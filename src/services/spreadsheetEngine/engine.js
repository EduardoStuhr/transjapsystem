import { canonSheet, cellKey } from "./types.js";
import { extractDepKeys, evalFormula } from "./formula.js";

function toNum(v) {
  const n = typeof v === "string" ? parseFloat(v.replace(",", ".")) : parseFloat(v);
  return Number.isFinite(n) ? n : v;
}

const SHEET_SEQUENCE = [
  canonSheet("Dados do Contrato"),
  canonSheet("Custos de Equipamentos"),
  canonSheet("Custos Equipamentos"), // Fallback for alternative names
  canonSheet("COMPOSIÇÃO DE PREÇO"),
  canonSheet("Resultado Final"),
];

function sheetRank(sheetName) {
  const canon = canonSheet(sheetName);
  const idx = SHEET_SEQUENCE.findIndex((s) => s === canon);
  return idx === -1 ? 999 : idx;
}

function stableCellOrder(aKey, bKey, cellsByKey) {
  const a = cellsByKey[aKey];
  const b = cellsByKey[bKey];
  const ra = sheetRank(a?.aba);
  const rb = sheetRank(b?.aba);
  if (ra !== rb) return ra - rb;
  return String(aKey).localeCompare(String(bKey));
}

function findCyclePath(nodes, deps) {
  const nodeSet = new Set(nodes);
  const color = {}; // 0 unvisited, 1 visiting, 2 done
  const parent = {};

  const dfs = (u) => {
    color[u] = 1;
    for (const v of deps[u] || []) {
      if (!nodeSet.has(v)) continue;
      if (!color[v]) {
        parent[v] = u;
        const r = dfs(v);
        if (r) return r;
      } else if (color[v] === 1) {
        const path = [v];
        let cur = u;
        while (cur && cur !== v) {
          path.push(cur);
          cur = parent[cur];
        }
        path.push(v);
        path.reverse();
        return path;
      }
    }
    color[u] = 2;
    return null;
  };

  for (const n of nodes) {
    if (!color[n]) {
      const r = dfs(n);
      if (r) return r;
    }
  }
  return null;
}

export function buildIndex(workbook) {
  const cells = {};
  for (const sheet of Object.keys(workbook.sheets || {})) {
    const sheetCanon = canonSheet(sheet);
    for (const c of workbook.sheets[sheet]) {
      cells[cellKey(sheetCanon, c.id)] = { ...c, aba: sheetCanon, abaOriginal: sheet };
    }
  }
  return cells;
}

