// ══════════════════════════════════════════════════════════════════
// COST ENGINE v3.2 — Calibragem Profissional + Auditoria Completa
// Mantém comportamento de v3.1 e adiciona `detalhes.auditoria`
// com origem/fórmula/status por linha (mesma lógica da aba
// COMPOSIÇÃO DE PREÇO da planilha RONMA, sem valores hardcoded).
// ══════════════════════════════════════════════════════════════════
// REGRA DE OURO: Nunca ajustar preço direto.
// Ajustar: produtividade → eficiência → custo/h → markup
// REGRAS CRÍTICAS:
//   - Nunca usar total como unitário
//   - Sempre separar custo_unitario e total_item
//   - total_item = preco_unitario × quantidade
// ══════════════════════════════════════════════════════════════════

import { gerarCalibracao, CALIBRATION_RANGES } from "../data/calibrationRanges";
import { fmt, fmtBRL } from "../utils/format";
import { ASSUMPTIONS, getFatorSolo } from "../config/assumptions.config";

const safePct = (val) => (val > 1 ? val / 100 : val);
const toNum = (v, fallback = 0) => {
  const n = typeof v === "string" ? parseFloat(v.replace(",", ".")) : parseFloat(v);
  return Number.isFinite(n) ? n : fallback;
};

const matchesCategoryName = (eq = {}, ...needles) => {
  const texto = `${eq.category || eq.categoria || ""} ${eq.name || eq.nome || eq.equipamento || ""}`.toLowerCase();
  return needles.some((n) => texto.includes(n));
};

const isEscavadeira   = (eq = {}) => matchesCategoryName(eq, "escavadeira");
const isPatrol        = (eq = {}) => matchesCategoryName(eq, "patrol", "motoniveladora");
const isTratorOuGrade = (eq = {}) => matchesCategoryName(eq, "trator", "grade");
const isRolo          = (eq = {}) => matchesCategoryName(eq, "rolo", "compactador");
const isPipa          = (eq = {}) => matchesCategoryName(eq, "pipa");

// Equipamentos cujo diesel/un usa o mesmo ciclo de viagens da escavadeira:
// (viagens/h × m³ empolado por viagem) → m³/h da máquina; horas = volumeInSitu ÷ (m³/h × frota).
const usaCicloViagensCategoria = (eq) =>
  isEscavadeira(eq) || isPatrol(eq) || isTratorOuGrade(eq) || isRolo(eq) || isPipa(eq);

// Denominador de rateio por categoria:
//   - Escavadeira, trator/grade, rolo, caminhão pipa → m³ empolado
//   - Patrol → m³ in situ
//   - Demais → m³ in situ (default)
const usaDenominadorEmpolado = (eq) =>
  isEscavadeira(eq) || isTratorOuGrade(eq) || isRolo(eq) || isPipa(eq);

const calcVolumeComEmpolamento = (volume, fatorEmpolamento) => {
  const v = toNum(volume, 0);
  const f = toNum(fatorEmpolamento, 0);
  if (v <= 0 || f <= 0) return 0;
  return f < 1 ? Math.max(v - (v * f), 0) : v * f;
};

const getItemVolumes = (item = {}, params = {}) => {
  const volumeInSitu = toNum(item.volumeInSitu, toNum(item.quantity, 0));
  const fatorPadrao = toNum(params?.fator_empolamento, 1 + ASSUMPTIONS.empolamento.fatorPadrao);
  const fatorInformado = toNum(item.fatorEmpolamento, 0);
  const fatorEmpolamento = fatorInformado > 0 ? fatorInformado : fatorPadrao;
  const volumeEmpolado = calcVolumeComEmpolamento(volumeInSitu, fatorEmpolamento);
  return { volumeInSitu, fatorEmpolamento, volumeEmpolado };
};

const getDenominadorEquipamento = (eq, volumes) =>
  usaDenominadorEmpolado(eq) ? volumes.volumeEmpolado : volumes.volumeInSitu;

// ── Volume de referência (denominador) por parcela ──
// Lê de `params.volume_ref_*` para tornar a regra explícita e auditável.
//   - Diesel: depende da categoria (Patrol é exceção e usa in_situ).
//   - Manutenção / MO / Indireto: chave única em params.
const resolveVolumeRefTipo = (rawTipo) =>
  rawTipo === "in_situ" || rawTipo === "empolado" ? rawTipo : "empolado";

const getVolumeRefValor = (tipo, volumes) =>
  tipo === "in_situ" ? volumes.volumeInSitu : volumes.volumeEmpolado;

const getVolumeRefDieselPorCategoria = (categoria, params, volumes) => {
  const tabela = params?.volume_ref_diesel_por_categoria || {};
  const tipo = resolveVolumeRefTipo(tabela?.[categoria] ?? tabela?._default ?? "empolado");
  return { tipo, valor: getVolumeRefValor(tipo, volumes) };
};

const getVolumeRefManutencao = (params, volumes) => {
  const tipo = resolveVolumeRefTipo(params?.volume_ref_manutencao ?? "empolado");
  return { tipo, valor: getVolumeRefValor(tipo, volumes) };
};

const getVolumeRefMO = (params, volumes) => {
  const tipo = resolveVolumeRefTipo(params?.volume_ref_mo ?? "empolado");
  return { tipo, valor: getVolumeRefValor(tipo, volumes) };
};

const getVolumeRefIndireto = (params, volumes) => {
  const tipo = resolveVolumeRefTipo(params?.volume_ref_indireto ?? "in_situ");
  return { tipo, valor: getVolumeRefValor(tipo, volumes) };
};

const getViagensPorHora = (eq = {}) =>
  toNum(eq.viagensPorHora ?? eq.viagens_hora ?? eq.tripsPerHour ?? eq.capacidadeViagensHora, 0);

const getHorasDiaItem = (item = {}, params = {}) =>
  toNum(item.horasDia, toNum(params?.horas_dia, toNum(params?.hoursPerDay, ASSUMPTIONS.jornada.horasPorDia)));

const calcVolumeEmpoladoPorViagem = (item = {}, params = {}) => {
  const volumeInSituViagem = toNum(
    item.volumeInSituPorViagem ?? item.volume_in_situ_por_viagem,
    toNum(params?.volume_in_situ_por_viagem, ASSUMPTIONS.transporte.volumePorViagemInSitu)
  );
  const fatorEmpolamento = getItemVolumes(item, params).fatorEmpolamento;

  if (volumeInSituViagem <= 0) {
    return { volumeInSituViagem: 0, fatorEmpolamento, perdaVolumeViagem: 0, volumeEmpoladoViagem: 0, modo: "sem_volume" };
  }

  // Compatibilidade: o sistema vinha usando fator 1.36 como multiplicador.
  // Se o usuário digitar 0.36, tratamos como perda informada (36%) e subtraímos.
  if (fatorEmpolamento > 0 && fatorEmpolamento < 1) {
    const perdaVolumeViagem = volumeInSituViagem * fatorEmpolamento;
    return { volumeInSituViagem, fatorEmpolamento, perdaVolumeViagem, volumeEmpoladoViagem: calcVolumeComEmpolamento(volumeInSituViagem, fatorEmpolamento), modo: "perda" };
  }

  return {
    volumeInSituViagem,
    fatorEmpolamento,
    perdaVolumeViagem: Math.max((fatorEmpolamento - 1) * volumeInSituViagem, 0),
    volumeEmpoladoViagem: volumeInSituViagem * fatorEmpolamento,
    modo: "multiplicador",
  };
};

const calcDieselUnitarioPorEquipamento = ({
  eq,
  item,
  params,
  volumes,
  quantidade,
  dieselHoraTotal,
  fallbackHoras,
}) => {
  // Denominador específico do diesel (Patrol exceção: in_situ).
  const dieselRef = getVolumeRefDieselPorCategoria(eq?.category, params, volumes);
  const denominador = dieselRef.valor;
  const viagensHora = getViagensPorHora(eq);
  const horasDia = getHorasDiaItem(item, params);
  const viagem = calcVolumeEmpoladoPorViagem(item, params);
  const usaCicloViagens = usaCicloViagensCategoria(eq) && viagensHora > 0 && viagem.volumeEmpoladoViagem > 0 && quantidade > 0;

  const m3EmpoladoHoraMaquina = viagensHora * viagem.volumeEmpoladoViagem;
  const m3EmpoladoHoraFrota = m3EmpoladoHoraMaquina * quantidade;
  const horasComProducao = usaCicloViagens && m3EmpoladoHoraFrota > 0
    ? volumes.volumeInSitu / m3EmpoladoHoraFrota
    : fallbackHoras;
  const dieselTotal = dieselHoraTotal * horasComProducao;

  return {
    valorUnitario: denominador > 0 ? dieselTotal / denominador : 0,
    denominador,
    denominadorTipo: dieselRef.tipo,
    baseRateio: dieselRef.tipo === "empolado" ? "m3 empolado" : "m3 in situ",
    usaCicloViagens,
    viagensHora,
    horasDia,
    viagensDia: viagensHora * horasDia * quantidade,
    m3EmpoladoHoraMaquina,
    m3EmpoladoHoraFrota,
    m3EmpoladoDia: m3EmpoladoHoraFrota * horasDia,
    horasComProducao,
    dieselTotal,
    ...viagem,
  };
};

