// ══════════════════════════════════════════════════════════════════
// Transporte Agregado / Caminhão Truck — Composição por frete/viagem
// Espelha a aba "Dados Transporte (2)" da planilha RONMA.
// ══════════════════════════════════════════════════════════════════

import { resolveFatorEmpolamento, DEFAULT_FATOR_EMPOLAMENTO } from "../utils/empolamento";

const toNum = (v, fallback = 0) => {
  if (typeof v === "number") return Number.isFinite(v) ? v : fallback;
  if (v == null || v === "") return fallback;
  const n = typeof v === "string" ? parseFloat(v.replace(",", ".")) : Number(v);
  return Number.isFinite(n) ? n : fallback;
};

const safePct = (v) => {
  const n = toNum(v, 0);
  // Se for > 1 (ex: 40), assume que é porcentagem inteira e divide por 100 (0.40).
  return n > 1 ? n / 100 : n;
};

export const MODOS_FRETE = [
  "por_viagem",
  "por_m3_in_situ",
  "por_m3_empolado",
  "planilha_m3_empolado", // Substitui o antigo "por_m3_planilha"
];

export const TRANSPORTE_AGREGADO_DEFAULT = Object.freeze({
  enabled: false,
  descricao: "Caminhão agregado / Transporte",
  dmtKm: 0,
  volumeBaseTransporte: 0,
  tipoVolumeBase: "in_situ", // "in_situ" | "empolado"

  volumeInSituPorViagem: 15,

  // Nomes conforme solicitação do usuário
  valorFreteBase: 0,
  acrescimoFreteEmpolamentoPct: 0, // ex: 40 para 40%
  perdaCarregamentoPct: 0,        // ex: 10 para 10%

  modoFrete: "planilha_m3_empolado",
  markupTransporte: 1,
});

export const normalizeTransporteAgregado = (item = {}, params = {}) => {
  const cru = item?.transporteAgregado || {};
  const enabled = !!cru.enabled;

  const paramFallback = toNum(params?.fatorEmpolamentoPadrao, DEFAULT_FATOR_EMPOLAMENTO);
  const fatorMaterialInfo = resolveFatorEmpolamento(item?.fatorEmpolamento, paramFallback);
  const fatorMaterial = fatorMaterialInfo.value;

  // Mapeamento de nomes antigos para novos para retro-compatibilidade
  const valorFreteBase = toNum(cru.valorFreteBase ?? cru.valorFretePorM3OuViagem, 0);
  const acrescimoFreteEmpolamentoPct = toNum(cru.acrescimoFreteEmpolamentoPct ?? cru.fatorEmpolamentoTransporte, 0);
  const perdaCarregamentoPct = toNum(cru.perdaCarregamentoPct, 0);
  const volumeBaseTransporte = toNum(cru.volumeBaseTransporte, 0);
  const tipoVolumeBase = String(cru.tipoVolumeBase ?? cru.volumeBaseTipo ?? "in_situ").toLowerCase();

  let modoFrete = String(cru.modoFrete || "planilha_m3_empolado").toLowerCase();
  if (modoFrete === "por_m3_planilha") modoFrete = "planilha_m3_empolado";
  if (!MODOS_FRETE.includes(modoFrete)) modoFrete = "planilha_m3_empolado";

  return {
    enabled,
    descricao: String(cru.descricao || TRANSPORTE_AGREGADO_DEFAULT.descricao),
    dmtKm: toNum(cru.dmtKm, 0),
    volumeBaseTransporte,
    tipoVolumeBase,
    volumeInSituPorViagem: toNum(cru.volumeInSituPorViagem, 0),
    fatorMaterial,
    fatorMaterialStatus: fatorMaterialInfo.status,
    valorFreteBase,
    acrescimoFreteEmpolamentoPct,
    perdaCarregamentoPct,
    modoFrete,
    markupTransporte: toNum(cru.markupTransporte, 1),
  };
};

