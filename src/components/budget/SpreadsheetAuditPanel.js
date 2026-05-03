import React, { useMemo } from "react";
import S from "../../styles/tokens";
import { computeWorkbook } from "../../services/spreadsheetEngine/engine";
import { RONMA_WORKBOOK } from "../../data/workbooks/ronmaWorkbook";
import RONMA_WORKBOOK_FULL from "../../data/workbooks/ronmaWorkbook.full.json";
import SpreadsheetCellTrace from "./SpreadsheetCellTrace";

// Minimal audit panel: shows the mapped COMPOSIÇÃO DE PREÇO cells for LIMPEZA (row 6),
// with formula + dependencies resolved by the engine.
export default function SpreadsheetAuditPanel() {
  const workbook = RONMA_WORKBOOK_FULL?.sheets ? RONMA_WORKBOOK_FULL : RONMA_WORKBOOK;
  const result = useMemo(() => computeWorkbook(workbook), [workbook]);

  const t = result.trace;
  const cellsByKey = result.cellsByKey;

  const keys = [
    "COMPOSIÇÃO DE PREÇO!B6",
    "COMPOSIÇÃO DE PREÇO!C6",
    "COMPOSIÇÃO DE PREÇO!D6",
    "COMPOSIÇÃO DE PREÇO!E6",
    "COMPOSIÇÃO DE PREÇO!F6",
    "COMPOSIÇÃO DE PREÇO!H6",
    "COMPOSIÇÃO DE PREÇO!J6",
  ];

  return (
    <div style={{ marginTop: 12, border: `1px solid ${S.border}`, borderRadius: 12, padding: 12, background: "rgba(255,255,255,0.02)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "baseline" }}>
        <div style={{ fontWeight: 900, color: S.text }}>Auditoria por célula (planilha)</div>
        <div style={{ fontSize: 11, color: S.muted }}>
          Issues: <b style={{ color: result.issues.length ? "#f59e0b" : S.accent3 }}>{result.issues.length}</b>
        </div>
      </div>

      {result.issues.length > 0 && (
        <div style={{ marginTop: 8, fontSize: 12, color: "#f59e0b", fontWeight: 700 }}>
          Atenção: existem células pendentes/erro. Agora o sistema **não mascara** com 0,00 — ele mostra “—” e o motivo/dependências faltantes.
        </div>
      )}

      <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 10 }}>
        {keys.map((k) => (
          <SpreadsheetCellTrace key={k} t={t[k]} cellsByKey={cellsByKey} />
        ))}
      </div>
    </div>
  );
}

