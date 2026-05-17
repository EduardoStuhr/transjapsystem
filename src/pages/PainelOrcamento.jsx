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

const normalizeUnit = (unit = "") => {
  const u = String(unit || "").trim().toLowerCase();
  if (u === "m2" || u === "m²") return "m²";
  if (u === "m3" || u === "m³") return "m³";
  if (u.includes("viagem")) return "viagem";
  if (u === "h" || u.includes("hora")) return "hora";
  if (u === "vb" || u.includes("verba")) return "verba";
  if (u === "un" || u.includes("unidade")) return "unidade";
  return unit || "unidade";
};

const unidadePorTipoVolume = (tipo, itemUnit) => {
  const t = String(tipo || "").toLowerCase();
  if (t === "area") return "m²";
  if (t.includes("empolado")) return "m³ empolado";
  if (t.includes("in_situ") || t.includes("situ")) return "m³ in situ";
  if (t.includes("viagem")) return "viagem";
  if (t.includes("hora")) return "hora";
  return normalizeUnit(itemUnit);
};

const tipoVolumeLabel = (tipo) => {
  const t = String(tipo || "").toLowerCase();
  if (t === "area") return "área do item";
  if (t === "empolado") return "volume empolado";
  if (t === "in_situ") return "volume in situ";
  if (t === "aterro_in_situ") return "volume de aterro in situ";
  if (t === "aterro_empolado") return "volume de aterro empolado";
  if (t === "transporte_agregado") return "transporte agregado";
  return tipo || "base do item";
};

const getItemTotal = (item = {}) =>
  Number(item.total_item ?? item.totalPrice ?? item.totalCost ?? 0) || 0;

