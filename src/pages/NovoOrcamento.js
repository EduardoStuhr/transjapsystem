import React, { useEffect, useState, useMemo } from "react";
import { Save, CheckCircle, ChevronRight, Zap } from "lucide-react";
import Button from "../components/ui/Button";
import Input from "../components/ui/Input";
import { Row } from "../components/ui/Card";
import BudgetItem from "../components/budget/BudgetItem";
import BudgetSummary from "../components/budget/BudgetSummary";
import PessoasIndiretas from "../components/budget/PessoasIndiretas";
import { calcNumOperadoresFrota, calcQuotationTotals } from "../services/costEngine";
import { TRANSPORTE_AGREGADO_DEFAULT } from "../services/transportAgregadoEngine";
import { fmt, uid, today } from "../utils/format";
import { buildPrazoParams, calcTotalHorasProjeto, migratePrazoMeta } from "../utils/quotationPrazo";
import { recalcularItensDerivados } from "../utils/itemDerivation";
import { ASSUMPTIONS } from "../config/assumptions.config";
import S from "../styles/tokens";

const toNumber = (v, fallback = 0) => {
  if (typeof v === "number") return Number.isFinite(v) ? v : fallback;
  if (!v) return fallback;
  const n = parseFloat(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : fallback;
};

const isLimpezaCamadaVegetal = (svc = {}) => {
  const nome = String(svc.name || svc.desc || "").toLowerCase();
  return nome.includes("limpeza") && nome.includes("vegetal");
};

const normalizeText = (value = "") =>
  String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

const usaHorasMaquinaGlobalPorPadrao = (svc = {}) => {
  const texto = normalizeText(svc.category || svc.name || svc.desc || svc.unit || "");
  if (!texto) return false;
  if (texto.includes("escavacao")) return false;
  if (texto.includes("limpeza") || texto.includes("preliminar") || texto.includes("apoio")) return false;
  return true;
};

// volumeEmpolado NUNCA persiste como propriedade do item.
// É sempre derivado em tempo real de (volumeInSitu × fatorEmpolamento) no engine
// e na UI (BudgetItem / ComposicaoPreco / PainelComposicao). Persistir um valor
// estático causa drift quando o usuário edita volumeInSitu ou fatorEmpolamento.
const emptyItem = () => ({
  id: uid(),
  serviceId: "",
  desc: "",
  unit: "",
  quantity: 1,
  volumeInSitu: 1,
  fatorEmpolamento: "",
  volumeInSituPorViagem: ASSUMPTIONS.transporte.volumePorViagemInSitu,

  // Volumes específicos por etapa.
  // Usados para não calcular rolo/trator/grade/pipa sobre volume de escavação.
  volumeAterroInSitu: 0,
  fatorEmpolamentoAterro: "",
  volumeTransporte: 0,

  adjustedProductivity: 0,
  terrainFactor: 1,
  distanceFactor: 1,
  manualCost: 0,
  equipmentLines: [],
  rateiaIndireto: true,
  modoPreco: "tecnico",
  modeloHorasMaquina: "proprio",
  precoUnitarioMercado: 0,
  precoUnitCravado: 0,
  fontePrecoCravado: "",
  derivadoDe: null,
  formulaDerivacao: null,
  manutencaoHorasBase: "",
  maoObraHorasBase: "",
  produtividadeUnidade: "hora",
  modoCalculoPrazoItem: "automatico",
  prazoDiasUteisItem: 0,
  horasDiaItem: 0,
  markup: "",
  indiretoBase: "area",
  manutencaoHorasManual: 0,
  manutencaoValorFixo: 0,
  maoObraHorasManual: 0,
  maoObraValorFixo: 0,
  indiretoValorFixo: 0,
  indiretoPercentualDireto: 0,
  indiretoMensal: 0,
  soilCategory: "1ª",
  dmtDistance: 0,
  transporteAgregado: { ...TRANSPORTE_AGREGADO_DEFAULT },
});

export default function NovoOrcamento({ services, equipment, params, onSave, editQuotation, onCancel }) {
  const eqMap = useMemo(
    () => Object.fromEntries(equipment.map(e => [e.id, e])),
    [equipment]
  );

  const [step, setStep] = useState(1);
  const [meta, setMeta] = useState(() => {
    const editMeta = editQuotation?.meta || editQuotation;
    return editMeta
      ? migratePrazoMeta({
        client: editMeta.client,
        cnpj: editMeta.cnpj,
        project: editMeta.project,
        location: editMeta.location,
        prazo: editMeta.prazo,
        notes: editMeta.notes || "",
        volumeEmpoladoObra: editMeta.volumeEmpoladoObra ?? 0,
        totalHorasProjeto: editMeta.totalHorasProjeto ?? 0,
        prazoMeses: editMeta.prazoMeses ?? 0,
        diasUteisMes: editMeta.diasUteisMes ?? 0,
        horasDia: editMeta.horasDia ?? 0,
      })
      : {
        client: "", cnpj: "", project: "", location: "", prazo: "", notes: "",
        volumeEmpoladoObra: 0,
        totalHorasProjeto: 0,
        prazoMeses: 0,
        diasUteisMes: 0,
        horasDia: 0,
      };
  });
  const [items, setItems] = useState(editQuotation ? editQuotation.items : [emptyItem()]);
  // Pessoas indiretas — nível do orçamento (uma única lista para todos os itens).
  const [indirectPersonnel, setIndirectPersonnel] = useState(
    Array.isArray(editQuotation?.indirectPersonnel) ? editQuotation.indirectPersonnel : []
  );
  const [bdi, setBdi] = useState(editQuotation?.bdi ?? params.defaultBDI);
  const [adminPct, setAdminPct] = useState(editQuotation?.adminPct ?? 3);
  const [mobilPct, setMobilPct] = useState(editQuotation?.mobilPct ?? 2);
  const [riskPct, setRiskPct] = useState(editQuotation?.riskPct ?? 1);
  const totalHorasProjetoCalculado = useMemo(
    () => calcTotalHorasProjeto(meta),
    [meta]
  );

  const paramsDoOrcamento = useMemo(
    () => buildPrazoParams(params, meta),
    [params, meta]
  );

  const numOperadoresFrotaOrcamento = useMemo(
    () => calcNumOperadoresFrota(items, paramsDoOrcamento),
    [items, paramsDoOrcamento],
  );

  // ── item field update + equipment line mutations ──
  const updateItem = (idx, key, value) => {
    setItems(prev => prev.map((it, i) => {
      if (i !== idx) return it;

      if (key === "_addEqLine") return { ...it, equipmentLines: [...it.equipmentLines, value] };
      if (key === "_delEqLine") return { ...it, equipmentLines: it.equipmentLines.filter((_, j) => j !== value) };
      if (key === "_setEqLine") {
        const { ei, k, v } = value;
        return {
          ...it,
          equipmentLines: it.equipmentLines.map((l, j) =>
            j !== ei ? l : { ...l, [k]: k === "equipmentId" ? v : toNumber(v) || 1 }
          ),
        };
      }
      if (key === "_setTransporteAgregado") {
        return {
          ...it,
          transporteAgregado: {
            ...TRANSPORTE_AGREGADO_DEFAULT,
            ...(it.transporteAgregado || {}),
            [value.k]: value.v,
          },
        };
      }
      if (key === "_unlinkDerivation") {
        return { ...it, derivadoDe: null, formulaDerivacao: null };
      }

      const up = { ...it, [key]: value };
      const fatorPadrao = params?.fator_empolamento || (1 + ASSUMPTIONS.empolamento.fatorPadrao);

      if (key === "quantity") {
        const volumeInSitu = toNumber(value) || 0;
        up.quantity = volumeInSitu;
        up.volumeInSitu = volumeInSitu;
      }

      if (key === "fatorEmpolamento") {
        up.fatorEmpolamento = toNumber(value) || 0;
      }
      if (key === "fatorEmpolamentoAterro") {
        up.fatorEmpolamentoAterro = toNumber(value) || 0;
      }
      if (key === "markup") {
        up.markup = toNumber(value) || 0;
        up.markupManual = true;
      }
      if (key === "modeloHorasMaquina") {
        up.modeloHorasMaquina = value;
        up.modeloHorasMaquinaManual = true;
      }

      if (key === "serviceId") {
        const svc = services.find(s => s.id === value);
        if (svc) {
          up.unit = svc.unit;
          up.desc = svc.name;
          const isLimpezaVegetal = isLimpezaCamadaVegetal(svc);
          up.adjustedProductivity = svc.baseProductivity;
          up.produtividadeUnidade = svc.productivityUnit || "hora";
          up.modoCalculoPrazoItem = isLimpezaVegetal ? "automatico" : up.modoCalculoPrazoItem;
          up.prazoDiasUteisItem = isLimpezaVegetal ? 0 : up.prazoDiasUteisItem;
          up.horasDiaItem = isLimpezaVegetal ? (meta.horasDia || paramsDoOrcamento?.horas_dia || 9) : up.horasDiaItem;
          up.category = svc.category; // Calibragem RONMA
          up.terrainFactor = isLimpezaVegetal
            ? 1
            : (svc.efficiency || ASSUMPTIONS.produtividade.eficienciaPadrao);
          up.manutencaoHorasBase = isLimpezaVegetal ? "item" : up.manutencaoHorasBase;
          up.maoObraHorasBase = isLimpezaVegetal ? "item" : up.maoObraHorasBase;
          up.markup = svc.markup || "";
          up.markupManual = false;
          const usaGlobalPadrao = usaHorasMaquinaGlobalPorPadrao(svc);
          up.modeloHorasMaquina = usaGlobalPadrao ? "global_obra" : (up.modeloHorasMaquina || "proprio");
          up.modeloHorasMaquinaManual = false;
          const precoCravadoSugerido = toNumber(svc.precoCravadoSugerido, 0);
          const modoPrecoDefault = svc.modoPrecoDefault || (isLimpezaVegetal && toNumber(svc.referenceUnitPrice) > 0 ? "mercado" : "tecnico");
          up.precoUnitarioMercado = isLimpezaVegetal ? (toNumber(svc.referenceUnitPrice) || 0) : up.precoUnitarioMercado;
          up.precoUnitCravado = precoCravadoSugerido || up.precoUnitCravado || 0;
          up.fontePrecoCravado = precoCravadoSugerido
            ? `Cotação mercado / RONMA - ${svc.name}`
            : up.fontePrecoCravado;
          up.modoPreco = modoPrecoDefault;
          up.rateiaIndireto = isLimpezaVegetal ? false : up.rateiaIndireto;
          up.volumeInSitu = toNumber(up.volumeInSitu) || toNumber(up.quantity) || 0;
          up.fatorEmpolamento = isLimpezaVegetal ? 1 : (toNumber(up.fatorEmpolamento) || fatorPadrao);
          up.fatorEmpolamentoAterro = isLimpezaVegetal ? "" : (toNumber(up.fatorEmpolamentoAterro) || fatorPadrao);
        }
      }

      // volumeEmpolado é sempre derivado downstream — não persiste aqui.
      delete up.volumeEmpolado;

      return up;
    }));
  };

  const itemComPrazoMeta = (overrides = {}) => ({
    ...emptyItem(),
    prazoMeses: meta.prazoMeses || 0,
    diasUteisMes: meta.diasUteisMes || 22,
    horasDia: meta.horasDia || 9,
    ...overrides,
  });

  const addItem = () => setItems(prev => [...prev, itemComPrazoMeta()]);
  const delItem = (idx) => setItems(prev => prev.filter((_, i) => i !== idx));

  useEffect(() => {
    setItems(prev => recalcularItensDerivados(prev, services));
  }, [items, services]);

  const getServicoRelacionadoPendente = (itemAtual) => {
    const servicoPai = services.find(s => s.id === itemAtual.serviceId);
    if (!servicoPai?.servicoRelacionado) return null;
    if (!servicoPai?.espessuraCamadaPadrao) return null;

    const jaExiste = items.some((it) => {
      if (it.id === itemAtual.id) return false;
      const servico = services.find(s => s.id === it.serviceId);
      return servico?.name === servicoPai.servicoRelacionado;
    });

    return jaExiste ? null : servicoPai.servicoRelacionado;
  };

  const adicionarServicoRelacionado = (nomeServicoFilho, itemPai) => {
    const servicoFilho = services.find(s => s.name === nomeServicoFilho);
    const servicoPai = services.find(s => s.id === itemPai.serviceId);
    if (!servicoFilho || !servicoPai) return;

    const espessura = toNumber(servicoPai.espessuraCamadaPadrao, 0);
    const quantidadePai = toNumber(itemPai.quantity, toNumber(itemPai.volumeInSitu, 0));
    const quantidadeFilho = espessura > 0 ? quantidadePai * espessura : 0;
    const precoCravado = toNumber(servicoFilho.precoCravadoSugerido, 0);

    setItems(prev => [
      ...prev,
      itemComPrazoMeta({
        serviceId: servicoFilho.id,
        desc: servicoFilho.name,
        category: servicoFilho.category,
        unit: servicoFilho.unit,
        quantity: quantidadeFilho,
        volumeInSitu: quantidadeFilho,
        adjustedProductivity: toNumber(servicoFilho.baseProductivity, 0),
        produtividadeUnidade: servicoFilho.productivityUnit || "hora",
        terrainFactor: servicoFilho.efficiency || 1,
        modoPreco: servicoFilho.modoPrecoDefault || "tecnico",
        precoUnitCravado: precoCravado,
        fontePrecoCravado: precoCravado ? `Cotação mercado / RONMA - ${servicoFilho.name}` : "",
        derivadoDe: itemPai.id,
        formulaDerivacao: espessura > 0 ? `área_pai x ${espessura} m` : null,
        rateiaIndireto: false,
        dmtDistance: 1,
      }),
    ]);
  };

  // ── Automação de Mobilização e Topografia ──
  const generateAutoItems = () => {
    const numMachines = items.reduce((acc, it) => acc + it.equipmentLines.reduce((s, line) => s + line.quantity, 0), 0);
    const mobilCost = (params.mobilizationDistance * params.flatbedCostPerKm) * numMachines;
    const fatorPadrao = params?.fator_empolamento || (1 + ASSUMPTIONS.empolamento.fatorPadrao);

    const mobilSvc = services.find(s => s.name.toLowerCase().includes("mobiliza"));
    const topoSvc = services.find(s => s.name.toLowerCase().includes("topografia"));

    const newItems = [...items];

    if (mobilSvc && !newItems.find(i => i.serviceId === mobilSvc.id)) {
      newItems.push({
        ...itemComPrazoMeta(),
        serviceId: mobilSvc.id,
        desc: mobilSvc.name,
        unit: mobilSvc.unit,
        quantity: 1,
        volumeInSitu: 1,
        fatorEmpolamento: fatorPadrao,
        volumeInSituPorViagem: ASSUMPTIONS.transporte.volumePorViagemInSitu,
        adjustedProductivity: mobilSvc.baseProductivity,
        manualCost: mobilCost, // Custo da mobilização como custo manual
      });
    }

    if (topoSvc && !newItems.find(i => i.serviceId === topoSvc.id)) {
      newItems.push({
        ...itemComPrazoMeta(),
        serviceId: topoSvc.id,
        desc: topoSvc.name,
        unit: topoSvc.unit,
        quantity: params.totalClearingArea, // Proporcional à área
        volumeInSitu: params.totalClearingArea,
        fatorEmpolamento: fatorPadrao,
        volumeInSituPorViagem: ASSUMPTIONS.transporte.volumePorViagemInSitu,
        adjustedProductivity: topoSvc.baseProductivity,
        manualCost: 0,
        equipmentLines: [] // Espera-se que o usuário adicione a equipe ou que a topografia tenha custo manual
      });
    }

    setItems(newItems);
  };

  const totals = useMemo(
    () => calcQuotationTotals(items, eqMap, paramsDoOrcamento, {
      bdi,
      adminPct,
      mobilPct,
      riskPct,
      indirectPersonnel,
      volumeEmpoladoObra: meta.volumeEmpoladoObra,
    }),
    [items, bdi, adminPct, mobilPct, riskPct, eqMap, paramsDoOrcamento, indirectPersonnel, meta.volumeEmpoladoObra]
  );
  const horasMaquinaGlobalInfo = totals?.horasMaquinaGlobalInfo || {};
  const horasMaquinaGlobalObra = totals?.horasMaquinaGlobalObra || 0;
  const paramsDoOrcamentoComGlobal = useMemo(
    () => ({
      ...paramsDoOrcamento,
      horas_maquina_global_obra: horasMaquinaGlobalObra,
    }),
    [paramsDoOrcamento, horasMaquinaGlobalObra],
  );

  const save = (status = "rascunho") => {
    const metaToSave = {
      ...meta,
      totalHorasProjeto: totalHorasProjetoCalculado,
    };

    onSave({
      id: editQuotation?.id || uid(),
      number: editQuotation?.number || `TJ-${Date.now().toString().slice(-6)}`,
      createdAt: editQuotation?.createdAt || today(),
      status,
      ...metaToSave,
      volumeEmpoladoObra: metaToSave.volumeEmpoladoObra,
      totalHorasProjeto: metaToSave.totalHorasProjeto,
      indirectPersonnel,
      items: totals.itemsCalc,
      bdi, adminPct, mobilPct, riskPct,
      subtotal: totals.subtotal,
      subtotalPrice: totals.subtotalPrice,
      indirect: totals.indirect,
      bdiVal: totals.bdiVal,
      precoFinal: totals.precoFinal,
      laborFat: totals.laborFat,
      equipFat: totals.equipFat,
    });
  };

  const svcOptions = [
    { value: "", label: "— Selecionar Serviço —" },
    ...services.map(s => ({ value: s.id, label: s.name })),
  ];
  const eqOptions = [
    { value: "", label: "— Selecionar Equipamento —" },
    ...equipment.filter(e => e.active).map(e => ({ value: e.id, label: e.name })),
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <div className="page-header">
        <h1 className="page-title">{editQuotation ? "Editar Orçamento" : "Novo Orçamento"}</h1>
        <div style={{ display: "flex", gap: 8 }}>
          <Button onClick={onCancel} variant="ghost">Cancelar</Button>
          <Button onClick={() => save("rascunho")} variant="ghost"><Save size={14} />Salvar Rascunho</Button>
          <Button onClick={() => save("enviado")} variant="primary"><CheckCircle size={14} />Finalizar e Enviar</Button>
        </div>
      </div>

      {/* Step tabs */}
      <div style={{ display: "flex", gap: 0 }}>
        {[["1", "Dados do Projeto"], ["2", "Itens do Orçamento"], ["3", "Revisão Final"]].map(([n, l], i) => (
          <div
            key={n}
            onClick={() => setStep(i + 1)}
            style={{
              flex: 1, padding: "12px 20px", cursor: "pointer", textAlign: "center",
              background: step === i + 1 ? S.accent : S.card.background,
              border: `1px solid ${S.border}`,
              borderRadius: i === 0 ? "8px 0 0 8px" : i === 2 ? "0 8px 8px 0" : 0,
            }}
          >
            <span style={{ color: step === i + 1 ? "#0f1117" : S.muted, fontWeight: 700, fontSize: 13 }}>{n}. {l}</span>
          </div>
        ))}
      </div>

      {/* Step 1 — Dados */}
      {step === 1 && (
        <div className="card" style={{ padding: 24, display: "flex", flexDirection: "column", gap: 16 }}>
          <Row>
            <Input label="Nome do Cliente" value={meta.client} onChange={v => setMeta(m => ({ ...m, client: v }))} />
            <Input label="CNPJ" value={meta.cnpj} onChange={v => setMeta(m => ({ ...m, cnpj: v }))} />
          </Row>
          <Row>
            <Input label="Nome do Projeto / Obra" value={meta.project} onChange={v => setMeta(m => ({ ...m, project: v }))} />
            <Input label="Localização" value={meta.location} onChange={v => setMeta(m => ({ ...m, location: v }))} />
          </Row>
          <Row>
            <Input
              label="Prazo (meses)"
              type="number" step="1" min="1"
              value={meta.prazoMeses || ""}
              onChange={v => setMeta(m => ({ ...m, prazoMeses: parseInt(v, 10) || 0 }))}
              placeholder="Ex: 9"
            />
            <Input
              label="Dias úteis/mês"
              type="number" step="1" min="1" max="31"
              value={meta.diasUteisMes || ""}
              onChange={v => setMeta(m => ({ ...m, diasUteisMes: parseInt(v, 10) || 0 }))}
              placeholder="Ex: 22"
            />
            <Input
              label="Horas/dia"
              type="number" step="0.5" min="1" max="24"
              value={meta.horasDia || ""}
              onChange={v => setMeta(m => ({ ...m, horasDia: parseFloat(v) || 0 }))}
              placeholder="Ex: 9"
            />
          </Row>
          {horasMaquinaGlobalObra > 0 && (
            <div style={{
              padding: "10px 14px",
              background: "rgba(40, 80, 120, 0.10)",
              borderLeft: "3px solid rgba(70, 130, 180, 0.7)",
              fontSize: 12,
              color: S.text,
            }}>
              <div style={{ fontWeight: 700, marginBottom: 4 }}>
                Horas-mÃ¡quina global da obra: {fmt(horasMaquinaGlobalObra, 2)} h
              </div>
              <div style={{ color: S.muted }}>
                Calculado do item de EscavaÃ§Ã£o: {fmt(horasMaquinaGlobalInfo.volumeEscavacao || 0, 0)} mÂ³ in situ / {fmt(horasMaquinaGlobalInfo.producaoEscavadeiras || 0, 1)} mÂ³/h = {fmt(horasMaquinaGlobalObra, 2)} h.
              </div>
              <div style={{ color: S.muted, marginTop: 4, fontSize: 11 }}>
                Itens marcados com "Modelo de horas-mÃ¡quina = Global da obra" usam este valor no diesel.
              </div>
            </div>
          )}
          <Row>
            <Input
              label="Horas gerais do contrato (calculado)"
              value={`${fmt(totalHorasProjetoCalculado, 0)} h`}
              readOnly
              style={{ background: "rgba(0,0,0,0.20)" }}
              hint={`= ${meta.prazoMeses || 0} x ${meta.diasUteisMes || 0} x ${meta.horasDia || 0}`}
            />
            <Input
              label="Volume empolado total (m³)"
              value={meta.volumeEmpoladoObra || ""}
              onChange={v => setMeta(m => ({ ...m, volumeEmpoladoObra: toNumber(v) || 0 }))}
              type="number" step="0.01" min="0"
              placeholder="Volume manual da obra"
            />
            {items.length > 0 && (meta.prazoMeses || meta.diasUteisMes || meta.horasDia) && (
              <Button
                onClick={() => {
                  if (window.confirm(`Aplicar prazo (${meta.prazoMeses || 0}m x ${meta.diasUteisMes || 0}d x ${meta.horasDia || 0}h) a todos os ${items.length} itens?`)) {
                    setItems(prev => prev.map(it => ({
                      ...it,
                      prazoMeses: meta.prazoMeses,
                      diasUteisMes: meta.diasUteisMes,
                      horasDia: meta.horasDia,
                    })));
                  }
                }}
              >
                Aplicar a todos os itens
              </Button>
            )}
          </Row>
          <Input label="Observações" value={meta.notes} onChange={v => setMeta(m => ({ ...m, notes: v }))} />

          <PessoasIndiretas
            value={indirectPersonnel}
            onChange={setIndirectPersonnel}
            params={paramsDoOrcamentoComGlobal}
            items={items}
            totalHorasProjeto={totalHorasProjetoCalculado}
          />

          <div style={{ marginTop: 8 }}>
            <Button onClick={() => setStep(2)} variant="primary">Próximo: Itens <ChevronRight size={14} /></Button>
          </div>
        </div>
      )}

      {/* Step 2 — Itens */}
      {step === 2 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {items.map((item, idx) => (
            <BudgetItem
              key={item.id}
              item={item}
              index={idx}
              services={services}
              equipmentMap={eqMap}
              equipmentOptions={eqOptions}
              serviceOptions={svcOptions}
              params={paramsDoOrcamentoComGlobal}
              indirectPersonnel={indirectPersonnel}
              numOperadoresFrotaOrcamento={numOperadoresFrotaOrcamento}
              totalHorasProjeto={totalHorasProjetoCalculado}
              volumeEmpoladoObra={meta.volumeEmpoladoObra}
              servicoRelacionadoPendente={getServicoRelacionadoPendente(item)}
              onAddRelatedService={adicionarServicoRelacionado}
              onUpdate={updateItem}
              onDelete={() => delItem(idx)}
            />
          ))}
          <div style={{ display: "flex", gap: 8, justifyContent: "space-between" }}>
            <div style={{ display: "flex", gap: 8 }}>
              <Button onClick={addItem} variant="ghost">+ Adicionar Item</Button>
              <Button onClick={generateAutoItems} variant="ghost" style={{ color: S.accent3 }}>
                <Zap size={14} /> Gerar Itens Automáticos (Topografia/Mobilização)
              </Button>
            </div>
            <Button onClick={() => setStep(3)} variant="primary">Próximo: Revisão <ChevronRight size={14} /></Button>
          </div>
        </div>
      )}

      {/* Step 3 — Revisão */}
      {step === 3 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <BudgetSummary
            totals={totals}
            bdi={bdi}
            adminPct={adminPct}
            mobilPct={mobilPct}
            riskPct={riskPct}
            onChangeBdi={v => setBdi(toNumber(v) || 0)}
            onChangeAdmin={v => setAdminPct(toNumber(v) || 0)}
            onChangeMobil={v => setMobilPct(toNumber(v) || 0)}
            onChangeRisk={v => setRiskPct(toNumber(v) || 0)}
          />
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <Button onClick={() => setStep(2)} variant="ghost">← Voltar</Button>
            <Button onClick={() => save("rascunho")} variant="ghost"><Save size={14} />Salvar Rascunho</Button>
            <Button onClick={() => save("enviado")} variant="primary" size="lg"><CheckCircle size={15} />Finalizar Orçamento</Button>
          </div>
        </div>
      )}
    </div>
  );
}
