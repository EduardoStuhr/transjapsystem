import React, { useState } from "react";
import S from "../../styles/tokens";
import { fmt, fmtBRL } from "../../utils/format";

// ──────────────────────────────────────────────────────────────────
// Composição de Preço auditável (espelha COMPOSIÇÃO DE PREÇO da
// planilha RONMA: diesel/manutenção/MO/indiretos por hora, produti-
// vidade real, custo unitário, fatores e preço final). Sem números
// hardcoded — tudo vem de `detalhes.auditoria` produzido pelo
// costEngine a partir dos dados do projeto.
//
// Layout em 3 níveis:
//   1) Resumo (KPIs no topo): custo unit., preço unit., lucro, margem
//   2) Cards principais: Custo Base, Produtividade, Conversão,
//      Fatores, Resultado Final
//   3) Auditoria (fórmulas, dependências, origem) — colapsável,
//      visível só quando "Ver cálculo" é acionado.
// ──────────────────────────────────────────────────────────────────

const styles = {
  // Container principal (grid responsivo de cards)
  grid: {
    marginTop: 12,
    display: "grid",
    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
    gap: 16,
  },
  fullSpan: { gridColumn: "1 / -1" },

  // Bloco/card
  block: {
    background: "rgba(255,255,255,0.03)",
    border: `1px solid ${S.border}`,
    borderRadius: 12,
    padding: 16,
    display: "flex",
    flexDirection: "column",
    gap: 12,
  },
  blockHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "baseline",
    gap: 12,
    paddingBottom: 8,
    borderBottom: `1px dashed ${S.border}`,
  },
  blockTitle: {
    fontSize: 12,
    fontWeight: 800,
    letterSpacing: 0.4,
    color: S.text,
    textTransform: "uppercase",
    display: "flex",
    alignItems: "center",
    gap: 8,
  },
  stepBadge: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: 22,
    height: 22,
    borderRadius: "50%",
    background: "rgba(59,130,246,0.18)",
    color: S.accent2,
    fontSize: 11,
    fontWeight: 900,
  },
  blockHint: { fontSize: 11, color: S.muted, fontStyle: "italic" },
  blockBody: { display: "flex", flexDirection: "column", gap: 8 },

  // Linha auditável
  rowWrapper: {
    border: `1px solid ${S.border}`,
    borderRadius: 8,
    padding: "10px 12px",
    background: "rgba(0,0,0,0.20)",
    display: "flex",
    flexDirection: "column",
    gap: 6,
  },
  rowHeader: {
    display: "flex",
    justifyContent: "space-between",
    gap: 12,
    alignItems: "baseline",
  },
  rowLabel: { fontSize: 12.5, color: S.text, fontWeight: 700 },
  rowValue: {
    fontSize: 14,
    fontWeight: 900,
    color: S.text,
    whiteSpace: "nowrap",
    fontVariantNumeric: "tabular-nums",
  },
  meta: {
    fontSize: 10.5,
    color: S.muted,
    display: "flex",
    gap: 10,
    flexWrap: "wrap",
    marginTop: 2,
  },
  formulaBlock: {
    display: "flex",
    flexDirection: "column",
    gap: 6,
    padding: "8px 10px",
    borderRadius: 6,
    background: "rgba(0,0,0,0.30)",
    borderLeft: `2px solid ${S.accent2}`,
    marginTop: 4,
  },
  formula: { fontSize: 11, color: S.muted, lineHeight: 1.5 },
  formulaExec: {
    fontSize: 11.5,
    color: "#e2e8f0",
    fontFamily: "ui-monospace, Menlo, monospace",
    overflowWrap: "anywhere",
    lineHeight: 1.5,
  },
  badge: (color, bg) => ({
    display: "inline-flex",
    alignItems: "center",
    padding: "1px 6px",
    borderRadius: 4,
    fontSize: 10,
    fontWeight: 800,
    color,
    background: bg,
    letterSpacing: 0.3,
    textTransform: "uppercase",
  }),

  // Tabela de equipamentos
  table: {
    width: "100%",
    borderCollapse: "collapse",
    fontSize: 11.5,
  },
  th: {
    textAlign: "left",
    padding: "6px 8px",
    color: S.muted,
    fontWeight: 700,
    borderBottom: `1px solid ${S.border}`,
    fontSize: 10.5,
    textTransform: "uppercase",
  },
  td: {
    padding: "6px 8px",
    borderBottom: `1px dashed ${S.border}`,
    color: S.text,
    verticalAlign: "top",
    fontVariantNumeric: "tabular-nums",
  },

  // Botão (Ver cálculo / Ocultar)
  toggle: {
    cursor: "pointer",
    background: "transparent",
    color: S.accent2,
    border: `1px solid ${S.border}`,
    padding: "4px 10px",
    borderRadius: 6,
    fontSize: 11,
    fontWeight: 700,
    alignSelf: "flex-start",
  },

  // Sub-grupo dentro do Custo Base
  subGroupTitle: {
    fontSize: 10.5,
    fontWeight: 700,
    color: S.muted,
    textTransform: "uppercase",
    letterSpacing: 0.4,
    marginTop: 4,
    marginBottom: 2,
  },
};

