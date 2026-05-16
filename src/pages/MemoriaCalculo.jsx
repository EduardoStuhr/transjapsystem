import React, { useMemo, useState } from "react";
import { useStore } from "../store";
import SpreadsheetGrid from "../components/spreadsheet/SpreadsheetGrid";
import { SS } from "../styles/spreadsheetTheme";
import { computeBlocoA } from "../calculations/volumes";
import { runAllCrossChecks } from "../validation/crossChecks";
import { calcQuotationTotals } from "../services/costEngine";
import { ASSUMPTIONS } from "../config/assumptions.config";

// ──────────────────────────────────────────────────────────────────
// Tela 6 — MEMÓRIA DE CÁLCULO COMPLETA (read-only)
// Estrutura:
//   1) Cabeçalho do orçamento
//   2) Inputs do contrato
//   3) Bloco A: volumes e prazo (com fórmulas)
//   4) Auditoria por item: custo base, decomposição, fatores, resultado
//   5) Validações executadas
//   6) Botão "Imprimir" (window.print)
// ──────────────────────────────────────────────────────────────────

const Section = ({ title, children, anchor }) => (
  <section id={anchor} style={{
    background: SS.bg, border: `1px solid ${SS.border}`,
    padding: 16, marginBottom: 16,
  }}>
    <h2 style={{
      margin: "0 0 12px", fontFamily: SS.fontUI, fontSize: 14,
      color: SS.headerText, fontWeight: 800,
      textTransform: "uppercase", letterSpacing: 0.5,
      borderBottom: `2px solid ${SS.accentBlue}`,
      paddingBottom: 6,
    }}>{title}</h2>
    {children}
  </section>
);

const SeveridadeBadge = ({ severidade }) => {
  const map = {
    ok:     { bg: SS.okBg,   color: SS.okText,   icon: "✓" },
    info:   { bg: SS.infoBg, color: SS.infoText, icon: "ℹ" },
    alerta: { bg: SS.warnBg, color: SS.warnText, icon: "⚠" },
    erro:   { bg: SS.errBg,  color: SS.errText,  icon: "✕" },
  };
  const c = map[severidade] || map.info;
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 4,
      padding: "1px 6px", background: c.bg, color: c.color,
      fontFamily: SS.fontMono, fontSize: 11, fontWeight: 700,
    }}>{c.icon} {String(severidade).toUpperCase()}</span>
  );
};

