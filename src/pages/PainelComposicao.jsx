import React, { useMemo, useState } from "react";
import { useStore } from "../store";
import SpreadsheetGrid from "../components/spreadsheet/SpreadsheetGrid";
import ValueCell from "../components/spreadsheet/ValueCell";
import { SS } from "../styles/spreadsheetTheme";
import { calcQuotationTotals } from "../services/costEngine";
import { ASSUMPTIONS } from "../config/assumptions.config";
import { fmt, fmtBRL } from "../utils/format";

// ──────────────────────────────────────────────────────────────────
// Tela 4 — PAINEL DE COMPOSIÇÃO DE PREÇO
// Espelha visualmente a aba "COMPOSIÇÃO DE PREÇO" da planilha RONMA:
//
//   ┌──────────────┬────┬────┬────┬─────┬─────┬─────────┐
//   │ Serviço/Eq.  │Die │Man │M.O.│Indir│Total│ Total R$│
//   │              │ R$/m³ R$/m³ R$/m³ R$/m³ R$/m³        │
//   ├──────────────┴────┴────┴────┴─────┴─────┴─────────┤
//   │ LIMPEZA                                              │
//   │   Escavadeira    │ ... │ ... │ ... │ ... │ ... │ ... │
//   │ ESCAVAÇÃO E CARGA                                    │
//   │   Escavadeira    │ ... │ ... │ ... │ ... │ ... │ ... │
//   │ ...                                                  │
//   │ Custo Total Projeto    Σ    Σ    Σ    Σ    Σ    Σ   │
//   └──────────────────────────────────────────────────────┘
//   + Bloco Comercial: markup, preço, lucro, imposto, líquido.
//
// Cada célula calculada mostra a fórmula no hover, com rateio por quantidade:
//   escavadeira/trator/grade/rolo/pipa ÷ m³ empolado; patrol e demais ÷ m³ in situ
// ──────────────────────────────────────────────────────────────────

const ROW_HEIGHT = 26;

const GroupHeader = ({ label, sub }) => (
  <tr>
    <td colSpan={7} style={{
      padding: "6px 10px",
      background: SS.bgHeader,
      color: SS.headerText,
      fontFamily: SS.fontUI,
      fontSize: SS.fontSizeHdr,
      fontWeight: 800,
      textTransform: "uppercase",
      letterSpacing: 0.5,
      borderTop: `2px solid ${SS.accentBlue}`,
      borderBottom: `1px solid ${SS.border}`,
    }}>
      {label}{sub ? <span style={{ marginLeft: 12, color: SS.mutedText, fontWeight: 500, textTransform: "none", letterSpacing: 0 }}>{sub}</span> : null}
    </td>
  </tr>
);

const SubtotalRow = ({ label, totals, unit }) => (
  <tr>
    <td style={tdLabel(true)}>{label}</td>
    <td style={tdNum(true)}>{fmt(totals.diesel || 0, 4)}</td>
    <td style={tdNum(true)}>{fmt(totals.manut  || 0, 4)}</td>
    <td style={tdNum(true)}>{fmt(totals.mo     || 0, 4)}</td>
    <td style={tdNum(true)}>{fmt(totals.indir  || 0, 4)}</td>
    <td style={tdNum(true)}>{fmt(totals.total  || 0, 4)} R$/{unit}</td>
    <td style={tdNum(true)}>{fmtBRL(totals.totalRs || 0)}</td>
  </tr>
);

const tdLabel = (bold = false) => ({
  padding: "4px 10px",
  height: ROW_HEIGHT,
  background: bold ? SS.bgHeader : SS.bg,
  color: SS.formulaText,
  fontFamily: SS.fontMono,
  fontSize: SS.fontSizeCell,
  fontWeight: bold ? 800 : 500,
  border: `1px solid ${SS.gridLine}`,
  whiteSpace: "nowrap",
});

const tdNum = (bold = false) => ({
  padding: "4px 10px",
  height: ROW_HEIGHT,
  background: bold ? SS.bgHeader : SS.bg,
  color: SS.formulaText,
  fontFamily: SS.fontMono,
  fontSize: SS.fontSizeCell,
  fontWeight: bold ? 800 : 500,
  textAlign: "right",
  border: `1px solid ${SS.gridLine}`,
});

