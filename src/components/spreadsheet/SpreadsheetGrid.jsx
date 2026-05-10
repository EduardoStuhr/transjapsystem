import React from "react";
import ValueCell from "./ValueCell";
import { SS } from "../../styles/spreadsheetTheme";

// ──────────────────────────────────────────────────────────────────
// <SpreadsheetGrid> — tabela densa estilo Excel.
//
// columns: [{
//   id: string,                   // chave única
//   header: string,               // texto do cabeçalho
//   width?: number,               // largura px (default: auto)
//   align?: "left"|"right"|"center",
//   accessor: (row, rowIndex) => any,
//   kind?: ((row) => "input"|"formula"|"ref"|"key"|"error"|"muted"|"header") | string,
//   unit?: string,
//   decimals?: number,
//   bold?: boolean,
//   formula?: (row) => string,
//   formulaExec?: (row) => string,
//   cellId?: (row, rowIndex) => string,
//   origem?: string,
//   onChange?: (row, value, rowIndex) => void,    // se presente + kind=input → editável
// }]
//
// rows: array de objetos arbitrários
// totalsRow: opcional — objeto que recebe os mesmos accessors,
//            renderizado em negrito no rodapé.
// ──────────────────────────────────────────────────────────────────

const resolveKind = (column, row) =>
  typeof column.kind === "function" ? column.kind(row) : (column.kind || "formula");

const resolveCallable = (fnOrVal, row) =>
  typeof fnOrVal === "function" ? fnOrVal(row) : fnOrVal;

export default function SpreadsheetGrid({
  columns,
  rows,
  totalsRow,
  caption,
  zebra = true,
  compact = false,
  onCellSelect,
  selectedCell,   // { rowIndex, colId } | null
}) {
  const rowH = compact ? SS.rowHeightCompact : SS.rowHeight;

  return (
    <div style={{
      border: `1px solid ${SS.border}`,
      background: SS.bg,
      fontFamily: SS.fontUI,
      overflowX: "auto",
      width: "100%",
    }}>
      {caption && (
        <div style={{
          padding: "8px 12px",
          background: SS.bgHeader,
          borderBottom: `1px solid ${SS.border}`,
          fontFamily: SS.fontUI,
          fontSize: SS.fontSizeTitle,
          fontWeight: 700,
          color: SS.headerText,
        }}>
          {caption}
        </div>
      )}

      <table style={{
        width: "100%",
        borderCollapse: "collapse",
        tableLayout: "auto",
      }}>
        <thead>
          <tr>
            {columns.map((col) => (
              <th
                key={col.id}
                style={{
                  height: rowH,
                  minWidth: col.width,
                  width: col.width,
                  padding: `${SS.cellPaddingY}px ${SS.cellPaddingX}px`,
                  background: SS.bgHeader,
                  color: SS.headerText,
                  textAlign: col.align || "left",
                  fontFamily: SS.fontUI,
                  fontSize: SS.fontSizeHdr,
                  fontWeight: 700,
                  border: `1px solid ${SS.border}`,
                  whiteSpace: "nowrap",
                  textTransform: "uppercase",
                  letterSpacing: 0.3,
                  position: "sticky",
                  top: 0,
                  zIndex: 1,
                }}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>

        <tbody>
          {rows.map((row, ri) => (
            <tr key={row.id ?? ri}>
              {columns.map((col) => {
                const kind = resolveKind(col, row);
                const value = col.accessor ? col.accessor(row, ri) : row[col.id];
                const formula     = resolveCallable(col.formula, row);
                const formulaExec = resolveCallable(col.formulaExec, row);
                const cellId      = resolveCallable(col.cellId, row);
                const onChange = col.onChange
                  ? (v) => col.onChange(row, v, ri)
                  : undefined;
                const selected = selectedCell?.rowIndex === ri && selectedCell?.colId === col.id;

                return (
                  <td
                    key={col.id}
                    onClick={() => onCellSelect && onCellSelect({ rowIndex: ri, colId: col.id, row })}
                    style={{ padding: 0, border: 0, verticalAlign: "middle" }}
                  >
                    <ValueCell
                      value={value}
                      kind={kind}
                      unit={col.unit}
                      decimals={col.decimals ?? 2}
                      bold={col.bold}
                      align={col.align || (kind === "input" || kind === "formula" || kind === "key" ? "right" : "left")}
                      rowIndex={zebra ? ri : 0}
                      selected={selected}
                      formula={formula}
                      formulaExec={formulaExec}
                      cellId={cellId}
                      origem={col.origem}
                      onChange={onChange}
                      width={col.width}
                    />
                  </td>
                );
              })}
            </tr>
          ))}

          {totalsRow && (
            <tr>
              {columns.map((col) => {
                const value = col.accessor ? col.accessor(totalsRow, rows.length) : totalsRow[col.id];
                const isFirst = col === columns[0];
                return (
                  <td key={col.id} style={{ padding: 0, border: 0 }}>
                    <ValueCell
                      value={value}
                      kind="formula"
                      unit={col.unit}
                      decimals={col.decimals ?? 2}
                      bold
                      align={col.align || (isFirst ? "left" : "right")}
                      rowIndex={0}
                      width={col.width}
                    />
                  </td>
                );
              })}
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
