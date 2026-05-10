import React, { useEffect, useRef, useState } from "react";
import { fmt, fmtBRL } from "../../utils/format";
import { SS, cellColor, cellBg } from "../../styles/spreadsheetTheme";
import FormulaTooltip from "./FormulaTooltip";

// ──────────────────────────────────────────────────────────────────
// <ValueCell> — célula tipo planilha com:
//  - Formatação BR (vírgula decimal, separador milhar)
//  - Codificação de cor automática por `kind`
//      "input"   → azul (editável)
//      "formula" → preto (calculado)
//      "ref"     → verde (referência a outra aba)
//      "key"     → preto sobre fundo amarelo (assumption-chave)
//      "error"   → vermelho
//      "header"  → azul Excel (#1F4E78), negrito
//      "muted"   → cinza
//  - Edição inline (apenas se kind="input" e onChange fornecido)
//      F2/duplo-clique entra em edição, Enter confirma, Esc cancela.
//  - Tooltip de fórmula no hover (se prop `formula`/`formulaExec` fornecidos)
// ──────────────────────────────────────────────────────────────────

const formatValue = (value, { unit, decimals = 2 } = {}) => {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "string" && Number.isNaN(parseFloat(value))) return value;
  const num = typeof value === "number" ? value : parseFloat(String(value).replace(",", "."));
  if (!Number.isFinite(num)) return "—";

  if (unit === "R$" || unit === "BRL") return fmtBRL(num);
  const formatted = fmt(num, decimals);
  return unit ? `${formatted} ${unit}` : formatted;
};

export default function ValueCell({
  value,
  kind = "formula",
  unit,
  decimals = 2,
  bold = false,
  align = "right",
  rowIndex = 0,
  selected = false,
  formula,
  formulaExec,
  cellId,
  origem,
  onChange,
  width,
  title,
}) {
  const isEditable = kind === "input" && typeof onChange === "function";
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [hover, setHover] = useState(false);
  const inputRef = useRef(null);
  const cellRef = useRef(null);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  const startEdit = () => {
    if (!isEditable) return;
    setDraft(value === null || value === undefined ? "" : String(value).replace(".", ","));
    setEditing(true);
  };

  const commit = () => {
    if (!isEditable) { setEditing(false); return; }
    const parsed = parseFloat(draft.replace(",", "."));
    if (Number.isFinite(parsed)) onChange(parsed);
    else if (draft === "") onChange(null);
    setEditing(false);
  };

  const cancel = () => setEditing(false);

  const onKeyDown = (e) => {
    if (e.key === "Enter") { e.preventDefault(); commit(); }
    else if (e.key === "Escape") { e.preventDefault(); cancel(); }
    else if (e.key === "Tab") { commit(); /* Tab nativo segue */ }
  };

  const onCellKeyDown = (e) => {
    if (!isEditable) return;
    if (e.key === "F2" || e.key === "Enter") { e.preventDefault(); startEdit(); }
  };

  const display = formatValue(value, { unit, decimals });
  const fontWeight = bold ? 700 : (kind === "header" ? 700 : 500);

  const baseStyle = {
    minHeight: SS.rowHeight,
    height: SS.rowHeight,
    padding: `${SS.cellPaddingY}px ${SS.cellPaddingX}px`,
    background: cellBg(kind, { rowIndex, selected }),
    color: cellColor(kind),
    fontFamily: SS.fontMono,
    fontSize: SS.fontSizeCell,
    fontWeight,
    textAlign: align,
    border: `1px solid ${SS.gridLine}`,
    cursor: isEditable ? "cell" : "default",
    outline: "none",
    width,
    boxSizing: "border-box",
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
    position: "relative",
    userSelect: isEditable ? "text" : "none",
  };

  if (editing) {
    return (
      <div ref={cellRef} style={{ ...baseStyle, padding: 0 }}>
        <input
          ref={inputRef}
          type="text"
          inputMode="decimal"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={onKeyDown}
          style={{
            width: "100%",
            height: "100%",
            padding: `${SS.cellPaddingY}px ${SS.cellPaddingX}px`,
            border: `2px solid ${SS.accentBlue}`,
            background: SS.bg,
            color: SS.inputText,
            fontFamily: SS.fontMono,
            fontSize: SS.fontSizeCell,
            fontWeight,
            textAlign: align,
            outline: "none",
            boxSizing: "border-box",
          }}
        />
      </div>
    );
  }

  return (
    <div
      ref={cellRef}
      tabIndex={isEditable ? 0 : -1}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onDoubleClick={startEdit}
      onKeyDown={onCellKeyDown}
      title={title || (isEditable ? "Duplo-clique ou F2 para editar" : undefined)}
      style={baseStyle}
    >
      {display}
      {hover && (formula || formulaExec) && (
        <FormulaTooltip
          anchor={cellRef.current}
          cellId={cellId}
          formula={formula}
          formulaExec={formulaExec}
          unit={unit}
          value={display}
          origem={origem}
        />
      )}
    </div>
  );
}

// Alias para compatibilidade com a nomenclatura da spec (<ValueWithUnit>)
export { ValueCell as ValueWithUnit };
