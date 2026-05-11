import React, { useMemo, useState } from "react";
import { useStore } from "../store";
import SpreadsheetGrid from "../components/spreadsheet/SpreadsheetGrid";
import { SS } from "../styles/spreadsheetTheme";
import { runAllCrossChecks, sumarizarChecks } from "../validation/crossChecks";
import { computeBlocoA } from "../calculations/volumes";
import { calcQuotationTotals } from "../services/costEngine";
import { ASSUMPTIONS } from "../config/assumptions.config";

// ──────────────────────────────────────────────────────────────────
// Tela 7 — VALIDAÇÕES (cross-checks)
// Lê do store: orçamentos, equipment, params.
// Para o orçamento selecionado, monta snapshot e roda runAllCrossChecks.
// Também surfacia validações pontuais emitidas por costEngine em cada item.
// ──────────────────────────────────────────────────────────────────

const SEVERIDADE_BADGES = {
  ok:     { bg: SS.okBg,   color: SS.okText,   icon: "✓",  label: "OK"     },
  info:   { bg: SS.infoBg, color: SS.infoText, icon: "ℹ",  label: "INFO"   },
  alerta: { bg: SS.warnBg, color: SS.warnText, icon: "⚠",  label: "AVISO"  },
  erro:   { bg: SS.errBg,  color: SS.errText,  icon: "✕",  label: "ERRO"   },
};

const SaudeBadge = ({ saude, counts, total }) => {
  const conf = saude === "critico" ? SEVERIDADE_BADGES.erro
    : saude === "atencao"   ? SEVERIDADE_BADGES.alerta
    : saude === "incompleto" ? SEVERIDADE_BADGES.info
    : SEVERIDADE_BADGES.ok;
  return (
    <div style={{
      display: "inline-flex", gap: 12, alignItems: "center",
      padding: "8px 14px",
      background: conf.bg, color: conf.color,
      border: `1px solid ${SS.border}`,
      fontFamily: SS.fontUI, fontSize: 13, fontWeight: 700,
    }}>
      <span style={{ fontSize: 16 }}>{conf.icon}</span>
      <span>SAÚDE: {String(saude).toUpperCase()}</span>
      <span style={{ color: SS.mutedText, fontWeight: 500 }}>
        {counts.ok} ok · {counts.alerta} aviso · {counts.erro} erro · {counts.info} info · total {total}
      </span>
    </div>
  );
};

const SeveridadeCell = ({ severidade }) => {
  const conf = SEVERIDADE_BADGES[severidade] || SEVERIDADE_BADGES.info;
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 6,
      padding: "2px 8px",
      background: conf.bg, color: conf.color,
      border: `1px solid ${conf.color}33`,
      fontFamily: SS.fontMono, fontSize: 11, fontWeight: 700, letterSpacing: 0.4,
    }}>
      <span>{conf.icon}</span><span>{conf.label}</span>
    </span>
  );
};

const buildSnapshotFromQuotation = (q, params, equipment) => {
  if (!q) return {};

  const equipmentMap = Object.fromEntries((equipment || []).map((e) => [e.id, e]));
  const totals = calcQuotationTotals(
    q.items || [],
    equipmentMap,
    params,
    {
      bdi:      q.bdi      ?? params?.defaultBDI ?? ASSUMPTIONS.comercial.bdiPadrao,
      adminPct: q.adminPct ?? 0,
      mobilPct: q.mobilPct ?? 0,
      riskPct:  q.riskPct  ?? 0,
      indirectPersonnel: q.indirectPersonnel || [],
    }
  );

  const subtotalCost   = totals.subtotal;
  const precoFinal     = totals.precoFinal;
  const lucroBruto     = precoFinal - subtotalCost;
  const imposto        = lucroBruto * ASSUMPTIONS.comercial.percentualImposto;
  const lucroLiquido   = lucroBruto - imposto;
  const margemPct      = precoFinal > 0 ? (lucroLiquido / precoFinal) * 100 : 0;

  const markupEfetivo = subtotalCost > 0 ? precoFinal / subtotalCost : 0;

  // Linhas de custo (V5): equipamentos com qtd=0 que carregam custo
  const linhasCusto = (totals.itemsCalc || []).flatMap((it) =>
    (it.equipmentLines || []).map((line) => ({
      equipamentoId: line.equipmentId,
      nome: equipmentMap[line.equipmentId]?.name || line.equipmentId,
      quantidade: line.quantity ?? 1,
      custoTotal: it.custo_unitario * (it.quantity || 1) || 0,
    }))
  );

  const snapshot = {
    capacidade: q.contractData ? {
      volumeInSitu:           q.contractData.volumeEscavacaoTotal,
      produtividadeTotal_m3h: q.contractData.produtividadeTotal_m3h,
      diasUteisContrato:      q.contractData.diasUteisContrato,
      jornadaHorasDia:        q.contractData.jornadaHorasDia ?? params?.hoursPerDay,
    } : undefined,

    volume: q.contractData ? (() => {
      const a = computeBlocoA(q.contractData);
      return {
        volumeInSitu:     a.inputs.volumeEscavacaoTotal,
        volumeEmpolado:   a.volumes.escavacaoEmpolado,
        fatorEmpolamento: a.inputs.fatorEmpolamento,
      };
    })() : undefined,

    linhasCusto,
    markup:           markupEfetivo,
    margemLiquidaPct: margemPct,
    dieselRsM3:       totals.itemsCalc?.[0]?.detalhamento?.diesel ?? null,
  };

  return snapshot;
};