const fmtPct = (n, d = 1) => `${fmt((n || 0) * 100, d)}%`;
const fmtBRLh = (n) => `${fmtBRL(n)}/h`;

// Helper para construir linhas de auditoria padronizadas.
// row = { label, valor, unidade, formula, formulaExec, origem, status, extra }
const auditRow = (row) => ({
  label: row.label,
  valor: row.valor,
  unidade: row.unidade || "",
  formula: row.formula || "",
  formulaExec: row.formulaExec || "",
  origem: row.origem || "calculado",
  status: row.status || "calculado",
  ...(row.extra || {}),
});

// ── Produtividade Dinâmica de Transporte (DMT) ──
export const calcTransportProductivity = (dmt, params, baseVol = 14) => {
  if (!dmt || dmt <= 0) return 1;
  const travelTimeMins = (dmt / params.transportSpeed) * 120;
  const totalCycleMins = params.cycleTimeBase + travelTimeMins;
  const tripsPerHour = 60 / totalCycleMins;
  return tripsPerHour * baseVol;
};

// ── Modelo de INDIRETOS (projeto-level, absoluto) ──
// Quando a soma das parcelas mensais > 0, ratemos o indireto pelas horas
// reais da obra (dias_obra_mes × hoursPerDay) → R$/h constante por item.
// Caso esteja vazio, caímos para o modo legado (10% sobre o parcial de
// cada equipamento), preservando o comportamento anterior.
export const calcIndiretoModel = (params) => {
  const componentes = {
    admin:        toNum(params?.indiretos_admin_mensal, 0),
    alojamento:   toNum(params?.indiretos_alojamento_mensal, 0),
    alimentacao:  toNum(params?.indiretos_alimentacao_mensal, 0),
    vigilancia:   toNum(params?.indiretos_vigilancia_mensal, 0),
    outros:       toNum(params?.indiretos_outros_mensal, 0),
  };
  const total =
    componentes.admin + componentes.alojamento + componentes.alimentacao +
    componentes.vigilancia + componentes.outros;
  const diasObra = toNum(params?.dias_obra_mes, 22);
  const horasDia = toNum(params?.hoursPerDay, 8);
  const horasMes = diasObra * horasDia;
  const percLegacy = safePct(params?.percentual_indiretos || ASSUMPTIONS.indireto.percentualLegadoSobreParcial);

  if (total > 0 && horasMes > 0) {
    return {
      modo: "absoluto",
      componentes,
      indiretoTotalMensal: total,
      diasObra,
      horasDia,
      horasMes,
      indiretoHora: total / horasMes,
      percIndiretosLegacy: percLegacy,
    };
  }
  return {
    modo: "percentual",
    componentes,
    indiretoTotalMensal: 0,
    diasObra,
    horasDia,
    horasMes,
    indiretoHora: 0,
    percIndiretosLegacy: percLegacy,
  };
};

// ── Indireto rateado por m³ por pessoa indireta ──
// Modelo planilha (CUSTOS EQUIPAMENTOS J22→J23→J24):
//   J22 = Σ (custo_h_pessoa × horas_projeto × qty_pessoa)
//   J23 = J22 ÷ volume_in_situ
//   J24 = J23 ÷ num_pessoas_ativas
// O retorno é o R$/m³ por pessoa — o item soma esse valor uma vez por equipamento ATIVO.
//
// Caso especial: tipo "alimentacao" sem custo_h cadastrado → calculado dinamicamente
// a partir de (numOperadoresFrota + numPessoasIndiretas) e dos parâmetros de alimentação.
export const calcIndiretoRateadoPorM3 = (
  params,
  indirectPersonnel = [],
  numOperadoresFrota = 0,
  volumeInSitu = 0,
  horasProjeto = 0,
) => {
  const v = toNum(volumeInSitu, 0);
  if (v <= 0) return 0;
  if (!Array.isArray(indirectPersonnel) || indirectPersonnel.length === 0) return 0;

  const numPessoasIndiretas = indirectPersonnel.reduce(
    (s, p) => s + toNum(p?.quantidade, 0),
    0,
  );
  if (numPessoasIndiretas <= 0) return 0;

  const tabela = params?.pessoas_indiretas
    || ASSUMPTIONS.pessoasIndiretas.porTipo;
  const valorDia = toNum(params?.alimentacao_valor_dia, ASSUMPTIONS.pessoasIndiretas.alimentacao.valorDia);
  const diasMes  = toNum(params?.alimentacao_dias_mes,  ASSUMPTIONS.pessoasIndiretas.alimentacao.diasMes);
  const horasRef = toNum(params?.alimentacao_horas_ref, ASSUMPTIONS.pessoasIndiretas.alimentacao.horasRef);

  let totalIndireto = 0;
  for (const pessoa of indirectPersonnel) {
    if (!pessoa?.tipo) continue;
    const qty = toNum(pessoa.quantidade, 0);
    if (qty <= 0) continue;

    let custoHora = tabela?.[pessoa.tipo];

    // Caso especial — alimentação calculada dinamicamente.
    if (pessoa.tipo === "alimentacao" && (custoHora == null || custoHora === 0)) {
      const totalPessoasObra = toNum(numOperadoresFrota, 0) + numPessoasIndiretas;
      custoHora = horasRef > 0
        ? (totalPessoasObra * valorDia * diasMes) / horasRef
        : 0;
    }

    if (custoHora == null) continue;
    totalIndireto += toNum(custoHora, 0) * toNum(horasProjeto, 0) * qty;
  }

  return (totalIndireto / v) / numPessoasIndiretas;
};

