export const uid = () => Math.random().toString(36).slice(2, 10);

export const fmt = (v, d = 2) =>
  new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: d,
    maximumFractionDigits: d,
  }).format(v ?? 0);

export const fmtBRL = (v) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v ?? 0);

export const today = () => new Date().toISOString().slice(0, 10);
