export const uid = () => Math.random().toString(36).slice(2, 10);

export const fmt = (v, d = 2) =>
  new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: d,
    maximumFractionDigits: d,
  }).format(v ?? 0);

export const fmtBRL = (v) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v ?? 0);

export const fmtBRLPreciso = (v, d = 6) =>
  `R$ ${new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: d,
    maximumFractionDigits: d,
  }).format(v ?? 0)}`;

export const today = () => new Date().toISOString().slice(0, 10);

// parseBRNumber — converte texto BR ("1.349.346,69", "R$ 2,63924408") em
// número. NÃO usar com valores já numéricos: só serve para inputs/textos
// vindos da UI. parseFloat(value.replace(",", ".")) quebra com milhar.
export const parseBRNumber = (value, fallback = 0) => {
  if (typeof value === "number") return Number.isFinite(value) ? value : fallback;
  if (typeof value !== "string") return fallback;
  const clean = value
    .replace(/\s/g, "")
    .replace(/R\$/g, "")
    .replace(/\./g, "")
    .replace(",", ".");
  const n = parseFloat(clean);
  return Number.isFinite(n) ? n : fallback;
};