// ── Custo Horário por Equipamento ──
// Quando recebe `indiretoModel` em modo "absoluto", o equipamento NÃO
// carrega indireto próprio (ele é alocado depois, no nível do item).
// Sem o argumento, mantém o comportamento legado para retro-compat
// (página de Equipamentos, EquipmentSelector).
//
// FONTES DE MANUTENÇÃO E MÃO DE OBRA (em ordem de preferência):
//   - manutenção:
//       1) eq.custo_h_manutencao            → R$/h direto da planilha (preferido)
//       2) consumo × dieselPrice × % manut. → cálculo legado por % do diesel
//   - mão de obra:
//       1) eq.custo_h_operador                              → R$/h direto (override)
//       2) params.custo_hh_por_categoria_operador[eq.cat]   → tabela por categoria
//       3) (salário mensal × fator encargos) ÷ horas/mês    → cálculo legado
export const calcEquipmentHourlyCost = (eq, params, soilCategory, indiretoModel = null) => {
  const percManutBase = safePct(params.percentual_manutencao || ASSUMPTIONS.manutencao.percentualSobreDiesel);
  const ajusteSolo = (soilCategory === "3ª" || soilCategory === "pesado")
    ? ASSUMPTIONS.manutencao.ajusteSoloPesado
    : 1.00;
  const percManutencao = percManutBase * ajusteSolo;

  const dieselPrice  = params.dieselPrice;
  const consumo      = eq.consumption;
  const fatorEnc     = params.fator_encargos;
  const horasMes     = params.hoursPerMonth;
  const modoIndireto = indiretoModel?.modo === "absoluto" ? "absoluto" : "percentual";
  const percIndir    = modoIndireto === "absoluto"
    ? 0
    : safePct(params.percentual_indiretos || ASSUMPTIONS.indireto.percentualLegadoSobreParcial);

  const diesel_hora = consumo * dieselPrice;

  // Manutenção: direto (planilha) → cálculo legado.
  const manutencaoDireta = toNum(eq.custo_h_manutencao, 0);
  const manutencaoUsaDireta = manutencaoDireta > 0;
  const manutencao_hora = manutencaoUsaDireta
    ? manutencaoDireta * ajusteSolo
    : diesel_hora * percManutencao;

  // Mão de obra: direto → tabela por categoria → cálculo legado por salário.
  // Tabela canônica: params.categorias_operador. Fallback no alias retro-compat.
  const tabelaMO = params?.categorias_operador
    || params?.custo_hh_por_categoria_operador
    || ASSUMPTIONS.maoDeObraDireta.porCategoriaOperador;
  const moDireta = toNum(eq.custo_h_operador, 0);
  const moPorCategoria = eq.categoria_operador ? toNum(tabelaMO?.[eq.categoria_operador], 0) : 0;
  const salario = toNum(eq.salario_operador_mensal, 3500);
  const operadorFonte = moDireta > 0
    ? "direto"
    : (moPorCategoria > 0 ? "tabela" : "legado");
  const operador_hora =
    operadorFonte === "direto"  ? moDireta :
    operadorFonte === "tabela"  ? moPorCategoria :
    /* legado */                  (salario * fatorEnc) / horasMes;

  const parcial         = diesel_hora + manutencao_hora + operador_hora;
  const indiretos_hora  = parcial * percIndir;
  const custo_total_hora = parcial + indiretos_hora;
  // Custo "direto" do equipamento (diesel + manut + MO) — sem indireto.
  // É o que o modelo novo (5.5) usa; indireto vai por rateio no item.
  const custo_direto_hora = parcial;

  const fmtAjusteSolo = (base, label) => ajusteSolo > 1
    ? `${base} × ${fmt(ajusteSolo, 2)} (solo 3ª) = ${label}`
    : base === label ? base : `${base} = ${label}`;

  const auditoria = {
    diesel: auditRow({
      label: "Diesel",
      valor: diesel_hora,
      unidade: "R$/h",
      formula: "consumo (L/h) × preço diesel (R$/L)",
      formulaExec: `${fmt(consumo, 2)} L/h × ${fmtBRL(dieselPrice)}/L = ${fmtBRLh(diesel_hora)}`,
      origem: "Equipamento + Parâmetros",
    }),
    manutencao: auditRow({
      label: "Manutenção",
      valor: manutencao_hora,
      unidade: "R$/h",
      formula: manutencaoUsaDireta
        ? (ajusteSolo > 1
            ? "custo_h_manutencao × ajuste de solo (3ª)"
            : "custo_h_manutencao do equipamento (planilha)")
        : (ajusteSolo > 1
            ? "diesel × % manutenção × ajuste de solo (3ª)"
            : "diesel × % manutenção"),
      formulaExec: manutencaoUsaDireta
        ? fmtAjusteSolo(`${fmtBRLh(manutencaoDireta)}`, fmtBRLh(manutencao_hora))
        : (ajusteSolo > 1
            ? `${fmtBRLh(diesel_hora)} × ${fmtPct(percManutBase)} × ${fmt(ajusteSolo, 2)} = ${fmtBRLh(manutencao_hora)}`
            : `${fmtBRLh(diesel_hora)} × ${fmtPct(percManutBase)} = ${fmtBRLh(manutencao_hora)}`),
      origem: manutencaoUsaDireta ? "Equipamento (R$/h direto)" : "Parâmetros",
      status: manutencaoUsaDireta ? "calculado" : "alerta",
    }),
    operador: auditRow({
      label: "Mão de obra (operador)",
      valor: operador_hora,
      unidade: "R$/h",
      formula:
        operadorFonte === "direto"  ? "custo_h_operador do equipamento" :
        operadorFonte === "tabela"  ? `tabela R$/h por categoria (${eq.categoria_operador})` :
        /* legado */                  "(salário mensal × fator encargos) ÷ horas/mês",
      formulaExec:
        operadorFonte === "direto"  ? `${fmtBRLh(operador_hora)}` :
        operadorFonte === "tabela"  ? `tabela["${eq.categoria_operador}"] = ${fmtBRLh(operador_hora)}` :
        /* legado */                  `(${fmtBRL(salario)} × ${fmt(fatorEnc, 2)}) ÷ ${fmt(horasMes, 0)} h = ${fmtBRLh(operador_hora)}`,
      origem:
        operadorFonte === "direto"  ? "Equipamento (R$/h direto)" :
        operadorFonte === "tabela"  ? "Parâmetros (tabela por categoria)" :
        /* legado */                  "Equipamento + Parâmetros (legado)",
      status: operadorFonte === "legado" ? "alerta" : "calculado",
    }),
    parcial: auditRow({
      label: "Subtotal direto + operação",
      valor: parcial,
      unidade: "R$/h",
      formula: "diesel + manutenção + operador",
      formulaExec: `${fmtBRL(diesel_hora)} + ${fmtBRL(manutencao_hora)} + ${fmtBRL(operador_hora)} = ${fmtBRLh(parcial)}`,
    }),
    indiretos: auditRow({
      label: "Indiretos",
      valor: indiretos_hora,
      unidade: "R$/h",
      formula: modoIndireto === "absoluto"
        ? "rateado no item (modo absoluto: indireto do projeto ÷ horas reais)"
        : "parcial × % indiretos",
      formulaExec: modoIndireto === "absoluto"
        ? `0,00 — alocado no nível do item`
        : `${fmtBRLh(parcial)} × ${fmtPct(percIndir)} = ${fmtBRLh(indiretos_hora)}`,
      origem: modoIndireto === "absoluto" ? "Projeto (modo absoluto)" : "Parâmetros",
    }),
    custoHora: auditRow({
      label: "Custo total por hora",
      valor: custo_total_hora,
      unidade: "R$/h",
      formula: "parcial + indiretos",
      formulaExec: `${fmtBRL(parcial)} + ${fmtBRL(indiretos_hora)} = ${fmtBRLh(custo_total_hora)}`,
    }),
  };

  return {
    diesel_hora,
    manutencao_hora,
    operador_hora,
    indiretos_hora,
    custo_total_hora,
    custo_direto_hora,
    auditoria,
    modoIndireto,
  };
};

// ── Constrói a auditoria por linha de equipamento (com multiplicador de quantidade) ──
const buildEquipamentosAuditoria = (item, equipmentMap, params, soil, indiretoModel) => {
  return (item.equipmentLines || []).map((line) => {
    const eq = equipmentMap[line.equipmentId];
    if (!eq) return null;
    const c = calcEquipmentHourlyCost(eq, params, soil, indiretoModel);
    const q = line.quantity || 1;
    const mult = (row, valorTotal) => ({
      ...row,
      valorTotal,
      formulaTotal: q !== 1
        ? `${row.formulaExec} × ${fmt(q, 2)} unid. = ${fmtBRLh(valorTotal)}`
        : row.formulaExec,
    });
    return {
      id: line.id,
      nome: eq.name,
      categoria: eq.category,
      quantidade: q,
      consumo: eq.consumption,
      viagensPorHora: getViagensPorHora(eq),
      baseProductivity: toNum(eq.baseProductivity ?? eq.productivity, 0),
      custoManutencaoDireto: eq.custo_h_manutencao,
      custoOperadorDireto: eq.custo_h_operador,
      categoriaOperador: eq.categoria_operador,
      salarioMensal: eq.salario_operador_mensal,
      diesel: mult(c.auditoria.diesel, c.diesel_hora * q),
      manutencao: mult(c.auditoria.manutencao, c.manutencao_hora * q),
      operador: mult(c.auditoria.operador, c.operador_hora * q),
      indiretos: mult(c.auditoria.indiretos, c.indiretos_hora * q),
      custoHora: mult(c.auditoria.custoHora, c.custo_total_hora * q),
    };
  }).filter(Boolean);
};

