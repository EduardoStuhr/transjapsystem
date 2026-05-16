// ══════════════════════════════════════════════════════════════════
// Transporte Agregado / Caminhão Truck — Composição por frete/viagem
// Espelha a aba "Dados Transporte (2)" da planilha RONMA.
//
// O caminhão agregado NÃO é equipamento operacional (sem diesel,
// manutenção, operador próprios). É um serviço pago por viagem ou
// por m³ e entra no item como linha de composição separada.
// ══════════════════════════════════════════════════════════════════

import { normalizeFatorEmpolamento, DEFAULT_FATOR_EMPOLAMENTO } from "../utils/empolamento";

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

export const MODOS_FRETE = ["por_m3", "por_viagem"];

export const TRANSPORTE_AGREGADO_DEFAULT = Object.freeze({
  enabled: false,
  descricao: "Caminhão agregado / Transporte",
  dmtKm: 0,
  volumeInSituPorViagem: 15,
  fatorEmpolamentoTransporte: "",
  perdaCarregamentoPct: 0,
  modoFrete: "por_viagem",
  valorFretePorM3OuViagem: 0,
  volumeBaseTransporte: 0,
  markupTransporte: 1,
});

// normalizeTransporteAgregado — converte o objeto cru do item em valores
// numéricos consistentes (fator empolamento normalizado para multiplicador,
// modoFrete validado, defaults garantidos). Não calcula totais.
export const normalizeTransporteAgregado = (item = {}, params = {}) => {
  const cru = item?.transporteAgregado || {};
  const enabled = !!cru.enabled;

  const fatorFallback = toNum(
    params?.fatorEmpolamentoPadrao,
    toNum(item?.fatorEmpolamento, DEFAULT_FATOR_EMPOLAMENTO),
  );
  const fatorEmpolamento = normalizeFatorEmpolamento(cru.fatorEmpolamentoTransporte, fatorFallback);
  const modoFreteCru = String(cru.modoFrete || "por_viagem").toLowerCase();
  const modoFrete = MODOS_FRETE.includes(modoFreteCru) ? modoFreteCru : "por_viagem";

  return {
    enabled,
    descricao: String(cru.descricao || TRANSPORTE_AGREGADO_DEFAULT.descricao),
    dmtKm: toNum(cru.dmtKm, 0),
    volumeInSituPorViagem: toNum(cru.volumeInSituPorViagem, 0),
    fatorEmpolamentoTransporte: fatorEmpolamento,
    fatorEmpolamentoTransporteRaw: cru.fatorEmpolamentoTransporte,
    perdaCarregamentoPct: safePct(cru.perdaCarregamentoPct),
    modoFrete,
    valorFretePorM3OuViagem: toNum(cru.valorFretePorM3OuViagem, 0),
    volumeBaseTransporte: toNum(cru.volumeBaseTransporte, 0),
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
      quantidadeViagens: 0,
      valorFrete: n.valorFretePorM3OuViagem,
      custoTotalFrete: 0,
      custoUnitarioTransporte: 0,
      precoUnitarioTransporte: 0,
      totalVendaTransporte: 0,
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

  const volumeEmpoladoPorViagem = n.volumeInSituPorViagem * n.fatorEmpolamentoTransporte;
  const perdaCarregamentoM3 = n.volumeInSituPorViagem * n.perdaCarregamentoPct;
  const volumeLiquidoPorViagem = n.volumeInSituPorViagem - perdaCarregamentoM3;

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
  if (podeCalcular) {
    custoTotalFrete = n.modoFrete === "por_viagem"
      ? quantidadeViagens * n.valorFretePorM3OuViagem
      : n.volumeBaseTransporte * n.valorFretePorM3OuViagem;
  }

  const custoUnitarioTransporte = n.volumeBaseTransporte > 0
    ? custoTotalFrete / n.volumeBaseTransporte
    : 0;
  const precoUnitarioTransporte = custoUnitarioTransporte * n.markupTransporte;
  const totalVendaTransporte = precoUnitarioTransporte * n.volumeBaseTransporte;

  return {
    ...n,
    volumeEmpoladoPorViagem,
    perdaCarregamentoM3,
    volumeLiquidoPorViagem,
    quantidadeViagens,
    valorFrete: n.valorFretePorM3OuViagem,
    custoTotalFrete,
    custoUnitarioTransporte,
    precoUnitarioTransporte,
    totalVendaTransporte,
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
