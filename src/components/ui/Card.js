import React from "react";
import S from "../../styles/tokens";
import "../../styles/components.css";

export function Badge({ children, color = S.accent }) {
  return (
    <span
      className="badge"
      style={{
        background: color + "22",
        color,
        border: `1px solid ${color}44`,
      }}
    >
      {children}
    </span>
  );
}

export function KpiCard({ icon: Icon, label, value, sub, color = S.accent }) {
  return (
    <div className="card" style={{ padding: "20px 24px", display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ color: S.muted, fontSize: 12, fontWeight: 600, letterSpacing: 1, textTransform: "uppercase" }}>
          {label}
        </span>
        <div style={{ background: color + "22", borderRadius: 8, padding: 8 }}>
          <Icon size={16} color={color} />
        </div>
      </div>
      <div style={{ color: S.text, fontSize: 24, fontWeight: 800 }}>{value}</div>
      {sub && <div style={{ color: S.muted, fontSize: 12 }}>{sub}</div>}
    </div>
  );
}

export function SectionTitle({ children }) {
  return <h3 className="section-title">{children}</h3>;
}

export function StatusBadge({ status }) {
  const map = {
    rascunho:  [S.muted,   "Rascunho"],
    enviado:   [S.accent2, "Enviado"],
    aprovado:  [S.accent3, "Aprovado"],
    reprovado: [S.danger,  "Reprovado"],
  };
  const [c, l] = map[status] || [S.muted, status];
  return <Badge color={c}>{l}</Badge>;
}

export function Row({ children, gap = 16 }) {
  const count = Array.isArray(children) ? children.length : 1;
  return (
    <div style={{ display: "grid", gridTemplateColumns: `repeat(${count}, 1fr)`, gap }}>
      {children}
    </div>
  );
}
