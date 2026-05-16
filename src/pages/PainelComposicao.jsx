import React, { useMemo, useState } from "react";
import { useStore } from "../store";
import ValueCell from "../components/spreadsheet/ValueCell";
import { SS } from "../styles/spreadsheetTheme";
import { calcQuotationTotals, getMarkupPorCategoria } from "../services/costEngine";
import { ASSUMPTIONS } from "../config/assumptions.config";
import { calcVolumeComEmpolamento } from "../utils/empolamento";
import { getVolumeBasePorEquipamentoOuCategoria } from "../utils/volumeBase";
import { fmt, fmtBRL, fmtBRLPreciso, parseBRNumber } from "../utils/format";

// ──────────────────────────────────────────────────────────────────
// Tela 4 — PAINEL DE COMPOSIÇÃO DE PREÇO
// Espelha visualmente a aba "COMPOSIÇÃO DE PREÇO" da planilha RONMA.
// ──────────────────────────────────────────────────────────────────

const ROW_HEIGHT = 26;

const GroupHeader = ({ label, sub }) => (
  <tr>
    <td colSpan={12} style={{
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
    <td style={tdNum(true)}>{fmt(totals.manut || 0, 4)}</td>
    <td style={tdNum(true)}>{fmt(totals.mo || 0, 4)}</td>
    <td style={tdNum(true)}>{fmt(totals.indir || 0, 4)}</td>
    <td style={tdNum(true)}>{fmt(totals.custo || 0, 4)} R$/{unit}</td>
    <td style={tdNum(true)}>{fmt(totals.markup || 0, 2)}x</td>
    <td style={tdNum(true)}>{fmt(totals.preco || 0, 4)} R$/{unit}</td>
    <td style={tdNum(true)}>—</td>
    <td style={tdNum(true)}>—</td>
    <td style={tdNum(true)}>{fmtBRL(totals.totalCusto || 0)}</td>
    <td style={tdNum(true)}>{fmtBRL(totals.totalVenda || 0)}</td>
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
  if (typeof value === "number") return Number.isFinite(value) ? value : fallback;
  if (typeof value === "string") return parseBRNumber(value, fallback);
  if (value == null) return fallback;
  const n = parseFloat(value);
  return Number.isFinite(n) ? n : fallback;
};

const matchesCategoryName = (eq = {}, ...needles) => {
  const texto = `${eq.category || eq.categoria || ""} ${eq.name || eq.nome || eq.equipamento || ""}`.toLowerCase();
  return needles.some((n) => texto.includes(n));
};

const isEscavadeira = (eq = {}) => matchesCategoryName(eq, "escavadeira");
const isPatrol = (eq = {}) => matchesCategoryName(eq, "patrol", "motoniveladora", "moto niveladora", "moto-niveladora", "niveladora", "grader");
const isTratorOuGrade = (eq = {}) => matchesCategoryName(eq, "trator", "grade");
const isRolo = (eq = {}) => matchesCategoryName(eq, "rolo", "compactador");
const isPipa = (eq = {}) => matchesCategoryName(eq, "pipa");

const usaCicloViagensCategoria = (eq) =>
  isEscavadeira(eq) || isPatrol(eq) || isTratorOuGrade(eq) || isRolo(eq) || isPipa(eq);

const usaDenominadorEmpolado = (eq) =>
  isEscavadeira(eq) || isTratorOuGrade(eq) || isRolo(eq) || isPipa(eq);

const labelVolumeBase = (tipo) => {
  if (tipo === "aterro_in_situ") return "m³ aterro in situ";
  if (tipo === "aterro_empolado") return "m³ aterro empolado";
  if (tipo === "empolado") return "m³ empolado";
  if (tipo === "transporte") return "m³ transporte";
  if (tipo === "transporte_agregado") return "m³ transporte agregado";
  if (tipo === "in_situ_fallback") return "m³ in situ fallback";
  return "m³ in situ";
};

// ── Decompõe um item em linhas por equipamento (R$/m³ por componente) ──
const buildItemRows = (item, params, { overrideMarkupEnabled = false, overrideMarkup = 1 } = {}) => {
  const aud = item?.detalhes?.auditoria;
  const prod = item?.produtividade_utilizada || 0;
  const unit = item?.unit || "un";
  const qty = item?.quantity || 0;

  const volumeInSitu = toNumber(item?.volumeInSitu, toNumber(item?.quantity, 0));
  const fatorEmpolamento = toNumber(
    item?.fatorEmpolamento,
    toNumber(item?.detalhes?.volumes?.fatorEmpolamento, 1 + ASSUMPTIONS.empolamento.fatorPadrao)
  );
  const volumeEmpolado = calcVolumeComEmpolamento(volumeInSitu, fatorEmpolamento);
  const volumes = { volumeInSitu, volumeEmpolado };

  const volumeInSituPorViagem = toNumber(item?.volumeInSituPorViagem, ASSUMPTIONS.transporte.volumePorViagemInSitu);
  const volumeEmpoladoPorViagem = calcVolumeComEmpolamento(volumeInSituPorViagem, fatorEmpolamento);
  const horasDia = toNumber(item?.horasDia, ASSUMPTIONS.jornada.horasPorDia);
  const volumeBaseVenda = volumeInSitu || qty;

  const eqs = aud?.equipamentos || [];

  const producaoConjuntoBase =
    toNumber(item?.detalhes?.produtividade?.producaoConjuntoBase, 0)
    || eqs.reduce((s, e) => s + toNumber(e.baseProductivity, 0) * toNumber(e.quantidade, toNumber(e.qty, 1)), 0);

  const horasMaquinaRateio =
    toNumber(item?.detalhes?.produtividade?.horasMaquinaRateio, 0)
    || (volumeInSitu > 0 && producaoConjuntoBase > 0 ? volumeInSitu / producaoConjuntoBase : 0);

  let rows = eqs.map((e) => {
    const empoladoBase = usaDenominadorEmpolado(e);
    const usaCiclo = usaCicloViagensCategoria(e);
    const denominador = empoladoBase ? volumeEmpolado : volumeInSitu;
    const baseRateio = empoladoBase ? "m³ empolado" : "m³ in situ";

    const nome = e.nome || e.equipamento || e.name || "Equipamento";
    const categoria = e.categoria || e.category || "_default";
    const qtdEq = toNumber(e.quantidade, toNumber(e.qty, 1));

    const viagensHora = toNumber(e.viagensPorHora, 0);
    const m3EmpoladoHoraMaquina = viagensHora * volumeEmpoladoPorViagem;
    const m3EmpoladoHoraFrota = m3EmpoladoHoraMaquina * qtdEq;
    const m3EmpoladoDia = m3EmpoladoHoraFrota * horasDia;
    const viagensDia = viagensHora * horasDia * qtdEq;
    const usaCicloEfetivo = usaCiclo && viagensHora > 0 && volumeEmpoladoPorViagem > 0 && qtdEq > 0;
    const horasComProducao = horasMaquinaRateio;

    const directUnit = (field) => {
      if (e[field] == null) return null;
      const n = toNumber(e[field], NaN);
      return Number.isFinite(n) ? n : null;
    };

    const componentUn = (rowName, directField) => {
      const direct = directUnit(directField);
      if (direct != null) return direct;

      const row = e[rowName];
      return denominador > 0 && row?.valorTotal != null
        ? (toNumber(row.valorTotal) * horasMaquinaRateio) / denominador
        : 0;
    };

    const dieselUn = componentUn("diesel", "diesel_R$_m3");
    const manutUn = componentUn("manutencao", "manutencao_R$_m3");
    const moUn = componentUn("operador", "mo_R$_m3");
    const indirUn = componentUn("indiretos", "indireto_R$_m3");
    const custoUn = toNumber(
      e.custo_R$_m3_preciso,
      toNumber(e.custo_R$_m3, dieselUn + manutUn + moUn + indirUn),
    );

    const markupCategoria = toNumber(
      e.markup_preciso,
      toNumber(e.markup, getMarkupPorCategoria(params, categoria)),
    );
    const markupUsado = overrideMarkupEnabled ? overrideMarkup : markupCategoria;
    const precoUn = overrideMarkupEnabled
      ? custoUn * markupUsado
      : toNumber(
          e.preco_R$_m3_preciso,
          toNumber(e.preco_R$_m3, custoUn * markupUsado),
        );

    const volumeBaseInfo = getVolumeBasePorEquipamentoOuCategoria({
      eq: e,
      item,
      params,
      volumes,
    });

    const volumeBase = toNumber(
      e.volume_base_total_preciso,
      toNumber(e.volume_base_total, volumeBaseInfo.valor || volumeBaseVenda),
    );
    const tipoVolume = e.volume_base_tipo || volumeBaseInfo.tipo || "in_situ";
    const origemVolume = e.volume_base_origem || volumeBaseInfo.origem || "fallback";
    const alertaVolume = e.volume_base_alerta || volumeBaseInfo.alerta || null;

    const totalCusto = toNumber(e.total_custo_maquina_obra_R$, custoUn * volumeBase);
    const totalVenda = overrideMarkupEnabled
      ? precoUn * volumeBase
      : toNumber(
          e.total_maquina_obra_preciso_R$,
          toNumber(e.total_maquina_obra_R$, precoUn * volumeBase),
        );

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
      categoria,
      qtd: qtdEq,
      diesel: dieselUn,
      manut: manutUn,
      mo: moUn,
      indir: indirUn,
      custo: custoUn,
      markup: markupUsado,
      markupOrigem: overrideMarkupEnabled ? "override do slider" : "params.markup_por_categoria",
      preco: precoUn,

      volumeBase,
      tipoVolume,
      origemVolume,
      alertaVolume,

      totalCusto,
      totalVenda,
      unit,

      formula: {
        diesel: { f: "diesel total do projeto ÷ quantidade de rateio", x: fexec(e.diesel, dieselUn) },
        manut: { f: "manutenção total do projeto ÷ quantidade de rateio", x: fexec(e.manutencao, manutUn) },
        mo: { f: "mão de obra total do projeto ÷ quantidade de rateio", x: fexec(e.operador, moUn) },
        indir: { f: "indiretos total do projeto ÷ quantidade de rateio", x: fexec(e.indiretos, indirUn) },
        custo: { f: "diesel + manutenção + mão de obra + indiretos", x: `${fmt(dieselUn, 4)} + ${fmt(manutUn, 4)} + ${fmt(moUn, 4)} + ${fmt(indirUn, 4)} = ${fmt(custoUn, 4)}` },
        markup: { f: overrideMarkupEnabled ? "override opcional do painel" : "markup por categoria", x: `${categoria}: ${fmt(markupUsado, 2)}x` },
        preco: { f: "custo unitário × markup", x: `${fmt(custoUn, 8)} × ${fmt(markupUsado, 2)} = ${fmt(precoUn, 8)}` },
        totalCusto: { f: "custo unitário × volume base do equipamento", x: `${fmtBRLPreciso(custoUn, 8)} × ${fmt(volumeBase, 2)} ${labelVolumeBase(tipoVolume)} = ${fmtBRL(totalCusto)}` },
        totalVenda: { f: "preço venda unitário × volume base do equipamento", x: `${fmtBRLPreciso(precoUn, 8)} × ${fmt(volumeBase, 2)} ${labelVolumeBase(tipoVolume)} = ${fmtBRL(totalVenda)}` },
      },
    };
  });

  const custoLinhas = rows.reduce((s, r) => s + r.custo, 0);
  const precoLinhas = rows.reduce((s, r) => s + r.preco, 0);
  const custoResto = toNumber(item?.custo_unitario, 0) - custoLinhas;
  const precoRestoBase = overrideMarkupEnabled
    ? custoResto * overrideMarkup
    : toNumber(item?.preco_unitario, 0) - precoLinhas;

  if (Math.abs(custoResto) > 0.0001 || Math.abs(precoRestoBase) > 0.0001) {
    const markupResto = custoResto > 0 ? precoRestoBase / custoResto : 0;
    const totalCusto = custoResto * volumeBaseVenda;
    const totalVenda = precoRestoBase * volumeBaseVenda;

    rows = [
      ...rows,
      {
        nome: rows.length === 0 ? "Item sem equipamento / verba" : "Custo manual / ajuste",
        categoria: item?.category || "_default",
        qtd: 1,
        diesel: 0,
        manut: 0,
        mo: 0,
        indir: 0,
        custo: custoResto,
        markup: markupResto,
        markupOrigem: overrideMarkupEnabled ? "override do slider" : "resultado do orçamento",
        preco: precoRestoBase,

        volumeBase: volumeBaseVenda,
        tipoVolume: "item",
        origemVolume: "volume do item",
        alertaVolume: null,

        totalCusto,
        totalVenda,
        unit,

        formula: {
          diesel: { f: "sem parcela diesel", x: "0" },
          manut: { f: "sem parcela manutenção", x: "0" },
          mo: { f: "sem parcela mão de obra", x: "0" },
          indir: { f: "sem parcela indireta", x: "0" },
          custo: { f: "diferença até custo_unitario do orçamento", x: `${fmtBRL(item?.custo_unitario || 0)} - ${fmtBRL(custoLinhas)} = ${fmtBRL(custoResto)}` },
          markup: { f: "preço / custo", x: `${fmtBRL(precoRestoBase)} / ${fmtBRL(custoResto)} = ${fmt(markupResto, 2)}x` },
          preco: { f: "diferença até preco_unitario do orçamento", x: `${fmtBRL(precoRestoBase)}` },
          totalCusto: { f: "custo unitário × volume", x: `${fmtBRLPreciso(custoResto, 6)} × ${fmt(volumeBaseVenda, 2)} = ${fmtBRL(totalCusto)}` },
          totalVenda: { f: "preço unitário × volume", x: `${fmtBRLPreciso(precoRestoBase, 6)} × ${fmt(volumeBaseVenda, 2)} = ${fmtBRL(totalVenda)}` },
        },
      },
    ];
  }

  const sub = rows.reduce((acc, r) => ({
    diesel: acc.diesel + r.diesel,
    manut: acc.manut + r.manut,
    mo: acc.mo + r.mo,
    indir: acc.indir + r.indir,
    custo: acc.custo + r.custo,
    preco: acc.preco + r.preco,
    totalCusto: acc.totalCusto + r.totalCusto,
    totalVenda: acc.totalVenda + r.totalVenda,
  }), { diesel: 0, manut: 0, mo: 0, indir: 0, custo: 0, preco: 0, totalCusto: 0, totalVenda: 0 });

  sub.markup = sub.custo > 0 ? sub.preco / sub.custo : 0;

  return { eqRows: rows, subtotal: sub, unit, prod, qty, volumeInSitu, volumeEmpolado, fatorEmpolamento };
};

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
      bdi: quotation.bdi ?? params?.defaultBDI ?? ASSUMPTIONS.comercial.bdiPadrao,
      adminPct: quotation.adminPct ?? 0,
      mobilPct: quotation.mobilPct ?? 0,
      riskPct: quotation.riskPct ?? 0,
      indirectPersonnel: quotation.indirectPersonnel || [],
      totalHorasProjeto: quotation.totalHorasProjeto || 0,
      volumeEmpoladoObra: quotation.volumeEmpoladoObra || 0,
    });
  }, [quotation, equipmentMap, params]);

  const [overrideMarkupEnabled, setOverrideMarkupEnabled] = useState(false);
  const [markup, setMarkup] = useState(params?.markup_por_categoria?._default || ASSUMPTIONS.markupPorCategoria._default);
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

  const grandTotal = itemsCalc.reduce((acc, item) => {
    const { subtotal } = buildItemRows(item, params, { overrideMarkupEnabled, overrideMarkup: markup });
    return {
      diesel: acc.diesel + subtotal.diesel,
      manut: acc.manut + subtotal.manut,
      mo: acc.mo + subtotal.mo,
      indir: acc.indir + subtotal.indir,
      custo: acc.custo + subtotal.custo,
      preco: acc.preco + subtotal.preco,
      totalCusto: acc.totalCusto + subtotal.totalCusto,
      totalVenda: acc.totalVenda + subtotal.totalVenda,
    };
  }, { diesel: 0, manut: 0, mo: 0, indir: 0, custo: 0, preco: 0, totalCusto: 0, totalVenda: 0 });

  grandTotal.markup = grandTotal.custo > 0 ? grandTotal.preco / grandTotal.custo : 0;

  const custoTotalProjeto = grandTotal.totalCusto;
  const precoUnitarioMedio = grandTotal.preco;
  const precoFinalProjeto = grandTotal.totalVenda;
  const lucroEstimado = precoFinalProjeto - custoTotalProjeto;
  const imposto = lucroEstimado * (percentImposto / 100);
  const lucroLiquido = lucroEstimado - imposto;
  const margemPct = precoFinalProjeto > 0 ? (lucroLiquido / precoFinalProjeto) * 100 : 0;

  return (
    <div style={{
      padding: 16,
      background: SS.bgAlt,
      minHeight: "100%",
      fontFamily: SS.fontUI,
    }}>
      <div style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        gap: 16,
        flexWrap: "wrap",
        marginBottom: 16,
      }}>
        <h1 style={{ margin: 0, color: SS.headerText, fontSize: 20, fontWeight: 800 }}>
          Composição de Preço — {quotation?.cliente || quotation?.numero || "(sem cliente)"}
        </h1>
        <select
          value={selectedId}
          onChange={(e) => setSelectedId(e.target.value)}
          style={{
            padding: "4px 8px",
            fontFamily: SS.fontMono,
            fontSize: 12,
            border: `1px solid ${SS.border}`,
            background: SS.bg,
            color: SS.formulaText,
            minWidth: 280,
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
          <div style={{
            border: `1px solid ${SS.border}`,
            background: SS.bg,
            overflowX: "auto",
          }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={thMain("left", 320)}>Serviço / Equipamento</th>
                  <th style={thMain("right", 110)}>Diesel R$/m³</th>
                  <th style={thMain("right", 120)}>Manut. R$/m³</th>
                  <th style={thMain("right", 120)}>M.O. R$/m³</th>
                  <th style={thMain("right", 120)}>Indiretos R$/m³</th>
                  <th style={thMain("right", 130)}>Custo Un.</th>
                  <th style={thMain("right", 90)}>Markup</th>
                  <th style={thMain("right", 140)}>Preço Venda</th>
                  <th style={thMain("right", 130)}>Volume Base</th>
                  <th style={thMain("right", 110)}>Tipo Volume</th>
                  <th style={thMain("right", 150)}>Total Custo</th>
                  <th style={thMain("right", 150)}>Total Venda</th>
                </tr>
                <tr>
                  <th style={thSub("left")}>(R$/un)</th>
                  <th style={thSub("right")} colSpan={7}>custo unitário → markup → preço de venda unitário</th>
                  <th style={thSub("right")} colSpan={2}>volume usado</th>
                  <th style={thSub("right")} colSpan={2}>R$ no projeto</th>
                </tr>
              </thead>
              <tbody>
                {itemsCalc.map((item) => {
                  const { eqRows, subtotal, unit, prod, qty, volumeInSitu, volumeEmpolado, fatorEmpolamento } =
                    buildItemRows(item, params, { overrideMarkupEnabled, overrideMarkup: markup });

                  return (
                    <React.Fragment key={item.id || item.desc}>
                      <GroupHeader
                        label={(item.desc || item.category || "Serviço").toUpperCase()}
                        sub={`${fmt(qty, 2)} ${unit} · in situ ${fmt(volumeInSitu, 2)} · empolado ${fmt(volumeEmpolado, 2)} (fator ${fmt(fatorEmpolamento, 2)}) · prod. real ${fmt(prod, 2)} ${unit}/h`}
                      />

                      {eqRows.length === 0 && (
                        <tr>
                          <td style={tdLabel()} colSpan={12}>
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
                          <NumCell value={r.manut} decimals={4} formula={r.formula.manut.f} formulaExec={r.formula.manut.x} origem={`${item.desc} · manutenção`} />
                          <NumCell value={r.mo} decimals={4} formula={r.formula.mo.f} formulaExec={r.formula.mo.x} origem={`${item.desc} · mão de obra`} />
                          <NumCell value={r.indir} decimals={4} formula={r.formula.indir.f} formulaExec={r.formula.indir.x} origem={`${item.desc} · indiretos`} />
                          <NumCell value={r.custo} decimals={4} formula={r.formula.custo.f} formulaExec={r.formula.custo.x} origem="custo unitário" />
                          <NumCell value={r.markup} decimals={2} formula={r.formula.markup.f} formulaExec={r.formula.markup.x} origem={r.markupOrigem} />
                          <NumCell value={r.preco} decimals={4} formula={r.formula.preco.f} formulaExec={r.formula.preco.x} origem="preço venda unitário" />
                          <NumCell value={r.volumeBase} decimals={2} formula="volume base do equipamento" formulaExec={`${fmt(r.volumeBase, 2)} (${r.tipoVolume}) · ${r.origemVolume}${r.alertaVolume ? ` · alerta: ${r.alertaVolume}` : ""}`} origem={r.origemVolume} />
                          <td style={tdNum()} title={r.alertaVolume || r.origemVolume}>{r.tipoVolume}</td>
                          <NumCell value={r.totalCusto} decimals={2} formula={r.formula.totalCusto.f} formulaExec={r.formula.totalCusto.x} origem="total custo no projeto" />
                          <NumCell value={r.totalVenda} decimals={2} formula={r.formula.totalVenda.f} formulaExec={r.formula.totalVenda.x} origem="total venda no projeto" />
                        </tr>
                      ))}

                      {eqRows.length > 0 && (
                        <SubtotalRow label={`Subtotal — ${item.desc || ""}`} totals={subtotal} unit={unit} />
                      )}
                    </React.Fragment>
                  );
                })}

                <tr>
                  <td style={{ ...tdLabel(true), background: "#FFF2CC", color: SS.accentAmber, borderTop: `2px solid ${SS.accentBlue}` }}>
                    Total do Projeto
                  </td>
                  <td style={{ ...tdNum(true), background: "#FFF2CC", borderTop: `2px solid ${SS.accentBlue}` }}>{fmt(grandTotal.diesel, 4)}</td>
                  <td style={{ ...tdNum(true), background: "#FFF2CC", borderTop: `2px solid ${SS.accentBlue}` }}>{fmt(grandTotal.manut, 4)}</td>
                  <td style={{ ...tdNum(true), background: "#FFF2CC", borderTop: `2px solid ${SS.accentBlue}` }}>{fmt(grandTotal.mo, 4)}</td>
                  <td style={{ ...tdNum(true), background: "#FFF2CC", borderTop: `2px solid ${SS.accentBlue}` }}>{fmt(grandTotal.indir, 4)}</td>
                  <td style={{ ...tdNum(true), background: "#FFF2CC", borderTop: `2px solid ${SS.accentBlue}` }}>{fmt(grandTotal.custo, 4)}</td>
                  <td style={{ ...tdNum(true), background: "#FFF2CC", borderTop: `2px solid ${SS.accentBlue}` }}>{fmt(grandTotal.markup, 2)}x</td>
                  <td style={{ ...tdNum(true), background: "#FFF2CC", borderTop: `2px solid ${SS.accentBlue}` }}>{fmt(grandTotal.preco, 4)}</td>
                  <td style={{ ...tdNum(true), background: "#FFF2CC", borderTop: `2px solid ${SS.accentBlue}` }}>—</td>
                  <td style={{ ...tdNum(true), background: "#FFF2CC", borderTop: `2px solid ${SS.accentBlue}` }}>—</td>
                  <td style={{ ...tdNum(true), background: "#FFF2CC", borderTop: `2px solid ${SS.accentBlue}` }}>{fmtBRL(grandTotal.totalCusto)}</td>
                  <td style={{ ...tdNum(true), background: "#FFF2CC", borderTop: `2px solid ${SS.accentBlue}` }}>{fmtBRL(grandTotal.totalVenda)}</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div style={{
            marginTop: 18,
            display: "grid",
            gridTemplateColumns: "minmax(360px, 480px) 1fr",
            gap: 18,
          }}>
            <div style={{ background: SS.bg, border: `1px solid ${SS.border}`, padding: 14 }}>
              <h2 style={{
                margin: "0 0 10px",
                color: SS.headerText,
                fontSize: 14,
                fontWeight: 800,
                textTransform: "uppercase",
                letterSpacing: 0.5,
                borderBottom: `2px solid ${SS.accentBlue}`,
                paddingBottom: 6
              }}>
                Cenário Comercial
              </h2>

              <label style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, color: SS.formulaText, fontSize: 12, fontWeight: 700 }}>
                <input
                  type="checkbox"
                  checked={overrideMarkupEnabled}
                  onChange={(e) => setOverrideMarkupEnabled(e.target.checked)}
                />
                Usar markup global do slider
              </label>

              <div style={{
                marginBottom: 10,
                padding: "6px 8px",
                background: overrideMarkupEnabled ? "#FFF2CC" : SS.bgAlt,
                border: `1px solid ${overrideMarkupEnabled ? SS.accentAmber : SS.gridLine}`,
                color: overrideMarkupEnabled ? SS.accentAmber : SS.mutedText,
                fontSize: 11,
                fontFamily: SS.fontUI,
                fontWeight: 700,
              }}>
                {overrideMarkupEnabled
                  ? `Override ligado: todas as linhas usam ${fmt(markup, 2)}x.`
                  : "Override desligado: cada equipamento usa params.markup_por_categoria."}
              </div>

              <ScenarioField
                label="Markup global (override)"
                value={markup}
                onChange={setMarkup}
                min={1.0}
                max={4.0}
                step={0.05}
                suffix="×"
                decimals={2}
                disabled={!overrideMarkupEnabled}
                hint={`default categoria: ${(params?.markup_por_categoria?._default || ASSUMPTIONS.markupPorCategoria._default).toFixed(2)}x`}
              />

              <ScenarioField
                label="% Imposto sobre lucro"
                value={percentImposto}
                onChange={setPercentImposto}
                min={0}
                max={50}
                step={0.25}
                suffix="%"
                decimals={2}
                hint={`assumption-chave (default: ${(ASSUMPTIONS.comercial.percentualImposto * 100).toFixed(2)}%)`}
              />
            </div>

            <div style={{ background: SS.bg, border: `1px solid ${SS.border}`, padding: 0, overflow: "hidden" }}>
              <div style={{ padding: "8px 12px", background: SS.bgHeader, color: SS.headerText, fontWeight: 800, fontSize: 14, borderBottom: `2px solid ${SS.accentBlue}` }}>
                Resumo Comercial
              </div>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <tbody>
                  <CommercialRow label="Custo total do projeto" value={custoTotalProjeto} kind="formula" decimals={2} unit="R$"
                    formula="soma dos totais de custo por equipamento"
                    formulaExec={`= ${fmtBRL(custoTotalProjeto)}`} />
                  <CommercialRow label="Preço unitário médio" value={precoUnitarioMedio} kind="formula" decimals={4} unit={`R$/${itemsCalc[0]?.unit || "un"}`}
                    formula="soma dos preços unitários por categoria"
                    formulaExec={`= ${fmt(precoUnitarioMedio, 4)}`} />
                  <CommercialRow label="Preço final apresentado" value={precoFinalProjeto} kind="formula" decimals={2} unit="R$"
                    formula={overrideMarkupEnabled ? "custo total × override do slider" : "soma(preço venda unitário × volume base)"}
                    formulaExec={`= ${fmtBRL(precoFinalProjeto)}`} />
                  <CommercialRow label="Lucro estimado" value={lucroEstimado} kind="formula" decimals={2} unit="R$"
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
            Cada célula da tabela mostra a fórmula no hover. O total por equipamento usa o volume-base correto: escavação, transporte ou aterro/compactação.
          </p>
        </>
      )}
    </div>
  );
}

