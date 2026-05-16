// ══════════════════════════════════════════════════════════════════
// Transporte Agregado / Caminhão Truck — Composição por frete/viagem
// Espelha a aba "Dados Transporte (2)" da planilha RONMA.
//
// O caminhão agregado NÃO é equipamento operacional (sem diesel,
// manutenção, operador próprios). É um serviço pago por viagem ou
// por m³ e entra no item como linha de composição separada.
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
  return n > 1 ? n / 100 : n;
};

// 4 modos de frete:
//  • por_viagem        — R$/viagem × Σ viagens (modo legado)
//  • por_m3_in_situ    — R$/m³ × vol_in_situ (sem inflação)
//  • por_m3_empolado   — R$/m³ × vol_empolado (sem inflação)
//  • por_m3_planilha   — R$/m³ × vol_empolado × (1 + empolamento + perda)
//                        ← Modelo da planilha RONMA. Default para itens novos.
export const MODOS_FRETE = [
  "por_viagem",
  "por_m3_in_situ",
  "por_m3_empolado",
  "por_m3_planilha",
];

export const TRANSPORTE_AGREGADO_DEFAULT = Object.freeze({
  enabled: false,
  descricao: "Caminhão agregado / Transporte",
  dmtKm: 0,
  volumeInSituPorViagem: 15,
  fatorEmpolamentoTransporte: "",
  perdaCarregamentoPct: 0,
  modoFrete: "por_m3_planilha",
  valorFretePorM3OuViagem: 0,
  volumeBaseTransporte: 0,
  volumeBaseTipo: "in_situ",
  markupTransporte: 1,
});

// normalizeTransporteAgregado — converte o objeto cru do item em valores
// numéricos consistentes. Dois fatores distintos são tratados:
//   • fatorMaterial            — do contrato/material (item.fatorEmpolamento,
//                                default 1,36). Converte vol_in_situ → vol_empolado.
//   • fatorEmpolamentoTransporte — fator do frete (ex: 1,40). Aplicado SÓ
//                                como acréscimo no preço (1 + emp + perda).
export const normalizeTransporteAgregado = (item = {}, params = {}) => {
  const cru = item?.transporteAgregado || {};
  const enabled = !!cru.enabled;

  const paramFallback = toNum(params?.fatorEmpolamentoPadrao, DEFAULT_FATOR_EMPOLAMENTO);
  // Fator do MATERIAL (contrato). Vem do item, com fallback de params/default.
  const fatorMaterialInfo = resolveFatorEmpolamento(item?.fatorEmpolamento, paramFallback);
  const fatorMaterial = fatorMaterialInfo.value;

  // Fator do TRANSPORTE (acréscimo no frete). Vem só do bloco de transporte.
  // Se vazio, cai para o fator material — neutralizando o acréscimo.
  const fatorTransporteInfo = resolveFatorEmpolamento(cru.fatorEmpolamentoTransporte, fatorMaterial);
  const fatorEmpolamento = fatorTransporteInfo.value;

  const modoFreteCru = String(cru.modoFrete || "por_m3_planilha").toLowerCase();
  const modoFrete = MODOS_FRETE.includes(modoFreteCru) ? modoFreteCru : "por_m3_planilha";

  return {
    enabled,
    descricao: String(cru.descricao || TRANSPORTE_AGREGADO_DEFAULT.descricao),
    dmtKm: toNum(cru.dmtKm, 0),
    volumeInSituPorViagem: toNum(cru.volumeInSituPorViagem, 0),
    fatorMaterial,
    fatorMaterialStatus: fatorMaterialInfo.status,
    fatorMaterialMessage: fatorMaterialInfo.message,
    fatorEmpolamentoTransporte: fatorEmpolamento,
    fatorEmpolamentoTransporteRaw: cru.fatorEmpolamentoTransporte,
    fatorEmpolamentoStatus: fatorTransporteInfo.status,
    fatorEmpolamentoMessage: fatorTransporteInfo.message,
    perdaCarregamentoPct: safePct(cru.perdaCarregamentoPct),
    modoFrete,
    valorFretePorM3OuViagem: toNum(cru.valorFretePorM3OuViagem, 0),
    volumeBaseTransporte: toNum(cru.volumeBaseTransporte, 0),
    volumeBaseTipo: String(cru.volumeBaseTipo || "in_situ").toLowerCase(),
    markupTransporte: toNum(cru.markupTransporte, 1),
  };
};

