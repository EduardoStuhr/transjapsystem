import React from "react";
import ValueCell from "../spreadsheet/ValueCell";
import { SS } from "../../styles/spreadsheetTheme";
import { fmt, fmtBRL } from "../../utils/format";

// ──────────────────────────────────────────────────────────────────
// <PainelComposicaoItem> — modal/painel que mostra a composição de
// preço de UM item do orçamento, usando o tema light planilha.
//
// Substitui o componente <ComposicaoPreco> (cards verticais escuros
// com "+ Ver cálculo") por uma view tabular compacta, cada célula
// com tooltip de fórmula, organizada em 5 seções:
//   1) KPIs (custo, preço, lucro, margem, markup, total)
//   2) R$/h por equipamento (diesel/manut/MO/indir/total)
//   3) R$/un — decomposição unitária
//   4) Fatores de markup (custo → preço)
//   5) Resultado (preço × qtde = total)
//
// Recebe `result` (saída completa de calcItemCost) + `item`.
// Não busca nada do store; é puro de render.
// ──────────────────────────────────────────────────────────────────

const SEVERIDADE = {
  ok:     { bg: SS.okBg,   color: SS.okText,   icon: "✓" },
  info:   { bg: SS.infoBg, color: SS.infoText, icon: "ℹ" },
  alerta: { bg: SS.warnBg, color: SS.warnText, icon: "⚠" },
  erro:   { bg: SS.errBg,  color: SS.errText,  icon: "✕" },
};

