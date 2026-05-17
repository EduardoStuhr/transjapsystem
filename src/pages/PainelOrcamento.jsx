import React, { useMemo, useState, useEffect } from "react";
import { useStore } from "../store";
import { calcQuotationTotals } from "../services/costEngine";
import { ASSUMPTIONS } from "../config/assumptions.config";
import { fmt, fmtBRL, fmtBRLPreciso } from "../utils/format";
import { buildPrazoParams } from "../utils/quotationPrazo";
import { SS } from "../styles/spreadsheetTheme";

// ──────────────────────────────────────────────────────────────────
// Tela 5 — PAINEL ORÇAMENTO (Viabilidade Financeira)
// Espelha o quadro "COMPOSIÇÃO DE PREÇO" (linhas 24-39) da planilha
// RONMA: decomposição de custo por parcela, cenários base x alternativo,
// comparativo e piso de negociação.
// ──────────────────────────────────────────────────────────────────

const MARGEM_MINIMA_PADRAO = 0.25; // 25%

export default function PainelOrcamento() {
  const { quotations, equipment, params, saveQuotation } = useStore();
  const [selectedId, setSelectedId] = useState(quotations?.[0]?.id || "");

  const quotation = useMemo(
    () => quotations.find((q) => q.id === selectedId) || null,
    [quotations, selectedId]
  );

  const equipmentMap = useMemo(
    () => Object.fromEntries((equipment || []).map((e) => [e.id, e])),
    [equipment]
  );

  const paramsDoOrcamento = useMemo(
    () => buildPrazoParams(params, quotation || {}),
    [params, quotation]
  );

  const totals = useMemo(() => {
    if (!quotation) return null;
    return calcQuotationTotals(quotation.items || [], equipmentMap, paramsDoOrcamento, {
      bdi: quotation.bdi ?? paramsDoOrcamento?.defaultBDI ?? ASSUMPTIONS.comercial.bdiPadrao,
      adminPct: quotation.adminPct ?? 0,
      mobilPct: quotation.mobilPct ?? 0,
      riskPct: quotation.riskPct ?? 0,
      indirectPersonnel: quotation.indirectPersonnel || [],
      volumeEmpoladoObra: quotation.volumeEmpoladoObra || 0,
    });
  }, [quotation, equipmentMap, paramsDoOrcamento]);

  const aliquotaDefault =
    typeof params?.aliquota_imposto_lucro === "number"
      ? params.aliquota_imposto_lucro
      : ASSUMPTIONS.comercial.percentualImposto;

  // Estado dos cenários (editáveis, com persistência no quotation)
  const cenarioSalvo = quotation?.cenarioAlt || {};
  const [precoUnitAlternativo, setPrecoUnitAlternativo] = useState("");
  const [adicionalCusto, setAdicionalCusto] = useState(cenarioSalvo.adicionalCusto || 0);
  const [aliquotaImposto, setAliquotaImposto] = useState(
    typeof cenarioSalvo.aliquotaImposto === "number" ? cenarioSalvo.aliquotaImposto : aliquotaDefault
  );
  const [margemMinima, setMargemMinima] = useState(
    typeof quotation?.margemMinima === "number" ? quotation.margemMinima : MARGEM_MINIMA_PADRAO
  );

  useEffect(() => {
    const c = quotation?.cenarioAlt || {};
    setPrecoUnitAlternativo(
      typeof c.precoUnitAlternativo === "number" && c.precoUnitAlternativo > 0
        ? String(c.precoUnitAlternativo)
        : ""
    );
    setAdicionalCusto(c.adicionalCusto || 0);
    setAliquotaImposto(typeof c.aliquotaImposto === "number" ? c.aliquotaImposto : aliquotaDefault);
    setMargemMinima(
      typeof quotation?.margemMinima === "number" ? quotation.margemMinima : MARGEM_MINIMA_PADRAO
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quotation?.id, aliquotaDefault]);

  // Cálculos base
  const custoTotal = totals?.subtotal || 0;
  const precoBase = totals?.subtotalPrice || 0;
  const volumeTotal = (quotation?.items || []).reduce(
    (s, it) => s + (it.volumeInSitu || it.quantity || 0),
    0
  );
  const precoUnitBase = volumeTotal > 0 ? precoBase / volumeTotal : 0;
  const custoUnitTotal = volumeTotal > 0 ? custoTotal / volumeTotal : 0;
  const markupEfetivo = custoTotal > 0 ? precoBase / custoTotal : 0;

  // Decomposição do custo por parcela
  const decompCusto = useMemo(() => {
    let dieselR = 0, manutR = 0, moR = 0, indirR = 0, transpR = 0;
    (totals?.itemsCalc || []).forEach((it) => {
      const eqs = it.detalhes?.auditoria?.equipamentos || [];
      eqs.forEach((eq) => {
        dieselR += eq.total_diesel || 0;
        manutR += eq.total_manutencao || 0;
        moR += eq.total_mo || 0;
        indirR += eq.total_indireto || 0;
      });
      const ta = it.detalhes?.transporteAgregado;
      if (ta?.enabled) transpR += ta.custoTotalFrete || 0;
    });
    return {
      diesel:     { totalR: dieselR, unitR: volumeTotal > 0 ? dieselR / volumeTotal : 0 },
      manut:      { totalR: manutR,  unitR: volumeTotal > 0 ? manutR  / volumeTotal : 0 },
      mo:         { totalR: moR,     unitR: volumeTotal > 0 ? moR     / volumeTotal : 0 },
      indireto:   { totalR: indirR,  unitR: volumeTotal > 0 ? indirR  / volumeTotal : 0 },
      transporte: { totalR: transpR, unitR: volumeTotal > 0 ? transpR / volumeTotal : 0 },
      total:      { totalR: custoTotal, unitR: custoUnitTotal },
    };
  }, [totals, volumeTotal, custoTotal, custoUnitTotal]);

  // Cenário base
  const lucroEstBase = precoBase - custoTotal;
  const impostoBase = lucroEstBase * aliquotaImposto;
  const lucroLiqBase = lucroEstBase - impostoBase;
  const margemLiqBase = precoBase > 0 ? lucroLiqBase / precoBase : 0;

  const cenarioBase = {
    precoUnit:  precoUnitBase,
    orcamento:  precoBase,
    custo:      custoTotal,
    lucroEst:   lucroEstBase,
    imposto:    impostoBase,
    lucroLiq:   lucroLiqBase,
    margemLiq:  margemLiqBase,
  };

  // Cenário alternativo
  const precoAltNum = parseFloat(precoUnitAlternativo);
  const precoUnitAlt = Number.isFinite(precoAltNum) && precoAltNum > 0 ? precoAltNum : precoUnitBase;
  const orcAlt = precoUnitAlt * volumeTotal;
  const adicionalNum = parseFloat(adicionalCusto) || 0;
  const custoAlt = custoTotal + adicionalNum;
  const lucroEstAlt = orcAlt - custoAlt;
  const impostoAlt = lucroEstAlt * aliquotaImposto;
  const lucroLiqAlt = lucroEstAlt - impostoAlt;
  const margemLiqAlt = orcAlt > 0 ? lucroLiqAlt / orcAlt : 0;

  const cenarioAlt = {
    precoUnit:  precoUnitAlt,
    orcamento:  orcAlt,
    custo:      custoAlt,
    lucroEst:   lucroEstAlt,
    imposto:    impostoAlt,
    lucroLiq:   lucroLiqAlt,
    margemLiq:  margemLiqAlt,
  };

  // Comparativo
  const deltaOrc = cenarioAlt.orcamento - cenarioBase.orcamento;
  const deltaLucroLiq = cenarioAlt.lucroLiq - cenarioBase.lucroLiq;
  const deltaPct = cenarioBase.lucroLiq !== 0 ? deltaLucroLiq / Math.abs(cenarioBase.lucroLiq) : 0;
  const deltaOrcPct = cenarioBase.orcamento !== 0 ? deltaOrc / cenarioBase.orcamento : 0;

  // Piso de negociação: preço unit que ainda mantém margemMinima
  const piso = useMemo(() => {
    if (volumeTotal <= 0 || aliquotaImposto >= 1) {
      return { precoUnit: Infinity, orcamento: Infinity, viavel: false };
    }
    const fator = 1 - margemMinima / (1 - aliquotaImposto);
    if (fator <= 0) {
      return { precoUnit: Infinity, orcamento: Infinity, viavel: false };
    }
    const precoMin = custoTotal / (volumeTotal * fator);
    return { precoUnit: precoMin, orcamento: precoMin * volumeTotal, viavel: true };
  }, [custoTotal, volumeTotal, margemMinima, aliquotaImposto]);

  if (!quotations || quotations.length === 0) {
    return (
      <div style={{ padding: 16, fontFamily: SS.fontUI, color: SS.formulaText }}>
        <h1 style={{ color: SS.headerText, fontSize: 20 }}>Painel Orçamento</h1>
        <p style={{ color: SS.mutedText }}>
          Nenhum orçamento cadastrado. Cadastre em "Orçamentos" para ver a análise de viabilidade aqui.
        </p>
      </div>
    );
  }

  // Persistir cenário
  const persistir = () => {
    if (!quotation) return;
    const atualizado = {
      ...quotation,
      cenarioAlt: {
        precoUnitAlternativo: precoUnitAlt,
        adicionalCusto: adicionalNum,
        aliquotaImposto,
      },
      margemMinima,
    };
    saveQuotation(atualizado);
  };

  return (
    <div style={{ padding: 16, background: SS.bgAlt, minHeight: "100%", fontFamily: SS.fontUI }}>
      <div style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        gap: 16,
        flexWrap: "wrap",
        marginBottom: 16,
      }}>
        <h1 style={{ margin: 0, color: SS.headerText, fontSize: 20, fontWeight: 800 }}>
          Painel Orçamento — {quotation?.cliente || quotation?.numero || "(sem cliente)"}
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
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          {/* 1. DECOMPOSIÇÃO DO CUSTO POR PARCELA */}
          <Card title="1. Decomposição do Custo por Parcela" full>
            <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: SS.fontMono, fontSize: 12 }}>
              <thead>
                <tr>
                  <th style={th("left")}>Parcela</th>
                  <th style={th("right")}>R$/m³ in situ</th>
                  <th style={th("right")}>× Volume</th>
                  <th style={th("right")}>= Total R$</th>
                </tr>
              </thead>
              <tbody>
                <LinhaDecomp label="Diesel"              p={decompCusto.diesel}     vol={volumeTotal} />
                <LinhaDecomp label="Manutenção"          p={decompCusto.manut}      vol={volumeTotal} />
                <LinhaDecomp label="Mão de obra"         p={decompCusto.mo}         vol={volumeTotal} />
                <LinhaDecomp label="Indireto"            p={decompCusto.indireto}   vol={volumeTotal} />
                <LinhaDecomp label="Transporte agregado" p={decompCusto.transporte} vol={volumeTotal} />
                <LinhaDecomp label="Σ Custo Total"       p={decompCusto.total}      vol={volumeTotal} bold />
              </tbody>
            </table>
          </Card>

          {/* 2. CENÁRIO BASE */}
          <Card title="2. Cenário BASE (markup natural do orçamento)">
            <Linha label="Markup efetivo"   valor={`× ${fmt(markupEfetivo, 2)}`} />
            <Linha label="Preço unitário"   valor={`${fmtBRLPreciso(cenarioBase.precoUnit, 4)}/m³`} />
            <Linha label="Orçamento total"  valor={fmtBRL(cenarioBase.orcamento)} />
            <Linha label="Custo total"      valor={fmtBRL(cenarioBase.custo)} />
            <Linha label="Lucro estimado"   valor={fmtBRL(cenarioBase.lucroEst)} />
            <Linha label={`Imposto (${(aliquotaImposto * 100).toFixed(2)}%)`} valor={fmtBRL(cenarioBase.imposto)} />
            <Linha label="LUCRO LÍQUIDO"    valor={fmtBRL(cenarioBase.lucroLiq)} emphasize />
            <Linha label="Margem líquida"   valor={`${(cenarioBase.margemLiq * 100).toFixed(2)}%`} emphasize />
          </Card>

          {/* 3. CENÁRIO ALTERNATIVO */}
          <Card title="3. Cenário ALTERNATIVO (preço aumentado)">
            <InputLinha
              label="Preço unitário alternativo (R$/m³)"
              type="number"
              step="0.01"
              value={precoUnitAlternativo}
              onChange={(e) => setPrecoUnitAlternativo(e.target.value)}
              placeholder={fmt(precoUnitBase * 1.1, 2)}
            />
            <InputLinha
              label="Custos adicionais (mob, desmob, contingência)"
              type="number"
              step="100"
              value={adicionalCusto}
              onChange={(e) => setAdicionalCusto(parseFloat(e.target.value) || 0)}
            />
            <InputLinha
              label="Alíquota imposto sobre lucro (%)"
              type="number"
              step="0.01"
              value={(aliquotaImposto * 100).toFixed(2)}
              onChange={(e) => setAliquotaImposto((parseFloat(e.target.value) || 0) / 100)}
            />
            <Linha label="Orçamento total"  valor={fmtBRL(cenarioAlt.orcamento)} />
            <Linha label="Custo total"      valor={fmtBRL(cenarioAlt.custo)} />
            <Linha label="Lucro estimado"   valor={fmtBRL(cenarioAlt.lucroEst)} />
            <Linha label="Imposto"          valor={fmtBRL(cenarioAlt.imposto)} />
            <Linha label="LUCRO LÍQUIDO"    valor={fmtBRL(cenarioAlt.lucroLiq)} emphasize />
            <Linha label="Margem líquida"   valor={`${(cenarioAlt.margemLiq * 100).toFixed(2)}%`} emphasize />
          </Card>

          {/* 4. COMPARATIVO */}
          <Card title="4. Comparativo">
            <Linha
              label="Δ Orçamento"
              valor={`${deltaOrc >= 0 ? "+" : ""}${fmtBRL(deltaOrc)} (${(deltaOrcPct * 100).toFixed(1)}%)`}
            />
            <Linha
              label="Δ Lucro Líquido"
              valor={`${deltaLucroLiq >= 0 ? "+" : ""}${fmtBRL(deltaLucroLiq)} (${(deltaPct * 100).toFixed(1)}%)`}
              emphasize
            />
            <div style={{
              marginTop: 12,
              padding: 12,
              background: SS.warnBg,
              borderLeft: `4px solid ${SS.accentAmber}`,
              fontSize: 12,
              color: SS.formulaText,
              lineHeight: 1.45,
            }}>
              Cobrando {fmtBRLPreciso(cenarioAlt.precoUnit - cenarioBase.precoUnit, 4)}/m³ a mais,
              você sobe {fmtBRL(deltaLucroLiq)} de lucro líquido.
              {deltaLucroLiq > 0 && (
                <> Margem para negociação: até {fmtBRLPreciso(cenarioAlt.precoUnit - cenarioBase.precoUnit, 4)}/m³ de desconto sem sair do cenário base.</>
              )}
            </div>
          </Card>

          {/* 5. PISO DE NEGOCIAÇÃO */}
          <Card title="5. Piso de Negociação" full>
            <InputLinha
              label="Margem líquida mínima aceitável (%)"
              type="number"
              step="0.5"
              value={(margemMinima * 100).toFixed(2)}
              onChange={(e) => setMargemMinima((parseFloat(e.target.value) || 0) / 100)}
            />
            {piso.viavel ? (
              <>
                <Linha
                  label={`Preço unitário mínimo para ${(margemMinima * 100).toFixed(1)}% margem`}
                  valor={`${fmtBRLPreciso(piso.precoUnit, 4)}/m³`}
                  emphasize
                />
                <Linha
                  label="Orçamento mínimo total"
                  valor={fmtBRL(piso.orcamento)}
                  emphasize
                />
              </>
            ) : (
              <div style={{
                padding: 10,
                background: SS.errBg,
                color: SS.errText,
                fontSize: 12,
                border: `1px solid ${SS.accentRed}`,
              }}>
                Configuração inviável: a margem mínima ({(margemMinima * 100).toFixed(1)}%) excede o teto possível dada a alíquota ({(aliquotaImposto * 100).toFixed(2)}%).
              </div>
            )}
            <div style={{ fontSize: 11, color: SS.mutedText, marginTop: 8, fontStyle: "italic" }}>
              Esse é o piso. Cobrando menos que isso, a margem líquida cai abaixo do mínimo configurado. Use como referência em negociação.
            </div>
          </Card>

          <div style={{ gridColumn: "1 / -1", display: "flex", justifyContent: "flex-end" }}>
            <button
              onClick={persistir}
              style={{
                padding: "8px 16px",
                background: SS.accentBlue,
                color: "#fff",
                border: "none",
                fontFamily: SS.fontUI,
                fontWeight: 700,
                fontSize: 12,
                cursor: "pointer",
              }}
            >
              Salvar cenário neste orçamento
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Card({ title, full, children }) {
  return (
    <div style={{
      background: SS.bg,
      border: `1px solid ${SS.border}`,
      padding: 0,
      overflow: "hidden",
      gridColumn: full ? "1 / -1" : "auto",
    }}>
      <div style={{
        padding: "8px 12px",
        background: SS.bgHeader,
        color: SS.headerText,
        fontWeight: 800,
        fontSize: 13,
        textTransform: "uppercase",
        letterSpacing: 0.5,
        borderBottom: `2px solid ${SS.accentBlue}`,
      }}>
        {title}
      </div>
      <div style={{ padding: 12 }}>{children}</div>
    </div>
  );
}

