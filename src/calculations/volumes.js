// ══════════════════════════════════════════════════════════════════
// BLOCO A — Volumes e Prazo (camada de projeto)
// Funções puras: recebem inputs, retornam saída, sem efeitos colaterais.
// Constantes vêm de assumptions.config.js. Inputs do contrato têm
// prioridade sobre defaults.
// ══════════════════════════════════════════════════════════════════

import { ASSUMPTIONS } from "../config/assumptions.config";
import { normalizeFatorEmpolamento } from "../utils/empolamento";

const toNum = (v, fallback = 0) => {
  if (v === null || v === undefined || v === "") return fallback;
  const n = typeof v === "string" ? parseFloat(v.replace(",", ".")) : Number(v);
  return Number.isFinite(n) ? n : fallback;
};

const toDate = (v) => {
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v;
  if (typeof v === "string" && v) {
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
};

// ── A1. Volume empolado ──────────────────────────────────────────
// Convencao unica: fator e MULTIPLICADOR. fatorEmpolamento=1.36 => +36%.
export const calcVolumeEmpolado = (volumeInSitu, fatorEmpolamento) => {
  const v = toNum(volumeInSitu, 0);
  const f = normalizeFatorEmpolamento(fatorEmpolamento, 1 + ASSUMPTIONS.empolamento.fatorPadrao);
  return v * f;
};

// ── A2. Bota-fora (calculado a partir de escavação − aterro) ─────
export const calcBotaFora = (volumeEscavacaoTotal, volumeAterro, fatorEmpolamento) => {
  const inSitu = Math.max(0, toNum(volumeEscavacaoTotal, 0) - toNum(volumeAterro, 0));
  return {
    inSitu,
    empolado: calcVolumeEmpolado(inSitu, fatorEmpolamento),
  };
};

// ── A3. Limpeza camada vegetal ───────────────────────────────────
export const calcVolumeLimpezaVegetal = (areaTerreno_m2, percentualLimpeza, profundidadeCamadaM) => {
  const area    = toNum(areaTerreno_m2, 0);
  const perc    = toNum(percentualLimpeza, ASSUMPTIONS.limpezaVegetal.percentualAreaTerrenoPadrao);
  const profund = toNum(profundidadeCamadaM, ASSUMPTIONS.limpezaVegetal.profundidadeCamadaM);
  return {
    areaLimpeza_m2:    area * perc,
    volumeLimpeza_m3:  area * perc * profund,
  };
};

// ── A4. NETWORKDAYS — dias úteis (seg–sex) excluindo feriados ────
// Implementa a mesma semântica do Excel NETWORKDAYS: inclusive nos extremos.
export const networkDays = (dataInicio, dataFim, feriados = []) => {
  const ini = toDate(dataInicio);
  const fim = toDate(dataFim);
  if (!ini || !fim) return 0;

  let start = new Date(ini.getFullYear(), ini.getMonth(), ini.getDate());
  let end   = new Date(fim.getFullYear(), fim.getMonth(), fim.getDate());
  if (start > end) [start, end] = [end, start];

  const feriadosSet = new Set(
    feriados
      .map(toDate)
      .filter(Boolean)
      .map(d => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`)
  );

  let count = 0;
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const dow = d.getDay(); // 0=Dom, 6=Sáb
    if (dow === 0 || dow === 6) continue;
    const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    if (feriadosSet.has(key)) continue;
    count++;
  }
  return count;
};

// ── A4. Prazo e horas do projeto ─────────────────────────────────
export const calcPrazoEHoras = ({
  dataInicio,
  dataFim,
  feriados = [],
  diasUteisMes,
  jornadaHorasDia,
  horasIndiretasDia,
}) => {
  const diasUteisContrato     = networkDays(dataInicio, dataFim, feriados);
  const diasMes               = toNum(diasUteisMes, ASSUMPTIONS.jornada.diasUteisMes);
  const jornada               = toNum(jornadaHorasDia, ASSUMPTIONS.jornada.horasPorDia);
  const horasIndiretas        = toNum(horasIndiretasDia, jornada);
  const totalHorasProjeto     = diasUteisContrato * jornada;
  const totalHorasProjetoMes  = diasMes * jornada;
  const prazoMeses            = diasMes > 0 ? diasUteisContrato / diasMes : 0;
  const totalHorasIndiretas   = diasUteisContrato * horasIndiretas;

  return {
    diasUteisContrato,
    diasUteisMes:       diasMes,
    jornadaHorasDia:    jornada,
    horasIndiretasDia:  horasIndiretas,
    totalHorasProjeto,
    totalHorasProjetoMes,
    prazoMeses,
    totalHorasIndiretas,
  };
};

// ── Snapshot completo do Bloco A ─────────────────────────────────
// Recebe ContractData e devolve TODOS os valores derivados de Bloco A
// + uma tabela de auditoria (id, label, valor, unidade, fórmula, fórmulaExec).
export const computeBlocoA = (contract) => {
  const fatorEmpolamento = normalizeFatorEmpolamento(
    contract?.fatorEmpolamento,
    1 + ASSUMPTIONS.empolamento.fatorPadrao
  );

  const volumeEscavacaoTotal = toNum(contract?.volumeEscavacaoTotal, 0);
  const volumeAterro         = toNum(contract?.volumeAterro, 0);
  const areaTerreno_m2       = toNum(contract?.areaTerreno_m2, 0);

  const volumeEscavacaoEmpolado = calcVolumeEmpolado(volumeEscavacaoTotal, fatorEmpolamento);
  const volumeAterroEmpolado    = calcVolumeEmpolado(volumeAterro, fatorEmpolamento);
  const botaFora                = calcBotaFora(volumeEscavacaoTotal, volumeAterro, fatorEmpolamento);
  const limpeza                 = calcVolumeLimpezaVegetal(
    areaTerreno_m2,
    contract?.percentualLimpeza,
    contract?.profundidadeCamadaVegetalM
  );

  const prazo = calcPrazoEHoras({
    dataInicio:        contract?.dataInicio,
    dataFim:           contract?.dataFim,
    feriados:          contract?.feriados || [],
    diasUteisMes:      contract?.diasUteisMes,
    jornadaHorasDia:   contract?.jornadaHorasDia,
    horasIndiretasDia: contract?.horasIndiretasDia,
  });

  const auditoria = [
    {
      id: "A1.escavacao_empolado",
      label: "Volume escavação empolado",
      valor: volumeEscavacaoEmpolado,
      unidade: "m³",
      formula: "volumeEscavacaoTotal × fatorEmpolamento",
      formulaExec: `${volumeEscavacaoTotal} × ${fatorEmpolamento} = ${volumeEscavacaoEmpolado.toFixed(2)}`,
    },
    {
      id: "A1.aterro_empolado",
      label: "Volume aterro empolado",
      valor: volumeAterroEmpolado,
      unidade: "m³",
      formula: "volumeAterro × fatorEmpolamento",
      formulaExec: `${volumeAterro} × ${fatorEmpolamento} = ${volumeAterroEmpolado.toFixed(2)}`,
    },
    {
      id: "A2.bota_fora_in_situ",
      label: "Bota-fora (in situ)",
      valor: botaFora.inSitu,
      unidade: "m³",
      formula: "max(0, volumeEscavacaoTotal − volumeAterro)",
      formulaExec: `max(0, ${volumeEscavacaoTotal} − ${volumeAterro}) = ${botaFora.inSitu.toFixed(2)}`,
    },
    {
      id: "A2.bota_fora_empolado",
      label: "Bota-fora (empolado)",
      valor: botaFora.empolado,
      unidade: "m³",
      formula: "bota_fora_in_situ × fatorEmpolamento",
      formulaExec: `${botaFora.inSitu.toFixed(2)} × ${fatorEmpolamento} = ${botaFora.empolado.toFixed(2)}`,
    },
    {
      id: "A3.limpeza_volume",
      label: "Volume limpeza camada vegetal",
      valor: limpeza.volumeLimpeza_m3,
      unidade: "m³",
      formula: "areaTerreno × percentualLimpeza × profundidadeCamada",
      formulaExec: `${areaTerreno_m2} × ${contract?.percentualLimpeza ?? ASSUMPTIONS.limpezaVegetal.percentualAreaTerrenoPadrao} × ${contract?.profundidadeCamadaVegetalM ?? ASSUMPTIONS.limpezaVegetal.profundidadeCamadaM} = ${limpeza.volumeLimpeza_m3.toFixed(2)}`,
    },
    {
      id: "A4.dias_uteis_contrato",
      label: "Dias úteis do contrato",
      valor: prazo.diasUteisContrato,
      unidade: "dias",
      formula: "NETWORKDAYS(dataInicio, dataFim, feriados)",
      formulaExec: `NETWORKDAYS(${contract?.dataInicio || "—"}, ${contract?.dataFim || "—"}) = ${prazo.diasUteisContrato}`,
    },
    {
      id: "A4.total_horas_projeto",
      label: "Total de horas do projeto",
      valor: prazo.totalHorasProjeto,
      unidade: "h",
      formula: "diasUteisContrato × jornadaHorasDia",
      formulaExec: `${prazo.diasUteisContrato} × ${prazo.jornadaHorasDia} = ${prazo.totalHorasProjeto}`,
    },
    {
      id: "A4.prazo_meses",
      label: "Prazo (meses úteis)",
      valor: prazo.prazoMeses,
      unidade: "meses",
      formula: "diasUteisContrato ÷ diasUteisMes",
      formulaExec: `${prazo.diasUteisContrato} ÷ ${prazo.diasUteisMes} = ${prazo.prazoMeses.toFixed(2)}`,
    },
    {
      id: "A4.total_horas_indiretas",
      label: "Total de horas indiretas",
      valor: prazo.totalHorasIndiretas,
      unidade: "h",
      formula: "diasUteisContrato × horasIndiretasDia",
      formulaExec: `${prazo.diasUteisContrato} × ${prazo.horasIndiretasDia} = ${prazo.totalHorasIndiretas}`,
    },
  ];

  return {
    inputs: {
      volumeEscavacaoTotal,
      volumeAterro,
      areaTerreno_m2,
      fatorEmpolamento,
    },
    volumes: {
      escavacaoEmpolado: volumeEscavacaoEmpolado,
      aterroEmpolado:    volumeAterroEmpolado,
      botaFora,
      limpeza,
    },
    prazo,
    auditoria,
  };
};