const firstNum = (...values) => {
  for (const value of values) {
    const n = Number(value);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return 0;
};

const getParcelaBase = (eq = {}, volumeKey, tipoKey, itemUnit) => {
  const volume = firstNum(
    eq[volumeKey],
    eq.volume_base_total_preciso,
    eq.volume_base_total,
    eq.volume_totalizacao,
  );
  const tipo = eq[tipoKey] || eq.volume_base_tipo || eq.volume_totalizacao_tipo || "quantidade do item";
  return {
    volume,
    unidade: unidadePorTipoVolume(tipo, itemUnit),
    tipo: tipoVolumeLabel(tipo),
  };
};

const getParcelaTotal = (eq = {}, totalKeys = [], unitKeys = [], volume = 0) => {
  const total = firstNum(...totalKeys.map((key) => eq[key]));
  if (total > 0) return total;
  const unit = firstNum(...unitKeys.map((key) => eq[key]));
  return unit * volume;
};

const buildBasesPorUnidade = (items = []) => {
  const groups = new Map();
  items.forEach((item, index) => {
    const unit = normalizeUnit(item.unit);
    const quantity = Number(item.quantity ?? item.volumeInSitu ?? 0) || 0;
    const total = getItemTotal(item);
    if (quantity <= 0 || total <= 0) return;
    const key = unit;
    const current = groups.get(key) || { unit, quantidade: 0, total: 0, itens: [] };
    current.quantidade += quantity;
    current.total += total;
    current.itens.push({
      item: item.desc || item.name || `Item ${index + 1}`,
      quantidade: quantity,
      formula: unit === "m²"
        ? "área informada do item"
        : unit === "m³"
          ? "volume/quantidade informada do item"
          : "quantidade informada do item",
    });
    groups.set(key, current);
  });
  return Array.from(groups.values());
};

const buildResumoItens = (items = []) =>
  items.map((item, index) => ({
    idx: index + 1,
    desc: item.desc || item.name || `Item ${index + 1}`,
    category: item.category || item.categoria || "—",
    unit: normalizeUnit(item.unit),
    quantity: Number(item.quantity ?? item.volumeInSitu ?? 0) || 0,
    custoUnit: Number(item.custo_unitario ?? item.unitCost ?? 0) || 0,
    precoUnit: Number(item.preco_unitario ?? item.unitPrice ?? 0) || 0,
    custoTotal: Number(item.totalCost ?? 0) || 0,
    total: getItemTotal(item),
    modelo: item.detalhes?.auditoria?.modelo || item.detalhes?.modelo || item.modoPreco || "—",
  }));

// eslint-disable-next-line no-unused-vars
const buildDecomposicaoPorBase = (itemsCalc = []) => {
  const groups = new Map();
  const add = ({ parcela, totalR, volume, unidade, tipo, origem, formula }) => {
    const total = Number(totalR) || 0;
    const base = Number(volume) || 0;
    if (total === 0 && base === 0) return;
    const key = `${parcela}|${unidade}|${tipo}`;
    const current = groups.get(key) || {
      parcela,
      unidade,
      tipo,
      totalR: 0,
      volume: 0,
      origens: [],
    };
    current.totalR += total;
    current.volume += base;
    if (origem) current.origens.push({ origem, quantidade: base, unidade, formula });
    groups.set(key, current);
  };

  itemsCalc.forEach((item, itemIndex) => {
    const itemNome = item.desc || item.name || `Item ${itemIndex + 1}`;
    const itemUnit = normalizeUnit(item.unit);
    const eqs = item.detalhes?.auditoria?.equipamentos || [];

    eqs.forEach((eq) => {
      if (eq.tipo === "transporte_agregado") {
        const t = eq.transporteAgregado || {};
        const unidade = unidadePorTipoVolume(t.volumeBaseTotalizacaoTipo || eq.volume_base_tipo, itemUnit);
        add({
          parcela: "Transporte agregado",
          totalR: t.custoTotalFrete ?? eq.total_custo_maquina_obra_R$,
          volume: t.volumeBaseTotalizacao ?? eq.volume_base_total_preciso ?? eq.volume_base_total,
          unidade,
          tipo: tipoVolumeLabel(t.volumeBaseTotalizacaoTipo || eq.volume_base_tipo),
          origem: `${itemNome} · ${eq.equipamento || "transporte agregado"}`,
          formula: t.modoFrete === "planilha_m3_empolado"
            ? "volume transportado empolado × preço/custo por m³ empolado"
            : "volume transportado correspondente ao item",
        });
        return;
      }

      add({
        parcela: "Diesel",
        totalR: eq.total_diesel_obra ?? eq.total_diesel,
        volume: eq.volume_ref_diesel,
        unidade: unidadePorTipoVolume(eq.volume_ref_diesel_tipo, itemUnit),
        tipo: tipoVolumeLabel(eq.volume_ref_diesel_tipo),
        origem: `${itemNome} · ${eq.equipamento || eq.nome || "equipamento"}`,
        formula: eq.horas_maquina_origem || "R$/h × horas-máquina × quantidade",
      });
      add({
        parcela: "Manutenção",
        totalR: eq.total_manutencao_obra ?? eq.total_manutencao,
        volume: eq.volume_ref_manutencao,
        unidade: unidadePorTipoVolume(eq.volume_ref_manutencao_tipo, itemUnit),
        tipo: tipoVolumeLabel(eq.volume_ref_manutencao_tipo),
        origem: `${itemNome} · ${eq.equipamento || eq.nome || "equipamento"}`,
        formula: "R$/h × base de horas da manutenção × quantidade",
      });
      add({
        parcela: "Mão de obra",
        totalR: eq.total_mo_obra ?? eq.total_mo,
        volume: eq.volume_ref_mo,
        unidade: unidadePorTipoVolume(eq.volume_ref_mo_tipo, itemUnit),
        tipo: tipoVolumeLabel(eq.volume_ref_mo_tipo),
        origem: `${itemNome} · ${eq.equipamento || eq.nome || "equipamento"}`,
        formula: "R$/h × base de horas da mão de obra × quantidade",
      });
      add({
        parcela: "Indireto",
        totalR: eq.total_indireto_obra ?? eq.total_indireto,
        volume: eq.volume_ref_indireto,
        unidade: unidadePorTipoVolume(eq.volume_ref_indireto_tipo, itemUnit),
        tipo: tipoVolumeLabel(eq.volume_ref_indireto_tipo),
        origem: `${itemNome} · ${eq.equipamento || eq.nome || "equipamento"}`,
        formula: "rateio de indiretos conforme base do item",
      });
    });

    if (eqs.length === 0 && getItemTotal(item) > 0) {
      add({
        parcela: item.modoPreco === "preco_cravado" ? "Preço cravado/mercado" : "Item sem composição técnica",
        totalR: item.totalCost ?? item.total_item,
        volume: item.quantity ?? item.volumeInSitu,
        unidade: itemUnit,
        tipo: "quantidade do item",
        origem: itemNome,
        formula: `${normalizeUnit(item.unit)} informado no item × preço/custo unitário`,
      });
    }
  });

  return Array.from(groups.values()).sort((a, b) =>
    `${a.parcela}|${a.unidade}`.localeCompare(`${b.parcela}|${b.unidade}`, "pt-BR")
  );
};

const buildDecomposicaoPorBaseV2 = (itemsCalc = []) => {
  const groups = new Map();
  const add = ({ parcela, totalR, volume, unidade, tipo, origem, formula }) => {
    const total = Number(totalR) || 0;
    const base = Number(volume) || 0;
    if (total === 0 && base === 0) return;
    const key = `${parcela}|${unidade}|${tipo}`;
    const current = groups.get(key) || { parcela, unidade, tipo, totalR: 0, volume: 0, origens: [] };
    current.totalR += total;
    current.volume += base;
    if (origem) current.origens.push({ origem, quantidade: base, unidade, formula });
    groups.set(key, current);
  };

  const addEqParcela = (itemNome, itemUnit, eq, cfg) => {
    const base = getParcelaBase(eq, cfg.volumeKey, cfg.tipoKey, itemUnit);
    add({
      parcela: cfg.parcela,
      totalR: getParcelaTotal(eq, cfg.totalKeys, cfg.unitKeys, base.volume),
      volume: base.volume,
      unidade: base.unidade,
      tipo: base.tipo,
      origem: `${itemNome} · ${eq.equipamento || eq.nome || "equipamento"}`,
      formula: cfg.formula(eq),
    });
  };

  itemsCalc.forEach((item, itemIndex) => {
    const itemNome = item.desc || item.name || `Item ${itemIndex + 1}`;
    const itemUnit = normalizeUnit(item.unit);
    const eqs = item.detalhes?.auditoria?.equipamentos || [];

    eqs.forEach((eq) => {
      if (eq.tipo === "transporte_agregado") {
        const t = eq.transporteAgregado || {};
        const tipoBase = t.volumeBaseTotalizacaoTipo || eq.volume_base_tipo || "transporte_agregado";
        add({
          parcela: "Transporte agregado",
          totalR: firstNum(t.custoTotalFrete, eq.total_custo_maquina_obra_R$),
          volume: firstNum(t.volumeBaseTotalizacao, eq.volume_base_total_preciso, eq.volume_base_total),
          unidade: unidadePorTipoVolume(tipoBase, itemUnit),
          tipo: tipoVolumeLabel(tipoBase),
          origem: `${itemNome} · ${eq.equipamento || "transporte agregado"}`,
          formula: t.modoFrete === "planilha_m3_empolado"
            ? "volume transportado empolado x preco/custo por m3 empolado"
            : "volume transportado correspondente ao item",
        });
        return;
      }

      addEqParcela(itemNome, itemUnit, eq, {
        parcela: "Diesel",
        totalKeys: ["total_diesel_obra", "total_diesel"],
        unitKeys: ["diesel_R$_m3_preciso", "diesel_R$_m3"],
        volumeKey: "volume_ref_diesel",
        tipoKey: "volume_ref_diesel_tipo",
        formula: (e) => e.horas_maquina_origem || "R$/h x horas-maquina x quantidade",
      });
      addEqParcela(itemNome, itemUnit, eq, {
        parcela: "Manutencao",
        totalKeys: ["total_manutencao_obra", "total_manutencao"],
        unitKeys: ["manutencao_R$_m3_preciso", "manutencao_R$_m3"],
        volumeKey: "volume_ref_manutencao",
        tipoKey: "volume_ref_manutencao_tipo",
        formula: () => "R$/h x base de horas da manutencao x quantidade",
      });
      addEqParcela(itemNome, itemUnit, eq, {
        parcela: "Mao de obra",
        totalKeys: ["total_mo_obra", "total_mo"],
        unitKeys: ["mo_R$_m3_preciso", "mo_R$_m3"],
        volumeKey: "volume_ref_mo",
        tipoKey: "volume_ref_mo_tipo",
        formula: () => "R$/h x base de horas da mao de obra x quantidade",
      });
      addEqParcela(itemNome, itemUnit, eq, {
        parcela: "Indireto",
        totalKeys: ["total_indireto_obra", "total_indireto"],
        unitKeys: ["indireto_R$_m3_preciso", "indireto_R$_m3"],
        volumeKey: "volume_ref_indireto",
        tipoKey: "volume_ref_indireto_tipo",
        formula: () => "rateio de indiretos conforme base do item",
      });
    });

    if (eqs.length === 0 && getItemTotal(item) > 0) {
      add({
        parcela: item.modoPreco === "preco_cravado" ? "Preco cravado/mercado" : "Item sem composicao tecnica",
        totalR: item.totalCost ?? item.total_item,
        volume: item.quantity ?? item.volumeInSitu,
        unidade: itemUnit,
        tipo: "quantidade do item",
        origem: itemNome,
        formula: `${normalizeUnit(item.unit)} informado no item x preco/custo unitario`,
      });
    }
  });

  return Array.from(groups.values()).sort((a, b) =>
    `${a.parcela}|${a.unidade}`.localeCompare(`${b.parcela}|${b.unidade}`, "pt-BR")
  );
};

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
  const basesPorUnidade = useMemo(
    () => buildBasesPorUnidade(totals?.itemsCalc || quotation?.items || []),
    [totals, quotation]
  );
  const baseUnica = basesPorUnidade.length === 1 ? basesPorUnidade[0] : null;
  const baseRateioGlobal = baseUnica?.quantidade || 0;
  const temUnidadesMisturadas = basesPorUnidade.length > 1;
  const precoUnitBase = baseRateioGlobal > 0 ? precoBase / baseRateioGlobal : 0;
  const markupEfetivo = custoTotal > 0 ? precoBase / custoTotal : 0;

  // Decomposição do custo por parcela
  const decompCusto = useMemo(
    () => buildDecomposicaoPorBaseV2(totals?.itemsCalc || []),
    [totals]
  );
  const resumoItens = useMemo(
    () => buildResumoItens(totals?.itemsCalc || []),
    [totals]
  );

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
  const orcAlt = baseUnica ? precoUnitAlt * baseRateioGlobal : precoBase;
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
    if (custoTotal <= 0 || aliquotaImposto >= 1) {
      return { precoUnit: Infinity, orcamento: Infinity, viavel: false };
    }
    const fator = 1 - margemMinima / (1 - aliquotaImposto);
    if (fator <= 0) {
      return { precoUnit: Infinity, orcamento: Infinity, viavel: false };
    }
    const orcamentoMinimo = custoTotal / fator;
    const precoMin = baseRateioGlobal > 0 ? orcamentoMinimo / baseRateioGlobal : Infinity;
    return { precoUnit: precoMin, orcamento: orcamentoMinimo, viavel: true };
  }, [custoTotal, baseRateioGlobal, margemMinima, aliquotaImposto]);

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
          <div style={{ gridColumn: "1 / -1" }}>
            <div style={{
              display: "grid",
              gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
              gap: 10,
              marginBottom: 16,
            }}>
              <MiniKpi label="Custo calculado" value={fmtBRL(custoTotal)} />
              <MiniKpi label="Preço base de venda" value={fmtBRL(precoBase)} tone="ref" />
              <MiniKpi label="Lucro estimado" value={fmtBRL(lucroEstBase)} tone={lucroEstBase >= 0 ? "ok" : "bad"} />
              <MiniKpi label="Itens no orçamento" value={String(resumoItens.length)} />
            </div>
          </div>

          <Card title="0. Resumo por item" full>
            <ResumoItens itens={resumoItens} />
          </Card>
          {/* 1. DECOMPOSIÇÃO DO CUSTO POR PARCELA */}
          <Card title="1. Decomposição do Custo por Parcela" full>
            {temUnidadesMisturadas && (
              <AvisoBase>
                Este orçamento tem unidades diferentes. O painel não usa mais um único volume total:
                cada parcela abaixo usa sua própria base de referência.
              </AvisoBase>
            )}
            <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: SS.fontMono, fontSize: 12 }}>
              <thead>
                <tr>
                  <th style={th("left")}>Parcela</th>
                  <th style={th("right")}>R$/unid. base</th>
                  <th style={th("right")}>Base de referência</th>
                  <th style={th("left")}>Origem da base</th>
                  <th style={th("right")}>= Total R$</th>
                </tr>
              </thead>
              <tbody>
                {decompCusto.map((row) => (
                  <LinhaDecomp key={`${row.parcela}-${row.unidade}-${row.tipo}`} row={row} />
                ))}
                <LinhaTotalFinanceiro total={custoTotal} />
              </tbody>
            </table>
            <BasesPorUnidade bases={basesPorUnidade} />
          </Card>

          {/* 2. CENÁRIO BASE */}
          <Card title="2. Cenário BASE (markup natural do orçamento)">
            <Linha label="Markup efetivo"   valor={`× ${fmt(markupEfetivo, 2)}`} />
            <Linha
              label={baseUnica ? `Preço unitário médio (${baseUnica.unit})` : "Preço unitário médio"}
              valor={baseUnica ? `${fmtBRLPreciso(cenarioBase.precoUnit, 4)}/${baseUnica.unit}` : "não aplicável: unidades diferentes"}
            />
            <Linha label="Orçamento total"  valor={fmtBRL(cenarioBase.orcamento)} />
            <Linha label="Custo total"      valor={fmtBRL(cenarioBase.custo)} />
            <Linha label="Lucro estimado"   valor={fmtBRL(cenarioBase.lucroEst)} />
            <Linha label={`Imposto (${(aliquotaImposto * 100).toFixed(2)}%)`} valor={fmtBRL(cenarioBase.imposto)} />
            <Linha label="LUCRO LÍQUIDO"    valor={fmtBRL(cenarioBase.lucroLiq)} emphasize />
            <Linha label="Margem líquida"   valor={`${(cenarioBase.margemLiq * 100).toFixed(2)}%`} emphasize />
          </Card>

          {/* 3. CENÁRIO ALTERNATIVO */}
          <Card title="3. Cenário ALTERNATIVO (preço aumentado)">
            {baseUnica ? (
              <InputLinha
                label={`Preço unitário alternativo (R$/${baseUnica.unit})`}
                type="number"
                step="0.01"
                value={precoUnitAlternativo}
                onChange={(e) => setPrecoUnitAlternativo(e.target.value)}
                placeholder={fmt(precoUnitBase * 1.1, 2)}
              />
            ) : (
              <AvisoBase>
                Preço unitário alternativo global desativado porque há unidades diferentes.
                Ajuste preços por item para simular cenários mistos.
              </AvisoBase>
            )}
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
              {baseUnica ? (
                <>
                  Cobrando {fmtBRLPreciso(cenarioAlt.precoUnit - cenarioBase.precoUnit, 4)}/{baseUnica.unit} a mais,
                  você sobe {fmtBRL(deltaLucroLiq)} de lucro líquido.
                  {deltaLucroLiq > 0 && (
                    <> Margem para negociação: até {fmtBRLPreciso(cenarioAlt.precoUnit - cenarioBase.precoUnit, 4)}/{baseUnica.unit} de desconto sem sair do cenário base.</>
                  )}
                </>
              ) : (
                <>Comparativo calculado somente por valores financeiros finais, sem preço unitário global.</>
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
                {baseUnica && (
                  <Linha
                    label={`Preço unitário mínimo para ${(margemMinima * 100).toFixed(1)}% margem`}
                    valor={`${fmtBRLPreciso(piso.precoUnit, 4)}/${baseUnica.unit}`}
                    emphasize
                  />
                )}
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

function MiniKpi({ label, value, tone = "default" }) {
  const color =
    tone === "ref" ? SS.accentGreen :
    tone === "ok" ? SS.accentGreen :
    tone === "bad" ? SS.accentRed :
    SS.formulaText;
  return (
    <div style={{
      background: SS.bg,
      border: `1px solid ${SS.border}`,
      padding: "12px 14px",
      minHeight: 76,
      display: "flex",
      flexDirection: "column",
      justifyContent: "center",
      gap: 6,
    }}>
      <div style={{ fontSize: 11, color: SS.mutedText, fontWeight: 800, textTransform: "uppercase", letterSpacing: 0.4 }}>
        {label}
      </div>
      <div style={{ fontFamily: SS.fontMono, color, fontSize: 18, fontWeight: 900 }}>
        {value}
      </div>
    </div>
  );
}

function ResumoItens({ itens }) {
  if (!itens?.length) {
    return <div style={{ color: SS.mutedText, fontSize: 12 }}>Nenhum item calculado.</div>;
  }
  return (
    <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: SS.fontMono, fontSize: 11 }}>
      <thead>
        <tr>
          <th style={th("right")}>#</th>
          <th style={th("left")}>Item</th>
          <th style={th("left")}>Categoria</th>
          <th style={th("right")}>Quantidade</th>
          <th style={th("right")}>Custo un.</th>
          <th style={th("right")}>Preço un.</th>
          <th style={th("right")}>Total</th>
          <th style={th("left")}>Modelo</th>
        </tr>
      </thead>
      <tbody>
        {itens.map((item) => (
          <tr key={`${item.idx}-${item.desc}`}>
            <td style={td("right")}>{item.idx}</td>
            <td style={td("left")}>{item.desc}</td>
            <td style={td("left")}>{item.category}</td>
            <td style={td("right")}>{fmt(item.quantity, 2)} {item.unit}</td>
            <td style={td("right")}>{fmtBRLPreciso(item.custoUnit, 4)}/{item.unit}</td>
            <td style={td("right")}>{fmtBRLPreciso(item.precoUnit, 4)}/{item.unit}</td>
            <td style={{ ...td("right"), color: SS.accentGreen, fontWeight: 800 }}>{fmtBRL(item.total)}</td>
            <td style={td("left")}>{item.modelo}</td>
          </tr>
        ))}
      </tbody>
    </table>
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

function LinhaDecomp({ row }) {
  const unitR = row.volume > 0 ? row.totalR / row.volume : 0;
  const origemResumo = row.origens.length > 0
    ? row.origens
      .slice(0, 4)
      .map((o) => `${o.origem}: ${fmt(o.quantidade, 2)} ${o.unidade}`)
      .join(" · ")
    : "—";
  const origemExtra = row.origens.length > 4 ? ` · +${row.origens.length - 4} origens` : "";
  const formulaResumo = row.origens[0]?.formula || row.tipo;
  const style = {
    padding: "4px 10px",
    fontFamily: SS.fontMono,
    fontSize: 12,
    fontWeight: 500,
    color: SS.formulaText,
    background: SS.bg,
    borderTop: `1px solid ${SS.gridLine}`,
    textAlign: "right",
    verticalAlign: "top",
  };
  return (
    <tr>
      <td style={{ ...style, textAlign: "left" }}>{row.parcela}</td>
      <td style={style}>{fmtBRLPreciso(unitR, 4)}/{row.unidade}</td>
      <td style={style}>
        {fmt(row.volume, 2)} {row.unidade}
        <div style={{ color: SS.mutedText, fontFamily: SS.fontUI, fontSize: 10 }}>{row.tipo}</div>
      </td>
      <td style={{ ...style, textAlign: "left", fontFamily: SS.fontUI, maxWidth: 420 }}>
        {origemResumo}{origemExtra}
        <div style={{ color: SS.mutedText, fontSize: 10 }}>{formulaResumo}</div>
      </td>
      <td style={style}>{fmtBRL(row.totalR)}</td>
    </tr>
  );
}

function LinhaTotalFinanceiro({ total }) {
  const style = {
    padding: "6px 10px",
    fontFamily: SS.fontMono,
    fontSize: 12,
    fontWeight: 800,
    color: SS.formulaText,
    background: SS.bgHeader,
    borderTop: `2px solid ${SS.accentBlue}`,
    textAlign: "right",
  };
  return (
    <tr>
      <td style={{ ...style, textAlign: "left" }}>Σ Custo total financeiro</td>
      <td style={style}>não aplicável</td>
      <td style={style}>bases separadas</td>
      <td style={{ ...style, textAlign: "left", fontFamily: SS.fontUI }}>
        Soma financeira dos itens, sem volume global misto
      </td>
      <td style={style}>{fmtBRL(total)}</td>
    </tr>
  );
}

function AvisoBase({ children }) {
  return (
    <div style={{
      marginBottom: 10,
      padding: "8px 10px",
      background: SS.warnBg,
      borderLeft: `4px solid ${SS.accentAmber}`,
      color: SS.formulaText,
      fontSize: 12,
      lineHeight: 1.45,
    }}>
      {children}
    </div>
  );
}

function BasesPorUnidade({ bases }) {
  if (!bases?.length) return null;
  return (
    <div style={{ marginTop: 12 }}>
      <div style={{ fontSize: 11, color: SS.mutedText, fontWeight: 800, textTransform: "uppercase", marginBottom: 6 }}>
        Bases físicas por unidade (não somadas entre si)
      </div>
      <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: SS.fontMono, fontSize: 11 }}>
        <thead>
          <tr>
            <th style={th("left")}>Unidade</th>
            <th style={th("right")}>Quantidade</th>
            <th style={th("right")}>Total financeiro dos itens</th>
            <th style={th("left")}>Origem / fórmula</th>
          </tr>
        </thead>
        <tbody>
          {bases.map((base) => (
            <tr key={base.unit}>
              <td style={td("left")}>{base.unit}</td>
              <td style={td("right")}>{fmt(base.quantidade, 2)} {base.unit}</td>
              <td style={td("right")}>{fmtBRL(base.total)}</td>
              <td style={td("left")}>
                {base.itens.slice(0, 3).map((it) => `${it.item}: ${fmt(it.quantidade, 2)} ${base.unit} (${it.formula})`).join(" · ")}
                {base.itens.length > 3 ? ` · +${base.itens.length - 3} itens` : ""}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const td = (align) => ({
  padding: "5px 8px",
  border: `1px solid ${SS.gridLine}`,
  color: SS.formulaText,
  textAlign: align,
  verticalAlign: "top",
});

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