// ── Custo e Preço do Item Completo (modelo novo: por volume e prazo) ──
// Ativado quando item.volumeInSitu > 0 e há frota com produtividade.
// Aplica:
//   - diesel  ∝ horas-máquina (volume ÷ produção_conjunto)
//   - manut   ∝ horas-projeto (dias × horas/dia × meses)
//   - MO      ∝ horas-projeto
//   - indireto rateado por m³ via calcIndiretoRateadoPorM3
//   - markup por categoria de equipamento
const calcItemCostNovo = (item, equipmentMap, params) => {
  const { volumeInSitu, fatorEmpolamento, volumeEmpolado } = getItemVolumes(item, params);

  const prazoMeses   = toNum(item.prazoMeses,   toNum(params?.prazo_meses,   1));
  const diasUteisMes = toNum(item.diasUteisMes, toNum(params?.dias_uteis_mes, 22));
  const horasDia     = toNum(item.horasDia,     toNum(params?.horas_dia,     9));
  const horasProjeto = diasUteisMes * horasDia * prazoMeses;

  const equipmentLines = (item.equipmentLines || []).filter(
    l => toNum(l?.quantity ?? l?.qty, 0) > 0 && equipmentMap[l.equipmentId],
  );

  const producaoConjuntoHora = equipmentLines.reduce((s, l) => {
    const eq = equipmentMap[l.equipmentId];
    const q  = toNum(l.quantity ?? l.qty, 0);
    const prod = toNum(eq?.baseProductivity ?? eq?.productivity, 0);
    return s + prod * q;
  }, 0);

  const horasMaquinaNecessarias = producaoConjuntoHora > 0
    ? volumeInSitu / producaoConjuntoHora
    : 0;

  // Indireto rateado: mesmo R$/m³ para cada equipamento ativo.
  const indirectPersonnel = item.indirectPersonnel || [];
  const numOperadoresFrota = equipmentLines.reduce(
    (s, l) => s + toNum(l.quantity ?? l.qty, 0),
    0,
  );
  const indiretoR$M3PorPessoa = calcIndiretoRateadoPorM3(
    params,
    indirectPersonnel,
    numOperadoresFrota,
    volumeInSitu,
    horasProjeto,
  );

  let custo_unitario = 0;
  let preco_unitario = 0;
  let dieselR$M3_total   = 0;
  let manutR$M3_total    = 0;
  let moR$M3_total       = 0;
  let indiretoR$M3_total = 0;
  const detalheEquipamentos = [];
  const markupTabela = params?.markup_por_categoria
    || ASSUMPTIONS.markupPorCategoria;
  const markupDefault = toNum(markupTabela?._default, 2.37);

  // Denominadores por parcela (manut/MO/indireto são uniformes para todos
  // os equipamentos do item — diesel varia por categoria).
  const volumes = { volumeInSitu, volumeEmpolado };
  const refManut    = getVolumeRefManutencao(params, volumes);
  const refMO       = getVolumeRefMO(params, volumes);
  const refIndireto = getVolumeRefIndireto(params, volumes);

  for (const line of equipmentLines) {
    const qty = toNum(line.quantity ?? line.qty, 0);
    const eq  = equipmentMap[line.equipmentId];
    const c   = calcEquipmentHourlyCost(eq, params, item.soilCategory || "1ª");

    const dieselCalc = calcDieselUnitarioPorEquipamento({
      eq,
      item,
      params,
      volumes,
      quantidade: qty,
      dieselHoraTotal: c.diesel_hora * qty,
      fallbackHoras: horasMaquinaNecessarias,
    });
    const refDiesel = { tipo: dieselCalc.denominadorTipo, valor: dieselCalc.denominador };

    const totalDieselEq = dieselCalc.dieselTotal;
    const totalManutEq  = c.manutencao_hora * horasProjeto * qty;
    const totalMOEq     = c.operador_hora   * horasProjeto * qty;
    const totalIndiretoEq = indiretoR$M3PorPessoa * volumeInSitu;

    const dieselEqM3   = dieselCalc.valorUnitario;
    const manutEqM3    = refManut.valor    > 0 ? totalManutEq    / refManut.valor    : 0;
    const moEqM3       = refMO.valor       > 0 ? totalMOEq       / refMO.valor       : 0;
    const indiretoEqM3 = refIndireto.valor > 0 ? totalIndiretoEq / refIndireto.valor : 0;
    const custoEqM3    = dieselEqM3 + manutEqM3 + moEqM3 + indiretoEqM3;

    const markupEq = toNum(markupTabela?.[eq.category], markupDefault);
    const precoEqM3 = custoEqM3 * markupEq;
    const totalMaquinaObra = precoEqM3 * volumeInSitu;

    custo_unitario     += custoEqM3;
    preco_unitario     += precoEqM3;
    dieselR$M3_total   += dieselEqM3;
    manutR$M3_total    += manutEqM3;
    moR$M3_total       += moEqM3;
    indiretoR$M3_total += indiretoEqM3;

    detalheEquipamentos.push({
      equipmentId: line.equipmentId,
      equipamento: eq.name,
      categoria: eq.category,
      qty,
      viagensPorHora: getViagensPorHora(eq),
      baseProductivity: toNum(eq?.baseProductivity ?? eq?.productivity, 0),
      custoManutencaoDireto: toNum(eq?.custo_h_manutencao, 0),
      consumo: toNum(eq?.consumption, 0),

      // R$/h
      diesel_hora: c.diesel_hora,
      manutencao_hora: c.manutencao_hora,
      operador_hora: c.operador_hora,

      // horas usadas em cada parcela
      horas_diesel: dieselCalc.horasComProducao,
      horas_manutencao: horasProjeto,
      horas_mo: horasProjeto,

      // totais R$
      total_diesel:    totalDieselEq,
      total_manutencao: totalManutEq,
      total_mo:        totalMOEq,
      total_indireto:  totalIndiretoEq,

      // volume de referência por parcela (com tipo)
      volume_ref_diesel:           refDiesel.valor,
      volume_ref_diesel_tipo:      refDiesel.tipo,
      volume_ref_manutencao:       refManut.valor,
      volume_ref_manutencao_tipo:  refManut.tipo,
      volume_ref_mo:               refMO.valor,
      volume_ref_mo_tipo:          refMO.tipo,
      volume_ref_indireto:         refIndireto.valor,
      volume_ref_indireto_tipo:    refIndireto.tipo,

      // R$/m³
      diesel_R$_m3:    dieselEqM3,
      manutencao_R$_m3: manutEqM3,
      mo_R$_m3:        moEqM3,
      indireto_R$_m3:  indiretoEqM3,
      custo_R$_m3:     custoEqM3,
      markup:          markupEq,
      preco_R$_m3:     precoEqM3,
      total_maquina_obra_R$: totalMaquinaObra,

      // Compat retro (consumido por algumas telas)
      denominador_rateio: refDiesel.valor,
      base_rateio: refDiesel.tipo,
      diesel_calculo: dieselCalc,
    });
  }

  const markup_efetivo = custo_unitario > 0 ? preco_unitario / custo_unitario : 0;
  const quantidade     = toNum(item.quantity, volumeInSitu);
  const total_item     = preco_unitario * quantidade;
  const lucro_unitario   = preco_unitario - custo_unitario;
  const margem_percentual = preco_unitario > 0 ? (lucro_unitario / preco_unitario) * 100 : 0;

  const auditoria = {
    tipo: "ok-novo",
    unidade: item.unit || "m³",
    modelo: "novo (volume + prazo + frota + indireto rateado)",
    contexto: {
      volumeInSitu,
      fatorEmpolamento,
      volumeEmpolado,
      prazoMeses,
      diasUteisMes,
      horasDia,
      horasProjeto,
      producaoConjuntoHora,
      horasMaquinaNecessarias,
      numOperadoresFrota,
      indiretoR$M3PorPessoa,
    },
    parcelasPorM3: {
      diesel:    dieselR$M3_total,
      manutencao: manutR$M3_total,
      mo:        moR$M3_total,
      indireto:  indiretoR$M3_total,
      custo:     custo_unitario,
      preco:     preco_unitario,
      markupEfetivo: markup_efetivo,
    },
    equipamentos: detalheEquipamentos,
    validacoes: [],
  };
  if (volumeInSitu <= 0) auditoria.validacoes.push({ severidade: "erro", mensagem: "volumeInSitu deve ser > 0." });
  if (producaoConjuntoHora <= 0) auditoria.validacoes.push({ severidade: "erro", mensagem: "Produção conjunta da frota = 0." });
  if (indirectPersonnel.length === 0) auditoria.validacoes.push({ severidade: "alerta", mensagem: "Aloque pelo menos uma pessoa indireta para que o overhead seja contabilizado." });

  return {
    // contrato com a UI existente
    unitCost: custo_unitario,
    totalCost: custo_unitario * quantidade,
    totalPrice: total_item,
    custo_unitario,
    preco_unitario,
    total_item,
    markup_aplicado: markup_efetivo,
    volumeInSitu,
    fatorEmpolamento,
    volumeEmpolado,
    produtividade_informada: producaoConjuntoHora,
    produtividade_utilizada: producaoConjuntoHora,
    totalHourlyCost: 0,
    preco_minimo: custo_unitario * 1.10,
    lucro_unitario,
    margem_percentual,
    detalhamento: {
      diesel: dieselR$M3_total,
      manutencao: manutR$M3_total,
      operador: moR$M3_total,
      indiretos: indiretoR$M3_total,
      manual: 0,
      custoDireto: dieselR$M3_total + manutR$M3_total,
      custoOperacional: moR$M3_total,
      custoIndireto: indiretoR$M3_total,
    },
    detalhes: {
      custo: {
        diesel: dieselR$M3_total,
        manutencao: manutR$M3_total,
        maoDeObra: moR$M3_total,
        indiretos: indiretoR$M3_total,
        manual: 0,
        custoDireto: dieselR$M3_total + manutR$M3_total,
        custoOperacional: moR$M3_total,
        custoIndireto: indiretoR$M3_total,
        custoHora: 0,
      },
      produtividade: { base: producaoConjuntoHora, eficiencia: 1, fatorSolo: 1, fatorLogistica: 1, final: producaoConjuntoHora },
      volumes: { inSitu: volumeInSitu, fatorEmpolamento, empolado: volumeEmpolado },
      conversao: { custoHora: 0, produtividade: producaoConjuntoHora, custoUnitario: custo_unitario },
      fatores: { fatorBase: 1, valorAposFator1: custo_unitario, ajusteFinal: markup_efetivo, valorAposFator2: preco_unitario, bdi: toNum(params?.defaultBDI, 20) },
      resultado: { precoUnitario: preco_unitario, quantidade, total: total_item },
      auditoria,
    },
    calibracao: null,
    status: "ok",
    divergencia: null,
  };
};

// Detecta se o item tem o suficiente para o modelo novo da spec.
const itemUsaModeloNovo = (item) => {
  if (!item) return false;
  if (item.unit === "VB") return false;
  const vol = toNum(item.volumeInSitu, 0);
  if (vol <= 0) return false;
  const lines = (item.equipmentLines || []).filter(l => toNum(l?.quantity ?? l?.qty, 0) > 0);
  if (lines.length === 0) return false;
  const prazo = toNum(item.prazoMeses, toNum(item.params?.prazo_meses, 0));
  if (prazo <= 0) return false;
  return true;
};