const toNumber = (value, fallback = 0) => {
  const n = typeof value === "string" ? parseFloat(value.replace(",", ".")) : parseFloat(value);
  return Number.isFinite(n) ? n : fallback;
};

const matchesCategoryName = (eq = {}, ...needles) => {
  const texto = `${eq.categoria || ""} ${eq.nome || eq.equipamento || ""}`.toLowerCase();
  return needles.some((n) => texto.includes(n));
};
const isEscavadeira   = (eq = {}) => matchesCategoryName(eq, "escavadeira");
const isPatrol        = (eq = {}) => matchesCategoryName(eq, "patrol", "motoniveladora");
const isTratorOuGrade = (eq = {}) => matchesCategoryName(eq, "trator", "grade");
const isRolo          = (eq = {}) => matchesCategoryName(eq, "rolo", "compactador");
const isPipa          = (eq = {}) => matchesCategoryName(eq, "pipa");

// Mesmo conjunto da escavadeira: usam ciclo de viagens × m³ empolado/viagem
// para derivar m³/h da máquina e horas com produção.
const usaCicloViagensCategoria = (eq) =>
  isEscavadeira(eq) || isPatrol(eq) || isTratorOuGrade(eq) || isRolo(eq) || isPipa(eq);

// Denominador de rateio por categoria:
//   - Escavadeira, trator/grade, rolo, caminhão pipa → m³ empolado
//   - Patrol, demais                                  → m³ in situ
const usaDenominadorEmpolado = (eq) =>
  isEscavadeira(eq) || isTratorOuGrade(eq) || isRolo(eq) || isPipa(eq);

const calcVolumeComEmpolamento = (volume, fator) => {
  const v = toNumber(volume, 0);
  const f = toNumber(fator, 0);
  if (v <= 0 || f <= 0) return 0;
  return f < 1 ? Math.max(v - (v * f), 0) : v * f;
};