// calcTransporteAgregado — aplica as fórmulas da aba "Dados Transporte (2)".
// Quando enabled === false, retorna objeto "neutro" (totais = 0) com
// enabled = false; os consumidores devem ignorar a linha nesse caso.
export const calcTransporteAgregado = (item = {}, params = {}) => {
  const n = normalizeTransporteAgregado(item, params);
  const validacoes = [];

  if (!n.enabled) {
    return {
      ...n,
      volumeEmpoladoPorViagem: 0,
      perdaCarregamentoM3: 0,
      volumeLiquidoPorViagem: 0,
      volumeEmpoladoTotal: 0,
      quantidadeViagens: 0,
      valorFrete: n.valorFretePorM3OuViagem,
      custoTotalFrete: 0,
      custoUnitarioTransporte: 0,
      precoUnitarioTransporte: 0,
      totalVendaTransporte: 0,
      decomposicaoPlanilha: null,
      validacoes,
    };
  }

  if (n.volumeBaseTransporte <= 0) {
    validacoes.push({ severidade: "erro", mensagem: "Transporte agregado: volume base de transporte deve ser > 0." });
  }
  if (n.volumeInSituPorViagem <= 0) {
    validacoes.push({ severidade: "erro", mensagem: "Transporte agregado: volume in situ por viagem deve ser > 0." });
  }
  if (n.valorFretePorM3OuViagem <= 0) {
    validacoes.push({ severidade: "erro", mensagem: "Transporte agregado: valor do frete deve ser > 0." });
  }
  if (n.markupTransporte <= 0) {
    validacoes.push({ severidade: "erro", mensagem: "Transporte agregado: markup deve ser > 0." });
  }
  if (!MODOS_FRETE.includes(n.modoFrete)) {
    validacoes.push({ severidade: "erro", mensagem: "Transporte agregado: modo do frete inválido." });
  }

  if (n.fatorEmpolamentoStatus === "rescued" || n.fatorEmpolamentoStatus === "converted") {
    validacoes.push({ severidade: "alerta", mensagem: `Transporte agregado: ${n.fatorEmpolamentoMessage}` });
  } else if (n.fatorEmpolamentoStatus === "invalid") {
    validacoes.push({ severidade: "alerta", mensagem: `Transporte agregado: ${n.fatorEmpolamentoMessage}` });
  }

  // Fator do TRANSPORTE — multiplicador (ex: 1,40); só entra no acréscimo
  // do preço (1 + emp + perda), nunca na conversão de volume.
  const fatorTransporteMult = n.fatorEmpolamentoTransporte;
  const fatorEmpAcresc = fatorTransporteMult - 1;

  // Fator do MATERIAL — usado para todas as conversões de volume in situ
  // → empolado (per viagem e total). Vem do contrato/item.
  const fatorMaterialMult = n.fatorMaterial;

  // Volumes derivados (sempre via fatorMaterial)
  const volumeEmpoladoPorViagem = n.volumeInSituPorViagem * fatorMaterialMult;
  const perdaCarregamentoM3 = n.volumeInSituPorViagem * n.perdaCarregamentoPct;
  const volumeLiquidoPorViagem = n.volumeInSituPorViagem - perdaCarregamentoM3;

  // Volume EMPOLADO total (base derivada).
  // Se volumeBaseTransporte é in situ → vol_empolado_total = base × fatorMaterial.
  // Se já é empolado, assume direto.
  const volumeEmpoladoTotal = n.volumeBaseTipo === "empolado"
    ? n.volumeBaseTransporte
    : n.volumeBaseTransporte * fatorMaterialMult;

  if (volumeLiquidoPorViagem <= 0) {
    validacoes.push({
      severidade: "erro",
      mensagem: "Transporte agregado: volume líquido por viagem ≤ 0 (revise perda de carregamento).",
    });
  }

  const podeCalcular =
    n.volumeBaseTransporte > 0 &&
    volumeLiquidoPorViagem > 0 &&
    n.valorFretePorM3OuViagem > 0 &&
    n.markupTransporte > 0;

  const quantidadeViagens = volumeLiquidoPorViagem > 0
    ? n.volumeBaseTransporte / volumeLiquidoPorViagem
    : 0;

  let custoTotalFrete = 0;
  let custoUnitPlanilha = 0;
  if (podeCalcular) {
    switch (n.modoFrete) {
      case "por_viagem":
        custoTotalFrete = quantidadeViagens * n.valorFretePorM3OuViagem;
        break;
      case "por_m3_in_situ":
        custoTotalFrete = n.volumeBaseTransporte * n.valorFretePorM3OuViagem;
        break;
      case "por_m3_empolado":
        custoTotalFrete = volumeEmpoladoTotal * n.valorFretePorM3OuViagem;
        break;
      case "por_m3_planilha":
        // Modelo RONMA: vol_empolado × R$/m³ × (1 + empolamento + perda).
        custoUnitPlanilha = n.valorFretePorM3OuViagem * (1 + fatorEmpAcresc + n.perdaCarregamentoPct);
        custoTotalFrete = volumeEmpoladoTotal * custoUnitPlanilha;
        break;
      default:
        validacoes.push({ severidade: "erro", mensagem: `Modo de frete desconhecido: ${n.modoFrete}` });
    }
  }

  // Decomposição auditável (para a UI) — só para o modo planilha.
  const decomposicaoPlanilha = n.modoFrete === "por_m3_planilha" ? {
    parcelaBase: n.valorFretePorM3OuViagem,
    parcelaEmpolamento: n.valorFretePorM3OuViagem * fatorEmpAcresc,
    parcelaPerda: n.valorFretePorM3OuViagem * n.perdaCarregamentoPct,
    somaPorM3Empolado: custoUnitPlanilha,
    volumeEmpoladoTotal,
    volumeBaseTransporte: n.volumeBaseTransporte,
    volumeBaseTipo: n.volumeBaseTipo,
    fatorMaterialMult,
    fatorEmpAcresc,
    perdaCarregamentoPct: n.perdaCarregamentoPct,
  } : null;

  const custoUnitarioTransporte = n.volumeBaseTransporte > 0
    ? custoTotalFrete / n.volumeBaseTransporte
    : 0;
  const precoUnitarioTransporte = custoUnitarioTransporte * n.markupTransporte;
  const totalVendaTransporte = precoUnitarioTransporte * n.volumeBaseTransporte;

  // ── Validações de plausibilidade (warnings, não erros) ──
  if (n.modoFrete === "por_viagem" && n.valorFretePorM3OuViagem > 0 && n.valorFretePorM3OuViagem < 10) {
    validacoes.push({
      severidade: "alerta",
      mensagem: `Valor do frete R$ ${n.valorFretePorM3OuViagem.toFixed(2)}/viagem parece baixo demais. Frete real de caminhão truck DMT ${n.dmtKm} km é tipicamente R$ ${Math.max(30, n.dmtKm * 15)}–R$ ${n.dmtKm * 60}/viagem. Confira se não é R$/m³.`,
    });
  }
  if (n.modoFrete.startsWith("por_m3") && n.valorFretePorM3OuViagem > 50) {
    validacoes.push({
      severidade: "alerta",
      mensagem: `Valor do frete R$ ${n.valorFretePorM3OuViagem.toFixed(2)}/m³ parece alto demais. Frete tipicamente é R$ 1–10/m³. Confira se não é R$/viagem.`,
    });
  }
  if (volumeEmpoladoPorViagem > 100) {
    validacoes.push({
      severidade: "alerta",
      mensagem: `Volume empolado por viagem = ${volumeEmpoladoPorViagem.toFixed(0)} m³ é fisicamente implausível para caminhão truck (cap. típica: 12–20 m³). Confira o fator de empolamento.`,
    });
  }
  if (n.modoFrete === "por_m3_planilha" && (fatorEmpAcresc + n.perdaCarregamentoPct) > 1) {
    validacoes.push({
      severidade: "alerta",
      mensagem: `Soma empolamento (${(fatorEmpAcresc * 100).toFixed(0)}%) + perda (${(n.perdaCarregamentoPct * 100).toFixed(0)}%) > 100%. Custo unitário será ${(1 + fatorEmpAcresc + n.perdaCarregamentoPct).toFixed(2)}× o frete base; revise.`,
    });
  }

  return {
    ...n,
    volumeEmpoladoPorViagem,
    perdaCarregamentoM3,
    volumeLiquidoPorViagem,
    volumeEmpoladoTotal,
    quantidadeViagens,
    valorFrete: n.valorFretePorM3OuViagem,
    custoTotalFrete,
    custoUnitarioTransporte,
    precoUnitarioTransporte,
    totalVendaTransporte,
    decomposicaoPlanilha,
    validacoes,
  };
};