// ── Custo e Preço do Item Completo ──
export const calcItemCost = (item, equipmentMap, params) => {
  // Modelo novo (spec) — quando o item tem volumeInSitu, prazoMeses e frota.
  if (itemUsaModeloNovo(item)) {
    return calcItemCostNovo(item, equipmentMap, params);
  }

  // VB (Verba Bruta): cálculo direto sem produtividade, eficiência ou markup
  if (item.unit === "VB") {
    const valor      = toNum(item.manualCost, 0);
    const quantidade = item.quantity || 1;
    const total_item = valor * quantidade;

    const auditoria = {
      tipo: "VB",
      equipamentos: [],
      custoBase: [
        auditRow({
          label: "Verba unitária (manual)",
          valor,
          unidade: "R$",
          formula: "valor da verba informado",
          formulaExec: `${fmtBRL(valor)}`,
          origem: "Manual (input usuário)",
          status: "manual",
        }),
      ],
      decomposicaoUnitaria: [],
      produtividade: [],
      conversao: [],
      fatores: [],
      resultado: [
        auditRow({
          label: "Preço unitário",
          valor,
          unidade: "R$",
          formula: "preço = verba",
          formulaExec: `${fmtBRL(valor)}`,
        }),
        auditRow({
          label: "Quantidade",
          valor: quantidade,
          unidade: "VB",
          formula: "quantidade informada",
          formulaExec: `${fmt(quantidade, 2)}`,
          origem: "Manual (input usuário)",
          status: "manual",
        }),
        auditRow({
          label: "Total do item",
          valor: total_item,
          unidade: "R$",
          formula: "preço unitário × quantidade",
          formulaExec: `${fmtBRL(valor)} × ${fmt(quantidade, 2)} = ${fmtBRL(total_item)}`,
        }),
      ],
    };

    return {
      unitCost: valor, totalCost: total_item, totalPrice: total_item,
      produtividade_informada: 1, produtividade_utilizada: 1,
      custo_unitario: valor, preco_unitario: valor, total_item,
      markup_aplicado: 1, totalHourlyCost: 0, preco_minimo: valor,
      lucro_unitario: 0, margem_percentual: 0,
      detalhamento: { diesel: 0, manutencao: 0, operador: 0, indiretos: 0, manual: valor },
      calibracao: null, status: "vb",
      detalhes: {
        custo: { diesel: 0, manutencao: 0, maoDeObra: 0, indiretos: 0, custoHora: 0 },
        produtividade: { base: 1, eficiencia: 1, fatorSolo: 1, final: 1 },
        conversao: { custoHora: 0, produtividade: 1, custoUnitario: valor },
        fatores: { fatorBase: toNum(params?.fatorBase, ASSUMPTIONS.markup.fatorBase), valorAposFator1: valor, ajusteFinal: toNum(params?.ajusteFinal, ASSUMPTIONS.markup.ajusteFinal), valorAposFator2: valor },
        resultado: { precoUnitario: valor, quantidade, total: total_item },
        auditoria,
      },
      divergencia: null,
    };
  }

  let status = "ok";
  const soil     = item.soilCategory || "1ª";
  const category = item.category || "";

  // 1. Produtividade (informada pelo usuário; nunca alterada)
  const produtividade_informada = toNum(item.adjustedProductivity, toNum(item.baseProductivity, 0));

  if (produtividade_informada <= 0 || isNaN(produtividade_informada)) {
    status = "produtividade_invalida";
  }

  const fatorSolo = getFatorSolo(soil);

  const eficiencia     = toNum(item.terrainFactor, toNum(item.efficiency, 1));
  const fatorLogistica = toNum(item.fatorLogistica, 1.0);

  const produtividade_calculo = produtividade_informada;
  const produtividade_utilizada = produtividade_calculo * eficiencia * fatorSolo * fatorLogistica;

  if (produtividade_utilizada <= 0 || isNaN(produtividade_utilizada)) {
    status = "produtividade_invalida";
  } else if (produtividade_utilizada < 10 && item.dmtDistance === 0) {
    if (status === "ok") status = "alerta";
  }

  // 2. Custos Horários (agregados a partir da auditoria por equipamento)
  const indiretoModel = calcIndiretoModel(params);
  const equipamentosAuditoria = buildEquipamentosAuditoria(item, equipmentMap, params, soil, indiretoModel);
  let sumDiesel = 0, sumManut = 0, sumOp = 0, sumIndiretoEq = 0, totalEquipDiretoHour = 0;
  equipamentosAuditoria.forEach((e) => {
    sumDiesel             += e.diesel.valorTotal;
    sumManut              += e.manutencao.valorTotal;
    sumOp                 += e.operador.valorTotal;
    sumIndiretoEq         += e.indiretos.valorTotal; // 0 em modo absoluto
    totalEquipDiretoHour  += e.diesel.valorTotal + e.manutencao.valorTotal + e.operador.valorTotal;
  });

  const manualCost = toNum(item.manualCost, 0);
  // Indireto aplicado ao item:
  //   - absoluto:  R$/h constante = indireto_total_mensal ÷ horas_obra_mes
  //                (NÃO se multiplica por quantidade de equipamentos do item)
  //   - percentual (legado): soma dos indiretos por equipamento (10% × parcial × qtd)
  const sumIndireto = indiretoModel.modo === "absoluto"
    ? indiretoModel.indiretoHora
    : sumIndiretoEq;
  const custo_total_hora = totalEquipDiretoHour + manualCost + sumIndireto;
  const unit = item.unit || "un";

  // Linhas auditáveis do bloco "Custo Base por hora" (R$/h)
  const buildCustoBaseAuditoria = () => {
    const linhas = [];
    const eqsLabel = equipamentosAuditoria.length === 0
      ? "(nenhum equipamento alocado)"
      : equipamentosAuditoria.map(e => `${e.nome}${e.quantidade !== 1 ? ` × ${fmt(e.quantidade, 2)}` : ""}`).join(" + ");

    linhas.push(auditRow({
      label: "Diesel (Σ equipamentos)",
      valor: sumDiesel,
      unidade: "R$/h",
      formula: "Σ (diesel_eq × qtd_alocada)",
      formulaExec: equipamentosAuditoria.length
        ? `${equipamentosAuditoria.map(e => `${fmtBRL(e.diesel.valor)}×${fmt(e.quantidade, 2)}`).join(" + ")} = ${fmtBRLh(sumDiesel)}`
        : `${fmtBRLh(0)}`,
      origem: "Equipamentos alocados",
    }));
    linhas.push(auditRow({
      label: "Manutenção (Σ equipamentos)",
      valor: sumManut,
      unidade: "R$/h",
      formula: "Σ (manut_eq × qtd_alocada)",
      formulaExec: equipamentosAuditoria.length
        ? `${equipamentosAuditoria.map(e => `${fmtBRL(e.manutencao.valor)}×${fmt(e.quantidade, 2)}`).join(" + ")} = ${fmtBRLh(sumManut)}`
        : `${fmtBRLh(0)}`,
      origem: "Equipamentos alocados",
    }));
    linhas.push(auditRow({
      label: "Mão de obra operador (Σ equipamentos)",
      valor: sumOp,
      unidade: "R$/h",
      formula: "Σ (operador_eq × qtd_alocada)",
      formulaExec: equipamentosAuditoria.length
        ? `${equipamentosAuditoria.map(e => `${fmtBRL(e.operador.valor)}×${fmt(e.quantidade, 2)}`).join(" + ")} = ${fmtBRLh(sumOp)}`
        : `${fmtBRLh(0)}`,
      origem: "Equipamentos alocados",
    }));
    if (manualCost > 0) {
      linhas.push(auditRow({
        label: "Custo manual / equipe extra",
        valor: manualCost,
        unidade: "R$/h",
        formula: "valor informado pelo usuário",
        formulaExec: `${fmtBRLh(manualCost)}`,
        origem: "Manual (input usuário)",
        status: "manual",
      }));
    }
    if (indiretoModel.modo === "absoluto") {
      const c = indiretoModel.componentes;
      linhas.push(auditRow({
        label: "Indiretos (modo absoluto — projeto)",
        valor: sumIndireto,
        unidade: "R$/h",
        formula: "indireto_total_mensal ÷ (dias_obra_mes × horas/dia)",
        formulaExec: `(${fmtBRL(c.admin)} + ${fmtBRL(c.alojamento)} + ${fmtBRL(c.alimentacao)} + ${fmtBRL(c.vigilancia)} + ${fmtBRL(c.outros)}) ÷ (${fmt(indiretoModel.diasObra, 0)} × ${fmt(indiretoModel.horasDia, 0)} h) = ${fmtBRL(indiretoModel.indiretoTotalMensal)} ÷ ${fmt(indiretoModel.horasMes, 0)} h = ${fmtBRLh(indiretoModel.indiretoHora)}`,
        origem: "Projeto (parâmetros globais)",
      }));
    } else {
      linhas.push(auditRow({
        label: "Indiretos (Σ equipamentos — modo legado)",
        valor: sumIndireto,
        unidade: "R$/h",
        formula: "Σ (parcial_eq × % indiretos × qtd_alocada)",
        formulaExec: equipamentosAuditoria.length
          ? `${equipamentosAuditoria.map(e => `${fmtBRL(e.indiretos.valor)}×${fmt(e.quantidade, 2)}`).join(" + ")} = ${fmtBRLh(sumIndireto)}`
          : `${fmtBRLh(0)}`,
        origem: "Equipamentos alocados",
        status: "alerta",
      }));
    }
    linhas.push(auditRow({
      label: "Custo total por hora",
      valor: custo_total_hora,
      unidade: "R$/h",
      formula: "(diesel + manut + operador) Σ eq + custo manual + indireto aplicado",
      formulaExec: `${fmtBRL(totalEquipDiretoHour)} + ${fmtBRL(manualCost)} + ${fmtBRL(sumIndireto)} = ${fmtBRLh(custo_total_hora)}  (${eqsLabel})`,
    }));
    return linhas;
  };

  const custoBaseAuditoria = buildCustoBaseAuditoria();

  const produtividadeAuditoria = [
    auditRow({
      label: "Produtividade informada",
      valor: produtividade_informada,
      unidade: `${unit}/h`,
      formula: "valor digitado pelo usuário",
      formulaExec: `${fmt(produtividade_informada, 2)} ${unit}/h`,
      origem: "Manual (input usuário)",
      status: "manual",
    }),
    auditRow({
      label: "Eficiência",
      valor: eficiencia,
      unidade: "×",
      formula: "fator de eficiência operacional (0–1)",
      formulaExec: `${fmt(eficiencia, 2)}×`,
      origem: "Manual (input usuário)",
      status: item.terrainFactor != null ? "manual" : "calculado",
    }),
    auditRow({
      label: `Fator de solo (${soil})`,
      valor: fatorSolo,
      unidade: "×",
      formula: "1ª = 1,00 | 2ª = 0,85 | 3ª = 0,70",
      formulaExec: `${fmt(fatorSolo, 2)}×`,
      origem: "Categoria de solo (item)",
      status: "calculado",
    }),
    auditRow({
      label: "Fator logística (DMT)",
      valor: fatorLogistica,
      unidade: "×",
      formula: "ajuste de logística informado pelo usuário",
      formulaExec: `${fmt(fatorLogistica, 2)}×`,
      origem: "Manual (input usuário)",
      status: item.fatorLogistica != null ? "manual" : "calculado",
    }),
    auditRow({
      label: "Produtividade real",
      valor: produtividade_utilizada,
      unidade: `${unit}/h`,
      formula: "informada × eficiência × fator solo × logística",
      formulaExec: `${fmt(produtividade_informada, 2)} × ${fmt(eficiencia, 2)} × ${fmt(fatorSolo, 2)} × ${fmt(fatorLogistica, 2)} = ${fmt(produtividade_utilizada, 2)} ${unit}/h`,
    }),
  ];

  // Se produtividade real é inválida, expor auditoria parcial e bloquear cálculo
  if (status === "produtividade_invalida") {
    const quantidade  = item.quantity || 1;
    const fatorBase   = toNum(item.fatorBase, toNum(params?.fatorBase, ASSUMPTIONS.markup.fatorBase));
    const ajusteFinal = toNum(item.ajusteFinal, toNum(params?.ajusteFinal, ASSUMPTIONS.markup.ajusteFinal));

    return {
      unitCost: 0,
      totalCost: 0,
      totalPrice: 0,
      produtividade_informada,
      produtividade_utilizada: 0,
      custo_unitario: 0,
      preco_unitario: 0,
      total_item: 0,
      markup_aplicado: fatorBase * ajusteFinal,
      totalHourlyCost: custo_total_hora,
      preco_minimo: 0,
      lucro_unitario: 0,
      margem_percentual: 0,
      detalhamento: {
        diesel: sumDiesel,
        manutencao: sumManut,
        operador: sumOp,
        indiretos: sumIndireto,
        manual: manualCost,
        custoDireto: sumDiesel + sumManut,
        custoOperacional: sumOp + manualCost,
        custoIndireto: sumIndireto,
      },
      detalhes: {
        custo: {
          diesel: sumDiesel,
          manutencao: sumManut,
          maoDeObra: sumOp,
          manual: manualCost,
          indiretos: sumIndireto,
          custoDireto: sumDiesel + sumManut,
          custoOperacional: sumOp + manualCost,
          custoIndireto: sumIndireto,
          custoHora: custo_total_hora
        },
        produtividade: { base: produtividade_calculo, eficiencia, fatorSolo, fatorLogistica, final: 0 },
        conversao: { custoHora: custo_total_hora, produtividade: 0, custoUnitario: 0 },
        fatores: { fatorBase, valorAposFator1: 0, ajusteFinal, valorAposFator2: 0, bdi: toNum(params?.defaultBDI, 20) },
        resultado: { precoUnitario: 0, quantidade, total: 0 },
        auditoria: {
          tipo: "bloqueado",
          motivo: "produtividade inválida (informe um valor > 0)",
          unidade: unit,
          indiretoModel,
          validacoes: [{ severidade: "erro", mensagem: "Produtividade real ≤ 0. Cálculo bloqueado." }],
          equipamentos: equipamentosAuditoria,
          custoBase: custoBaseAuditoria,
          decomposicaoUnitaria: [],
          produtividade: produtividadeAuditoria,
          conversao: [
            auditRow({
              label: "Custo unitário",
              valor: 0,
              unidade: `R$/${unit}`,
              formula: "custo hora ÷ produtividade real",
              formulaExec: "—  (produtividade real inválida)",
              status: "erro",
            }),
          ],
          fatores: [],
          resultado: [],
        },
      },
      calibracao: null,
      status,
      divergencia: null,
    };
  }

  // 3.1 Decomposição R$/un (espelho da aba COMPOSIÇÃO DE PREÇO da planilha)
  // Rateio por quantidade:
  //   - escavadeira, trator/grade, rolo, caminhão pipa → m³ empolado
  //   - patrol e demais equipamentos                    → m³ in situ
  const volumes = getItemVolumes(item, params);
  // Horas-máquina = volumeInSitu ÷ Σ (baseProductivity × qty) da frota.
  // NÃO aplicar eficiência, fatorSolo nem fatorLogistica aqui — esses fatores
  // permanecem na auditoria como produtividade real informativa, mas não devem
  // contaminar o rateio de diesel/manutenção/MO em horas-máquina.
  const producaoConjuntoBase = (item.equipmentLines || []).reduce((s, l) => {
    const eq = equipmentMap[l.equipmentId];
    const q  = toNum(l?.quantity ?? l?.qty, 0);
    const prod = toNum(eq?.baseProductivity ?? eq?.productivity, 0);
    return s + prod * q;
  }, 0);
  // Fallback (somente quando não há frota cadastrada): cai para a produtividade
  // do item (sem fatores) para itens com manualCost mas sem equipamento.
  const baseRateioProducao = producaoConjuntoBase > 0 ? producaoConjuntoBase : produtividade_calculo;
  const horasMaquinaRateio = volumes.volumeInSitu > 0 && baseRateioProducao > 0
    ? volumes.volumeInSitu / baseRateioProducao
    : 0;
  const rateiaEquipamento = (e, row) => {
    const denominador = getDenominadorEquipamento(e, volumes);
    return denominador > 0 ? (row.valorTotal * horasMaquinaRateio) / denominador : 0;
  };
  const dieselPorEquipamento = (e) => calcDieselUnitarioPorEquipamento({
    eq: e,
    item,
    params,
    volumes,
    quantidade: toNum(e.quantidade, 1),
    dieselHoraTotal: toNum(e.diesel?.valorTotal, 0),
    fallbackHoras: horasMaquinaRateio,
  });

  const dieselCalculos = equipamentosAuditoria.map(dieselPorEquipamento);
  const decompUnitDiesel = dieselCalculos.reduce((s, c) => s + c.valorUnitario, 0);
  const decompUnitManut  = equipamentosAuditoria.reduce((s, e) => s + rateiaEquipamento(e, e.manutencao), 0);
  const decompUnitOp     = equipamentosAuditoria.reduce((s, e) => s + rateiaEquipamento(e, e.operador), 0);
  const decompUnitIndir  = indiretoModel.modo === "absoluto"
    ? (volumes.volumeInSitu > 0 ? (sumIndireto * horasMaquinaRateio) / volumes.volumeInSitu : 0)
    : equipamentosAuditoria.reduce((s, e) => s + rateiaEquipamento(e, e.indiretos), 0);
  const decompUnitManual = volumes.volumeInSitu > 0
    ? (manualCost * horasMaquinaRateio) / volumes.volumeInSitu
    : 0;
  const custo_unitario = decompUnitDiesel + decompUnitManut + decompUnitOp + decompUnitIndir + decompUnitManual;
  const rateioExec = "escavadeira/trator/grade/rolo/pipa ÷ m³ empolado; patrol e demais ÷ m³ in situ";
  const dieselViagensExec = dieselCalculos
    .filter((c) => c.usaCicloViagens)
    .map((c) => `${fmt(c.viagensHora, 2)} viagens/h × ${fmt(c.volumeEmpoladoViagem, 2)} m3/viagem = ${fmt(c.m3EmpoladoHoraMaquina, 2)} m3/h; dia: ${fmt(c.m3EmpoladoDia, 2)} m3 e ${fmt(c.viagensDia, 2)} viagens; horas=${fmt(c.horasComProducao, 2)}`)
    .join(" + ");

  const decomposicaoUnitariaAuditoria = [
    auditRow({
      label: "Diesel",
      valor: decompUnitDiesel,
      unidade: `R$/${unit}`,
      formula: "Σ (diesel R$/h × horas com produção) ÷ quantidade de rateio",
      formulaExec: dieselViagensExec
        ? `${dieselViagensExec}; ${rateioExec} = ${fmtBRL(decompUnitDiesel)}/${unit}`
        : `${fmtBRL(sumDiesel)}/h × ${fmt(horasMaquinaRateio, 2)} h; ${rateioExec} = ${fmtBRL(decompUnitDiesel)}/${unit}`,
    }),
    auditRow({
      label: "Manutenção",
      valor: decompUnitManut,
      unidade: `R$/${unit}`,
      formula: "Σ (manutenção R$/h × horas máquina) ÷ quantidade de rateio",
      formulaExec: `${fmtBRL(sumManut)}/h × ${fmt(horasMaquinaRateio, 2)} h; ${rateioExec} = ${fmtBRL(decompUnitManut)}/${unit}`,
    }),
    auditRow({
      label: "Mão de obra",
      valor: decompUnitOp,
      unidade: `R$/${unit}`,
      formula: "Σ (mão de obra R$/h × horas máquina) ÷ quantidade de rateio",
      formulaExec: `${fmtBRL(sumOp)}/h × ${fmt(horasMaquinaRateio, 2)} h; ${rateioExec} = ${fmtBRL(decompUnitOp)}/${unit}`,
    }),
    ...(manualCost > 0 ? [auditRow({
      label: "Custo manual",
      valor: decompUnitManual,
      unidade: `R$/${unit}`,
      formula: "custo manual R$/h × horas máquina ÷ quantidade in situ",
      formulaExec: `(${fmtBRL(manualCost)}/h × ${fmt(horasMaquinaRateio, 2)} h) ÷ ${fmt(volumes.volumeInSitu, 2)} ${unit} = ${fmtBRL(decompUnitManual)}/${unit}`,
      status: "manual",
    })] : []),
    auditRow({
      label: "Indiretos",
      valor: decompUnitIndir,
      unidade: `R$/${unit}`,
      formula: indiretoModel.modo === "absoluto"
        ? "indireto/h projeto × horas máquina ÷ quantidade in situ"
        : "Σ (indiretos R$/h × horas máquina) ÷ quantidade de rateio",
      formulaExec: `${fmtBRL(sumIndireto)}/h × ${fmt(horasMaquinaRateio, 2)} h; ${indiretoModel.modo === "absoluto" ? `÷ ${fmt(volumes.volumeInSitu, 2)} ${unit}` : rateioExec} = ${fmtBRL(decompUnitIndir)}/${unit}`,
      origem: indiretoModel.modo === "absoluto" ? "Projeto (modo absoluto)" : "Equipamentos (modo legado)",
    }),
    auditRow({
      label: "Custo unitário (Σ)",
      valor: custo_unitario,
      unidade: `R$/${unit}`,
      formula: "Σ componentes (R$/un)",
      formulaExec: `${fmtBRL(decompUnitDiesel)} + ${fmtBRL(decompUnitManut)} + ${fmtBRL(decompUnitOp)}${manualCost > 0 ? ` + ${fmtBRL(decompUnitManual)}` : ""} + ${fmtBRL(decompUnitIndir)} = ${fmtBRL(custo_unitario)}/${unit}`,
    }),
  ];

  const conversaoAuditoria = [
    auditRow({
      label: "Custo unitário",
      valor: custo_unitario,
      unidade: `R$/${unit}`,
      formula: "Σ componentes unitários",
      formulaExec: `${fmtBRL(decompUnitDiesel)} + ${fmtBRL(decompUnitManut)} + ${fmtBRL(decompUnitOp)}${manualCost > 0 ? ` + ${fmtBRL(decompUnitManual)}` : ""} + ${fmtBRL(decompUnitIndir)} = ${fmtBRL(custo_unitario)}/${unit}`,
    }),
  ];

  // 4. Fatores da Planilha (Composição de Preço)
  const fatorBase     = toNum(item.fatorBase,   toNum(params?.fatorBase, ASSUMPTIONS.markup.fatorBase));
  const ajusteFinal   = toNum(item.ajusteFinal, toNum(params?.ajusteFinal, ASSUMPTIONS.markup.ajusteFinal));
  const valorAposFator1 = custo_unitario   * fatorBase;
  const valorAposFator2 = valorAposFator1 * ajusteFinal;
  let preco_unitario = valorAposFator2;
  const markup = custo_unitario > 0 ? (preco_unitario / custo_unitario) : (fatorBase * ajusteFinal);
  const bdi = toNum(params?.defaultBDI, 20);

  const fatoresAuditoria = [
    auditRow({
      label: "Fator base (markup)",
      valor: fatorBase,
      unidade: "×",
      formula: "fatorBase do item, ou de params, ou padrão (2,3)",
      formulaExec: `${fmt(fatorBase, 2)}×`,
      origem: item.fatorBase != null ? "Item (manual)" : "Parâmetros",
      status: item.fatorBase != null ? "manual" : "calculado",
    }),
    auditRow({
      label: "Após fator base",
      valor: valorAposFator1,
      unidade: `R$/${unit}`,
      formula: "custo unitário × fator base",
      formulaExec: `${fmtBRL(custo_unitario)} × ${fmt(fatorBase, 2)} = ${fmtBRL(valorAposFator1)}`,
    }),
    auditRow({
      label: "Ajuste de risco / outros",
      valor: ajusteFinal,
      unidade: "×",
      formula: "ajusteFinal do item, ou de params, ou padrão (1,2)",
      formulaExec: `${fmt(ajusteFinal, 2)}×`,
      origem: item.ajusteFinal != null ? "Item (manual)" : "Parâmetros",
      status: item.ajusteFinal != null ? "manual" : "calculado",
    }),
    auditRow({
      label: "Após ajuste final",
      valor: valorAposFator2,
      unidade: `R$/${unit}`,
      formula: "(custo × fator base) × ajuste final",
      formulaExec: `${fmtBRL(valorAposFator1)} × ${fmt(ajusteFinal, 2)} = ${fmtBRL(valorAposFator2)}`,
    }),
    auditRow({
      label: "Markup efetivo",
      valor: markup,
      unidade: "×",
      formula: "preço unitário ÷ custo unitário",
      formulaExec: `${fmtBRL(preco_unitario)} ÷ ${fmtBRL(custo_unitario)} = ${fmt(markup, 2)}×`,
    }),
    auditRow({
      label: "BDI estimado (informativo)",
      valor: bdi,
      unidade: "%",
      formula: "BDI dos parâmetros (informativo, não compõe item)",
      formulaExec: `${fmt(bdi, 1)}%`,
      origem: "Parâmetros",
    }),
  ];

  // 5. AUTO-CALIBRAGEM contra faixas de mercado
  const range = CALIBRATION_RANGES[category];
  if (range) {
    if (preco_unitario > range.faixa_preco.max) {
      status = "ajustado_preco_acima";
    } else if (preco_unitario < range.faixa_preco.min) {
      status = "ajustado_preco_abaixo";
    }
  }

  // 6. Total Item
  const quantidade = item.quantity || 1;
  const total_item = preco_unitario * quantidade;

  const isSimpleUnit = ["m²","m³","M²","M³"].includes(item.unit);
  if (isSimpleUnit && preco_unitario > 1000) {
    status = "erro_corrigido (preço inflado)";
  }

  const lucro_unitario   = preco_unitario - custo_unitario;
  const margem_percentual = preco_unitario > 0 ? (lucro_unitario / preco_unitario) * 100 : 0;

  const resultadoAuditoria = [
    auditRow({
      label: "Preço unitário",
      valor: preco_unitario,
      unidade: `R$/${unit}`,
      formula: "custo unitário × fator base × ajuste final",
      formulaExec: `${fmtBRL(custo_unitario)} × ${fmt(fatorBase, 2)} × ${fmt(ajusteFinal, 2)} = ${fmtBRL(preco_unitario)}/${unit}`,
    }),
    auditRow({
      label: "Quantidade",
      valor: quantidade,
      unidade: unit,
      formula: "quantidade informada no item",
      formulaExec: `${fmt(quantidade, 2)} ${unit}`,
      origem: "Manual (input usuário)",
      status: "manual",
    }),
    auditRow({
      label: "Total do item",
      valor: total_item,
      unidade: "R$",
      formula: "preço unitário × quantidade",
      formulaExec: `${fmtBRL(preco_unitario)} × ${fmt(quantidade, 2)} = ${fmtBRL(total_item)}`,
    }),
    auditRow({
      label: "Lucro unitário",
      valor: lucro_unitario,
      unidade: `R$/${unit}`,
      formula: "preço unitário − custo unitário",
      formulaExec: `${fmtBRL(preco_unitario)} − ${fmtBRL(custo_unitario)} = ${fmtBRL(lucro_unitario)}`,
    }),
    auditRow({
      label: "Margem (% sobre preço)",
      valor: margem_percentual,
      unidade: "%",
      formula: "(lucro ÷ preço unitário) × 100",
      formulaExec: `(${fmtBRL(lucro_unitario)} ÷ ${fmtBRL(preco_unitario)}) × 100 = ${fmt(margem_percentual, 2)}%`,
    }),
  ];

  // 6.1 Validações automáticas (sinalizam, não corrigem)
  const validacoes = [];
  if (indiretoModel.modo === "percentual" && indiretoModel.indiretoTotalMensal === 0) {
    validacoes.push({
      severidade: "alerta",
      mensagem: "Modo legado de indireto ativo (10% por equipamento). Para precificação realista, configure os indiretos do projeto (admin/aloj./alim./vig./outros) em Parâmetros.",
    });
  }
  if (indiretoModel.modo === "absoluto" && decompUnitIndir > 0 && decompUnitIndir < 0.005) {
    validacoes.push({
      severidade: "alerta",
      mensagem: `Indireto unitário muito baixo (${fmtBRL(decompUnitIndir)}/${unit}). Reveja produtividade real ou indiretos mensais.`,
    });
  }
  if (produtividade_utilizada > 1500 && !["M²","M2"].includes(item.unit)) {
    validacoes.push({
      severidade: "alerta",
      mensagem: `Produtividade real possivelmente irreal (${fmt(produtividade_utilizada, 2)} ${unit}/h). Reveja produtividade base e eficiência.`,
    });
  }
  if (totalEquipDiretoHour === 0 && manualCost === 0) {
    validacoes.push({
      severidade: "erro",
      mensagem: "Item sem equipamento alocado e sem custo manual — custo direto é zero.",
    });
  }
  if (custo_unitario > 0 && sumIndireto / custo_total_hora < 0.02 && indiretoModel.modo === "absoluto") {
    validacoes.push({
      severidade: "info",
      mensagem: "Indireto representa < 2% do custo/h — verifique se a estrutura de overhead está completa.",
    });
  }

  const hasEquipment = item.equipmentLines && item.equipmentLines.length > 0;
  const refCost  = toNum(item.referenceUnitCost, null);
  const refPrice = toNum(item.referenceUnitPrice, null);

  // 7. Calibração final
  const calibracao = gerarCalibracao(
    category,
    custo_unitario,
    preco_unitario,
    custo_total_hora,
    produtividade_utilizada,
    item.unit,
    hasEquipment,
    refCost,
    refPrice
  );

  // 8. Divergência vs planilha
  const difPct = (calc, ref) => (ref && ref !== 0 ? Math.abs((calc - ref) / ref) * 100 : null);
  const diffCostPct  = refCost  != null ? difPct(custo_unitario, refCost)  : null;
  const diffPricePct = refPrice != null ? difPct(preco_unitario, refPrice) : null;
  const diverge = (v) => (v != null && v > 1.0);
  const divergencia = (diverge(diffCostPct) || diverge(diffPricePct))
    ? { diffCostPct, diffPricePct, limitePct: 1.0 }
    : null;

  return {
    // retrocompatibilidade
    unitCost:   custo_unitario,
    totalCost:  custo_unitario * quantidade,
    totalPrice: total_item,

    produtividade_informada,
    produtividade_utilizada,
    volumeInSitu: volumes.volumeInSitu,
    fatorEmpolamento: volumes.fatorEmpolamento,
    volumeEmpolado: volumes.volumeEmpolado,
    custo_unitario,
    preco_unitario,
    total_item,
    markup_aplicado: markup,

    totalHourlyCost: custo_total_hora,
    preco_minimo:    custo_unitario * 1.10,
    lucro_unitario,
    margem_percentual,
    detalhamento: {
      diesel: sumDiesel,
      manutencao: sumManut,
      operador: sumOp,
      indiretos: sumIndireto,
      manual: manualCost,
      custoDireto: sumDiesel + sumManut,
      custoOperacional: sumOp + manualCost,
      custoIndireto: sumIndireto,
    },
    detalhes: {
      custo: {
        diesel: sumDiesel,
        manutencao: sumManut,
        maoDeObra: sumOp,
        manual: manualCost,
        indiretos: sumIndireto,
        custoDireto: sumDiesel + sumManut,
        custoOperacional: sumOp + manualCost,
        custoIndireto: sumIndireto,
        custoHora: custo_total_hora,
      },
      produtividade: {
        base: produtividade_calculo,
        eficiencia,
        fatorSolo,
        fatorLogistica,
        final: produtividade_utilizada,
        // Σ (baseProductivity × qty) da frota — fonte real do rateio de horas-máquina.
        producaoConjuntoBase,
        horasMaquinaRateio,
      },
      volumes: {
        inSitu: volumes.volumeInSitu,
        fatorEmpolamento: volumes.fatorEmpolamento,
        empolado: volumes.volumeEmpolado,
      },
      conversao: {
        custoHora: custo_total_hora,
        produtividade: produtividade_utilizada,
        custoUnitario: custo_unitario,
      },
      fatores: {
        fatorBase,
        valorAposFator1,
        ajusteFinal,
        valorAposFator2,
        bdi,
      },
      resultado: {
        precoUnitario: preco_unitario,
        quantidade,
        total: total_item,
      },
      auditoria: {
        tipo: "ok",
        unidade: unit,
        indiretoModel,
        validacoes,
        equipamentos: equipamentosAuditoria,
        custoBase: custoBaseAuditoria,
        decomposicaoUnitaria: decomposicaoUnitariaAuditoria,
        produtividade: produtividadeAuditoria,
        conversao: conversaoAuditoria,
        fatores: fatoresAuditoria,
        resultado: resultadoAuditoria,
      },
    },
    calibracao,
    status,
    divergencia,
  };
};