// ── Decompõe um item em linhas por equipamento (R$/m³ por componente) ──
// Escavadeira, trator/grade, rolo e caminhão pipa usam m³ empolado;
// patrol (motoniveladora) e os demais equipamentos usam m³ in situ.
const buildItemRows = (item) => {
  const aud = item?.detalhes?.auditoria;
  const prod = item?.produtividade_utilizada || 0;
  const unit = item?.unit || "un";
  const qty  = item?.quantity || 0;

  const volumeInSitu = toNumber(item?.volumeInSitu, toNumber(item?.quantity, 0));
  const fatorEmpolamento = toNumber(
    item?.fatorEmpolamento,
    toNumber(item?.detalhes?.volumes?.fatorEmpolamento, 1 + ASSUMPTIONS.empolamento.fatorPadrao)
  );
  const volumeEmpolado = calcVolumeComEmpolamento(volumeInSitu, fatorEmpolamento);
  const volumeInSituPorViagem = toNumber(item?.volumeInSituPorViagem, ASSUMPTIONS.transporte.volumePorViagemInSitu);
  const volumeEmpoladoPorViagem = calcVolumeComEmpolamento(volumeInSituPorViagem, fatorEmpolamento);
  const horasDia = toNumber(item?.horasDia, ASSUMPTIONS.jornada.horasPorDia);

  const eqs = aud?.equipamentos || [];

  // Horas-máquina = volumeInSitu ÷ Σ(baseProductivity × qty). Sem aplicar
  // eficiência, fatorSolo ou fatorLogistica (esses só servem para a UI
  // informativa de "produtividade real").
  const producaoConjuntoBase =
    toNumber(item?.detalhes?.produtividade?.producaoConjuntoBase, 0)
    || eqs.reduce((s, e) => s + toNumber(e.baseProductivity, 0) * toNumber(e.quantidade, toNumber(e.qty, 1)), 0);
  const horasMaquinaRateio =
    toNumber(item?.detalhes?.produtividade?.horasMaquinaRateio, 0)
    || (volumeInSitu > 0 && producaoConjuntoBase > 0 ? volumeInSitu / producaoConjuntoBase : 0);

  const rows = eqs.map((e) => {
    const empoladoBase = usaDenominadorEmpolado(e);
    const usaCiclo = usaCicloViagensCategoria(e);
    const denominador = empoladoBase ? volumeEmpolado : volumeInSitu;
    const baseRateio = empoladoBase ? "m³ empolado" : "m³ in situ";
    const nome = e.nome || e.equipamento || "Equipamento";
    const qtdEq = toNumber(e.quantidade, toNumber(e.qty, 1));
    const viagensHora = toNumber(e.viagensPorHora, 0);
    const m3EmpoladoHoraMaquina = viagensHora * volumeEmpoladoPorViagem;
    const m3EmpoladoHoraFrota = m3EmpoladoHoraMaquina * qtdEq;
    const m3EmpoladoDia = m3EmpoladoHoraFrota * horasDia;
    const viagensDia = viagensHora * horasDia * qtdEq;
    const usaCicloEfetivo = usaCiclo && viagensHora > 0 && volumeEmpoladoPorViagem > 0 && qtdEq > 0;
    const horasComProducao = usaCicloEfetivo && m3EmpoladoHoraFrota > 0
      ? volumeInSitu / m3EmpoladoHoraFrota
      : horasMaquinaRateio;

    const directUnit = (field) => {
      if (e[field] == null) return null;
      const n = toNumber(e[field], NaN);
      return Number.isFinite(n) ? n : null;
    };
    const componentUn = (rowName, directField) => {
      const direct = directUnit(directField);
      if (direct != null) return direct;
      const row = e[rowName];
      if (rowName === "diesel" && usaCicloEfetivo) {
        return denominador > 0 && row?.valorTotal != null
          ? (toNumber(row.valorTotal) * horasComProducao) / denominador
          : 0;
      }
      return denominador > 0 && row?.valorTotal != null
        ? (toNumber(row.valorTotal) * horasMaquinaRateio) / denominador
        : 0;
    };

    const dieselUn = componentUn("diesel", "diesel_R$_m3");
    const manutUn  = componentUn("manutencao", "manutencao_R$_m3");
    const moUn     = componentUn("operador", "mo_R$_m3");
    const indirUn  = componentUn("indiretos", "indireto_R$_m3");
    const totalUn  = dieselUn + manutUn + moUn + indirUn;
    const totalRs  = totalUn * qty;

    const fexec = (row, compUn) => {
      const valorHora = toNumber(row?.valorTotal, null);
      if (valorHora == null) {
        return `${baseRateio}: ${fmtBRL(compUn)}/${unit}`;
      }
      if (row === e.diesel && usaCicloEfetivo) {
        return `${fmt(viagensHora, 2)} viagens/h × ${fmt(volumeEmpoladoPorViagem, 2)} m³/viagem = ${fmt(m3EmpoladoHoraMaquina, 2)} m³/h; dia: ${fmt(m3EmpoladoDia, 2)} m³ e ${fmt(viagensDia, 2)} viagens; ${fmt(volumeInSitu, 2)} ÷ ${fmt(m3EmpoladoHoraFrota, 2)} = ${fmt(horasComProducao, 2)} h; ${fmtBRL(valorHora)}/h × ${fmt(horasComProducao, 2)} h ÷ ${fmt(denominador, 2)} ${unit} (${baseRateio}) = ${fmtBRL(compUn)}/${unit}`;
      }
      return `(${fmtBRL(valorHora)}/h × ${fmt(horasMaquinaRateio, 2)} h) ÷ ${fmt(denominador, 2)} ${unit} (${baseRateio}) = ${fmtBRL(compUn)}/${unit}`;
    };

    return {
      nome,
      qtd:  qtdEq,
      diesel: dieselUn,
      manut:  manutUn,
      mo:     moUn,
      indir:  indirUn,
      total:  totalUn,
      totalRs,
      unit,
      // fórmulas auditáveis por célula
      formula: {
        diesel: { f: "diesel total do projeto ÷ quantidade de rateio", x: fexec(e.diesel, dieselUn) },
        manut:  { f: "manutenção total do projeto ÷ quantidade de rateio", x: fexec(e.manutencao, manutUn) },
        mo:     { f: "mão de obra total do projeto ÷ quantidade de rateio", x: fexec(e.operador, moUn) },
        indir:  { f: "indiretos total do projeto ÷ quantidade de rateio", x: fexec(e.indiretos, indirUn) },
        total:  { f: "Σ componentes R$/m³",                        x: `${fmt(dieselUn,4)} + ${fmt(manutUn,4)} + ${fmt(moUn,4)} + ${fmt(indirUn,4)} = ${fmt(totalUn,4)}` },
        totalRs:{ f: "total R$/un × quantidade",                   x: `${fmt(totalUn,4)} × ${fmt(qty,2)} = ${fmtBRL(totalRs)}` },
      },
    };
  });

  // Subtotal do item
  const sub = rows.reduce((acc, r) => ({
    diesel:  acc.diesel + r.diesel,
    manut:   acc.manut  + r.manut,
    mo:      acc.mo     + r.mo,
    indir:   acc.indir  + r.indir,
    total:   acc.total  + r.total,
    totalRs: acc.totalRs+ r.totalRs,
  }), { diesel: 0, manut: 0, mo: 0, indir: 0, total: 0, totalRs: 0 });

  return { eqRows: rows, subtotal: sub, unit, prod, qty, volumeInSitu, volumeEmpolado, fatorEmpolamento };
};