export default function MemoriaCalculo() {
  const { quotations, params, equipment } = useStore();
  const [selectedId, setSelectedId] = useState(quotations?.[0]?.id || "");

  const quotation = useMemo(
    () => quotations.find((q) => q.id === selectedId) || null,
    [quotations, selectedId]
  );

  const equipmentMap = useMemo(
    () => Object.fromEntries((equipment || []).map((e) => [e.id, e])),
    [equipment]
  );

  const totals = useMemo(() => {
    if (!quotation) return null;
    return calcQuotationTotals(quotation.items || [], equipmentMap, params, {
      bdi:      quotation.bdi      ?? params?.defaultBDI ?? ASSUMPTIONS.comercial.bdiPadrao,
      adminPct: quotation.adminPct ?? 0,
      mobilPct: quotation.mobilPct ?? 0,
      riskPct:  quotation.riskPct  ?? 0,
      indirectPersonnel: quotation.indirectPersonnel || [],
      totalHorasProjeto: quotation.totalHorasProjeto || 0,
      volumeEmpoladoObra: quotation.volumeEmpoladoObra || 0,
    });
  }, [quotation, equipmentMap, params]);

  const blocoA = useMemo(() => {
    if (!quotation?.contractData) return null;
    return computeBlocoA(quotation.contractData);
  }, [quotation]);

  const checks = useMemo(() => {
    if (!quotation || !totals) return [];
    const lucroBruto   = totals.precoFinal - totals.subtotal;
    const imposto      = lucroBruto * ASSUMPTIONS.comercial.percentualImposto;
    const lucroLiquido = lucroBruto - imposto;
    const margemPct    = totals.precoFinal > 0 ? (lucroLiquido / totals.precoFinal) * 100 : 0;
    const markup       = totals.subtotal > 0 ? totals.precoFinal / totals.subtotal : 0;

    const snap = {
      capacidade: quotation.contractData ? {
        volumeInSitu:           quotation.contractData.volumeEscavacaoTotal,
        produtividadeTotal_m3h: quotation.contractData.produtividadeTotal_m3h,
        diasUteisContrato:      quotation.contractData.diasUteisContrato,
        jornadaHorasDia:        quotation.contractData.jornadaHorasDia ?? params?.hoursPerDay,
      } : undefined,
      volume: blocoA ? {
        volumeInSitu:     blocoA.inputs.volumeEscavacaoTotal,
        volumeEmpolado:   blocoA.volumes.escavacaoEmpolado,
        fatorEmpolamento: blocoA.inputs.fatorEmpolamento,
      } : undefined,
      markup,
      margemLiquidaPct: margemPct,
    };
    return runAllCrossChecks(snap);
  }, [quotation, totals, blocoA, params]);

  const handlePrint = () => window.print();

  if (!quotations || quotations.length === 0) {
    return (
      <div style={{ padding: 16, fontFamily: SS.fontUI, color: SS.formulaText }}>
        <h1 style={{ color: SS.headerText, fontSize: 20 }}>Memória de cálculo</h1>
        <p style={{ color: SS.mutedText }}>Nenhum orçamento salvo. Crie um orçamento em "Orçamentos" para gerar a memória.</p>
      </div>
    );
  }

  return (
    <div style={{
      padding: 16, background: SS.bgAlt, minHeight: "100%",
      fontFamily: SS.fontUI,
    }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 12 }}>
        <h1 style={{ margin: 0, color: SS.headerText, fontSize: 20, fontWeight: 800 }}>
          Memória de Cálculo Completa
        </h1>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <select
            value={selectedId}
            onChange={(e) => setSelectedId(e.target.value)}
            style={{
              padding: "4px 8px", fontFamily: SS.fontMono, fontSize: 12,
              border: `1px solid ${SS.border}`, background: SS.bg, color: SS.formulaText, minWidth: 280,
            }}
          >
            <option value="">— selecione —</option>
            {quotations.map((q) => (
              <option key={q.id} value={q.id}>{q.cliente || q.numero || q.id}</option>
            ))}
          </select>
          <button
            onClick={handlePrint}
            style={{
              padding: "6px 12px", border: `1px solid ${SS.accentBlue}`,
              background: SS.bg, color: SS.accentBlue, fontWeight: 700, cursor: "pointer",
              fontFamily: SS.fontUI, fontSize: 12,
            }}
          >Imprimir</button>
        </div>
      </header>

      {!quotation ? (
        <p style={{ color: SS.mutedText, fontSize: 13 }}>Selecione um orçamento acima.</p>
      ) : (
        <>
          <Section title={`Orçamento ${quotation.numero || quotation.id}`}>
            <table style={{ borderCollapse: "collapse", fontFamily: SS.fontMono, fontSize: 12 }}>
              <tbody>
                {[
                  ["Cliente",  quotation.cliente || "—"],
                  ["Status",   quotation.status || "Em elaboração"],
                  ["Data",     quotation.data || "—"],
                  ["Itens",    String((quotation.items || []).length)],
                ].map(([k, v]) => (
                  <tr key={k}>
                    <td style={{ padding: "4px 12px", color: SS.mutedText, borderBottom: `1px solid ${SS.gridLine}` }}>{k}</td>
                    <td style={{ padding: "4px 12px", color: SS.formulaText, fontWeight: 700, borderBottom: `1px solid ${SS.gridLine}` }}>{v}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Section>

          {blocoA && (
            <Section title="Bloco A — Volumes e Prazo">
              <SpreadsheetGrid
                columns={[
                  { id: "id",          header: "ID",         width: 180, align: "left",  accessor: (r) => r.id,         kind: "muted" },
                  { id: "label",       header: "Descrição",  width: 280, align: "left",  accessor: (r) => r.label,      kind: "formula", bold: true },
                  { id: "valor",       header: "Valor",      width: 140, align: "right", accessor: (r) => r.valor,      kind: "formula", decimals: 2 },
                  { id: "unidade",     header: "Un.",        width: 60,  align: "center",accessor: (r) => r.unidade,    kind: "muted" },
                  { id: "formula",     header: "Fórmula",    width: 320, align: "left",  accessor: (r) => r.formula,    kind: "muted" },
                  { id: "formulaExec", header: "Execução",   align: "left",              accessor: (r) => r.formulaExec, kind: "ref" },
                ]}
                rows={blocoA.auditoria}
              />
            </Section>
          )}

          {totals && (
            <Section title="Equipamentos & Custos por item">
              <ItemAuditTable totals={totals} />
            </Section>
          )}

          {totals && (
            <Section title="Resumo Comercial">
              <ResumoComercial totals={totals} />
            </Section>
          )}

          <Section title="Validações Executadas">
            <SpreadsheetGrid
              columns={[
                { id: "id",         header: "ID",          width: 56,  align: "center", accessor: (r) => r.id, kind: "muted" },
                { id: "severidade", header: "Severidade",  width: 120, align: "left",
                  accessor: (r) => <SeveridadeBadge severidade={r.severidade} />, kind: "muted" },
                { id: "titulo",     header: "Validação",   width: 280, align: "left",  accessor: (r) => r.titulo, kind: "formula", bold: true },
                { id: "mensagem",   header: "Mensagem",    align: "left", accessor: (r) => r.mensagem, kind: "muted" },
              ]}
              rows={checks}
            />
          </Section>

          <footer style={{ marginTop: 24, padding: 12, background: SS.bgHeader, fontFamily: SS.fontMono, fontSize: 11, color: SS.mutedText }}>
            Gerado por Sistema de Orçamento de Terraplenagem · {new Date().toLocaleString("pt-BR")}
          </footer>
        </>
      )}
    </div>
  );
}

// Tabela auditável por item: linhas de custoBase + decomposição unitária.
function ItemAuditTable({ totals }) {
  const items = totals.itemsCalc || [];
  if (items.length === 0) return <p style={{ color: SS.mutedText, fontSize: 12 }}>Sem itens.</p>;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      {items.map((it) => {
        const aud = it?.detalhes?.auditoria;
        if (!aud) return null;
        const linhas = [
          ...(aud.custoBase || []),
          ...(aud.decomposicaoUnitaria || []),
          ...(aud.fatores || []),
          ...(aud.resultado || []),
        ].map((row, i) => ({ ...row, _i: i }));
        return (
          <div key={it.id || it.desc}>
            <div style={{ fontFamily: SS.fontUI, fontSize: 13, fontWeight: 700, color: SS.headerText, marginBottom: 6 }}>
              {it.desc || "(sem descrição)"} · custo unit. {it.custo_unitario?.toFixed?.(4) ?? "—"} R$/{it.unit || "un"}
            </div>
            <SpreadsheetGrid
              compact
              columns={[
                { id: "label",       header: "Item",      width: 280, align: "left",  accessor: (r) => r.label,       kind: "formula", bold: true },
                { id: "valor",       header: "Valor",     width: 120, align: "right", accessor: (r) => r.valor,       kind: "formula", decimals: 4 },
                { id: "unidade",     header: "Un.",       width: 70,  align: "center",accessor: (r) => r.unidade,     kind: "muted" },
                { id: "formula",     header: "Fórmula",   width: 280, align: "left",  accessor: (r) => r.formula,     kind: "muted" },
                { id: "formulaExec", header: "Execução",  align: "left",              accessor: (r) => r.formulaExec, kind: "ref" },
              ]}
              rows={linhas}
            />
          </div>
        );
      })}
    </div>
  );
}

function ResumoComercial({ totals }) {
  const subtotalCost = totals.subtotal || 0;
  const precoFinal   = totals.precoFinal || 0;
  const lucroBruto   = precoFinal - subtotalCost;
  const imposto      = lucroBruto * ASSUMPTIONS.comercial.percentualImposto;
  const lucroLiquido = lucroBruto - imposto;
  const margemPct    = precoFinal > 0 ? (lucroLiquido / precoFinal) * 100 : 0;
  const markup       = subtotalCost > 0 ? precoFinal / subtotalCost : 0;

  const rows = [
    { label: "Custo total do projeto", valor: subtotalCost, unidade: "R$",
      formula: "Σ custo unitário × quantidade",
      formulaExec: `Σ items.custo_unitario × items.quantity = ${subtotalCost.toFixed(2)}` },
    { label: "Preço final ao cliente", valor: precoFinal, unidade: "R$",
      formula: "subtotal + indireto + BDI",
      formulaExec: `subtotal=${(totals.subtotalPrice || 0).toFixed(2)} + indireto=${(totals.indirect || 0).toFixed(2)} + BDI=${(totals.bdiVal || 0).toFixed(2)} = ${precoFinal.toFixed(2)}` },
    { label: "Lucro bruto", valor: lucroBruto, unidade: "R$",
      formula: "preço final − custo total",
      formulaExec: `${precoFinal.toFixed(2)} − ${subtotalCost.toFixed(2)} = ${lucroBruto.toFixed(2)}` },
    { label: `Imposto (${(ASSUMPTIONS.comercial.percentualImposto * 100).toFixed(2)}%)`, valor: imposto, unidade: "R$",
      formula: "lucro bruto × % imposto",
      formulaExec: `${lucroBruto.toFixed(2)} × ${ASSUMPTIONS.comercial.percentualImposto} = ${imposto.toFixed(2)}` },
    { label: "Lucro líquido", valor: lucroLiquido, unidade: "R$",
      formula: "lucro bruto − imposto",
      formulaExec: `${lucroBruto.toFixed(2)} − ${imposto.toFixed(2)} = ${lucroLiquido.toFixed(2)}` },
    { label: "Margem líquida", valor: margemPct, unidade: "%",
      formula: "(lucro líquido ÷ preço final) × 100",
      formulaExec: `(${lucroLiquido.toFixed(2)} ÷ ${precoFinal.toFixed(2)}) × 100 = ${margemPct.toFixed(2)}` },
    { label: "Markup efetivo", valor: markup, unidade: "×",
      formula: "preço final ÷ custo total",
      formulaExec: `${precoFinal.toFixed(2)} ÷ ${subtotalCost.toFixed(2)} = ${markup.toFixed(2)}` },
  ];

  return (
    <SpreadsheetGrid
      columns={[
        { id: "label",       header: "Linha",     width: 280, align: "left",  accessor: (r) => r.label,       kind: "formula", bold: true },
        { id: "valor",       header: "Valor",     width: 160, align: "right", accessor: (r) => r.valor,       kind: "formula", decimals: 2 },
        { id: "unidade",     header: "Un.",       width: 60,  align: "center",accessor: (r) => r.unidade,     kind: "muted" },
        { id: "formula",     header: "Fórmula",   width: 260, align: "left",  accessor: (r) => r.formula,     kind: "muted" },
        { id: "formulaExec", header: "Execução",  align: "left",              accessor: (r) => r.formulaExec, kind: "ref" },
      ]}
      rows={rows}
    />
  );
}
