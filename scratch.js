const { readFileSync } = require("fs");

function canonSheet(sheetName) {
  return String(sheetName || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

const sheetToCtxMap = {
  "dadosdocontrato": "dadosContrato",
  "custosdeequipamentos": "custosEquipamentos",
  "custosequipamentos": "custosEquipamentos",
  "composicaodepreco": "composicaoPreco",
  "resultadofinal": "resultadoFinal"
};

function sheetToCtx(sheet) {
  const c = canonSheet(sheet);
  return sheetToCtxMap[c] || c.replace(/[^a-z0-9]/g, "");
}

function expandRange(a, b) {
  const m1 = a.match(/^([A-Z]+)([0-9]+)$/);
  const m2 = b.match(/^([A-Z]+)([0-9]+)$/);
  if (!m1 || !m2) return [];
  const col1 = m1[1], row1 = parseInt(m1[2], 10);
  const col2 = m2[1], row2 = parseInt(m2[2], 10);
  if (col1 !== col2 && row1 !== row2) return []; 
  const refs = [];
  if (col1 === col2) {
    const [s, e] = row1 <= row2 ? [row1, row2] : [row2, row1];
    for (let r = s; r <= e; r++) refs.push(`${col1}${r}`);
  } else {
    const c1 = col1.charCodeAt(0), c2 = col2.charCodeAt(0);
    const [s, e] = c1 <= c2 ? [c1, c2] : [c2, c1];
    for (let c = s; c <= e; c++) refs.push(`${String.fromCharCode(c)}${row1}`);
  }
  return refs;
}

function transpileFormula(formula, currentSheet) {
  let f = String(formula || "").trim();
  if (f.startsWith("=")) f = f.slice(1).trim();

  // Handle <> and =
  f = f.replace(/<>/g, " !== ");
  f = f.replace(/(?<![<>!])=/g, " === ");
  
  // Fix NETWORKDAYS.INTL
  f = f.replace(/\bNETWORKDAYS\.INTL\b/g, "NETWORKDAYS_INTL");

  // Handle SUM ranges
  f = f.replace(/SUM\(\s*(?:'([^']+)'|([A-Za-z0-9 _\[\]\.]+))!\s*([A-Z]{1,3}[0-9]{1,6})\s*:\s*([A-Z]{1,3}[0-9]{1,6})\s*\)/g,
    (_m, qs1, us1, a, b) => {
      const s1 = qs1 || us1 || "";
      const refs = expandRange(a, b);
      return `SUM(${refs.map(id => `ctx.${sheetToCtx(s1)}.${id}`).join(", ")})`;
    }
  );
  f = f.replace(/SUM\(\s*([A-Z]{1,3}[0-9]{1,6})\s*:\s*([A-Z]{1,3}[0-9]{1,6})\s*\)/g, (_m, a, b) => {
    const refs = expandRange(a, b);
    return `SUM(${refs.map(id => `ctx.${sheetToCtx(currentSheet)}.${id}`).join(", ")})`;
  });

  // Cross-sheet refs
  f = f.replace(/('([^']+)'|[A-Za-z0-9 _\[\]\.]+)!\s*([A-Z]{1,3}[0-9]{1,6})/g, (m, _g1, quotedName, id) => {
    const sheetNameRaw = quotedName || m.split("!")[0];
    return `ctx.${sheetToCtx(sheetNameRaw)}.${id}`;
  });

  // Same-sheet refs
  f = f.replace(/\b([A-Z]{1,3}[0-9]{1,6})\b/g, (m, id, offset) => {
    if (["SUM", "IF", "NETWORKDAYS_INTL"].includes(m)) return m;
    const prev = offset > 0 ? f[offset - 1] : "";
    if (prev === '.' || prev === '"' || prev === "'") return m;
    return `ctx.${sheetToCtx(currentSheet)}.${id}`;
  });

  // Convert IF(cond, a, b) to (cond ? a : b)
  // This requires a bit more care due to nested IFs, but regex can handle simple ones or we can just provide a SUM/IF function in ctx context if we don't fully transpile to ternary.
  // Wait, if we just define IF in ctx and use JS evaluation, it won't short circuit.
  // We can write a simple recursive parser for IF.
  
  return `function(ctx) {\n  return ${f};\n}`;
}

console.log(transpileFormula("IF(A1<>0, SUM(B1:C1)/A1, 0)", "Dados do Contrato"));
console.log(transpileFormula("IF('CUSTOS EQUIPAMENTOS'!D5=1, 'CUSTOS EQUIPAMENTOS'!E5, 0)", "Dados do Contrato"));
