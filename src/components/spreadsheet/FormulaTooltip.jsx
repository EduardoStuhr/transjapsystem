import React, { useEffect, useState } from "react";
import { SS } from "../../styles/spreadsheetTheme";

// ──────────────────────────────────────────────────────────────────
// <FormulaTooltip> — popup pequeno disparado no hover de uma célula
// calculada. Mostra: ID célula, fórmula, fórmula executada (com
// valores substituídos), valor final, aba/origem.
// Posicionamento: lê o bounding rect do `anchor` e ancora abaixo.
// ──────────────────────────────────────────────────────────────────

export default function FormulaTooltip({
  anchor,
  cellId,
  formula,
  formulaExec,
  unit,
  value,
  origem,
}) {
  const [pos, setPos] = useState(null);

  useEffect(() => {
    if (!anchor) return;
    const r = anchor.getBoundingClientRect();
    const top  = r.bottom + 4;
    const left = Math.min(window.innerWidth - 360, Math.max(8, r.left));
    setPos({ top, left });
  }, [anchor]);

  if (!pos) return null;

  return (
    <div
      role="tooltip"
      style={{
        position: "fixed",
        top: pos.top,
        left: pos.left,
        zIndex: 9999,
        minWidth: 280,
        maxWidth: 360,
        background: "#FFFFFF",
        border: `1px solid ${SS.border}`,
        borderTop: `3px solid ${SS.accentBlue}`,
        boxShadow: "0 4px 12px rgba(0,0,0,0.18)",
        padding: 10,
        fontFamily: SS.fontMono,
        fontSize: 11.5,
        color: SS.formulaText,
        pointerEvents: "none",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6, gap: 8 }}>
        <div style={{ fontWeight: 700, color: SS.headerText }}>
          {cellId || "Célula calculada"}
        </div>
        {origem && (
          <div style={{ color: SS.refText, fontSize: 11 }}>{origem}</div>
        )}
      </div>

      {formula && (
        <div style={{ marginBottom: 4 }}>
          <span style={{ color: SS.mutedText }}>Fórmula: </span>
          <span style={{ color: SS.formulaText, fontWeight: 600 }}>{formula}</span>
        </div>
      )}

      {formulaExec && (
        <div style={{
          marginTop: 6, padding: 6,
          background: SS.bgAlt, border: `1px dashed ${SS.gridLine}`,
          color: SS.formulaText, whiteSpace: "pre-wrap", wordBreak: "break-word",
        }}>
          {formulaExec}
        </div>
      )}

      {value !== undefined && (
        <div style={{ marginTop: 8, paddingTop: 6, borderTop: `1px solid ${SS.gridLine}`, display: "flex", justifyContent: "space-between" }}>
          <span style={{ color: SS.mutedText }}>Valor:</span>
          <span style={{ color: SS.accentBlue, fontWeight: 800 }}>{value}{unit && !String(value).includes(unit) ? ` ${unit}` : ""}</span>
        </div>
      )}
    </div>
  );
}