export default function PainelComposicaoItem({
  item,
  result,
  volumeEmpoladoObra = 0,
  totalHorasProjeto  = 0,
  onClose,
}) {
  if (!item || !result) return null;

  const aud = result?.detalhes?.auditoria;
  const unit = item.unit || "un";

  // ── Custo total no projeto, por componente ──
  // Σ (R$/h × qtd) entre os equipamentos alocados, multiplicado por
  // totalHorasProjeto (input manual em "Dados do Projeto").
  // Esse é o numerador da decomposição R$/m³ correta.
  const eqs = aud?.equipamentos || [];
  const sumRsHora = eqs.reduce((acc, e) => ({
    diesel: acc.diesel + (e.diesel.valorTotal     || 0),
    manut:  acc.manut  + (e.manutencao.valorTotal || 0),
    mo:     acc.mo     + (e.operador.valorTotal   || 0),
    indir:  acc.indir  + (e.indiretos.valorTotal  || 0),
  }), { diesel: 0, manut: 0, mo: 0, indir: 0 });
  sumRsHora.total = sumRsHora.diesel + sumRsHora.manut + sumRsHora.mo + sumRsHora.indir;

  const horas = Number(totalHorasProjeto) || 0;
  const volEmp = Number(volumeEmpoladoObra) || 0;

  const custoTotalProjeto = {
    diesel: sumRsHora.diesel * horas,
    manut:  sumRsHora.manut  * horas,
    mo:     sumRsHora.mo     * horas,
    indir:  sumRsHora.indir  * horas,
    total:  sumRsHora.total  * horas,
  };

  const decompCorreta = volEmp > 0 ? {
    diesel: custoTotalProjeto.diesel / volEmp,
    manut:  custoTotalProjeto.manut  / volEmp,
    mo:     custoTotalProjeto.mo     / volEmp,
    indir:  custoTotalProjeto.indir  / volEmp,
    total:  custoTotalProjeto.total  / volEmp,
  } : null;

  const denominadorOk = horas > 0 && volEmp > 0;
  const conversaoCusto = result?.detalhes?.auditoria?.conversao?.find(
    (row) => String(row.label || "").toLowerCase().includes("custo")
  );

  const kpis = [
    { label: "Custo unitário",    value: result.custo_unitario,  unit: `R$/${unit}`, kind: "formula", decimals: 4,
      formula: conversaoCusto?.formula || "Σ componentes unitários",
      formulaExec: conversaoCusto?.formulaExec || `${fmtBRL(result.custo_unitario)}/${unit}` },
    { label: "Preço unitário",    value: result.preco_unitario,  unit: `R$/${unit}`, kind: "formula", decimals: 4,
      formula: "custo unit. × fator base × ajuste final",
      formulaExec: `${fmtBRL(result.custo_unitario)} × ${fmt(result.detalhes.fatores.fatorBase, 2)} × ${fmt(result.detalhes.fatores.ajusteFinal, 2)} = ${fmtBRL(result.preco_unitario)}` },
    { label: "Markup efetivo",    value: result.markup_aplicado, unit: "×",          kind: "key",     decimals: 2,
      formula: "preço ÷ custo",
      formulaExec: `${fmtBRL(result.preco_unitario)} ÷ ${fmtBRL(result.custo_unitario)} = ${fmt(result.markup_aplicado, 2)}×` },
    { label: "Lucro unitário",    value: result.lucro_unitario,  unit: `R$/${unit}`, kind: "formula", decimals: 4,
      formula: "preço − custo",
      formulaExec: `${fmtBRL(result.preco_unitario)} − ${fmtBRL(result.custo_unitario)} = ${fmtBRL(result.lucro_unitario)}` },
    { label: "Margem (sobre preço)", value: result.margem_percentual, unit: "%",     kind: "formula", decimals: 2,
      formula: "(lucro ÷ preço) × 100",
      formulaExec: `(${fmtBRL(result.lucro_unitario)} ÷ ${fmtBRL(result.preco_unitario)}) × 100 = ${fmt(result.margem_percentual, 2)}%` },
    { label: "Total do item",     value: result.total_item,      unit: "R$",         kind: "formula", decimals: 2,
      formula: "preço × quantidade",
      formulaExec: `${fmtBRL(result.preco_unitario)} × ${fmt(item.quantity, 2)} = ${fmtBRL(result.total_item)}` },
  ];

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 1000,
        background: "rgba(0,0,0,0.65)",
        display: "flex", alignItems: "flex-start", justifyContent: "center",
        padding: "32px 16px", overflowY: "auto",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "min(1180px, 100%)",
          background: SS.bg,
          fontFamily: SS.fontUI,
          color: SS.formulaText,
          border: `1px solid ${SS.border}`,
          boxShadow: "0 12px 32px rgba(0,0,0,0.45)",
          display: "flex", flexDirection: "column",
        }}
      >
        {/* Header */}
        <div style={{
          padding: "12px 18px",
          background: SS.headerText,
          color: "#FFFFFF",
          display: "flex", justifyContent: "space-between", alignItems: "center",
        }}>
          <div>
            <div style={{ fontSize: 11, opacity: 0.8, letterSpacing: 1, textTransform: "uppercase" }}>
              Composição de Preço · auditoria do item
            </div>
            <div style={{ fontSize: 18, fontWeight: 800 }}>
              {item.desc || "(sem descrição)"} <span style={{ opacity: 0.7, fontSize: 12, fontWeight: 500 }}>· {fmt(item.quantity, 2)} {unit}</span>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: "rgba(255,255,255,0.12)", color: "#FFFFFF",
              border: "1px solid rgba(255,255,255,0.25)", padding: "6px 14px",
              cursor: "pointer", fontFamily: SS.fontUI, fontSize: 13, fontWeight: 700,
            }}
          >Fechar ✕</button>
        </div>

        <div style={{ padding: 18, display: "flex", flexDirection: "column", gap: 18 }}>

          {/* ── 1. KPI strip ── */}
          <SectionTitle n={1}>Indicadores</SectionTitle>
          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
            gap: 1, background: SS.gridLine,
            border: `1px solid ${SS.border}`,
          }}>
            {kpis.map((k) => (
              <div key={k.label} style={{
                background: SS.bg, padding: "10px 14px",
                display: "flex", flexDirection: "column", gap: 4,
              }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: SS.mutedText, letterSpacing: 0.5, textTransform: "uppercase" }}>
                  {k.label}
                </div>
                <div style={{ display: "flex", alignItems: "baseline", justifyContent: "flex-end" }}>
                  <ValueCell
                    value={k.value} kind={k.kind} decimals={k.decimals} unit={k.unit}
                    bold align="right"
                    formula={k.formula} formulaExec={k.formulaExec}
                  />
                </div>
              </div>
            ))}
          </div>

          {/* ── 2. R$/h por equipamento ── */}
          {aud?.equipamentos?.length > 0 && (
            <>
              <SectionTitle n={2}>Custo por hora — equipamentos alocados</SectionTitle>
              <Table
                head={["Equipamento", "Qtd", "Diesel R$/h", "Manutenção R$/h", "M.O. R$/h", "Indiretos R$/h", "Total R$/h"]}
                widths={[280, 60, 130, 140, 130, 140, 140]}
                rows={aud.equipamentos.map((e) => [
                  { value: e.nome, kind: "muted", align: "left" },
                  { value: e.quantidade, kind: "input", decimals: 2, align: "right" },
                  { value: e.diesel.valorTotal,     decimals: 2, formula: e.diesel.formula,     formulaExec: e.diesel.formulaTotal     || e.diesel.formulaExec },
                  { value: e.manutencao.valorTotal, decimals: 2, formula: e.manutencao.formula, formulaExec: e.manutencao.formulaTotal || e.manutencao.formulaExec },
                  { value: e.operador.valorTotal,   decimals: 2, formula: e.operador.formula,   formulaExec: e.operador.formulaTotal   || e.operador.formulaExec },
                  { value: e.indiretos.valorTotal,  decimals: 2, formula: e.indiretos.formula,  formulaExec: e.indiretos.formulaTotal  || e.indiretos.formulaExec },
                  { value: e.custoHora.valorTotal,  decimals: 2, formula: e.custoHora.formula,  formulaExec: e.custoHora.formulaTotal  || e.custoHora.formulaExec, bold: true },
                ])}
                totals={(() => {
                  const sum = aud.equipamentos.reduce((acc, e) => ({
                    diesel: acc.diesel + (e.diesel.valorTotal || 0),
                    manut:  acc.manut  + (e.manutencao.valorTotal || 0),
                    mo:     acc.mo     + (e.operador.valorTotal || 0),
                    indir:  acc.indir  + (e.indiretos.valorTotal || 0),
                    total:  acc.total  + (e.custoHora.valorTotal || 0),
                  }), { diesel: 0, manut: 0, mo: 0, indir: 0, total: 0 });
                  return [
                    { value: "Σ", kind: "muted", align: "left" },
                    { value: "", kind: "muted" },
                    { value: sum.diesel, decimals: 2 },
                    { value: sum.manut,  decimals: 2 },
                    { value: sum.mo,     decimals: 2 },
                    { value: sum.indir,  decimals: 2 },
                    { value: sum.total,  decimals: 2 },
                  ];
                })()}
              />
            </>
          )}

          {/* ── 3. R$/un — decomposição unitária ── */}
          {aud?.decomposicaoUnitaria?.length > 0 && (
            <>
              <SectionTitle n={3}>Decomposição unitária — R$/{unit}</SectionTitle>
              <Table
                head={["Componente", "Valor", "Unidade", "Fórmula", "Execução"]}
                widths={[260, 130, 80, 280, undefined]}
                rows={aud.decomposicaoUnitaria.map((row) => [
                  { value: row.label,   kind: "formula", align: "left", bold: row.label?.includes("Σ") || row.label?.toLowerCase().includes("custo unit") },
                  { value: row.valor,   decimals: 4, formula: row.formula, formulaExec: row.formulaExec },
                  { value: row.unidade, kind: "muted", align: "center" },
                  { value: row.formula,    kind: "muted", align: "left" },
                  { value: row.formulaExec, kind: "ref",  align: "left" },
                ])}
              />
            </>
          )}

          {/* ── 4. Fatores de markup ── */}
          {aud?.fatores?.length > 0 && (
            <>
              <SectionTitle n={4}>Fatores de markup — custo → preço</SectionTitle>
              <Table
                head={["Etapa", "Valor", "Unidade", "Fórmula", "Execução"]}
                widths={[260, 140, 80, 280, undefined]}
                rows={aud.fatores.map((row) => [
                  { value: row.label,   kind: "formula", align: "left", bold: true },
                  { value: row.valor,   decimals: 4, formula: row.formula, formulaExec: row.formulaExec, kind: row.label?.includes("Markup") ? "key" : "formula" },
                  { value: row.unidade, kind: "muted", align: "center" },
                  { value: row.formula,    kind: "muted", align: "left" },
                  { value: row.formulaExec, kind: "ref",  align: "left" },
                ])}
              />
            </>
          )}

          {/* ── 5. Resultado ── */}
          {aud?.resultado?.length > 0 && (
            <>
              <SectionTitle n={5}>Resultado final</SectionTitle>
              <Table
                head={["Linha", "Valor", "Unidade", "Fórmula", "Execução"]}
                widths={[260, 160, 80, 280, undefined]}
                rows={aud.resultado.map((row) => [
                  { value: row.label,   kind: "formula", align: "left", bold: true },
                  { value: row.valor,   decimals: row.unidade === "%" ? 2 : 4, formula: row.formula, formulaExec: row.formulaExec },
                  { value: row.unidade, kind: "muted", align: "center" },
                  { value: row.formula,    kind: "muted", align: "left" },
                  { value: row.formulaExec, kind: "ref",  align: "left" },
                ])}
              />
            </>
          )}

          {/* ── Validações ── */}
          {aud?.validacoes?.length > 0 && (
            <>
              <SectionTitle n="!">Validações</SectionTitle>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {aud.validacoes.map((v, i) => {
                  const c = SEVERIDADE[v.severidade] || SEVERIDADE.info;
                  return (
                    <div key={i} style={{
                      padding: "8px 12px",
                      background: c.bg, color: c.color,
                      border: `1px solid ${c.color}33`,
                      fontFamily: SS.fontUI, fontSize: 12.5,
                      display: "flex", gap: 10, alignItems: "flex-start",
                    }}>
                      <span style={{ fontSize: 14, fontWeight: 800 }}>{c.icon}</span>
                      <span>{v.mensagem}</span>
                    </div>
                  );
                })}
              </div>
            </>
          )}

          {/* ── Modo de indireto (informativo) ── */}
          {aud?.indiretoModel && (
            <div style={{
              padding: 10, fontSize: 11, color: SS.mutedText,
              background: SS.bgAlt, border: `1px solid ${SS.gridLine}`, fontFamily: SS.fontMono,
            }}>
              <b>Modo indireto:</b> {aud.indiretoModel.modo}
              {aud.indiretoModel.modo === "absoluto" && (
                <>  ·  R$ {fmt(aud.indiretoModel.indiretoTotalMensal, 2)}/mês ÷ {fmt(aud.indiretoModel.horasMes, 0)} h = R$ {fmt(aud.indiretoModel.indiretoHora, 2)}/h</>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Section title helper ──
function SectionTitle({ n, children }) {
  return (
    <h3 style={{
      margin: 0, fontSize: 12, fontWeight: 800,
      color: SS.headerText, letterSpacing: 0.6, textTransform: "uppercase",
      borderBottom: `2px solid ${SS.accentBlue}`, paddingBottom: 4,
      display: "flex", alignItems: "center", gap: 8,
    }}>
      <span style={{
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        width: 20, height: 20, background: SS.accentBlue, color: "#FFFFFF",
        fontSize: 11, fontWeight: 800,
      }}>{n}</span>
      {children}
    </h3>
  );
}

// ── Table helper ──
// rows: array of arrays of cell-defs:
//   { value, kind?, decimals?, unit?, align?, bold?, formula?, formulaExec? }
function Table({ head, widths = [], rows, totals }) {
  return (
    <div style={{ border: `1px solid ${SS.border}`, overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            {head.map((h, i) => (
              <th key={i} style={{
                padding: "5px 10px", height: 30,
                background: SS.bgHeader, color: SS.headerText,
                fontSize: SS.fontSizeHdr, fontWeight: 700,
                textTransform: "uppercase", letterSpacing: 0.4,
                borderBottom: `2px solid ${SS.accentBlue}`,
                border: `1px solid ${SS.border}`,
                width: widths[i], minWidth: widths[i],
                textAlign: i === 0 ? "left" : "right",
                fontFamily: SS.fontUI,
                whiteSpace: "nowrap",
              }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((cells, ri) => (
            <tr key={ri}>
              {cells.map((c, ci) => (
                <td key={ci} style={{ padding: 0, border: 0, verticalAlign: "middle" }}>
                  <ValueCell
                    value={c.value}
                    kind={c.kind || "formula"}
                    decimals={c.decimals ?? 2}
                    unit={c.unit}
                    align={c.align || (ci === 0 ? "left" : "right")}
                    bold={c.bold}
                    rowIndex={ri}
                    formula={c.formula}
                    formulaExec={c.formulaExec}
                    width={widths[ci]}
                  />
                </td>
              ))}
            </tr>
          ))}
          {totals && (
            <tr>
              {totals.map((c, ci) => (
                <td key={ci} style={{ padding: 0, border: 0, background: SS.bgHeader }}>
                  <ValueCell
                    value={c.value}
                    kind={c.kind || "formula"}
                    decimals={c.decimals ?? 2}
                    unit={c.unit}
                    align={c.align || (ci === 0 ? "left" : "right")}
                    bold
                    width={widths[ci]}
                  />
                </td>
              ))}
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
