import React from "react";
import { Shield, AlertTriangle, CheckCircle, TrendingUp } from "lucide-react";
import Input from "../ui/Input";
import { Row, SectionTitle } from "../ui/Card";
import { fmt, fmtBRL } from "../../utils/format";
import { MARKUP_PROFILES } from "../../data/calibrationRanges";
import S from "../../styles/tokens";

// ── Cores do Semáforo de Saúde ──
const saudeConfig = {
  otimo:    { cor: S.accent3, icon: CheckCircle,    label: "ÓTIMO",    desc: "Todos os itens dentro da faixa de mercado" },
  bom:      { cor: "#3b82f6", icon: TrendingUp,     label: "BOM",      desc: "Maioria dos itens calibrados corretamente" },
  atencao:  { cor: "#f59e0b", icon: AlertTriangle,   label: "ATENÇÃO",  desc: "Vários itens fora da faixa — revisar produtividade/markup" },
  sem_dados:{ cor: S.muted,   icon: Shield,          label: "SEM DADOS",desc: "Nenhum item com faixa de referência" },
};

export default function BudgetSummary({ totals, bdi, adminPct, mobilPct, riskPct, onChangeBdi, onChangeAdmin, onChangeMobil, onChangeRisk }) {
  const calib = totals.calibracaoGlobal;
  const saudeInfo = saudeConfig[calib?.saude] || saudeConfig.sem_dados;
  const SaudeIcon = saudeInfo.icon;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

      {/* ══ PAINEL DE SAÚDE DA CALIBRAGEM ══ */}
      {calib && calib.total > 0 && (
        <div className="card" style={{ padding: 24 }}>
          <SectionTitle>
            <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Shield size={16} style={{ color: saudeInfo.cor }} />
              Calibragem RONMA — Saúde do Orçamento
            </span>
          </SectionTitle>
          
          {/* Semáforo principal */}
          <div style={{
            display: "flex", alignItems: "center", gap: 16, padding: "16px 20px",
            background: `${saudeInfo.cor}11`, border: `1px solid ${saudeInfo.cor}33`,
            borderRadius: 10, marginBottom: 16,
          }}>
            <div style={{
              width: 48, height: 48, borderRadius: "50%",
              background: `${saudeInfo.cor}22`,
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <SaudeIcon size={24} style={{ color: saudeInfo.cor }} />
            </div>
            <div>
              <div style={{ fontSize: 16, fontWeight: 800, color: saudeInfo.cor, letterSpacing: 1 }}>
                {saudeInfo.label}
              </div>
              <div style={{ fontSize: 12, color: S.muted, marginTop: 2 }}>
                {saudeInfo.desc}
              </div>
            </div>
            <div style={{ marginLeft: "auto", textAlign: "right" }}>
              <div style={{ fontSize: 24, fontWeight: 900, color: S.text }}>
                {calib.dentro}/{calib.total}
              </div>
              <div style={{ fontSize: 11, color: S.muted }}>itens calibrados</div>
            </div>
          </div>

          {/* Barra de progresso de calibragem */}
          <div style={{ height: 8, background: "rgba(255,255,255,0.06)", borderRadius: 4, overflow: "hidden", marginBottom: 12 }}>
            <div style={{
              height: "100%", borderRadius: 4,
              width: `${calib.total > 0 ? (calib.dentro / calib.total) * 100 : 0}%`,
              background: `linear-gradient(90deg, ${S.accent3}, ${S.accent2})`,
              transition: "width 0.5s ease",
            }} />
          </div>

          {/* Alertas individuais */}
          {calib.alertas.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {calib.alertas.map((a, i) => (
                <div key={i} style={{
                  display: "flex", alignItems: "center", gap: 8,
                  padding: "8px 12px", borderRadius: 6, fontSize: 12,
                  background: "rgba(245, 158, 11, 0.08)",
                  border: "1px solid rgba(245, 158, 11, 0.20)",
                }}>
                  <AlertTriangle size={13} style={{ color: "#f59e0b", flexShrink: 0 }} />
                  <span style={{ color: S.muted }}>{a.desc}:</span>
                  <span style={{ color: S.text }}>{a.mensagem}</span>
                </div>
              ))}
            </div>
          )}

          {/* Perfis de Markup */}
          <div style={{ marginTop: 16 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: S.muted, marginBottom: 8 }}>PERFIS DE MARKUP PROFISSIONAL</div>
            <div style={{ display: "flex", gap: 8 }}>
              {Object.entries(MARKUP_PROFILES).map(([key, profile]) => (
                <div key={key} style={{
                  flex: 1, padding: "10px 14px", borderRadius: 8, cursor: "default",
                  background: "rgba(255,255,255,0.04)",
                  border: `1px solid ${S.border}`,
                  textAlign: "center",
                }}>
                  <div style={{ fontSize: 18, fontWeight: 900, color: S.accent }}>{profile.valor}×</div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: S.text, marginTop: 2 }}>{key.toUpperCase()}</div>
                  <div style={{ fontSize: 10, color: S.muted, marginTop: 2 }}>{profile.desc}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Custos Indiretos e BDI ── */}
      <div className="card" style={{ padding: 24 }}>
        <SectionTitle>Custos Indiretos e BDI Globais</SectionTitle>
        <p style={{ fontSize: 13, color: S.muted, marginBottom: 12 }}>
          Estes percentuais são aplicados sobre o <strong>Preço Base de Venda</strong> (que já inclui markup de {fmt(totals.itemsCalc?.[0]?.markup_aplicado || 1.66)}× sobre cada item).
        </p>
        <Row>
          <Input label="Administração (%)"  value={adminPct} onChange={onChangeAdmin} type="number" step="0.1" />
          <Input label="Mobilização (%)"    value={mobilPct} onChange={onChangeMobil} type="number" step="0.1" />
          <Input label="Riscos Globais (%)" value={riskPct}  onChange={onChangeRisk}  type="number" step="0.1" />
          <Input label="BDI Global (%)"     value={bdi}      onChange={onChangeBdi}   type="number" step="0.5" />
        </Row>
      </div>

      {/* ── Resumo do Orçamento ── */}
      <div className="card" style={{ padding: 24 }}>
        <SectionTitle>Resumo do Orçamento (Preços de Venda)</SectionTitle>
        <table className="data-table">
          <thead>
            <tr>
              {["Item", "Serviço", "Qtd.", "Custo Base Un.", "Markup", "Preço Venda Un.", "Calibragem", "Total do Item"].map(h => (
                <th key={h}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {totals.itemsCalc.map((it, i) => {
              const cal = it.calibracao;
              const calColor = !cal?.temReferencia ? S.muted
                : cal.status === "ok" ? S.accent3
                : cal.status.includes("erro") || cal.status.includes("preco_alto") ? S.danger
                : "#f59e0b";
              const calLabel = !cal?.temReferencia ? "—"
                : cal.status === "ok" ? "✓ OK"
                : "⚠ Ajustar";

              return (
                <tr key={it.id}>
                  <td style={{ color: S.muted }}>{i + 1}</td>
                  <td style={{ color: S.text, fontWeight: 600 }}>{it.desc}</td>
                  <td style={{ color: S.muted }}>{fmt(it.quantity)} {it.unit}</td>
                  <td style={{ color: S.muted }}>{fmtBRL(it.custo_unitario)}</td>
                  <td style={{ color: S.accent2, fontWeight: 600 }}>{fmt(it.markup_aplicado)}×</td>
                  <td style={{ color: S.accent, fontWeight: 700 }}>{fmtBRL(it.preco_unitario)}</td>
                  <td>
                    <span style={{
                      padding: "2px 8px", borderRadius: 4, fontSize: 11, fontWeight: 700,
                      background: `${calColor}22`, color: calColor,
                    }}>
                      {calLabel}
                    </span>
                  </td>
                  <td style={{ color: S.accent3, fontWeight: 700 }}>{fmtBRL(it.total_item)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>

        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 16, borderTop: `1px solid ${S.border}`, paddingTop: 16 }}>
          {[
            ["Subtotal (Custo Puro Operacional)", totals.subtotal, S.muted, 14],
            ["Subtotal (Preço Base Venda)", totals.subtotalPrice, S.text, 14],
            [`Indiretos Globais (${adminPct + mobilPct + riskPct}%)`, totals.indirect, S.muted, 14],
            [`BDI Global (${bdi}%)`, totals.bdiVal, S.muted, 14],
            ["PREÇO FINAL DE VENDA", totals.precoFinal, S.accent, 22],
          ].map(([l, v, c, s]) => (
            <div key={l} style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ color: l.includes("PREÇO FINAL") ? S.accent : S.muted, fontWeight: l.includes("PREÇO FINAL") ? 800 : 400, fontSize: l.includes("PREÇO FINAL") ? 16 : 14 }}>{l}</span>
              <span style={{ color: c, fontWeight: 800, fontSize: s }}>{fmtBRL(v)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
