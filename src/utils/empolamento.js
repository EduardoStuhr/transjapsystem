import { ASSUMPTIONS } from "../config/assumptions.config";

const toNum = (value, fallback = 0) => {
  if (value === null || value === undefined || value === "") return fallback;
  const n = typeof value === "string" ? parseFloat(value.replace(",", ".")) : Number(value);
  return Number.isFinite(n) ? n : fallback;
};

export const DEFAULT_FATOR_EMPOLAMENTO = 1 + ASSUMPTIONS.empolamento.fatorPadrao;

export const resolveFatorEmpolamento = (value, fallback = DEFAULT_FATOR_EMPOLAMENTO) => {
  const fallbackNum = toNum(fallback, DEFAULT_FATOR_EMPOLAMENTO);
  const fallbackNormalizado = fallbackNum > 0 && fallbackNum < 1 ? 1 + fallbackNum : fallbackNum;
  const raw = toNum(value, fallbackNormalizado);

  // Caso 1: valor em decimal (0,36 = 36% de acréscimo) → multiplicador.
  if (raw > 0 && raw < 1) {
    return {
      raw,
      value: 1 + raw,
      status: "converted",
      message: `Fator ${raw.toFixed(2)} interpretado como acréscimo (${(raw * 100).toFixed(0)}%) → ${(1 + raw).toFixed(2)}×.`,
    };
  }

  // Caso 2: multiplicador razoável (1 ≤ raw ≤ 5).
  if (raw >= 1 && raw <= 5) {
    return {
      raw,
      value: raw,
      status: "ok",
      message: "",
    };
  }

  // Caso 3: valor entre 5 e 100 → provável % digitado sem decimal
  // (ex: "40" em vez de "0,40"). Resgata como percentual.
  if (raw > 5 && raw <= 100) {
    const corrigido = 1 + raw / 100;
    return {
      raw,
      value: corrigido,
      status: "rescued",
      message: `Fator ${raw} foi tratado como percentual (${raw}%) → ${corrigido.toFixed(2)}×. Use "0,${String(Math.round(raw)).padStart(2, "0")}" ou "${corrigido.toFixed(2)}" para evitar ambiguidade.`,
    };
  }

  // Caso 4: valor absurdo (> 100) — usa fallback.
  return {
    raw,
    value: fallbackNormalizado,
    status: "invalid",
    message: `Fator ${raw} inválido (>100); usando fallback ${fallbackNormalizado.toFixed(2)}×.`,
  };
};

export const normalizeFatorEmpolamento = (value, fallback = DEFAULT_FATOR_EMPOLAMENTO) =>
  resolveFatorEmpolamento(value, fallback).value;

export const calcVolumeComEmpolamento = (volume, fatorEmpolamento, fallback = DEFAULT_FATOR_EMPOLAMENTO) => {
  const v = toNum(volume, 0);
  const f = normalizeFatorEmpolamento(fatorEmpolamento, fallback);
  if (v <= 0 || f <= 0) return 0;
  return v * f;
};