// ── Totais do orçamento ──
export const calcQuotationTotals = (items, equipmentMap, params, { bdi, adminPct, mobilPct, riskPct }) => {
  const itemsCalc = items.map(it => ({ ...it, ...calcItemCost(it, equipmentMap, params) }));

  const subtotalCost  = itemsCalc.reduce((s, it) => s + (it.custo_unitario * (it.quantity || 1)), 0);
  const subtotalPrice = itemsCalc.reduce((s, it) => s + it.total_item, 0);

  const indirect   = subtotalPrice * ((adminPct + mobilPct + riskPct) / 100);
  const bdiVal     = (subtotalPrice + indirect) * (bdi / 100);
  const precoFinal = subtotalPrice + indirect + bdiVal;

  const itensComReferencia = itemsCalc.filter(it => it.calibracao?.temReferencia);
  const itensDentroFaixa   = itensComReferencia.filter(it => it.calibracao?.status === "ok");
  const itensForaFaixa     = itensComReferencia.filter(it => it.calibracao?.status !== "ok");

  const calibracaoGlobal = {
    total: itensComReferencia.length,
    dentro: itensDentroFaixa.length,
    fora: itensForaFaixa.length,
    saude: itensComReferencia.length === 0
      ? "sem_dados"
      : itensForaFaixa.length === 0
        ? "otimo"
        : itensForaFaixa.length <= itensComReferencia.length * 0.3
          ? "bom"
          : "atencao",
    alertas: itensForaFaixa.map(it => ({
      desc: it.desc,
      status: it.calibracao.status,
      mensagem: it.calibracao.mensagem,
    })),
  };

  // ── Lucro estimado, imposto sobre lucro, lucro líquido, margem líquida ──
  const lucroEstimado     = subtotalPrice - subtotalCost;
  const aliquotaIR        = toNum(params?.aliquota_imposto_lucro, ASSUMPTIONS.comercial.percentualImposto);
  const impostoSobreLucro = lucroEstimado > 0 ? lucroEstimado * aliquotaIR : 0;
  const lucroLiquido      = lucroEstimado - impostoSobreLucro;
  const margemLiquida     = subtotalPrice > 0 ? (lucroLiquido / subtotalPrice) * 100 : 0;

  return {
    itemsCalc,
    subtotal: subtotalCost,
    subtotalPrice,
    indirect,
    bdiVal,
    precoFinal,
    laborFat: 0,
    equipFat: 0,
    calibracaoGlobal,
    lucroEstimado,
    impostoSobreLucro,
    lucroLiquido,
    margemLiquida,
    aliquotaIR,
  };
};