function CommercialRow({ label, value, kind, decimals, unit, bold, formula, formulaExec }) {
  return (
    <tr>
      <td style={{
        padding: "6px 12px",
        height: 30,
        background: bold ? SS.bgHeader : SS.bg,
        color: SS.formulaText,
        fontFamily: SS.fontUI,
        fontSize: 13,
        fontWeight: bold ? 800 : 500,
        borderBottom: `1px solid ${SS.gridLine}`,
        width: "60%",
      }}>{label}</td>
      <td style={{ padding: 0, border: 0, background: bold ? SS.bgHeader : SS.bg }}>
        <ValueCell
          value={value}
          kind={kind}
          decimals={decimals}
          unit={unit}
          bold={bold}
          align="right"
          formula={formula}
          formulaExec={formulaExec}
        />
      </td>
    </tr>
  );
}

function ScenarioField({ label, value, onChange, min, max, step, suffix, decimals = 2, hint, disabled = false }) {
  return (
    <div style={{ marginBottom: 14, opacity: disabled ? 0.55 : 1 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6 }}>
        <label style={{ fontSize: 12, fontWeight: 700, color: SS.formulaText }}>{label}</label>
        <span style={{
          padding: "2px 8px",
          fontFamily: SS.fontMono,
          fontSize: 13,
          fontWeight: 800,
          background: "#FFFFCC",
          color: SS.formulaText,
          border: `1px solid ${SS.border}`,
        }}>
          {fmt(value, decimals)} {suffix}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        style={{ width: "100%", accentColor: SS.accentBlue, cursor: disabled ? "not-allowed" : "pointer" }}
      />
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: SS.mutedText, marginTop: 2 }}>
        <span>{fmt(min, decimals)} {suffix}</span>
        <span>{hint}</span>
        <span>{fmt(max, decimals)} {suffix}</span>
      </div>
    </div>
  );
}

const thMain = (align, width) => ({
  height: 32,
  width,
  minWidth: width,
  padding: "4px 10px",
  background: SS.bgHeader,
  color: SS.headerText,
  fontFamily: SS.fontUI,
  fontSize: SS.fontSizeHdr,
  fontWeight: 800,
  textAlign: align,
  textTransform: "uppercase",
  letterSpacing: 0.5,
  borderBottom: `2px solid ${SS.accentBlue}`,
  border: `1px solid ${SS.border}`,
  position: "sticky",
  top: 0,
  zIndex: 1,
});

const thSub = (align) => ({
  padding: "2px 10px",
  background: SS.bgAlt,
  color: SS.mutedText,
  fontFamily: SS.fontMono,
  fontSize: 10,
  fontWeight: 600,
  textAlign: align,
  borderBottom: `1px solid ${SS.border}`,
  borderLeft: `1px solid ${SS.border}`,
  borderRight: `1px solid ${SS.border}`,
});