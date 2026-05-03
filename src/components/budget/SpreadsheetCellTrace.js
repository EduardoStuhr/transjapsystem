import React, { useState } from "react";
import S from "../../styles/tokens";
import { fmt, fmtBRL } from "../../utils/format";

export default function SpreadsheetCellTrace({ t, cellsByKey }) {
  const [open, setOpen] = useState(false);
  if (!t) return null;

  const isMoney = (t.unidade || "").includes("R$");
  const hasValue = t.valor !== null && t.valor !== undefined && Number.isFinite(Number(t.valor));
  const v = hasValue ? (isMoney ? fmtBRL(t.valor) : fmt(t.valor)) : "—";

  const statusLabel =
    t.status === "calculado" ? "Calculado"
      : t.status === "pendente" ? "Aguardando dependências"
      : t.status === "erro" ? "Erro"
      : (t.status || "—");

  const statusColor =
    t.status === "calculado" ? S.accent3
      : t.status === "pendente" ? "#f59e0b"
      : t.status === "erro" ? "#ef4444"
      : S.muted;

  return (
    <div style={{ border: `1px solid ${S.border}`, borderRadius: 8, padding: 10, background: "rgba(255,255,255,0.03)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "baseline" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <div style={{ fontSize: 11, color: S.muted }}>
            <b style={{ color: S.text }}>{t.id}</b> — {t.aba} {t.origem ? `(${t.origem})` : ""}
          </div>
          <div style={{ fontSize: 12, color: S.text, fontWeight: 800 }}>{t.nome || "(sem nome)"}</div>
          <div style={{ fontSize: 11, color: S.muted }}>
            Tipo: <b style={{ color: t.tipo === "manual" ? "#60a5fa" : S.accent3 }}>{t.tipo}</b>
            {t.unidade ? <span> | Unidade: <b style={{ color: S.text }}>{t.unidade}</b></span> : null}
          </div>
          <div style={{ fontSize: 11, color: S.muted }}>
            Status: <b style={{ color: statusColor }}>{statusLabel}</b>
            {t.motivo ? <span> | Motivo: <b style={{ color: S.text }}>{t.motivo}</b></span> : null}
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 12, color: S.muted }}>Valor</div>
          <div style={{ fontSize: 14, fontWeight: 900, color: S.text }}>{v}</div>
        </div>
      </div>

      {t.formula && (
        <div style={{ marginTop: 8, fontSize: 12, color: S.muted }}>
          Fórmula: <b style={{ color: S.text }}>{t.formula}</b>
        </div>
      )}

      {t.formulaConvertida && (
        <div style={{ marginTop: 4, fontSize: 12, color: S.muted, background: "rgba(0,0,0,0.2)", padding: 6, borderRadius: 4, fontFamily: "monospace", borderLeft: `2px solid #8b5cf6` }}>
          <b style={{ color: "#a78bfa" }}>JS:</b> <span style={{ color: "#e2e8f0" }}>{t.formulaConvertida}</span>
        </div>
      )}

      {t.dependeDe?.length > 0 && (
        <div style={{ marginTop: 10 }}>
          <button
            type="button"
            onClick={() => setOpen((s) => !s)}
            style={{
              cursor: "pointer",
              background: "transparent",
              color: S.accent2,
              border: `1px solid ${S.border}`,
              padding: "6px 10px",
              borderRadius: 8,
              fontSize: 12,
              fontWeight: 800,
            }}
          >
            {open ? "Ocultar dependências" : `Ver dependências (${t.dependeDe.length})`}
          </button>

          {open && (
            <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 8 }}>
              {t.entradas?.map((e) => {
                const c = cellsByKey?.[e.key];
                const unidade = c?.unidade || "";
                const evHas = e.valor !== null && e.valor !== undefined && Number.isFinite(Number(e.valor));
                const ev = evHas ? (unidade.includes("R$") ? fmtBRL(e.valor) : fmt(e.valor)) : "—";
                return (
                  <div key={e.key} style={{ padding: "8px 10px", borderRadius: 8, border: `1px dashed ${S.border}`, color: S.muted }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                      <div>
                        <b style={{ color: S.text }}>{e.key}</b>
                        {c?.nome ? <span> — {c.nome}</span> : null}
                        <span style={{ marginLeft: 8, fontSize: 11 }}>
                          ({c?.tipo || "?"}{e.status ? ` | ${e.status}` : ""})
                        </span>
                      </div>
                      <div style={{ color: S.text, fontWeight: 800 }}>{ev}</div>
                    </div>
                  </div>
                );
              })}
              {(t.dependenciasFaltantes?.length > 0) && (
                <div style={{ padding: "8px 10px", borderRadius: 8, border: `1px solid ${S.border}`, background: "rgba(239, 68, 68, 0.06)", color: S.muted }}>
                  <div style={{ fontSize: 11, fontWeight: 900, color: "#fecaca" }}>Dependências faltantes</div>
                  <div style={{ marginTop: 6, fontSize: 12, color: S.text }}>
                    {t.dependenciasFaltantes.join(", ")}
                  </div>
                </div>
              )}
              {(t.ciclo?.length > 0) && (
                <div style={{ padding: "8px 10px", borderRadius: 8, border: `1px solid ${S.border}`, background: "rgba(239, 68, 68, 0.06)", color: S.muted }}>
                  <div style={{ fontSize: 11, fontWeight: 900, color: "#fecaca" }}>Ciclo detectado</div>
                  <div style={{ marginTop: 6, fontSize: 12, color: S.text }}>
                    {t.ciclo.join(" → ")}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

