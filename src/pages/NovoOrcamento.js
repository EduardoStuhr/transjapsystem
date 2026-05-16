import React, { useState, useMemo } from "react";
import { Save, CheckCircle, ChevronRight, Zap } from "lucide-react";
import Button from "../components/ui/Button";
import Input from "../components/ui/Input";
import { Row } from "../components/ui/Card";
import BudgetItem from "../components/budget/BudgetItem";
import BudgetSummary from "../components/budget/BudgetSummary";
import PessoasIndiretas from "../components/budget/PessoasIndiretas";
import { calcNumOperadoresFrota, calcQuotationTotals } from "../services/costEngine";
import { uid, today } from "../utils/format";
import { ASSUMPTIONS } from "../config/assumptions.config";
import S from "../styles/tokens";

const toNumber = (v, fallback = 0) => {
  if (typeof v === "number") return Number.isFinite(v) ? v : fallback;
  if (!v) return fallback;
  const n = parseFloat(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : fallback;
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
  soilCategory: "1ª",
  dmtDistance: 0
});

export default function NovoOrcamento({ services, equipment, params, onSave, editQuotation, onCancel }) {
  const eqMap = useMemo(
    () => Object.fromEntries(equipment.map(e => [e.id, e])),
    [equipment]
  );

  const [step, setStep] = useState(1);
  const [meta, setMeta] = useState(
    editQuotation
      ? {
        client: editQuotation.client,
        cnpj: editQuotation.cnpj,
        project: editQuotation.project,
        location: editQuotation.location,
        prazo: editQuotation.prazo,
        notes: editQuotation.notes || "",
        volumeEmpoladoObra: editQuotation.volumeEmpoladoObra ?? 0,
        totalHorasProjeto: editQuotation.totalHorasProjeto ?? 0,
      }
      : {
        client: "", cnpj: "", project: "", location: "", prazo: "", notes: "",
        volumeEmpoladoObra: 0,
        totalHorasProjeto: 0,
      }
  );
  const [items, setItems] = useState(editQuotation ? editQuotation.items : [emptyItem()]);
  // Pessoas indiretas — nível do orçamento (uma única lista para todos os itens).
  const [indirectPersonnel, setIndirectPersonnel] = useState(
    Array.isArray(editQuotation?.indirectPersonnel) ? editQuotation.indirectPersonnel : []
  );
  const [bdi, setBdi] = useState(editQuotation?.bdi ?? params.defaultBDI);
  const [adminPct, setAdminPct] = useState(editQuotation?.adminPct ?? 3);
  const [mobilPct, setMobilPct] = useState(editQuotation?.mobilPct ?? 2);
  const [riskPct, setRiskPct] = useState(editQuotation?.riskPct ?? 1);
  const numOperadoresFrotaOrcamento = useMemo(
    () => calcNumOperadoresFrota(items, params),
    [items, params],
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

      if (key === "serviceId") {
        const svc = services.find(s => s.id === value);
        if (svc) {
          up.unit = svc.unit;
          up.desc = svc.name;
          up.adjustedProductivity = svc.baseProductivity;
          up.category = svc.category; // Calibragem RONMA
          up.terrainFactor = svc.efficiency || ASSUMPTIONS.produtividade.eficienciaPadrao;
          up.volumeInSitu = toNumber(up.volumeInSitu) || toNumber(up.quantity) || 0;
          up.fatorEmpolamento = toNumber(up.fatorEmpolamento) || fatorPadrao;
          up.fatorEmpolamentoAterro = toNumber(up.fatorEmpolamentoAterro) || fatorPadrao;
        }
      }

      // volumeEmpolado é sempre derivado downstream — não persiste aqui.
      delete up.volumeEmpolado;

      return up;
    }));
  };

  const addItem = () => setItems(prev => [...prev, emptyItem()]);
  const delItem = (idx) => setItems(prev => prev.filter((_, i) => i !== idx));

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
        ...emptyItem(),
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
        ...emptyItem(),
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
    () => calcQuotationTotals(items, eqMap, params, {
      bdi,
      adminPct,
      mobilPct,
      riskPct,
      indirectPersonnel,
      totalHorasProjeto: meta.totalHorasProjeto,
      volumeEmpoladoObra: meta.volumeEmpoladoObra,
    }),
    [items, bdi, adminPct, mobilPct, riskPct, eqMap, params, indirectPersonnel, meta.totalHorasProjeto, meta.volumeEmpoladoObra]
  );

  const save = (status = "rascunho") => {
    onSave({
      id: editQuotation?.id || uid(),
      number: editQuotation?.number || `TJ-${Date.now().toString().slice(-6)}`,
      createdAt: editQuotation?.createdAt || today(),
      status,
      ...meta,
      volumeEmpoladoObra: meta.volumeEmpoladoObra,
      totalHorasProjeto: meta.totalHorasProjeto,
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
            <Input label="Prazo de Execução" value={meta.prazo} onChange={v => setMeta(m => ({ ...m, prazo: v }))} placeholder="Ex: 45 dias úteis" />
            <Input
              label="Total de horas do projeto (h)"
              value={meta.totalHorasProjeto || ""}
              onChange={v => setMeta(m => ({ ...m, totalHorasProjeto: toNumber(v) || 0 }))}
              type="number" step="1" min="0"
              placeholder="Ex: 1782 (250 dias × 9h)"
            />
            <Input
              label="Volume empolado total (m³)"
              value={meta.volumeEmpoladoObra || ""}
              onChange={v => setMeta(m => ({ ...m, volumeEmpoladoObra: toNumber(v) || 0 }))}
              type="number" step="0.01" min="0"
              placeholder="Volume manual da obra"
            />
          </Row>
          <Input label="Observações" value={meta.notes} onChange={v => setMeta(m => ({ ...m, notes: v }))} />

          <PessoasIndiretas
            value={indirectPersonnel}
            onChange={setIndirectPersonnel}
            params={params}
            items={items}
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
              params={params}
              indirectPersonnel={indirectPersonnel}
              numOperadoresFrotaOrcamento={numOperadoresFrotaOrcamento}
              totalHorasProjeto={meta.totalHorasProjeto}
              volumeEmpoladoObra={meta.volumeEmpoladoObra}
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
