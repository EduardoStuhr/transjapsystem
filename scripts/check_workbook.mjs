import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { computeWorkbook } from "../src/services/spreadsheetEngine/engine.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const input = process.argv[2] || path.join(__dirname, "..", "src", "data", "workbooks", "ronmaWorkbook.full.json");

const raw = fs.readFileSync(input, "utf-8");
const workbook = JSON.parse(raw);

const res = computeWorkbook(workbook);

console.log("Workbook sheets:", Object.keys(workbook.sheets || {}).length);
console.log("Cells:", Object.values(workbook.sheets || {}).reduce((s, a) => s + a.length, 0));
console.log("Order length:", res.order.length);
console.log("Issues:", res.issues.length);

const issuesByType = {};
for (const it of res.issues) issuesByType[it.type] = (issuesByType[it.type] || 0) + 1;
console.log("Issues by type:", issuesByType);

// Show first 50 nan issues with formula
const nan = res.issues.filter((i) => i.type === "nan").slice(0, 50);
if (nan.length) {
  console.log("\nFirst NaN issues:");
  for (const i of nan) console.log("-", i.cell, "=", i.formula);
}

const cycles = res.issues.find((i) => i.type === "unresolved_or_cycle");
if (cycles) {
  console.log("\nUnresolved/cycle cells:", cycles.cells.length);
  console.log("First 50 unresolved:", cycles.cells.slice(0, 50));
}

// Extract function names inventory (upper tokens followed by '(')
const fnSet = new Set();
for (const sheet of Object.keys(workbook.sheets || {})) {
  for (const c of workbook.sheets[sheet]) {
    if (c.tipo === "calculado" && typeof c.formula === "string") {
      const m = c.formula.match(/\b([A-Z_]{2,})\s*\(/g) || [];
      for (const tok of m) {
        const name = tok.replace("(", "").trim();
        if (name !== "SUM" && name !== "IF") fnSet.add(name);
      }
    }
  }
}
console.log("\nOther functions found:", Array.from(fnSet).sort().join(", ") || "(none)");

