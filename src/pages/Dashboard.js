import React from "react";
import { FileText, CheckCircle, DollarSign, Clock } from "lucide-react";
import { KpiCard, SectionTitle, StatusBadge } from "../components/ui/Card";
import { fmt, fmtBRL } from "../utils/format";
import { normalizeFatorEmpolamento } from "../utils/empolamento";
import S from "../styles/tokens";

const toNum = (value, fallback = 0) => {
  const n = typeof value === "string" ? parseFloat(value.replace(",", ".")) : Number(value);
  return Number.isFinite(n) ? n : fallback;
};

export default function Dashboard({ quotations, equipment, params }) {
  const approved  = quotations.filter(q => q.status === "aprovado");
  const totalRev  = approved.reduce((s, q) => s + (q.precoFinal || 0), 0);
  const pending   = quotations.filter(q => q.status === "rascunho" || q.status === "enviado").length;
  const recent    = [...quotations].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 5);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <div>
        <h1 className="page-title">Dashboard</h1>
        <p className="page-subtitle">Visão geral do sistema TRANSJAP</p>
      </div>

      <div className="kpi-grid">
        <KpiCard icon={FileText}    label="Total Orçamentos" value={quotations.length}  sub="Todos os registros"           color={S.accent}  />
        <KpiCard icon={CheckCircle} label="Aprovados"        value={approved.length}    sub="Contratos aprovados"          color={S.accent3} />
        <KpiCard icon={DollarSign}  label="Receita Aprovada" value={fmtBRL(totalRev)}  sub="Soma dos contratos aprovados" color={S.accent2} />
        <KpiCard icon={Clock}       label="Em Aberto"        value={pending}            sub="Rascunho + Enviado"           color={S.accent}  />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <div className="card" style={{ padding: 24 }}>
          <SectionTitle>Últimos Orçamentos</SectionTitle>
          {recent.length === 0 && <p style={{ color: S.muted, margin: 0 }}>Nenhum orçamento cadastrado.</p>}
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {recent.map(q => (
              <div key={q.id} className="card2" style={{ padding: "12px 16px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <div style={{ color: S.text, fontSize: 13, fontWeight: 600 }}>{q.project}</div>
                  <div style={{ color: S.muted, fontSize: 11 }}>{q.client} · {q.createdAt}</div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ color: S.accent, fontWeight: 700, fontSize: 13 }}>{fmtBRL(q.precoFinal)}</div>
                  <StatusBadge status={q.status} />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="card" style={{ padding: 24 }}>
          <SectionTitle>Parâmetros Globais Ativos</SectionTitle>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {[
              ["Preço do Diesel",         fmtBRL(params.dieselPrice) + "/L"],
              ["Fator de Manutenção",     fmt(toNum(params.percentual_manutencao) * 100) + "%"],
              ["Fator Indiretos",         fmt(toNum(params.percentual_indiretos) * 100) + "%"],
              ["Horas/Dia",               params.hoursPerDay + "h"],
              ["Horas/Mês",               params.hoursPerMonth + "h"],
              ["BDI Padrão",              params.defaultBDI + "%"],
              ["Empolamento",             fmt(normalizeFatorEmpolamento(params.fator_empolamento)) + "x"],
              ["Equipamentos Ativos",     equipment.filter(e => e.active).length],
            ].map(([k, v]) => (
              <div key={k} style={{ display: "flex", justifyContent: "space-between", borderBottom: `1px solid ${S.border}`, paddingBottom: 8 }}>
                <span style={{ color: S.muted, fontSize: 13 }}>{k}</span>
                <span style={{ color: S.text, fontWeight: 600, fontSize: 13 }}>{v}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