// buildLinhaAuditoriaTransporteAgregado — molda o resultado como linha de
// composição compatível com `auditoria.equipamentos[]` (mesmo shape usado
// no PainelComposicao). Útil para acoplar o transporte agregado às telas
// existentes sem precisar duplicar lógica de render.
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
    baseProductivity: 0,

    diesel_R$_m3: 0,
    manutencao_R$_m3: 0,
    mo_R$_m3: 0,
    indireto_R$_m3: 0,

    custo_R$_m3: calc.custoUnitarioTransporte,
    markup: calc.markupTransporte,
    preco_R$_m3: calc.precoUnitarioTransporte,

    volume_base_total: calc.volumeBaseTransporte,
    volume_base_tipo: "transporte_agregado",
    volume_base_origem: "item.transporteAgregado.volumeBaseTransporte",
    volume_base_alerta: null,

    total_custo_maquina_obra_R$: calc.custoTotalFrete,
    total_maquina_obra_R$: calc.totalVendaTransporte,

    // Campos precisos (sem arredondamento)
    custo_R$_m3_preciso: calc.custoUnitarioTransporte,
    markup_preciso: calc.markupTransporte,
    preco_R$_m3_preciso: calc.precoUnitarioTransporte,
    volume_base_total_preciso: calc.volumeBaseTransporte,
    total_maquina_obra_preciso_R$: calc.totalVendaTransporte,

    transporteAgregado: calc,
    validacoes: calc.validacoes || [],
  };
};
