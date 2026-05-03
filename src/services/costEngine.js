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

const safePct = (val) => (val > 1 ? val / 100 : val);
const toNum = (v, fallback = 0) => {
  const n = typeof v === "string" ? parseFloat(v.replace(",", ".")) : parseFloat(v);
  return Number.isFinite(n) ? n : fallback;
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
  const percLegacy = safePct(params?.percentual_indiretos || 0.10);

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

// ── Custo Horário por Equipamento ──
// Quando recebe `indiretoModel` em modo "absoluto", o equipamento NÃO
// carrega indireto próprio (ele é alocado depois, no nível do item).
// Sem o argumento, mantém o comportamento legado para retro-compat
// (página de Equipamentos, EquipmentSelector).
export const calcEquipmentHourlyCost = (eq, params, soilCategory, indiretoModel = null) => {
  const percManutBase = safePct(params.percentual_manutencao || 0.10);
  const ajusteSolo = (soilCategory === "3ª" || soilCategory === "pesado") ? 1.20 : 1.00;
  const percManutencao = percManutBase * ajusteSolo;

  const dieselPrice  = params.dieselPrice;
  const consumo      = eq.consumption;
  const salario      = eq.salario_operador_mensal || 3500;
  const fatorEnc     = params.fator_encargos;
  const horasMes     = params.hoursPerMonth;
  const modoIndireto = indiretoModel?.modo === "absoluto" ? "absoluto" : "percentual";
  const percIndir    = modoIndireto === "absoluto"
    ? 0
    : safePct(params.percentual_indiretos || 0.10);

  const diesel_hora     = consumo * dieselPrice;
  const manutencao_hora = diesel_hora * percManutencao;
  const operador_hora   = (salario * fatorEnc) / horasMes;
  const parcial         = diesel_hora + manutencao_hora + operador_hora;
  const indiretos_hora  = parcial * percIndir;
  const custo_total_hora = parcial + indiretos_hora;

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
      formula: ajusteSolo > 1
        ? "diesel × % manutenção × ajuste de solo (3ª)"
        : "diesel × % manutenção",
      formulaExec: ajusteSolo > 1
        ? `${fmtBRLh(diesel_hora)} × ${fmtPct(percManutBase)} × ${fmt(ajusteSolo, 2)} = ${fmtBRLh(manutencao_hora)}`
        : `${fmtBRLh(diesel_hora)} × ${fmtPct(percManutBase)} = ${fmtBRLh(manutencao_hora)}`,
      origem: "Parâmetros",
    }),
    operador: auditRow({
      label: "Mão de obra (operador)",
      valor: operador_hora,
      unidade: "R$/h",
      formula: "(salário mensal × fator encargos) ÷ horas/mês",
      formulaExec: `(${fmtBRL(salario)} × ${fmt(fatorEnc, 2)}) ÷ ${fmt(horasMes, 0)} h = ${fmtBRLh(operador_hora)}`,
      origem: "Equipamento + Parâmetros",
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
      salarioMensal: eq.salario_operador_mensal,
      diesel: mult(c.auditoria.diesel, c.diesel_hora * q),
      manutencao: mult(c.auditoria.manutencao, c.manutencao_hora * q),
      operador: mult(c.auditoria.operador, c.operador_hora * q),
      indiretos: mult(c.auditoria.indiretos, c.indiretos_hora * q),
      custoHora: mult(c.auditoria.custoHora, c.custo_total_hora * q),
    };
  }).filter(Boolean);
};

// ── Custo e Preço do Item Completo ──
export const calcItemCost = (item, equipmentMap, params) => {
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
        fatores: { fatorBase: toNum(params?.fatorBase, 2.3), valorAposFator1: valor, ajusteFinal: toNum(params?.ajusteFinal, 1.2), valorAposFator2: valor },
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

  let fatorSolo = 1.0;
  if (soil === "2ª" || soil === "medio")   fatorSolo = 0.85;
  if (soil === "3ª" || soil === "pesado")  fatorSolo = 0.70;

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
    const fatorBase   = toNum(item.fatorBase, toNum(params?.fatorBase, 2.3));
    const ajusteFinal = toNum(item.ajusteFinal, toNum(params?.ajusteFinal, 1.2));

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

  // 3. Custo Unitário
  const custo_unitario = custo_total_hora / produtividade_utilizada;

  // 3.1 Decomposição R$/un (espelho da aba COMPOSIÇÃO DE PREÇO da planilha)
  const decompUnitDiesel    = sumDiesel    / produtividade_utilizada;
  const decompUnitManut     = sumManut     / produtividade_utilizada;
  const decompUnitOp        = sumOp        / produtividade_utilizada;
  const decompUnitIndir     = sumIndireto  / produtividade_utilizada;
  const decompUnitManual    = manualCost   / produtividade_utilizada;

  const decomposicaoUnitariaAuditoria = [
    auditRow({
      label: "Diesel",
      valor: decompUnitDiesel,
      unidade: `R$/${unit}`,
      formula: "diesel R$/h ÷ produtividade real",
      formulaExec: `${fmtBRL(sumDiesel)} ÷ ${fmt(produtividade_utilizada, 2)} = ${fmtBRL(decompUnitDiesel)}/${unit}`,
    }),
    auditRow({
      label: "Manutenção",
      valor: decompUnitManut,
      unidade: `R$/${unit}`,
      formula: "manutenção R$/h ÷ produtividade real",
      formulaExec: `${fmtBRL(sumManut)} ÷ ${fmt(produtividade_utilizada, 2)} = ${fmtBRL(decompUnitManut)}/${unit}`,
    }),
    auditRow({
      label: "Mão de obra",
      valor: decompUnitOp,
      unidade: `R$/${unit}`,
      formula: "mão de obra R$/h ÷ produtividade real",
      formulaExec: `${fmtBRL(sumOp)} ÷ ${fmt(produtividade_utilizada, 2)} = ${fmtBRL(decompUnitOp)}/${unit}`,
    }),
    ...(manualCost > 0 ? [auditRow({
      label: "Custo manual",
      valor: decompUnitManual,
      unidade: `R$/${unit}`,
      formula: "custo manual R$/h ÷ produtividade real",
      formulaExec: `${fmtBRL(manualCost)} ÷ ${fmt(produtividade_utilizada, 2)} = ${fmtBRL(decompUnitManual)}/${unit}`,
      status: "manual",
    })] : []),
    auditRow({
      label: "Indiretos",
      valor: decompUnitIndir,
      unidade: `R$/${unit}`,
      formula: indiretoModel.modo === "absoluto"
        ? "indireto/h projeto ÷ produtividade real"
        : "Σ indiretos R$/h ÷ produtividade real (modo legado)",
      formulaExec: `${fmtBRL(sumIndireto)}/h ÷ ${fmt(produtividade_utilizada, 2)} ${unit}/h = ${fmtBRL(decompUnitIndir)}/${unit}`,
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
      formula: "custo hora ÷ produtividade real",
      formulaExec: `${fmtBRL(custo_total_hora)}/h ÷ ${fmt(produtividade_utilizada, 2)} ${unit}/h = ${fmtBRL(custo_unitario)}/${unit}`,
    }),
  ];

  // 4. Fatores da Planilha (Composição de Preço)
  const fatorBase     = toNum(item.fatorBase,   toNum(params?.fatorBase, 2.3));
  const ajusteFinal   = toNum(item.ajusteFinal, toNum(params?.ajusteFinal, 1.2));
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

  return { itemsCalc, subtotal: subtotalCost, subtotalPrice, indirect, bdiVal, precoFinal, laborFat: 0, equipFat: 0, calibracaoGlobal };
};