// ── Célula numérica com tooltip de fórmula (atalho local) ──
const NumCell = ({ value, formula, formulaExec, decimals = 4, kind = "formula", origem }) => (
  <td style={{ padding: 0, border: 0 }}>
    <ValueCell
      value={value}
      kind={kind}
      decimals={decimals}
      align="right"
      formula={formula}
      formulaExec={formulaExec}
      origem={origem}
    />
  </td>
);

export default function PainelComposicao() {
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
    });
  }, [quotation, equipmentMap, params]);

  // Markup / imposto editáveis (state local — não persiste no store)
  const [markup,         setMarkup]         = useState(ASSUMPTIONS.markup.fatorBase);
  const [percentImposto, setPercentImposto] = useState(ASSUMPTIONS.comercial.percentualImposto * 100);

  if (!quotations || quotations.length === 0) {
    return (
      <div style={{ padding: 16, fontFamily: SS.fontUI, color: SS.formulaText }}>
        <h1 style={{ color: SS.headerText, fontSize: 20 }}>Composição de Preço</h1>
        <p style={{ color: SS.mutedText }}>Nenhum orçamento cadastrado. Cadastre em "Orçamentos" para ver a composição aqui.</p>
      </div>
    );
  }

  const itemsCalc = totals?.itemsCalc || [];

  // Soma global por componente (para a linha "Custo Total do Projeto")
  const grandTotal = itemsCalc.reduce((acc, item) => {
    const { subtotal } = buildItemRows(item);
    return {
      diesel:  acc.diesel  + subtotal.diesel,
      manut:   acc.manut   + subtotal.manut,
      mo:      acc.mo      + subtotal.mo,
      indir:   acc.indir   + subtotal.indir,
      total:   acc.total   + subtotal.total,
      totalRs: acc.totalRs + subtotal.totalRs,
    };
  }, { diesel: 0, manut: 0, mo: 0, indir: 0, total: 0, totalRs: 0 });

  // Bloco Comercial (Bloco F simplificado)
  const custoTotalProjeto  = grandTotal.totalRs;
  const precoUnitarioMedio = grandTotal.total * markup;
  const precoFinalProjeto  = precoUnitarioMedio > 0 && grandTotal.total > 0
    ? custoTotalProjeto * (precoUnitarioMedio / grandTotal.total)
    : custoTotalProjeto * markup;
  const lucroEstimado      = precoFinalProjeto - custoTotalProjeto;
  const imposto            = lucroEstimado * (percentImposto / 100);
  const lucroLiquido       = lucroEstimado - imposto;
  const margemPct          = precoFinalProjeto > 0 ? (lucroLiquido / precoFinalProjeto) * 100 : 0;

  return (
    <div style={{
      padding: 16, background: SS.bgAlt, minHeight: "100%",
      fontFamily: SS.fontUI,
    }}>
      {/* ── Cabeçalho do painel ── */}
      <div style={{
        display: "flex", justifyContent: "space-between", alignItems: "center",
        gap: 16, flexWrap: "wrap", marginBottom: 16,
      }}>
        <h1 style={{ margin: 0, color: SS.headerText, fontSize: 20, fontWeight: 800 }}>
          Composição de Preço — {quotation?.cliente || quotation?.numero || "(sem cliente)"}
        </h1>
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
      </div>

      {!quotation ? (
        <p style={{ color: SS.mutedText }}>Selecione um orçamento.</p>
      ) : (
        <>
          {/* ── Tabela principal ── */}
          <div style={{
            border: `1px solid ${SS.border}`, background: SS.bg, overflowX: "auto",
          }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={thMain("left", 320)}>Serviço / Equipamento</th>
                  <th style={thMain("right", 110)}>Diesel</th>
                  <th style={thMain("right", 110)}>Manutenção</th>
                  <th style={thMain("right", 110)}>Mão de Obra</th>
                  <th style={thMain("right", 110)}>Indirétos</th>
                  <th style={thMain("right", 130)}>Total R$/un</th>
                  <th style={thMain("right", 160)}>Total R$</th>
                </tr>
                <tr>
                  <th style={thSub("left")}>(R$/un)</th>
                  <th style={thSub("right")} colSpan={5}>R$/un</th>
                  <th style={thSub("right")}>R$ no projeto</th>
                </tr>
              </thead>
              <tbody>
                {itemsCalc.map((item) => {
                  const { eqRows, subtotal, unit, prod, qty, volumeInSitu, volumeEmpolado, fatorEmpolamento } = buildItemRows(item);
                  return (
                    <React.Fragment key={item.id || item.desc}>
                      <GroupHeader
                        label={(item.desc || item.category || "Serviço").toUpperCase()}
                        sub={`${fmt(qty, 2)} ${unit} · in situ ${fmt(volumeInSitu, 2)} · empolado ${fmt(volumeEmpolado, 2)} (fator ${fmt(fatorEmpolamento, 2)}) · prod. real ${fmt(prod, 2)} ${unit}/h`}
                      />
                      {eqRows.length === 0 && (
                        <tr>
                          <td style={tdLabel()} colSpan={7}>
                            <span style={{ color: SS.mutedText, fontStyle: "italic" }}>
                              (nenhum equipamento alocado)
                            </span>
                          </td>
                        </tr>
                      )}
                      {eqRows.map((r, idx) => (
                        <tr key={idx}>
                          <td style={tdLabel()}>
                            {r.nome}
                            {r.qtd !== 1 && <span style={{ color: SS.mutedText, marginLeft: 6 }}>× {fmt(r.qtd, 2)}</span>}
                          </td>
                          <NumCell value={r.diesel} decimals={4} formula={r.formula.diesel.f} formulaExec={r.formula.diesel.x} origem={`${item.desc} · diesel`} />
                          <NumCell value={r.manut}  decimals={4} formula={r.formula.manut.f}  formulaExec={r.formula.manut.x}  origem={`${item.desc} · manutenção`} />
                          <NumCell value={r.mo}     decimals={4} formula={r.formula.mo.f}     formulaExec={r.formula.mo.x}     origem={`${item.desc} · mão de obra`} />
                          <NumCell value={r.indir}  decimals={4} formula={r.formula.indir.f}  formulaExec={r.formula.indir.x}  origem={`${item.desc} · indiretos`} />
                          <NumCell value={r.total}  decimals={4} formula={r.formula.total.f}  formulaExec={r.formula.total.x}  origem="custo unitário" />
                          <NumCell value={r.totalRs} decimals={2} formula={r.formula.totalRs.f} formulaExec={r.formula.totalRs.x} origem="custo total no projeto" />
                        </tr>
                      ))}
                      {eqRows.length > 0 && (
                        <SubtotalRow label={`Subtotal — ${item.desc || ""}`} totals={subtotal} unit={unit} />
                      )}
                    </React.Fragment>
                  );
                })}

                {/* ── Linha final: Custo Total do Projeto ── */}
                <tr>
                  <td style={{ ...tdLabel(true), background: "#FFF2CC", color: SS.accentAmber, borderTop: `2px solid ${SS.accentBlue}` }}>
                    Custo Total do Projeto
                  </td>
                  <td style={{ ...tdNum(true), background: "#FFF2CC", borderTop: `2px solid ${SS.accentBlue}` }}>{fmt(grandTotal.diesel, 4)}</td>
                  <td style={{ ...tdNum(true), background: "#FFF2CC", borderTop: `2px solid ${SS.accentBlue}` }}>{fmt(grandTotal.manut,  4)}</td>
                  <td style={{ ...tdNum(true), background: "#FFF2CC", borderTop: `2px solid ${SS.accentBlue}` }}>{fmt(grandTotal.mo,     4)}</td>
                  <td style={{ ...tdNum(true), background: "#FFF2CC", borderTop: `2px solid ${SS.accentBlue}` }}>{fmt(grandTotal.indir,  4)}</td>
                  <td style={{ ...tdNum(true), background: "#FFF2CC", borderTop: `2px solid ${SS.accentBlue}` }}>{fmt(grandTotal.total,  4)}</td>
                  <td style={{ ...tdNum(true), background: "#FFF2CC", borderTop: `2px solid ${SS.accentBlue}` }}>{fmtBRL(grandTotal.totalRs)}</td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* ── Bloco Comercial (Bloco F simplificado) ── */}
          <div style={{
            marginTop: 18,
            display: "grid", gridTemplateColumns: "minmax(360px, 480px) 1fr", gap: 18,
          }}>
            {/* Sliders/inputs */}
            <div style={{ background: SS.bg, border: `1px solid ${SS.border}`, padding: 14 }}>
              <h2 style={{ margin: "0 0 10px", color: SS.headerText, fontSize: 14, fontWeight: 800,
                textTransform: "uppercase", letterSpacing: 0.5, borderBottom: `2px solid ${SS.accentBlue}`, paddingBottom: 6 }}>
                Cenário Comercial
              </h2>

              <ScenarioField
                label="Markup"
                value={markup}
                onChange={setMarkup}
                min={1.0} max={4.0} step={0.05}
                suffix="×"
                decimals={2}
                hint={`assumption-chave (default: ${ASSUMPTIONS.markup.fatorBase}×)`}
              />
              <ScenarioField
                label="% Imposto sobre lucro"
                value={percentImposto}
                onChange={setPercentImposto}
                min={0} max={50} step={0.25}
                suffix="%"
                decimals={2}
                hint={`assumption-chave (default: ${(ASSUMPTIONS.comercial.percentualImposto * 100).toFixed(2)}%)`}
              />
            </div>

            {/* Sumário comercial em formato tabular */}
            <div style={{ background: SS.bg, border: `1px solid ${SS.border}`, padding: 0, overflow: "hidden" }}>
              <div style={{ padding: "8px 12px", background: SS.bgHeader, color: SS.headerText, fontWeight: 800, fontSize: 14, borderBottom: `2px solid ${SS.accentBlue}` }}>
                Resumo Comercial
              </div>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <tbody>
                  <CommercialRow label="Custo total do projeto"            value={custoTotalProjeto} kind="formula" decimals={2} unit="R$"
                    formula="Σ totalRs por equipamento"
                    formulaExec={`= ${fmtBRL(custoTotalProjeto)}`} />
                  <CommercialRow label="Preço unitário médio"               value={precoUnitarioMedio} kind="formula" decimals={4} unit={`R$/${itemsCalc[0]?.unit || "un"}`}
                    formula="custo unitário médio × markup"
                    formulaExec={`${fmt(grandTotal.total, 4)} × ${fmt(markup, 2)} = ${fmt(precoUnitarioMedio, 4)}`} />
                  <CommercialRow label="Preço final apresentado"            value={precoFinalProjeto} kind="formula" decimals={2} unit="R$"
                    formula="custo total × markup efetivo"
                    formulaExec={`${fmtBRL(custoTotalProjeto)} × ${fmt(markup, 2)} = ${fmtBRL(precoFinalProjeto)}`} />
                  <CommercialRow label="Lucro estimado"                     value={lucroEstimado} kind="formula" decimals={2} unit="R$"
                    formula="preço final − custo total"
                    formulaExec={`${fmtBRL(precoFinalProjeto)} − ${fmtBRL(custoTotalProjeto)} = ${fmtBRL(lucroEstimado)}`} />
                  <CommercialRow label={`Imposto sobre lucro (${fmt(percentImposto, 2)}%)`} value={imposto} kind="formula" decimals={2} unit="R$"
                    formula="lucro × % imposto"
                    formulaExec={`${fmtBRL(lucroEstimado)} × ${fmt(percentImposto / 100, 4)} = ${fmtBRL(imposto)}`} />
                  <CommercialRow label="Lucro líquido" value={lucroLiquido} kind="formula" decimals={2} unit="R$" bold
                    formula="lucro estimado − imposto"
                    formulaExec={`${fmtBRL(lucroEstimado)} − ${fmtBRL(imposto)} = ${fmtBRL(lucroLiquido)}`} />
                  <CommercialRow label="Margem líquida" value={margemPct} kind="formula" decimals={2} unit="%" bold
                    formula="(lucro líquido ÷ preço final) × 100"
                    formulaExec={`(${fmtBRL(lucroLiquido)} ÷ ${fmtBRL(precoFinalProjeto)}) × 100 = ${fmt(margemPct, 2)}%`} />
                </tbody>
              </table>
            </div>
          </div>

          <p style={{ marginTop: 14, fontSize: 11, color: SS.mutedText, fontStyle: "italic" }}>
            Cada célula da tabela mostra a fórmula no hover (passe o mouse sobre o número).
            Markup e imposto editáveis aqui são locais — alteram apenas a previsão deste painel.
          </p>
        </>
      )}
    </div>
  );
}

