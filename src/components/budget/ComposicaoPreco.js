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
// Componente principal
// ──────────────────────────────────────────────────────────────────
export default function ComposicaoPreco({ detalhes, unit }) {
  const [showEqDetails, setShowEqDetails] = useState(false);
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

      {/* NÍVEL 2 — BLOCOS PRINCIPAIS */}
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
          hint="custo hora ÷ produtividade real"
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
    </div>
  );
}