export const calcTransporteAgregado = (item = {}, params = {}) => {
  const n = normalizeTransporteAgregado(item, params);
  const validacoes = [];

  if (!n.enabled) {
    return {
      ...n,
      volumeEmpoladoTotal: 0,
      custoTotalFrete: 0,
      custoUnitarioInSitu: 0,
      totalVendaTransporte: 0,
      validacoes
    };
  }

  // 1. Volumes
  // Se a base já for empolada, calculamos o in situ equivalente dividindo pelo fator material.
  const volumeBaseInSitu = n.tipoVolumeBase === "empolado"
    ? (n.fatorMaterial > 0 ? n.volumeBaseTransporte / n.fatorMaterial : 0)
    : n.volumeBaseTransporte;

  const volumeEmpoladoTotal = n.tipoVolumeBase === "empolado"
    ? n.volumeBaseTransporte
    : n.volumeBaseTransporte * n.fatorMaterial;

  // 2. Unidades de acréscimo
  const acrescimoEmpolamentoPct = safePct(n.acrescimoFreteEmpolamentoPct);
  const acrescimoPerdaPct = safePct(n.perdaCarregamentoPct);

  // 3. Parcelas Unitárias (R$/m³ empolado)
  const freteBaseUnitario = n.valorFreteBase;
  const acrescimoEmpolamentoUnitario = freteBaseUnitario * acrescimoEmpolamentoPct;
  const acrescimoPerdaUnitario = freteBaseUnitario * acrescimoPerdaPct;

  // 4. Custos Unitários
  const custoUnitarioEmpolado = freteBaseUnitario + acrescimoEmpolamentoUnitario + acrescimoPerdaUnitario;

  let custoTotalFrete = 0;
  if (n.modoFrete === "por_viagem") {
    const volLiquidoViagem = n.volumeInSituPorViagem * (1 - acrescimoPerdaPct);
    const qtdViagens = volLiquidoViagem > 0 ? volumeBaseInSitu / volLiquidoViagem : 0;
    custoTotalFrete = qtdViagens * n.valorFreteBase;
  } else if (n.modoFrete === "por_m3_in_situ") {
    custoTotalFrete = volumeBaseInSitu * n.valorFreteBase;
  } else if (n.modoFrete === "por_m3_empolado") {
    custoTotalFrete = volumeEmpoladoTotal * n.valorFreteBase;
  } else {
    // modo: planilha_m3_empolado
    custoTotalFrete = custoUnitarioEmpolado * volumeEmpoladoTotal;
  }

  const custoUnitarioInSitu = volumeBaseInSitu > 0 ? custoTotalFrete / volumeBaseInSitu : 0;

  // 5. Preços (Venda)
  const markup = n.markupTransporte;
  const precoUnitarioEmpolado = custoUnitarioEmpolado * markup;
  const precoUnitarioInSitu = custoUnitarioInSitu * markup;
  const totalVendaTransporte = custoTotalFrete * markup;
  const usaUnitarioEmpoladoNaComposicao = n.modoFrete === "planilha_m3_empolado";
  const custoUnitarioTransporte = usaUnitarioEmpoladoNaComposicao
    ? custoUnitarioEmpolado
    : custoUnitarioInSitu;
  const precoUnitarioTransporte = usaUnitarioEmpoladoNaComposicao
    ? precoUnitarioEmpolado
    : precoUnitarioInSitu;
  const volumeBaseTotalizacao = usaUnitarioEmpoladoNaComposicao
    ? volumeEmpoladoTotal
    : volumeBaseInSitu;
  const volumeBaseTotalizacaoTipo = usaUnitarioEmpoladoNaComposicao
    ? "empolado"
    : "in_situ";
  const decomposicaoPlanilha = n.modoFrete === "planilha_m3_empolado" ? {
    // CUSTO
    parcelaBase: freteBaseUnitario,
    parcelaEmpolamento: acrescimoEmpolamentoUnitario,
    parcelaPerda: acrescimoPerdaUnitario,
    somaPorM3Empolado: custoUnitarioEmpolado,

    totalBase: freteBaseUnitario * volumeEmpoladoTotal,
    totalEmpolamento: acrescimoEmpolamentoUnitario * volumeEmpoladoTotal,
    totalPerda: acrescimoPerdaUnitario * volumeEmpoladoTotal,
    totalCusto: custoTotalFrete,

    // MARKUP
    markup,

    // VENDA - preco unitario por m3 empolado
    precoBase: freteBaseUnitario * markup,
    precoEmpolamento: acrescimoEmpolamentoUnitario * markup,
    precoPerda: acrescimoPerdaUnitario * markup,
    precoSomaPorM3Empolado: custoUnitarioEmpolado * markup,

    // VENDA - totais por parcela
    totalVendaBase: freteBaseUnitario * volumeEmpoladoTotal * markup,
    totalVendaEmpolamento: acrescimoEmpolamentoUnitario * volumeEmpoladoTotal * markup,
    totalVendaPerda: acrescimoPerdaUnitario * volumeEmpoladoTotal * markup,
    totalVendaGeral: custoTotalFrete * markup,

    // Equivalentes in situ usados pela composicao final
    volumeInSitu: volumeBaseInSitu,
    custoUnitInSitu: custoUnitarioInSitu,
    precoUnitInSitu: precoUnitarioInSitu,

    // Metadata
    volumeEmpoladoTotal,
    volumeBaseTransporte: n.volumeBaseTransporte,
    volumeBaseTipo: n.tipoVolumeBase,
    fatorMaterialMult: n.fatorMaterial,
    fatorEmpAcresc: acrescimoEmpolamentoPct,
    perdaCarregamentoPct: acrescimoPerdaPct,
  } : null;

  // 6. Auditoria
  const formulaAuditoria = {
    freteBase: freteBaseUnitario,
    acrescimoEmpolamento: acrescimoEmpolamentoUnitario,
    acrescimoPerda: acrescimoPerdaUnitario,
    somaUnitarioEmpolado: custoUnitarioEmpolado,
    volumeEmpoladoTotal,
    totalFrete: custoTotalFrete,
    equivalenteInSitu: custoUnitarioInSitu
  };

  if (n.volumeBaseTransporte <= 0) validacoes.push({ severidade: "erro", mensagem: "Volume base deve ser > 0" });
  if (n.valorFreteBase <= 0) validacoes.push({ severidade: "erro", mensagem: "Valor do frete base deve ser > 0" });
  if (n.markupTransporte > 0 && n.markupTransporte < 1) {
    const perdaPct = ((1 - n.markupTransporte) * 100).toFixed(0);
    validacoes.push({
      severidade: "alerta",
      mensagem: `Markup transporte = ${n.markupTransporte.toFixed(2).replace(".", ",")} (${((n.markupTransporte - 1) * 100).toFixed(0)}%). Valor < 1 significa VENDA ABAIXO DO CUSTO - prejuizo de R$ ${perdaPct}%. Confirme se e intencional (ex.: rateio entre obras).`,
    });
  }
  if (n.markupTransporte === 1) {
    validacoes.push({
      severidade: "alerta",
      mensagem: "Markup transporte = 1,00 (0%). VENDA = CUSTO - sem margem para o empreiteiro. Confirme se e intencional (ex.: repasse direto ao cliente).",
    });
  }
  if (n.markupTransporte > 5) {
    validacoes.push({
      severidade: "alerta",
      mensagem: `Markup transporte = ${n.markupTransporte.toFixed(2).replace(".", ",")} (${((n.markupTransporte - 1) * 100).toFixed(0)}%) parece alto demais. Markup tipico de frete em terraplenagem: 1,5-2,5 (50-150%). Confira.`,
    });
  }

  return {
    ...n,
    volumeBaseInSitu,
    fatorEmpolamentoMaterial: n.fatorMaterial,
    volumeEmpoladoTotal,

    freteBaseUnitario,
    acrescimoEmpolamentoPct,
    acrescimoEmpolamentoUnitario,
    acrescimoPerdaPct,
    acrescimoPerdaUnitario,

    custoUnitarioEmpolado,
    custoUnitarioInSitu,
    custoUnitarioTransporte,
    custoTotalFrete,

    markupTransporte: markup,
    precoUnitarioEmpolado,
    precoUnitarioInSitu,
    precoUnitarioTransporte,
    totalVendaTransporte,
    volumeBaseTotalizacao,
    volumeBaseTotalizacaoTipo,
    decomposicaoPlanilha,

    formulaAuditoria,
    validacoes
  };
};