// ── Linha do resumo comercial ────────────────────────────────────
function CommercialRow({ label, value, kind, decimals, unit, bold, formula, formulaExec }) {
  return (
    <tr>
      <td style={{
        padding: "6px 12px", height: 30,
        background: bold ? SS.bgHeader : SS.bg,
        color: SS.formulaText, fontFamily: SS.fontUI, fontSize: 13, fontWeight: bold ? 800 : 500,
        borderBottom: `1px solid ${SS.gridLine}`, width: "60%",
      }}>{label}</td>
      <td style={{ padding: 0, border: 0, background: bold ? SS.bgHeader : SS.bg }}>
        <ValueCell value={value} kind={kind} decimals={decimals} unit={unit} bold={bold}
                   align="right" formula={formula} formulaExec={formulaExec} />
      </td>
    </tr>
  );
}

// ── Slider editável (markup, imposto) ────────────────────────────
function ScenarioField({ label, value, onChange, min, max, step, suffix, decimals = 2, hint }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6 }}>
        <label style={{ fontSize: 12, fontWeight: 700, color: SS.formulaText }}>{label}</label>
        <span style={{
          padding: "2px 8px",
          fontFamily: SS.fontMono, fontSize: 13, fontWeight: 800,
          background: "#FFFFCC", color: SS.formulaText,
          border: `1px solid ${SS.border}`,
        }}>
          {fmt(value, decimals)} {suffix}
        </span>
      </div>
      <input
        type="range"
        min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        style={{ width: "100%", accentColor: SS.accentBlue }}
      />
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: SS.mutedText, marginTop: 2 }}>
        <span>{fmt(min, decimals)} {suffix}</span>
        <span>{hint}</span>
        <span>{fmt(max, decimals)} {suffix}</span>
      </div>
    </div>
  );
}

// ── Estilos cabeçalho da tabela principal ────────────────────────
const thMain = (align, width) => ({
  height: 32,
  width,
  minWidth: width,
  padding: "4px 10px",
  background: SS.bgHeader,
  color: SS.headerText,
  fontFamily: SS.fontUI, fontSize: SS.fontSizeHdr, fontWeight: 800,
  textAlign: align,
  textTransform: "uppercase", letterSpacing: 0.5,
  borderBottom: `2px solid ${SS.accentBlue}`,
  border: `1px solid ${SS.border}`,
  position: "sticky", top: 0, zIndex: 1,
});

const thSub = (align) => ({
  padding: "2px 10px",
  background: SS.bgAlt,
  color: SS.mutedText,
  fontFamily: SS.fontMono, fontSize: 10, fontWeight: 600,
  textAlign: align,
  borderBottom: `1px solid ${SS.border}`,
  borderLeft: `1px solid ${SS.border}`,
  borderRight: `1px solid ${SS.border}`,
});