export default function Validacoes() {
  const { quotations, params, equipment } = useStore();
  const alerts = useStore((s) => s.alerts);
  const [selectedId, setSelectedId] = useState(quotations?.[0]?.id || "");

  const quotation = useMemo(
    () => quotations.find((q) => q.id === selectedId) || null,
    [quotations, selectedId]
  );

  const checks = useMemo(() => {
    const snap = buildSnapshotFromQuotation(quotation, params, equipment);
    return runAllCrossChecks(snap);
  }, [quotation, params, equipment]);

  const sumario = useMemo(() => sumarizarChecks(checks), [checks]);

  const columns = [
    { id: "id",          header: "ID",          width: 56,  align: "center", accessor: (r) => r.id, kind: "muted" },
    { id: "severidade",  header: "Severidade",  width: 110, align: "left",
      accessor: (r) => <SeveridadeCell severidade={r.severidade} />, kind: "muted" },
    { id: "titulo",      header: "Validação",   width: 280, align: "left", accessor: (r) => r.titulo, kind: "formula", bold: true },
    { id: "mensagem",    header: "Mensagem",    align: "left", accessor: (r) => r.mensagem, kind: "muted" },
  ];

  return (
    <div style={{
      display: "flex", flexDirection: "column", gap: 16,
      padding: 16, background: SS.bgAlt, minHeight: "100%",
      fontFamily: SS.fontUI,
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
        <h1 style={{ margin: 0, color: SS.headerText, fontSize: 20, fontWeight: 800 }}>
          Validações cruzadas
        </h1>
        <SaudeBadge saude={sumario.saude} counts={sumario.counts} total={sumario.total} />
      </div>

      <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
        <span style={{ fontSize: 12, color: SS.mutedText }}>Orçamento:</span>
        <select
          value={selectedId}
          onChange={(e) => setSelectedId(e.target.value)}
          style={{
            padding: "4px 8px",
            fontFamily: SS.fontMono, fontSize: 12,
            border: `1px solid ${SS.border}`, background: SS.bg, color: SS.formulaText,
            minWidth: 280,
          }}
        >
          <option value="">— nenhum (snapshot vazio) —</option>
          {quotations.map((q) => (
            <option key={q.id} value={q.id}>
              {q.cliente || q.numero || q.id} {q.status ? `· ${q.status}` : ""}
            </option>
          ))}
        </select>
        {!quotation && (
          <span style={{ fontSize: 11, color: SS.mutedText, fontStyle: "italic" }}>
            Sem orçamento: validações com inputs faltantes aparecem como “INFO”.
          </span>
        )}
      </div>

      <SpreadsheetGrid caption="V1–V8 · Cross-checks da spec" columns={columns} rows={checks} />

      {alerts && alerts.length > 0 && (
        <div>
          <h2 style={{ fontSize: 14, fontWeight: 700, color: SS.headerText, margin: "16px 0 8px" }}>
            Alertas do agente de melhoria contínua
          </h2>
          <SpreadsheetGrid
            columns={[
              { id: "level", header: "Nível", width: 110, align: "left",
                accessor: (a) => <SeveridadeCell severidade={
                  a.level === "danger" ? "erro" : a.level === "warning" ? "alerta" : "info"
                } />, kind: "muted" },
              { id: "id",      header: "ID",  width: 200, align: "left", accessor: (a) => a.id, kind: "muted" },
              { id: "message", header: "Mensagem",   align: "left", accessor: (a) => a.message, kind: "formula" },
            ]}
            rows={alerts}
          />
        </div>
      )}

      {quotation && (
        <div>
          <h2 style={{ fontSize: 14, fontWeight: 700, color: SS.headerText, margin: "16px 0 8px" }}>
            Validações por item ({quotation.items?.length || 0} itens)
          </h2>
          <ItemValidations quotation={quotation} params={params} equipment={equipment} />
        </div>
      )}
    </div>
  );
}

// Sub-componente: lista validações emitidas por costEngine para cada item.
function ItemValidations({ quotation, params, equipment }) {
  const equipmentMap = useMemo(() => Object.fromEntries((equipment || []).map((e) => [e.id, e])), [equipment]);
  const totals = useMemo(
    () => calcQuotationTotals(quotation.items || [], equipmentMap, params, {
      bdi:      quotation.bdi      ?? params?.defaultBDI ?? ASSUMPTIONS.comercial.bdiPadrao,
      adminPct: quotation.adminPct ?? 0,
      mobilPct: quotation.mobilPct ?? 0,
      riskPct:  quotation.riskPct  ?? 0,
      indirectPersonnel: quotation.indirectPersonnel || [],
    }),
    [quotation, equipmentMap, params]
  );

  const linhas = (totals.itemsCalc || []).flatMap((it) => {
    const vs = it?.detalhes?.auditoria?.validacoes || [];
    return vs.map((v, i) => ({
      id: `${it.id || it.desc}-${i}`,
      item: it.desc || "(sem descrição)",
      severidade: v.severidade,
      mensagem: v.mensagem,
    }));
  });

  if (linhas.length === 0) {
    return (
      <div style={{
        padding: 12, fontFamily: SS.fontUI, fontSize: 12, color: SS.mutedText,
        background: SS.bg, border: `1px solid ${SS.border}`,
      }}>
        Nenhum item levantou alertas no engine.
      </div>
    );
  }

  return (
    <SpreadsheetGrid
      columns={[
        { id: "severidade", header: "Severidade", width: 110, align: "left",
          accessor: (r) => <SeveridadeCell severidade={r.severidade} />, kind: "muted" },
        { id: "item",      header: "Item",      width: 280, align: "left", accessor: (r) => r.item, kind: "formula", bold: true },
        { id: "mensagem",  header: "Mensagem",   align: "left", accessor: (r) => r.mensagem, kind: "muted" },
      ]}
      rows={linhas}
    />
  );
}