export function computeWorkbook(workbook, { overrides = {} } = {}) {
  const cellsByKey = buildIndex(workbook);
  const trace = {};
  const issues = [];
  const deps = {};
  const rev = {};
  const finalOrder = [];

  // Apply overrides (manual user inputs)
  for (const k of Object.keys(overrides)) {
    if (!cellsByKey[k]) continue;
    cellsByKey[k] = { ...cellsByKey[k], tipo: "manual", valor: overrides[k], formula: null };
  }

  // 1. Build Global Dep Graph
  for (const k of Object.keys(cellsByKey)) {
    const c = cellsByKey[k];
    if (c.tipo === "calculado" && c.formula) {
      const keys = extractDepKeys(c.formula, c.aba);
      deps[k] = keys;
      for (const d of keys) {
        rev[d] = rev[d] || [];
        rev[d].push(k);
      }
    } else {
      deps[k] = [];
    }
  }

  // 2. Group by Phases (Sheets)
  const phases = {};
  for (const k of Object.keys(cellsByKey)) {
    const aba = cellsByKey[k].aba;
    if (!phases[aba]) phases[aba] = [];
    phases[aba].push(k);
  }

  // Sort phases according to SHEET_SEQUENCE
  const phaseNames = Object.keys(phases).sort((a, b) => {
    return sheetRank(a) - sheetRank(b);
  });

  const getValue = (sheet, id) => {
    const k = cellKey(sheet, id);
    return cellsByKey[k]?.valor;
  };

  // 3. Process Phase by Phase
  for (const phaseName of phaseNames) {
    console.log(`[ENGINE] Iniciando fase: ${phaseName} (${phases[phaseName].length} células)`);
    const phaseCells = phases[phaseName];

    // Topological sort ONLY for cells within this phase!
    const inDeg = {};
    for (const k of phaseCells) inDeg[k] = 0;

    for (const k of phaseCells) {
      for (const d of deps[k] || []) {
        // Only count dependencies that are in the SAME phase.
        // Cross-phase deps are assumed to be already computed (or missing).
        if (inDeg[d] != null) inDeg[k] += 1;
      }
    }

    const q = phaseCells.filter((k) => inDeg[k] === 0).sort((a, b) => stableCellOrder(a, b, cellsByKey));
    const order = [];

    while (q.length) {
      const n = q.shift();
      order.push(n);
      for (const nxt of rev[n] || []) {
        if (inDeg[nxt] != null) {
          inDeg[nxt] -= 1;
          if (inDeg[nxt] === 0) {
            q.push(nxt);
            q.sort((a, b) => stableCellOrder(a, b, cellsByKey));
          }
        }
      }
    }

    // Evaluate the sorted cells for this phase
    for (const k of order) {
      finalOrder.push(k);
      const c = cellsByKey[k];
      
      if (c.tipo !== "calculado") {
        const raw = c.valor;
        const n = raw === "" ? null : raw === null || raw === undefined ? null : toNum(raw);
        const ok = n !== null && Number.isFinite(n);
        trace[k] = {
          key: k, id: c.id, aba: c.aba, nome: c.nome, unidade: c.unidade,
          tipo: c.tipo, origem: c.origem, formula: null, formulaConvertida: null,
          dependeDe: [], entradas: [], valor: ok ? n : null,
          status: ok ? "calculado" : "pendente",
          motivo: ok ? null : "Valor manual ausente",
          dependenciasFaltantes: [],
        };
        cellsByKey[k] = { ...c, valor: ok ? n : null };
        continue;
      }

      // Check cross-phase dependencies (early block)
      const declaredDeps = deps[k] || [];
      const crossPhaseMissing = [];
      for (const dk of declaredDeps) {
        const depCell = cellsByKey[dk];
        if (!depCell) {
          crossPhaseMissing.push(dk);
        } else {
          // If the dependency belongs to a phase that hasn't run yet!
          // Since we process in order of `phaseNames`, if its phaseRank is > current, it's blocked.
          const depRank = sheetRank(depCell.aba);
          const currentRank = sheetRank(phaseName);
          // Only strictly block if we are sure it's an uncomputed future phase
          if (depRank > currentRank) {
            crossPhaseMissing.push(dk);
          }
        }
      }

      if (crossPhaseMissing.length > 0) {
        trace[k] = {
          key: k, id: c.id, aba: c.aba, nome: c.nome, unidade: c.unidade,
          tipo: c.tipo, origem: c.origem, formula: c.formula, formulaConvertida: null,
          dependeDe: declaredDeps, entradas: [], valor: null,
          status: "pendente", motivo: "Aguardando aba não processada",
          dependenciasFaltantes: crossPhaseMissing,
        };
        cellsByKey[k] = { ...c, valor: null };
        issues.push({ type: "cross_phase_blocked", cell: k, missing: crossPhaseMissing });
        console.warn(`[ENGINE] Célula ${k} bloqueada por dependência de aba futura: ${crossPhaseMissing.join(', ')}`);
        continue;
      }

      const { value, used, missing, jsCode } = evalFormula({
        formula: c.formula,
        getValue,
        sheet: c.aba,
      });

      const entradas = used.map((uk) => ({
        key: uk,
        valor: cellsByKey[uk]?.valor ?? null,
        nome: cellsByKey[uk]?.nome,
        aba: cellsByKey[uk]?.aba,
        id: cellsByKey[uk]?.id,
        tipo: cellsByKey[uk]?.tipo,
        status: trace[uk]?.status,
      }));

      let status = "calculado";
      let motivo = null;
      let dependenciasFaltantes = missing || [];
      let finalValue = null;

      if (value && typeof value === 'object' && value.error) {
        if (value.type === "DEPENDENCY_MISSING") {
          status = "pendente";
          motivo = "Aguardando dependências";
        } else {
          status = "erro";
          motivo = value.message;
          issues.push({ type: value.type, cell: k, formula: c.formula });
        }
      } else {
        const val = toNum(value);
        if (!Number.isFinite(val)) {
          status = "erro";
          motivo = "Resultado não é um número finito";
          issues.push({ type: "nan", cell: k, formula: c.formula });
        } else {
          finalValue = val;
        }
      }

      cellsByKey[k] = { ...c, valor: finalValue };

      trace[k] = {
        key: k, id: c.id, aba: c.aba, nome: c.nome, unidade: c.unidade,
        tipo: c.tipo, origem: c.origem, formula: c.formula, formulaConvertida: jsCode,
        dependeDe: used, entradas, valor: status === "calculado" ? finalValue : null,
        status, motivo, dependenciasFaltantes,
      };
    }

    console.log(`[ENGINE] Fase ${phaseName} concluída. Células processadas: ${order.length}`);
  }

  // 4. Handle Cycles / Unreachables (Cells inside a phase that formed a cycle)
  const remaining = Object.keys(cellsByKey).filter((k) => !trace[k]);
  if (remaining.length) {
    const cycle = findCyclePath(remaining, deps);
    const cycleSet = cycle ? new Set(cycle) : new Set();
    issues.push({ type: "unresolved_or_cycle", cells: remaining, cycle });

    for (const k of remaining) {
      const c = cellsByKey[k];
      const isCycle = cycleSet.has(k);
      const motivo = isCycle ? "Dependência circular detectada na fase" : "Dependência não resolvida na fase";
      const dependenciasFaltantes = (deps[k] || []).filter((dk) => !cellsByKey[dk] || !trace[dk]);

      cellsByKey[k] = { ...c, valor: null };
      trace[k] = {
        key: k, id: c?.id, aba: c?.aba, nome: c?.nome, unidade: c?.unidade,
        tipo: c?.tipo, origem: c?.origem, formula: c?.formula || null,
        dependeDe: deps[k] || [],
        entradas: (deps[k] || []).map((dk) => ({
          key: dk, valor: cellsByKey[dk]?.valor ?? null, nome: cellsByKey[dk]?.nome,
          aba: cellsByKey[dk]?.aba, id: cellsByKey[dk]?.id, tipo: cellsByKey[dk]?.tipo, status: trace[dk]?.status,
        })),
        valor: null, status: "erro", motivo, dependenciasFaltantes, ciclo: isCycle ? cycle : null,
      };
    }
  }

  return { cellsByKey, trace, deps, order: finalOrder, issues };
}

