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

  if (raw > 0 && raw < 1) {
    return {
      raw,
      value: 1 + raw,
      status: "converted",
      message: `Fator ${raw.toFixed(2)} convertido para ${(1 + raw).toFixed(2)}x.`,
    };
  }

  if (raw > 0) {
    return {
      raw,
      value: raw,
      status: "ok",
      message: "",
    };
  }

  return {
    raw,
    value: fallbackNormalizado,
    status: "invalid",
    message: `Fator invalido; usando ${fallbackNormalizado.toFixed(2)}x.`,
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
