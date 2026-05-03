import { lexer, parse, formatJS, extractDepsFromAST } from "./parser.js";
import { evaluateAST } from "./interpreter.js";
import { canonSheet, isCellRefToken } from "./types.js";

const normalize = (s) =>
  String(s || "")
    .trim()
    .replace(/\s+/g, " ")
    .replace(/;/g, ",")
    .replace(/\$/g, ""); // Excel absolute refs ($A$1) → A1

// Extract refs like A1, B12 from formula strings.
export function extractRefs(formula) {
  const f = normalize(formula);
  const tokens = f.match(/[A-Z]{1,3}[0-9]{1,6}/g) || [];
  return Array.from(new Set(tokens.filter(isCellRefToken)));
}

export function extractDepKeys(formula, currentSheet) {
  const f = normalize(formula);
  if (!f) return [];
  try {
    const tokens = lexer(f);
    const ast = parse(tokens);
    return extractDepsFromAST(ast, canonSheet(currentSheet));
  } catch (e) {
    return [];
  }
}

export function evalFormula({ formula, getValue, sheet }) {
  const f0 = normalize(formula);
  if (!f0) return { value: NaN, used: [], missing: [], jsCode: "" };

  const used = new Set();
  const missing = new Set();
  
  let ast = null;
  let jsCode = "";
  let value = NaN;

  try {
    const tokens = lexer(f0);
    ast = parse(tokens);
    jsCode = formatJS(ast, 'ctx');
  } catch (e) {
    return { value: NaN, used: [], missing: [], jsCode: "Erro de parse" };
  }

  const ctx = {
    currentSheet: canonSheet(sheet),
    get: (s, id) => {
      const cleanS = canonSheet(s);
      const k = `${cleanS}!${id}`;
      used.add(k);
      
      const v = getValue(cleanS, id);
      if (v === null || v === undefined || v === "") {
        missing.add(k);
        return { error: true, type: "DEPENDENCY_MISSING", message: `Aguardando dependência: ${k}` };
      }
      
      const n = Number(typeof v === 'string' ? v.replace(",", ".") : v);
      if (!Number.isFinite(n)) {
        missing.add(k);
        return { error: true, type: "DEPENDENCY_MISSING", message: `Dependência não numérica: ${k}` };
      }
      
      return n;
    },
    getRange: (s, cellStart, cellEnd) => {
      // expand range and call ctx.get for all
      const m1 = cellStart.match(/^([A-Z]+)([0-9]+)$/);
      const m2 = cellEnd.match(/^([A-Z]+)([0-9]+)$/);
      if (!m1 || !m2) return [];
      
      const col1 = m1[1], row1 = parseInt(m1[2], 10);
      const col2 = m2[1], row2 = parseInt(m2[2], 10);
      const refs = [];
      
      if (col1 === col2) {
        const [st, en] = row1 <= row2 ? [row1, row2] : [row2, row1];
        for (let r = st; r <= en; r++) refs.push(`${col1}${r}`);
      } else {
        const c1 = col1.charCodeAt(0), c2 = col2.charCodeAt(0);
        const [st, en] = c1 <= c2 ? [c1, c2] : [c2, c1];
        for (let c = st; c <= en; c++) refs.push(`${String.fromCharCode(c)}${row1}`);
      }
      
      const results = [];
      for (const id of refs) {
        const res = ctx.get(s, id);
        if (res && res.error) return res; // Bubble up
        results.push(res);
      }
      return results;
    }
  };

  try {
    const result = evaluateAST(ast, ctx);
    if (result && result.error) {
      // Just mark as NaN for now, the missing set has the missing keys.
      // Wait, if it's a DIV_ZERO error, we shouldn't add to missing, we should return the error!
      value = result;
    } else {
      value = result;
    }
  } catch (e) {
    value = NaN;
  }

  // Handle DIV_ZERO and missing appropriately for the engine trace later
  return {
    value,
    used: Array.from(used),
    missing: Array.from(missing),
    jsCode
  };
}