// ──────────────────────────────────────────────────────────────────
// KPI cards do Resumo (Nível 1)
// ──────────────────────────────────────────────────────────────────
const summaryStyles = {
  wrapper: {
    display: "grid",
    gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
    gap: 10,
    padding: 14,
    borderRadius: 12,
    background: "linear-gradient(180deg, rgba(245,158,11,0.07), rgba(16,185,129,0.05))",
    border: `1px solid ${S.border}`,
  },
  kpi: {
    display: "flex",
    flexDirection: "column",
    gap: 4,
    padding: "10px 12px",
    borderRadius: 8,
    background: "rgba(0,0,0,0.25)",
    border: `1px solid ${S.border}`,
  },
  kpiLabel: {
    fontSize: 10.5,
    color: S.muted,
    textTransform: "uppercase",
    letterSpacing: 0.4,
    fontWeight: 700,
  },
  kpiValue: {
    fontSize: 18,
    fontWeight: 900,
    fontVariantNumeric: "tabular-nums",
    lineHeight: 1.1,
  },
  kpiHint: { fontSize: 10, color: S.muted },
};

const statusBadge = (status) => {
  if (status === "manual") return styles.badge("#60a5fa", "rgba(59,130,246,0.18)");
  if (status === "calculado") return styles.badge(S.accent3, "rgba(16,185,129,0.18)");
  if (status === "erro") return styles.badge("#fecaca", "rgba(239,68,68,0.18)");
  if (status === "alerta") return styles.badge("#f59e0b", "rgba(245,158,11,0.18)");
  return styles.badge(S.muted, "rgba(255,255,255,0.06)");
};

const formatRowValue = (row) => {
  if (row.valor === null || row.valor === undefined || !Number.isFinite(Number(row.valor))) {
    return "—";
  }
  const u = row.unidade || "";
  if (u.startsWith("R$")) {
    const suf = u.replace("R$", "");
    return `${fmtBRL(row.valor)}${suf || ""}`;
  }
  if (u === "%") return `${fmt(row.valor, 2)}%`;
  if (u === "×") return `${fmt(row.valor, 2)}×`;
  return `${fmt(row.valor, 2)}${u ? ` ${u}` : ""}`;
};

// ──────────────────────────────────────────────────────────────────
// Linha auditável (Nível 2 + Nível 3 colapsável)
// ──────────────────────────────────────────────────────────────────
function AuditRow({ row, dense = false, emphasize = false }) {
  const [open, setOpen] = useState(false);
  if (!row) return null;
  const wrapperStyle = emphasize
    ? {
        ...styles.rowWrapper,
        background: "rgba(245,158,11,0.07)",
        borderColor: "rgba(245,158,11,0.30)",
      }
    : styles.rowWrapper;
  const valueStyle = emphasize
    ? { ...styles.rowValue, color: S.accent }
    : styles.rowValue;

  return (
    <div style={wrapperStyle}>
      <div style={styles.rowHeader}>
        <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
          <span style={styles.rowLabel}>{row.label}</span>
          <div style={styles.meta}>
            <span>
              Origem: <b style={{ color: S.text }}>{row.origem || "—"}</b>
            </span>
            <span>
              Status: <span style={statusBadge(row.status)}>{row.status || "—"}</span>
            </span>
            {row.unidade && (
              <span>
                Unidade: <b style={{ color: S.text }}>{row.unidade}</b>
              </span>
            )}
          </div>
        </div>
        <span style={valueStyle}>{formatRowValue(row)}</span>
      </div>

      {!dense && (row.formula || row.formulaExec) && (
        <button type="button" onClick={() => setOpen((s) => !s)} style={styles.toggle}>
          {open ? "− Ocultar cálculo" : "+ Ver cálculo"}
        </button>
      )}

      {(dense || open) && (row.formula || row.formulaExec) && (
        <div style={styles.formulaBlock}>
          {row.formula && (
            <div style={styles.formula}>
              Fórmula: <b style={{ color: S.text }}>{row.formula}</b>
            </div>
          )}
          {row.formulaExec && <div style={styles.formulaExec}>{row.formulaExec}</div>}
        </div>
      )}
    </div>
  );
}

function Block({ step, title, hint, headerRight, children, fullWidth = false }) {
  return (
    <div style={fullWidth ? { ...styles.block, ...styles.fullSpan } : styles.block}>
      <div style={styles.blockHeader}>
        <div style={styles.blockTitle}>
          {step != null && <span style={styles.stepBadge}>{step}</span>}
          <span>{title}</span>
        </div>
        <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
          {hint && <div style={styles.blockHint}>{hint}</div>}
          {headerRight}
        </div>
      </div>
      <div style={styles.blockBody}>{children}</div>
    </div>
  );
}

