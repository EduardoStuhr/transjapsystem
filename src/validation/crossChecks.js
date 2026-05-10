// ══════════════════════════════════════════════════════════════════
// VALIDAÇÕES CRUZADAS — sinaliza, nunca corrige silenciosamente.
// Implementa as 8 validações listadas na spec, mais retornadas como
// estrutura uniforme { id, severidade, titulo, mensagem, contexto }.
// Severidades: "ok" | "info" | "alerta" | "erro"
// ══════════════════════════════════════════════════════════════════

import { ASSUMPTIONS } from "../config/assumptions.config";

const toNum = (v, fb = 0) => {
  const n = typeof v === "string" ? parseFloat(v.replace(",", ".")) : Number(v);
  return Number.isFinite(n) ? n : fb;
};

const fmtNum = (n, d = 2) =>
  Number.isFinite(n) ? n.toLocaleString("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d }) : "—";

// ── V1. Soma dos pesos de serviço = 1.0 ──────────────────────────
export const checkPesosServicoSomaUm = (pesosServico) => {
  const pesos = pesosServico || {};
  const valores = Object.values(pesos).map((v) => toNum(v, 0));
  const soma    = valores.reduce((s, v) => s + v, 0);
  const passou  = Math.abs(soma - 1.0) < 0.001;
  return {
    id: "V1",
    titulo: "Pesos de serviço somam 1.0",
    severidade: passou ? "ok" : "erro",
    mensagem: passou
      ? `Soma dos pesos = ${fmtNum(soma, 4)} ✓`
      : `Soma dos pesos = ${fmtNum(soma, 4)} (esperado 1.0). Verifique a matriz de alocação por serviço — não use /5 hardcoded.`,
    contexto: { soma, pesos },
  };
};

// ── V2. Capacidade vs prazo declarado (A5) ───────────────────────
// horasNecessariasPorProdutividade = volumeInSitu / Σ produtividade ativa
// Se diasNecessarios << diasUteisContrato → prazo superestimado
// Se diasNecessarios >> diasUteisContrato → gargalo de capacidade
export const checkCapacidadeVsPrazo = ({
  volumeInSitu,
  produtividadeTotal_m3h,
  diasUteisContrato,
  jornadaHorasDia,
  toleranciaInferior = 0.5,
  toleranciaSuperior = 1.5,
}) => {
  const vol  = toNum(volumeInSitu, 0);
  const prod = toNum(produtividadeTotal_m3h, 0);
  const dias = toNum(diasUteisContrato, 0);
  const jorn = toNum(jornadaHorasDia, ASSUMPTIONS.jornada.horasPorDia);

  if (vol <= 0 || prod <= 0 || dias <= 0) {
    return {
      id: "V2",
      titulo: "Capacidade × prazo declarado",
      severidade: "info",
      mensagem: "Não foi possível avaliar (volume, produtividade ou prazo zero/ausente).",
      contexto: { volumeInSitu: vol, produtividadeTotal_m3h: prod, diasUteisContrato: dias },
    };
  }

  const horasNecessarias  = vol / prod;
  const diasNecessarios   = horasNecessarias / jorn;
  const horasDeclaradas   = dias * jorn;
  const ratio             = diasNecessarios / dias;

  let severidade = "ok";
  let mensagem = `Capacidade alinhada ao prazo: ${fmtNum(diasNecessarios, 1)} dias necessários vs ${dias} declarados.`;

  if (ratio < toleranciaInferior) {
    severidade = "alerta";
    mensagem = `Prazo superestimado: capacidade conclui em ${fmtNum(diasNecessarios, 1)} dias (${fmtNum(ratio * 100, 1)}% do prazo). Considere reduzir alocação de equipamentos ou prazo.`;
  } else if (ratio > toleranciaSuperior) {
    severidade = "erro";
    mensagem = `Gargalo de capacidade: produtividade exige ${fmtNum(diasNecessarios, 1)} dias, mas só há ${dias}. Reforce alocação ou ajuste prazo.`;
  }

  return {
    id: "V2",
    titulo: "Capacidade × prazo declarado",
    severidade,
    mensagem,
    contexto: { horasNecessarias, diasNecessarios, horasDeclaradas, ratio },
  };
};

// ── V3. Produtividade não-zero em equipamentos ativos ────────────
export const checkProdutividadeAtivos = (alocacoes) => {
  const ativos = (alocacoes || []).filter((a) => toNum(a.quantidade, 0) > 0);
  const zerados = ativos.filter((a) => toNum(a.produtividadeHora_m3, 0) <= 0 && a.tipo !== "apoio" && a.tipo !== "transporte");
  return {
    id: "V3",
    titulo: "Equipamentos de produção com produtividade > 0",
    severidade: zerados.length === 0 ? "ok" : "erro",
    mensagem: zerados.length === 0
      ? "Todos os equipamentos ativos de produção têm produtividade > 0."
      : `Equipamentos ativos com produtividade zerada: ${zerados.map((a) => a.nome || a.equipamentoId).join(", ")}.`,
    contexto: { zerados },
  };
};

// ── V4. Sanidade do diesel R$/m³ ─────────────────────────────────
export const checkDieselUnitario = (dieselRsM3, limiteAlerta = 1.0) => {
  const v = toNum(dieselRsM3, 0);
  return {
    id: "V4",
    titulo: "Sanidade do diesel R$/m³",
    severidade: v > limiteAlerta ? "alerta" : "ok",
    mensagem: v > limiteAlerta
      ? `Diesel = R$ ${fmtNum(v, 4)}/m³ — acima do limite (R$ ${fmtNum(limiteAlerta, 2)}). Reveja consumo (L/h) ou produtividade.`
      : `Diesel = R$ ${fmtNum(v, 4)}/m³ ✓`,
    contexto: { dieselRsM3: v, limite: limiteAlerta },
  };
};

// ── V5. Quantidades ativas: equipamento qtd=0 não pode ter custo ──
export const checkQuantidadesAtivas = (linhasCusto) => {
  const inconsistentes = (linhasCusto || []).filter(
    (l) => toNum(l.quantidade, 0) <= 0 && toNum(l.custoTotal, 0) > 0
  );
  return {
    id: "V5",
    titulo: "Equipamentos qtd=0 sem custo",
    severidade: inconsistentes.length === 0 ? "ok" : "erro",
    mensagem: inconsistentes.length === 0
      ? "Nenhum equipamento com qtd=0 carrega custo."
      : `Equipamentos com qtd=0 carregam custo: ${inconsistentes.map((l) => l.nome || l.equipamentoId).join(", ")}. Filtre antes de somar.`,
    contexto: { inconsistentes },
  };
};

// ── V6. Volume empolado consistente ──────────────────────────────
export const checkVolumeEmpoladoConsistente = ({ volumeInSitu, volumeEmpolado, fatorEmpolamento, tolerancia = 0.01 }) => {
  const inSitu   = toNum(volumeInSitu, 0);
  const empolado = toNum(volumeEmpolado, 0);
  const fator    = toNum(fatorEmpolamento, ASSUMPTIONS.empolamento.fatorPadrao);

  if (inSitu <= 0) {
    return {
      id: "V6",
      titulo: "Volume empolado consistente",
      severidade: "info",
      mensagem: "Volume in situ zero — não avaliado.",
      contexto: { inSitu, empolado, fator },
    };
  }

  const ratioCalc = empolado / inSitu;
  const ratioEsp  = 1 + fator;
  const dif       = Math.abs(ratioCalc - ratioEsp);
  const passou    = dif < tolerancia;

  return {
    id: "V6",
    titulo: "Volume empolado consistente",
    severidade: passou ? "ok" : "alerta",
    mensagem: passou
      ? `Razão empolado/in situ = ${fmtNum(ratioCalc, 4)} ≈ (1 + ${fmtNum(fator, 2)}) ✓`
      : `Razão empolado/in situ = ${fmtNum(ratioCalc, 4)} difere de (1 + ${fmtNum(fator, 2)}) = ${fmtNum(ratioEsp, 4)}.`,
    contexto: { inSitu, empolado, fator, ratioCalc, ratioEsp, dif },
  };
};

// ── V7. Markup mínimo ────────────────────────────────────────────
export const checkMarkupMinimo = (markup, minimo = 1.5) => {
  const m = toNum(markup, 0);
  const passou = m >= minimo;
  return {
    id: "V7",
    titulo: `Markup ≥ ${minimo}×`,
    severidade: passou ? "ok" : "alerta",
    mensagem: passou
      ? `Markup ${fmtNum(m, 2)}× ≥ ${minimo}× ✓`
      : `Markup ${fmtNum(m, 2)}× abaixo de ${minimo}× — provavelmente não cobre indireto.`,
    contexto: { markup: m, minimo },
  };
};

// ── V8. Margem líquida mínima ────────────────────────────────────
export const checkMargemLiquida = (margemLiquidaPct, minimo = 10) => {
  const m = toNum(margemLiquidaPct, 0);
  const passou = m >= minimo;
  return {
    id: "V8",
    titulo: `Margem líquida ≥ ${minimo}%`,
    severidade: passou ? "ok" : "alerta",
    mensagem: passou
      ? `Margem ${fmtNum(m, 2)}% ≥ ${minimo}% ✓`
      : `Margem ${fmtNum(m, 2)}% abaixo de ${minimo}% — risco de operar no prejuízo.`,
    contexto: { margemPct: m, minimo },
  };
};

// ── Orquestrador: roda todas as validações disponíveis para o input ──
// Aceita um snapshot agregado do orçamento e devolve array de resultados,
// na ordem V1..V8 (ausentes como severidade "info" — "não avaliado").
export const runAllCrossChecks = (snapshot = {}) => {
  const results = [];

  results.push(snapshot.pesosServico
    ? checkPesosServicoSomaUm(snapshot.pesosServico)
    : { id: "V1", titulo: "Pesos de serviço somam 1.0", severidade: "info", mensagem: "Matriz de pesos não fornecida (ainda usa rateio implícito).", contexto: {} }
  );

  results.push(snapshot.capacidade
    ? checkCapacidadeVsPrazo(snapshot.capacidade)
    : { id: "V2", titulo: "Capacidade × prazo declarado", severidade: "info", mensagem: "Snapshot de capacidade não fornecido.", contexto: {} }
  );

  results.push(snapshot.alocacoes
    ? checkProdutividadeAtivos(snapshot.alocacoes)
    : { id: "V3", titulo: "Equipamentos ativos com produtividade > 0", severidade: "info", mensagem: "Alocações não fornecidas.", contexto: {} }
  );

  results.push(snapshot.dieselRsM3 != null
    ? checkDieselUnitario(snapshot.dieselRsM3, snapshot.limiteDieselRsM3)
    : { id: "V4", titulo: "Sanidade do diesel R$/m³", severidade: "info", mensagem: "Diesel R$/m³ não fornecido.", contexto: {} }
  );

  results.push(snapshot.linhasCusto
    ? checkQuantidadesAtivas(snapshot.linhasCusto)
    : { id: "V5", titulo: "Equipamentos qtd=0 sem custo", severidade: "info", mensagem: "Linhas de custo não fornecidas.", contexto: {} }
  );

  results.push(snapshot.volume
    ? checkVolumeEmpoladoConsistente(snapshot.volume)
    : { id: "V6", titulo: "Volume empolado consistente", severidade: "info", mensagem: "Volume não fornecido.", contexto: {} }
  );

  results.push(snapshot.markup != null
    ? checkMarkupMinimo(snapshot.markup, snapshot.markupMinimo)
    : { id: "V7", titulo: "Markup mínimo", severidade: "info", mensagem: "Markup não fornecido.", contexto: {} }
  );

  results.push(snapshot.margemLiquidaPct != null
    ? checkMargemLiquida(snapshot.margemLiquidaPct, snapshot.margemMinimaPct)
    : { id: "V8", titulo: "Margem líquida mínima", severidade: "info", mensagem: "Margem não fornecida.", contexto: {} }
  );

  return results;
};

// Resumo qualitativo da bateria de validações
export const sumarizarChecks = (results) => {
  const counts = { ok: 0, info: 0, alerta: 0, erro: 0 };
  for (const r of results) counts[r.severidade] = (counts[r.severidade] || 0) + 1;
  let saude = "otimo";
  if (counts.erro > 0) saude = "critico";
  else if (counts.alerta > 0) saude = "atencao";
  else if (counts.info > counts.ok) saude = "incompleto";
  return { counts, total: results.length, saude };
};
