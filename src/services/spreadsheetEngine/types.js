/**
 * Cell model (sheet-aware) for auditability.
 *
 * key: `${sheet}!${id}` (ex: "COMPOSIÇÃO DE PREÇO!F6")
 *
 * tipo:
 * - "manual": user/provided constant
 * - "calculado": computed from formula
 */

export function cellKey(sheet, id) {
  return `${canonSheet(sheet)}!${String(id || "").replace(/\$/g, "")}`;
}

export function isCellRefToken(tok) {
  return /^[A-Z]{1,3}[0-9]{1,6}$/.test(tok);
}

export function canonSheet(name) {
  return String(name || "")
    .replace(/^\[[0-9]+\]/, "")
    .trim()
    .replace(/\s+/g, " ")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toUpperCase();
}