function EquipamentosTabela({ equipamentos }) {
  if (!equipamentos?.length) {
    return (
      <div style={{ fontSize: 11.5, color: S.muted, fontStyle: "italic" }}>
        Nenhum equipamento alocado neste item.
      </div>
    );
  }
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={styles.table}>
        <thead>
          <tr>
            <th style={styles.th}>Equipamento</th>
            <th style={styles.th}>Qtd.</th>
            <th style={styles.th}>Diesel</th>
            <th style={styles.th}>Manut.</th>
            <th style={styles.th}>Operador</th>
            <th style={styles.th}>Indir.</th>
            <th style={styles.th}>Custo/h</th>
          </tr>
        </thead>
        <tbody>
          {equipamentos.map((e) => (
            <tr key={e.id || e.nome}>
              <td style={styles.td}>
                <div style={{ fontWeight: 700, color: S.text }}>{e.nome}</div>
                <div style={{ fontSize: 10.5, color: S.muted }}>
                  consumo {fmt(e.consumo, 1)} L/h · sal. {fmtBRL(e.salarioMensal)}/mês
                </div>
              </td>
              <td style={styles.td}>{fmt(e.quantidade, 2)}</td>
              <td style={styles.td}>
                <div>{fmtBRL(e.diesel.valorTotal)}/h</div>
                <div style={{ fontSize: 10, color: S.muted }} title={e.diesel.formulaTotal}>
                  {fmtBRL(e.diesel.valor)}/h × {fmt(e.quantidade, 2)}
                </div>
              </td>
              <td style={styles.td}>
                <div>{fmtBRL(e.manutencao.valorTotal)}/h</div>
                <div style={{ fontSize: 10, color: S.muted }}>
                  {fmtBRL(e.manutencao.valor)}/h × {fmt(e.quantidade, 2)}
                </div>
              </td>
              <td style={styles.td}>
                <div>{fmtBRL(e.operador.valorTotal)}/h</div>
                <div style={{ fontSize: 10, color: S.muted }}>
                  {fmtBRL(e.operador.valor)}/h × {fmt(e.quantidade, 2)}
                </div>
              </td>
              <td style={styles.td}>
                <div>{fmtBRL(e.indiretos.valorTotal)}/h</div>
                <div style={{ fontSize: 10, color: S.muted }}>
                  {fmtBRL(e.indiretos.valor)}/h × {fmt(e.quantidade, 2)}
                </div>
              </td>
              <td style={{ ...styles.td, fontWeight: 800, color: S.accent }}>
                {fmtBRL(e.custoHora.valorTotal)}/h
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────
// Resumo (Nível 1) — KPIs no topo
// ──────────────────────────────────────────────────────────────────
function ResumoKPIs({ custoUnitario, precoUnitario, lucroUnitario, margem, unit, isBlocked }) {
  const corMargem =
    margem >= 30 ? S.accent3 : margem >= 15 ? S.accent : S.danger;

  return (
    <div style={summaryStyles.wrapper}>
      <div style={summaryStyles.kpi}>
        <span style={summaryStyles.kpiLabel}>Custo unitário</span>
        <span style={{ ...summaryStyles.kpiValue, color: S.text }}>
          {isBlocked ? "—" : fmtBRL(custoUnitario)}
        </span>
        <span style={summaryStyles.kpiHint}>R$/{unit}</span>
      </div>
      <div style={summaryStyles.kpi}>
        <span style={summaryStyles.kpiLabel}>Preço unitário</span>
        <span style={{ ...summaryStyles.kpiValue, color: S.accent }}>
          {isBlocked ? "—" : fmtBRL(precoUnitario)}
        </span>
        <span style={summaryStyles.kpiHint}>R$/{unit}</span>
      </div>
      <div style={summaryStyles.kpi}>
        <span style={summaryStyles.kpiLabel}>Lucro unitário</span>
        <span style={{ ...summaryStyles.kpiValue, color: S.accent3 }}>
          {isBlocked ? "—" : fmtBRL(lucroUnitario)}
        </span>
        <span style={summaryStyles.kpiHint}>preço − custo</span>
      </div>
      <div style={summaryStyles.kpi}>
        <span style={summaryStyles.kpiLabel}>Margem</span>
        <span style={{ ...summaryStyles.kpiValue, color: isBlocked ? S.muted : corMargem }}>
          {isBlocked ? "—" : `${fmt(margem, 1)}%`}
        </span>
        <span style={summaryStyles.kpiHint}>lucro ÷ preço</span>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────
// Painel de Variáveis do Orçamento (modelo novo) — derivadas visíveis
// ──────────────────────────────────────────────────────────────────
function PainelVariaveisOrcamento({ ctx, unit }) {
  if (!ctx) return null;
  const fmtMR = (v) => `${fmt(v, 2)} ${unit || "m³"}`;
  return (
    <div style={{ ...styles.block, ...styles.fullSpan }}>
      <div style={styles.blockHeader}>
        <div style={styles.blockTitle}>
          <span style={styles.stepBadge}>1</span>
          <span>Variáveis do Orçamento</span>
        </div>
        <div style={styles.blockHint}>derivadas em tempo real</div>
      </div>
      <div style={styles.blockBody}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 10 }}>
          <KV label="Volume in situ" value={fmtMR(ctx.volumeInSitu)} hint="informado pelo usuário" />
          <KV label="Fator empolamento" value={`${fmt(ctx.fatorEmpolamento, 3)}×`} hint="parâmetro" />
          <KV label="Volume empolado" value={fmtMR(ctx.volumeEmpolado)}
              hint={`= ${fmt(ctx.volumeInSitu, 2)} × ${fmt(ctx.fatorEmpolamento, 3)}`} accent />
          <KV label="Prazo" value={`${fmt(ctx.prazoMeses, 0)} meses`} />
          <KV label="Dias úteis / mês" value={`${fmt(ctx.diasUteisMes, 0)}`} />
          <KV label="Horas / dia" value={`${fmt(ctx.horasDia, 0)} h`} />
          <KV label="Horas projeto" value={`${fmt(ctx.horasProjeto, 0)} h`}
              hint={`= ${fmt(ctx.diasUteisMes, 0)} × ${fmt(ctx.horasDia, 0)} × ${fmt(ctx.prazoMeses, 0)}`} />
          <KV label="Produção conjunto" value={`${fmt(ctx.producaoConjuntoHora, 2)} ${unit || "m³"}/h`}
              hint="Σ baseProductivity × qty (sem fatores)" />
          <KV label="Horas-máquina" value={`${fmt(ctx.horasMaquinaNecessarias, 2)} h`}
              hint={`= ${fmt(ctx.volumeInSitu, 2)} ÷ ${fmt(ctx.producaoConjuntoHora, 2)}`} accent />
        </div>
      </div>
    </div>
  );
}

function KV({ label, value, hint, accent = false }) {
  return (
    <div style={{
      padding: "10px 12px",
      borderRadius: 8,
      background: "rgba(0,0,0,0.20)",
      border: `1px solid ${S.border}`,
      display: "flex", flexDirection: "column", gap: 2,
    }}>
      <span style={{ fontSize: 10.5, color: S.muted, textTransform: "uppercase", letterSpacing: 0.4, fontWeight: 700 }}>
        {label}
      </span>
      <span style={{ fontSize: 14, fontWeight: 800, color: accent ? S.accent : S.text, fontVariantNumeric: "tabular-nums" }}>
        {value}
      </span>
      {hint && <span style={{ fontSize: 10, color: S.muted, fontStyle: "italic" }}>{hint}</span>}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────
// Card de Composição por Equipamento
// ──────────────────────────────────────────────────────────────────
function CardComposicaoEquipamento({ eq, ctx, unit, semIndiretos }) {
  if (!eq) return null;
  const baseLabel = (tipo) => tipo === "in_situ" ? "in situ" : "empolado";
  const isPatrolDieselExcecao = eq.volume_ref_diesel_tipo === "in_situ";
  const usaFallbackManut = !(eq.custoManutencaoDireto > 0);
  const prodZero = !(eq.baseProductivity > 0);

  return (
    <div style={{ ...styles.block, gap: 10 }}>
      <div style={styles.blockHeader}>
        <div style={styles.blockTitle}>
          <span style={{ ...styles.stepBadge, background: "rgba(245,158,11,0.18)", color: S.accent }}>⚙</span>
          <span>{eq.equipamento}</span>
          <span style={styles.badge("#94a3b8", "rgba(148,163,184,0.18)")}>{eq.categoria}</span>
          <span style={{ ...styles.blockHint, marginLeft: 8 }}>qty: {fmt(eq.qty, 2)}</span>
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          {isPatrolDieselExcecao && (
            <span style={styles.badge("#fbbf24", "rgba(245,158,11,0.18)")} title="Diesel rateado por m³ in situ por configuração de categoria">
              diesel ÷ in situ
            </span>
          )}
        </div>
      </div>

      {prodZero && (
        <div style={alertBox("alerta")}>
          ⚠️ Produtividade base zero — horas-máquina e diesel ficam zerados. Configure em Equipamentos.
        </div>
      )}

      <div style={styles.blockBody}>
        <div style={styles.subGroupTitle}>Parcelas em R$ totais (R$/h × horas × qty)</div>
        <div style={{ overflowX: "auto" }}>
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>Parcela</th>
                <th style={{ ...styles.th, textAlign: "right" }}>R$/h</th>
                <th style={{ ...styles.th, textAlign: "right" }}>Horas</th>
                <th style={{ ...styles.th, textAlign: "right" }}>Qty</th>
                <th style={{ ...styles.th, textAlign: "right" }}>Total R$</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td style={styles.td}>⛽ Diesel</td>
                <td style={{ ...styles.td, textAlign: "right" }}>{fmtBRL(eq.diesel_hora)}</td>
                <td style={{ ...styles.td, textAlign: "right" }} title="horas-máquina">
                  {fmt(eq.horas_diesel, 2)} <span style={{ color: S.muted }}>ⓜ</span>
                </td>
                <td style={{ ...styles.td, textAlign: "right" }}>{fmt(eq.qty, 2)}</td>
                <td style={{ ...styles.td, textAlign: "right", fontWeight: 700 }}>{fmtBRL(eq.total_diesel)}</td>
              </tr>
              <tr>
                <td style={styles.td}>
                  🔧 Manutenção {usaFallbackManut && (
                    <span style={{ ...styles.badge("#fbbf24", "rgba(245,158,11,0.18)"), marginLeft: 6 }} title="Sem custo_h_manutencao cadastrado — usando fallback (% diesel)">
                      ⚠ fallback
                    </span>
                  )}
                </td>
                <td style={{ ...styles.td, textAlign: "right" }}>{fmtBRL(eq.manutencao_hora)}</td>
                <td style={{ ...styles.td, textAlign: "right" }} title="horas-projeto">
                  {fmt(eq.horas_manutencao, 0)} <span style={{ color: S.muted }}>ⓟ</span>
                </td>
                <td style={{ ...styles.td, textAlign: "right" }}>{fmt(eq.qty, 2)}</td>
                <td style={{ ...styles.td, textAlign: "right", fontWeight: 700 }}>{fmtBRL(eq.total_manutencao)}</td>
              </tr>
              <tr>
                <td style={styles.td}>👷 Mão de obra</td>
                <td style={{ ...styles.td, textAlign: "right" }}>{fmtBRL(eq.operador_hora)}</td>
                <td style={{ ...styles.td, textAlign: "right" }} title="horas-projeto">
                  {fmt(eq.horas_mo, 0)} <span style={{ color: S.muted }}>ⓟ</span>
                </td>
                <td style={{ ...styles.td, textAlign: "right" }}>{fmt(eq.qty, 2)}</td>
                <td style={{ ...styles.td, textAlign: "right", fontWeight: 700 }}>{fmtBRL(eq.total_mo)}</td>
              </tr>
              <tr>
                <td style={styles.td}>🏢 Indireto</td>
                <td colSpan={3} style={{ ...styles.td, color: S.muted, fontStyle: "italic" }}>
                  rateado por pessoas indiretas {semIndiretos ? "(nenhuma alocada)" : ""}
                </td>
                <td style={{ ...styles.td, textAlign: "right", fontWeight: 700 }}>{fmtBRL(eq.total_indireto || 0)}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div style={{ fontSize: 10.5, color: S.muted, marginTop: 2 }}>
          ⓜ horas-máquina = volumeInSitu ÷ Σ produção base · ⓟ horas-projeto = dias × horas/dia × meses
        </div>

        <div style={styles.subGroupTitle}>Rateio em R$/{unit || "m³"}</div>
        <div style={{ overflowX: "auto" }}>
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>Parcela</th>
                <th style={{ ...styles.th, textAlign: "right" }}>Total R$</th>
                <th style={{ ...styles.th, textAlign: "right" }}>÷ Volume ref.</th>
                <th style={styles.th}>Tipo</th>
                <th style={{ ...styles.th, textAlign: "right" }}>R$/{unit || "m³"}</th>
              </tr>
            </thead>
            <tbody>
              <RateioRow label="⛽ Diesel"      total={eq.total_diesel}     ref={eq.volume_ref_diesel}     tipo={baseLabel(eq.volume_ref_diesel_tipo)}     valor={eq.diesel_R$_m3} unit={unit} />
              <RateioRow label="🔧 Manutenção"  total={eq.total_manutencao} ref={eq.volume_ref_manutencao} tipo={baseLabel(eq.volume_ref_manutencao_tipo)} valor={eq.manutencao_R$_m3} unit={unit} />
              <RateioRow label="👷 Mão de obra" total={eq.total_mo}         ref={eq.volume_ref_mo}         tipo={baseLabel(eq.volume_ref_mo_tipo)}         valor={eq.mo_R$_m3} unit={unit} />
              <RateioRow label="🏢 Indireto"    total={eq.total_indireto}   ref={eq.volume_ref_indireto}   tipo={baseLabel(eq.volume_ref_indireto_tipo)}   valor={eq.indireto_R$_m3} unit={unit} />
            </tbody>
          </table>
        </div>

        <div style={{
          marginTop: 8,
          padding: 12,
          borderRadius: 10,
          background: "rgba(245,158,11,0.06)",
          border: `1px solid rgba(245,158,11,0.25)`,
          display: "grid",
          gridTemplateColumns: "repeat(2, 1fr)",
          gap: 10,
        }}>
          <KV label={`Custo unitário`} value={`${fmtBRL(eq.custo_R$_m3)}/${unit || "m³"}`} />
          <KV label={`Markup (${eq.categoria})`} value={`${fmt(eq.markup, 2)}×`} />
          <KV label={`Preço unitário`} value={`${fmtBRL(eq.preco_R$_m3)}/${unit || "m³"}`} accent />
          <KV label="Total desta máquina na obra"
              value={fmtBRL(eq.total_maquina_obra_R$)}
              hint={`= ${fmtBRL(eq.preco_R$_m3)} × ${fmt(eq.volume_totalizacao ?? ctx?.volumeInSitu ?? 0, 2)} ${unit || "m³"} ${eq.volume_totalizacao_tipo === "auxiliar_in_situ" ? "auxiliar in situ" : "in situ"}`}
              accent />
        </div>
      </div>
    </div>
  );
}

function RateioRow({ label, total, ref, tipo, valor, unit }) {
  return (
    <tr>
      <td style={styles.td}>{label}</td>
      <td style={{ ...styles.td, textAlign: "right" }}>{fmtBRL(total)}</td>
      <td style={{ ...styles.td, textAlign: "right" }}>{fmt(ref, 2)} {unit || "m³"}</td>
      <td style={styles.td}>
        <span style={tipo === "in situ"
          ? styles.badge("#fbbf24", "rgba(245,158,11,0.18)")
          : styles.badge(S.accent2, "rgba(59,130,246,0.18)")}>
          {tipo}
        </span>
      </td>
      <td style={{ ...styles.td, textAlign: "right", fontWeight: 800, color: S.accent }}>
        {fmtBRL(valor)}/{unit || "m³"}
      </td>
    </tr>
  );
}

function alertBox(severidade) {
  if (severidade === "erro") return {
    padding: "8px 12px", borderRadius: 8,
    background: "rgba(239,68,68,0.10)", border: "1px solid rgba(239,68,68,0.30)",
    color: "#fecaca", fontSize: 11.5,
  };
  if (severidade === "alerta") return {
    padding: "8px 12px", borderRadius: 8,
    background: "rgba(245,158,11,0.10)", border: "1px solid rgba(245,158,11,0.30)",
    color: "#f59e0b", fontSize: 11.5,
  };
  return {
    padding: "8px 12px", borderRadius: 8,
    background: "rgba(59,130,246,0.08)", border: "1px solid rgba(59,130,246,0.30)",
    color: "#93c5fd", fontSize: 11.5,
  };
}

// ──────────────────────────────────────────────────────────────────
// Componente principal
// ──────────────────────────────────────────────────────────────────
export default function ComposicaoPreco({ detalhes, unit }) {
  const [showEqDetails, setShowEqDetails] = useState(false);
  const [equipamentoSelecionado, setEquipamentoSelecionado] = useState("todos");
  if (!detalhes) return null;

  const a = detalhes.auditoria || {};
  const equipamentos = a.equipamentos || [];
  const custoBase = a.custoBase || [];
  const decompUnitaria = a.decomposicaoUnitaria || [];
  const produtividade = a.produtividade || [];
  const conversao = a.conversao || [];
  const fatores = a.fatores || [];
  const resultado = a.resultado || [];
  const indiretoModel = a.indiretoModel || null;
  const validacoes = a.validacoes || [];

  const isBlocked = a.tipo === "bloqueado";

  // Detecta modelo novo (calcItemCostNovo): equipamentos têm diesel_R$_m3 e contexto preenchido.
  const ctx = a.contexto || null;
  const usaModeloNovo = ctx != null && equipamentos.some((e) => e?.diesel_R$_m3 != null);

  const equipamentosVisiveis = usaModeloNovo
    ? (equipamentoSelecionado === "todos"
        ? equipamentos
        : equipamentos.filter((e) => (e.equipmentId || e.id) === equipamentoSelecionado))
    : [];

  const semEquipamentos = equipamentos.length === 0;
  const volumeZero = (ctx?.volumeInSitu ?? 0) <= 0;
  const semIndiretos = !validacoes.some((v) => v.severidade === "erro" && /indireta/i.test(v.mensagem || ""))
    ? validacoes.some((v) => /indireta/i.test(v.mensagem || ""))
    : false;

  // Resumo (Nível 1) — derivado de detalhes (sem alterar o engine)
  const precoUnitario = detalhes.resultado?.precoUnitario ?? 0;
  const custoUnitario = detalhes.conversao?.custoUnitario ?? 0;
  const quantidade = detalhes.resultado?.quantidade ?? 0;
  const totalItem = detalhes.resultado?.total ?? 0;
  const lucroUnitario = precoUnitario - custoUnitario;
  const margem = precoUnitario > 0 ? (lucroUnitario / precoUnitario) * 100 : 0;

  // Sub-grupos dentro do Custo Base (Diesel / Manut / MO / Indiretos / Total)
  const isLabel = (row, ...needles) => {
    const l = (row.label || "").toLowerCase();
    return needles.some((n) => l.startsWith(n));
  };
  const linhasDiesel = custoBase.filter((r) => isLabel(r, "diesel"));
  const linhasManut = custoBase.filter((r) => isLabel(r, "manuten"));
  const linhasMO = custoBase.filter(
    (r) => isLabel(r, "mão de obra") || isLabel(r, "custo manual")
  );
  const linhasIndir = custoBase.filter((r) => isLabel(r, "indireto"));
  const linhasTotal = custoBase.filter((r) => isLabel(r, "custo total"));
  const linhasOutras = custoBase.filter(
    (r) =>
      !linhasDiesel.includes(r) &&
      !linhasManut.includes(r) &&
      !linhasMO.includes(r) &&
      !linhasIndir.includes(r) &&
      !linhasTotal.includes(r)
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14, marginTop: 12 }}>
      {/* HEADER de status + validações */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <div
          style={{
            padding: "10px 14px",
            borderRadius: 10,
            background: isBlocked ? "rgba(239,68,68,0.10)" : "rgba(16,185,129,0.08)",
            border: `1px solid ${isBlocked ? "rgba(239,68,68,0.25)" : "rgba(16,185,129,0.20)"}`,
            color: isBlocked ? "#fecaca" : S.accent3,
            fontSize: 12.5,
            fontWeight: 700,
          }}
        >
          {isBlocked
            ? `🛑 Cálculo bloqueado — ${a.motivo || "produtividade inválida"}`
            : "✅ Composição de preço calculada dinamicamente a partir dos dados do projeto"}
        </div>

        {indiretoModel && (
          <div
            style={{
              padding: "10px 14px",
              borderRadius: 10,
              border: `1px solid ${S.border}`,
              background:
                indiretoModel.modo === "absoluto"
                  ? "rgba(59,130,246,0.06)"
                  : "rgba(245,158,11,0.06)",
              fontSize: 11.5,
              color: S.muted,
              display: "flex",
              flexWrap: "wrap",
              gap: 14,
              alignItems: "baseline",
            }}
          >
            <span>
              <b style={{ color: S.text }}>Modo de indireto:</b>{" "}
              <span style={statusBadge(indiretoModel.modo === "absoluto" ? "calculado" : "alerta")}>
                {indiretoModel.modo}
              </span>
            </span>
            {indiretoModel.modo === "absoluto" ? (
              <>
                <span>
                  Indireto/mês:{" "}
                  <b style={{ color: S.text }}>{fmtBRL(indiretoModel.indiretoTotalMensal)}</b>
                </span>
                <span>
                  Horas obra/mês:{" "}
                  <b style={{ color: S.text }}>
                    {fmt(indiretoModel.diasObra, 0)} dias × {fmt(indiretoModel.horasDia, 0)} h ={" "}
                    {fmt(indiretoModel.horasMes, 0)} h
                  </b>
                </span>
                <span>
                  Indireto/h:{" "}
                  <b style={{ color: S.accent2 }}>{fmtBRL(indiretoModel.indiretoHora)}/h</b>
                </span>
              </>
            ) : (
              <span>
                Modo legado ({fmt((indiretoModel.percIndiretosLegacy || 0) * 100, 1)}% sobre direto
                por equipamento). Configure indiretos absolutos em Parâmetros para precificação
                realista.
              </span>
            )}
          </div>
        )}

        {validacoes.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {validacoes.map((v, i) => {
              const isErro = v.severidade === "erro";
              const isAlerta = v.severidade === "alerta";
              const palette = isErro
                ? { bg: "rgba(239,68,68,0.10)", bd: "rgba(239,68,68,0.30)", color: "#fecaca", icon: "🛑" }
                : isAlerta
                  ? { bg: "rgba(245,158,11,0.10)", bd: "rgba(245,158,11,0.30)", color: "#f59e0b", icon: "⚠️" }
                  : { bg: "rgba(59,130,246,0.08)", bd: "rgba(59,130,246,0.30)", color: "#93c5fd", icon: "ℹ️" };
              return (
                <div
                  key={i}
                  style={{
                    padding: "8px 12px",
                    borderRadius: 8,
                    background: palette.bg,
                    border: `1px solid ${palette.bd}`,
                    color: palette.color,
                    fontSize: 11.5,
                  }}
                >
                  {palette.icon} {v.mensagem}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* NÍVEL 1 — RESUMO (KPIs) */}
      <ResumoKPIs
        custoUnitario={custoUnitario}
        precoUnitario={precoUnitario}
        lucroUnitario={lucroUnitario}
        margem={margem}
        unit={unit}
        isBlocked={isBlocked}
      />

      {/* MODELO NOVO — painel completo por equipamento */}
      {usaModeloNovo && !isBlocked && (
        <div style={styles.grid}>
          {/* 1 — VARIÁVEIS DO ORÇAMENTO */}
          <PainelVariaveisOrcamento ctx={ctx} unit={unit} />

          {/* 2 — SELETOR DE EQUIPAMENTO */}
          <div style={{ ...styles.block, ...styles.fullSpan }}>
            <div style={styles.blockHeader}>
              <div style={styles.blockTitle}>
                <span style={styles.stepBadge}>2</span>
                <span>Ver composição de</span>
              </div>
              <div style={styles.blockHint}>
                {equipamentos.length} equipamento(s) alocado(s)
              </div>
            </div>
            <div style={styles.blockBody}>
              {semEquipamentos ? (
                <div style={alertBox("info")}>
                  ℹ️ Adicione equipamentos ao item para ver a composição.
                </div>
              ) : volumeZero ? (
                <div style={alertBox("alerta")}>
                  ⚠️ Informe um volume in situ maior que zero.
                </div>
              ) : (
                <select
                  value={equipamentoSelecionado}
                  onChange={(e) => setEquipamentoSelecionado(e.target.value)}
                  style={{
                    background: "rgba(0,0,0,0.30)",
                    color: S.text,
                    border: `1px solid ${S.border}`,
                    borderRadius: 8,
                    padding: "8px 12px",
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: "pointer",
                    minWidth: 280,
                  }}
                >
                  <option value="todos">Todos os equipamentos</option>
                  {equipamentos.map((eq) => (
                    <option key={eq.equipmentId || eq.id} value={eq.equipmentId || eq.id}>
                      {eq.equipamento}{eq.qty !== 1 ? ` (×${fmt(eq.qty, 0)})` : ""} — {eq.categoria}
                    </option>
                  ))}
                </select>
              )}
            </div>
          </div>

          {/* 3 — CARDS DE COMPOSIÇÃO POR EQUIPAMENTO */}
          {equipamentosVisiveis.map((eq) => (
            <div key={eq.equipmentId || eq.id || eq.equipamento} style={styles.fullSpan}>
              <div style={styles.blockHeader}>
                <div style={styles.blockTitle}>
                  <span style={styles.stepBadge}>3</span>
                  <span>Composição por equipamento</span>
                </div>
              </div>
              <CardComposicaoEquipamento eq={eq} ctx={ctx} unit={unit} semIndiretos={semIndiretos} />
            </div>
          ))}

          {/* 4 — RESUMO DO ITEM */}
          <div style={{ ...styles.block, ...styles.fullSpan }}>
            <div style={styles.blockHeader}>
              <div style={styles.blockTitle}>
                <span style={styles.stepBadge}>4</span>
                <span>Resumo do Item</span>
              </div>
              <div style={styles.blockHint}>Σ de todos os equipamentos</div>
            </div>
            <div style={styles.blockBody}>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(5, minmax(0, 1fr))", gap: 10 }}>
                <KV label={`Σ Custo unitário`} value={`${fmtBRL(custoUnitario)}/${unit}`} />
                <KV label={`Σ Preço unitário`} value={`${fmtBRL(precoUnitario)}/${unit}`} accent />
                <KV label="Markup efetivo" value={`${fmt(custoUnitario > 0 ? precoUnitario / custoUnitario : 0, 2)}×`} />
                <KV label={`Volume do item`} value={`${fmt(quantidade, 2)} ${unit}`} />
                <KV label="Total do item" value={fmtBRL(totalItem)} accent />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODELO LEGADO — manter visualização auditável original */}
      {!usaModeloNovo && (
      <div style={styles.grid}>
        {/* BLOCO 1 — CUSTO BASE POR HORA (com sub-grupos) */}
        <Block
          step={1}
          title="Custo Base"
          hint="R$/h — diesel + manutenção + mão de obra + indiretos"
          fullWidth
          headerRight={
            <button
              type="button"
              onClick={() => setShowEqDetails((s) => !s)}
              style={styles.toggle}
            >
              {showEqDetails
                ? "− Ocultar equipamentos"
                : `+ Detalhar por equipamento (${equipamentos.length})`}
            </button>
          }
        >
          {linhasDiesel.length > 0 && (
            <>
              <div style={styles.subGroupTitle}>⛽ Diesel</div>
              {linhasDiesel.map((row, i) => <AuditRow key={`d${i}`} row={row} />)}
            </>
          )}

          {linhasManut.length > 0 && (
            <>
              <div style={styles.subGroupTitle}>🔧 Manutenção</div>
              {linhasManut.map((row, i) => <AuditRow key={`m${i}`} row={row} />)}
            </>
          )}

          {linhasMO.length > 0 && (
            <>
              <div style={styles.subGroupTitle}>👷 Mão de obra</div>
              {linhasMO.map((row, i) => <AuditRow key={`o${i}`} row={row} />)}
            </>
          )}

          {linhasIndir.length > 0 && (
            <>
              <div style={styles.subGroupTitle}>🏢 Indiretos</div>
              {linhasIndir.map((row, i) => <AuditRow key={`i${i}`} row={row} />)}
            </>
          )}

          {linhasOutras.length > 0 && (
            <>
              <div style={styles.subGroupTitle}>Outros</div>
              {linhasOutras.map((row, i) => <AuditRow key={`x${i}`} row={row} />)}
            </>
          )}

          {linhasTotal.length > 0 && (
            <>
              <div style={styles.subGroupTitle}>Σ Total</div>
              {linhasTotal.map((row, i) => (
                <AuditRow key={`t${i}`} row={row} emphasize />
              ))}
            </>
          )}

          {showEqDetails && (
            <div
              style={{
                marginTop: 8,
                padding: 10,
                borderRadius: 8,
                background: "rgba(0,0,0,0.20)",
                border: `1px solid ${S.border}`,
              }}
            >
              <EquipamentosTabela equipamentos={equipamentos} />
            </div>
          )}
        </Block>

        {/* BLOCO 2 — PRODUTIVIDADE */}
        <Block
          step={2}
          title="Produtividade"
          hint="informada × eficiência × solo × logística"
        >
          {produtividade.map((row, i) => (
            <AuditRow key={i} row={row} />
          ))}
        </Block>

        {/* BLOCO 3 — CONVERSÃO (R$/h ÷ produtividade) */}
        <Block
          step={3}
          title="Conversão para custo unitário"
          hint="componentes unitários por quantidade"
        >
          {conversao.map((row, i) => (
            <AuditRow key={i} row={row} dense />
          ))}

          {decompUnitaria.length > 0 && (
            <>
              <div style={styles.subGroupTitle}>
                Decomposição por unidade (planilha COMPOSIÇÃO DE PREÇO)
              </div>
              {decompUnitaria.map((row, i) => (
                <AuditRow key={i} row={row} />
              ))}
            </>
          )}
        </Block>

        {/* BLOCO 4 — FATORES DE PREÇO */}
        <Block
          step={4}
          title="Fatores de preço"
          hint="markup base × ajuste final (BDI informativo)"
          fullWidth
        >
          {fatores.map((row, i) => (
            <AuditRow key={i} row={row} />
          ))}
        </Block>

        {/* BLOCO 5 — RESULTADO FINAL */}
        <Block step={5} title="Resultado final" hint="preço × quantidade = total" fullWidth>
          {resultado.map((row, i) => (
            <AuditRow key={i} row={row} emphasize={i === 0 || i === resultado.length - 1} />
          ))}

          {!isBlocked && resultado.length > 0 && (
            <div
              style={{
                marginTop: 6,
                display: "grid",
                gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
                gap: 12,
                padding: 12,
                borderRadius: 10,
                background: "rgba(245,158,11,0.06)",
                border: `1px solid rgba(245,158,11,0.25)`,
              }}
            >
              <div>
                <div style={summaryStyles.kpiLabel}>Preço unitário</div>
                <div style={{ ...summaryStyles.kpiValue, color: S.accent }}>
                  {fmtBRL(precoUnitario)}
                  <span style={{ fontSize: 11, color: S.muted, fontWeight: 600 }}>
                    {" "}/{unit}
                  </span>
                </div>
              </div>
              <div>
                <div style={summaryStyles.kpiLabel}>Quantidade</div>
                <div style={{ ...summaryStyles.kpiValue, color: S.text }}>
                  {fmt(quantidade)}{" "}
                  <span style={{ fontSize: 11, color: S.muted, fontWeight: 600 }}>{unit}</span>
                </div>
              </div>
              <div>
                <div style={summaryStyles.kpiLabel}>Total do item</div>
                <div style={{ ...summaryStyles.kpiValue, color: S.text }}>
                  {fmtBRL(totalItem)}
                </div>
              </div>
            </div>
          )}
        </Block>
      </div>
      )}
    </div>
  );
}