function Linha({ label, valor, emphasize }) {
  return (
    <div style={{
      display: "flex",
      justifyContent: "space-between",
      padding: "6px 4px",
      borderBottom: `1px solid ${SS.gridLine}`,
      fontWeight: emphasize ? 800 : 500,
      color: emphasize ? SS.accentGreen : SS.formulaText,
      fontSize: 12,
      fontFamily: SS.fontUI,
    }}>
      <span>{label}</span>
      <span style={{ fontFamily: SS.fontMono }}>{valor}</span>
    </div>
  );
}

function InputLinha({ label, value, onChange, type = "text", step, placeholder }) {
  return (
    <div style={{
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      padding: "6px 4px",
      borderBottom: `1px solid ${SS.gridLine}`,
      gap: 12,
    }}>
      <label style={{ fontSize: 12, fontWeight: 600, color: SS.formulaText }}>{label}</label>
      <input
        type={type}
        step={step}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        style={{
          width: 140,
          padding: "4px 8px",
          fontFamily: SS.fontMono,
          fontSize: 12,
          color: SS.inputText,
          background: SS.bgKeyInput,
          border: `1px solid ${SS.border}`,
          textAlign: "right",
        }}
      />
    </div>
  );
}

function LinhaDecomp({ label, p, vol, bold }) {
  const style = {
    padding: "4px 10px",
    fontFamily: SS.fontMono,
    fontSize: 12,
    fontWeight: bold ? 800 : 500,
    color: SS.formulaText,
    background: bold ? SS.bgHeader : SS.bg,
    borderTop: bold ? `2px solid ${SS.accentBlue}` : `1px solid ${SS.gridLine}`,
    textAlign: "right",
  };
  return (
    <tr>
      <td style={{ ...style, textAlign: "left" }}>{label}</td>
      <td style={style}>{fmtBRLPreciso(p.unitR, 4)}</td>
      <td style={style}>{fmt(vol, 2)} m³</td>
      <td style={style}>{fmtBRL(p.totalR)}</td>
    </tr>
  );
}

const th = (align) => ({
  padding: "6px 10px",
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
});
