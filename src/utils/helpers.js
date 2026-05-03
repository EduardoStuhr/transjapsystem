export const parseNum = (v, fallback = 0) => parseFloat(v) || fallback;

export const parseField = (key, v) =>
  ["name", "unit", "category", "desc"].includes(key) ? v : parseFloat(v) || 0;