export const buildLinhaAuditoriaTransporteAgregado = (calc, item = {}) => {
  if (!calc?.enabled) return null;
  const dmtTxt = calc.dmtKm > 0 ? ` DMT ${calc.dmtKm} km` : "";
  const equipamento = `${calc.descricao}${dmtTxt}`.trim();

  return {
    tipo: "transporte_agregado",
    equipmentId: `transporte-agregado:${item?.id || "item"}`,
    equipamento,
    nome: equipamento,
    categoria: "Transporte Agregado",
    qty: 1,
    is_executor: false,

    diesel_R$_m3: 0,
    manutencao_R$_m3: 0,
    mo_R$_m3: 0,
    indireto_R$_m3: 0,

    // Mostramos o custo equivalente in situ se o orçamento estiver nesse padrão
    custo_R$_m3: calc.custoUnitarioTransporte,
    markup: calc.markupTransporte,
    preco_R$_m3: calc.precoUnitarioTransporte,

    volume_base_total: calc.volumeBaseTotalizacao,
    volume_base_tipo: calc.volumeBaseTotalizacaoTipo || "transporte_agregado",

    total_custo_maquina_obra_R$: calc.custoTotalFrete,
    total_maquina_obra_R$: calc.totalVendaTransporte,

    // Campos precisos
    custo_R$_m3_preciso: calc.custoUnitarioTransporte,
    markup_preciso: calc.markupTransporte,
    preco_R$_m3_preciso: calc.precoUnitarioTransporte,
    volume_base_total_preciso: calc.volumeBaseTotalizacao,
    total_maquina_obra_preciso_R$: calc.totalVendaTransporte,

    transporteAgregado: calc,
    validacoes: calc.validacoes || [],
  };
};
