import React, { useEffect, useState } from "react";
import { Trash2, AlertTriangle, CheckCircle, TrendingUp, Target } from "lucide-react";
import Button from "../ui/Button";
import Input from "../ui/Input";
import Select from "../ui/Select";
import { Badge, Row } from "../ui/Card";
import EquipmentSelector from "./EquipmentSelector";
import PainelComposicaoItem from "./PainelComposicaoItem";
import { calcItemCost } from "../../services/costEngine";
import {
  calcTransporteAgregado,
  TRANSPORTE_AGREGADO_DEFAULT,
} from "../../services/transportAgregadoEngine";
import { calcVolumeComEmpolamento, normalizeFatorEmpolamento, resolveFatorEmpolamento } from "../../utils/empolamento";
import { getVolumesAterro } from "../../utils/volumeBase";
import { fmt, fmtBRL, uid } from "../../utils/format";
import { getReferenciaPrecoMercado } from "../../data/precosMercado";
import S from "../../styles/tokens";

const toNumber = (v, fallback = 0) => {
  if (typeof v === "number") return Number.isFinite(v) ? v : fallback;
  if (!v) return fallback;
  const n = parseFloat(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : fallback;
};

const normalizeText = (value = "") =>
  String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

const usaHorasMaquinaGlobalPorPadrao = (item = {}) => {
  const texto = normalizeText(item.category || item.desc || item.unit || "");
  if (!texto) return false;
  if (texto.includes("escavacao")) return false;
  if (texto.includes("limpeza") || texto.includes("preliminar") || texto.includes("apoio")) return false;
  return true;
};

// ── Estilos do Painel de Calibragem ──
const calibrationStyles = {
  panel: {
    padding: "14px 16px",
    borderRadius: 8,
    marginTop: 10,
    fontSize: 13,
  },
  ok: {
    background: "rgba(16, 185, 129, 0.10)",
    border: "1px solid rgba(16, 185, 129, 0.30)",
  },
  alerta: {
    background: "rgba(245, 158, 11, 0.10)",
    border: "1px solid rgba(245, 158, 11, 0.30)",
  },
  erro: {
    background: "rgba(239, 68, 68, 0.10)",
    border: "1px solid rgba(239, 68, 68, 0.30)",
  },
  barContainer: {
    height: 8,
    background: "rgba(255,255,255,0.08)",
    borderRadius: 4,
    overflow: "hidden",
    position: "relative",
    margin: "8px 0",
  },
  badge: (color) => ({
    display: "inline-flex",
    alignItems: "center",
    gap: 4,
    padding: "3px 8px",
    borderRadius: 4,
    fontSize: 11,
    fontWeight: 700,
    background: `${color}22`,
    color: color,
  }),
};

// ── Barra de Faixa Visual ──
function CalibrationBar({ valor, faixa, label, cor }) {
  if (!faixa) return null;
  const range = faixa.max - faixa.min;
  const extendedMin = faixa.min - range * 0.5;
  const extendedMax = faixa.max + range * 0.5;
  const totalRange = extendedMax - extendedMin;

  const faixaLeft = ((faixa.min - extendedMin) / totalRange) * 100;
  const faixaWidth = (range / totalRange) * 100;
  const markerPos = Math.max(0, Math.min(100, ((valor - extendedMin) / totalRange) * 100));

  const dentro = valor >= faixa.min && valor <= faixa.max;

  return (
    <div style={{ marginBottom: 6 }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: S.muted, marginBottom: 3 }}>
        <span>{label}</span>
        <span style={{ color: dentro ? S.accent3 : "#f59e0b", fontWeight: 700 }}>
          R$ {valor.toFixed(2)} {dentro ? "✓" : "⚠"}
        </span>
      </div>
      <div style={calibrationStyles.barContainer}>
        {/* Faixa OK */}
        <div style={{
          position: "absolute",
          left: `${faixaLeft}%`,
          width: `${faixaWidth}%`,
          height: "100%",
          background: "rgba(16, 185, 129, 0.40)",
          borderRadius: 4,
        }} />
        {/* Marcador do valor atual */}
        <div style={{
          position: "absolute",
          left: `${markerPos}%`,
          top: -2,
          width: 4,
          height: 12,
          background: dentro ? S.accent3 : cor || "#f59e0b",
          borderRadius: 2,
          transform: "translateX(-50%)",
          boxShadow: `0 0 6px ${dentro ? S.accent3 : cor || "#f59e0b"}`,
        }} />
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: S.muted }}>
        <span>R$ {faixa.min.toFixed(2)}</span>
        <span>R$ {faixa.max.toFixed(2)}</span>
      </div>
    </div>
  );
}

export default function BudgetItem({
  item,
  index,
  services,
  equipmentMap,
  equipmentOptions,
  serviceOptions,
  params,
  indirectPersonnel = [],
  volumeEmpoladoObra,
  totalHorasProjeto,
  servicoRelacionadoPendente,
  onAddRelatedService,
  onUpdate,
  onDelete,
}) {
  const [panelOpen, setPanelOpen] = useState(false);
  const [showRateioHint, setShowRateioHint] = useState(false);
  const [sugestaoDispensada, setSugestaoDispensada] = useState(null);
  const result = calcItemCost(item, equipmentMap, params, indirectPersonnel);
  const {
    custo_unitario,
    preco_unitario,
    total_item,
    produtividade_utilizada,
    lucro_unitario,
    margem_percentual,
    markup_aplicado,
    calibracao,
    status,
    divergencia,
  } = result;

  const setField = (k, v) => onUpdate(index, k, v);
  const mostrarSugestaoRelacionado =
    servicoRelacionadoPendente && sugestaoDispensada !== servicoRelacionadoPendente;

  const isVB = item.unit === "VB";
  const unitUpper = String(item.unit || "").toUpperCase();
  const precoUnitarioMercado = toNumber(item.precoUnitarioMercado);
  const isAreaItem = unitUpper === "M2" || unitUpper === "M²";
  const modoPreco = item.modoPreco || (isAreaItem && precoUnitarioMercado > 0 ? "mercado" : "tecnico");
  const usaPrecoMercado = isAreaItem && modoPreco === "mercado";
  const usaPrecoCravado = modoPreco === "preco_cravado";
  const usaComposicaoTecnica = !usaPrecoMercado && !usaPrecoCravado;
  const modeloHorasDefault = usaHorasMaquinaGlobalPorPadrao(item) ? "global_obra" : "proprio";
  const modeloHorasMaquinaEfetivo = item.modeloHorasMaquinaManual === true
    ? (item.modeloHorasMaquina || "proprio")
    : modeloHorasDefault;
  useEffect(() => {
    const servico = services.find(s => s.id === item.serviceId);
    if (!servico) {
      setShowRateioHint(false);
      return;
    }

    const nomeServico = String(servico.name || "").toLowerCase();
    const unitServico = String(servico.unit || "").toUpperCase();
    const sugerirDesligarRateio =
      nomeServico.includes("limpeza") ||
      nomeServico.includes("mobiliz") ||
      nomeServico.includes("desmobil") ||
      unitServico === "VB";

    setShowRateioHint(sugerirDesligarRateio && item.rateiaIndireto !== false);
  }, [item.serviceId, item.rateiaIndireto, services]);

  useEffect(() => {
    setSugestaoDispensada(null);
  }, [item.serviceId]);

  const fatorEmpolamentoPadrao = normalizeFatorEmpolamento(params?.fator_empolamento, 1.36);

  const volumeInSituItem = toNumber(item.volumeInSitu) || toNumber(item.quantity) || 0;
  const fatorEmpolamentoInfo = resolveFatorEmpolamento(item.fatorEmpolamento || fatorEmpolamentoPadrao, fatorEmpolamentoPadrao);
  const fatorEmpolamentoItem = fatorEmpolamentoInfo.value;
  const volumeEmpoladoItem = calcVolumeComEmpolamento(volumeInSituItem, fatorEmpolamentoItem);

  const volumeInSituPorViagem = toNumber(item.volumeInSituPorViagem) || 0;
  const volumeEmpoladoPorViagem = calcVolumeComEmpolamento(volumeInSituPorViagem, fatorEmpolamentoItem);

  const volumesAterro = getVolumesAterro(item, params);

  const setFatorEmpolamento = (value) => {
    const parsed = toNumber(value);
    setField(
      "fatorEmpolamento",
      Number.isFinite(parsed) ? normalizeFatorEmpolamento(parsed, fatorEmpolamentoPadrao) : 0
    );
  };

  const setFatorEmpolamentoAterro = (value) => {
    const parsed = toNumber(value);
    setField(
      "fatorEmpolamentoAterro",
      Number.isFinite(parsed) ? normalizeFatorEmpolamento(parsed, fatorEmpolamentoPadrao) : 0
    );
  };

  const hasCalculation =
    isVB
      ? (item.manualCost || 0) > 0
      : usaPrecoCravado
        ? (item.precoUnitCravado || 0) > 0 && (item.quantity || 0) > 0
      : usaPrecoMercado
        ? precoUnitarioMercado > 0 && volumeInSituItem > 0
      : (item.equipmentLines.length > 0 || (item.manualCost || 0) > 0) && item.adjustedProductivity > 0;

  const soilOptions = [
    { value: "1ª", label: "1ª Categoria (Normal)" },
    { value: "2ª", label: "2ª Categoria (Duro)" },
    { value: "3ª", label: "3ª Categoria (Rocha)" },
  ];

  // Determinar cor do painel de calibragem
  const getCalibrationPanelStyle = () => {
    if (!calibracao?.temReferencia) return null;
    if (calibracao.status === "ok") return calibrationStyles.ok;
    if (calibracao.status.includes("erro") || calibracao.status.includes("preco_alto")) return calibrationStyles.erro;
    return calibrationStyles.alerta;
  };

  return (
    <div className="card" style={{ padding: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ color: S.accent, fontWeight: 700 }}>Item {index + 1}</span>
          {item.category && (
            <span style={{
              fontSize: 10,
              fontWeight: 600,
              padding: "2px 8px",
              borderRadius: 4,
              background: "rgba(59, 130, 246, 0.15)",
              color: S.accent2,
            }}>
              {item.category}
            </span>
          )}
          {item.derivadoDe && (
            <Badge color={S.accent2}>
              Derivado · {item.formulaDerivacao || "item pai"}
            </Badge>
          )}
        </div>
        <Button onClick={onDelete} variant="danger" size="sm">
          <Trash2 size={12} />
        </Button>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <Row>
          <Select
            label="Serviço"
            value={item.serviceId}
            onChange={v => setField("serviceId", v)}
            options={serviceOptions}
          />
          <Input
            label={isVB ? "Quantidade" : isAreaItem ? "Área do item" : "Quantidade in situ"}
            value={item.quantity}
            onChange={v => setField("quantity", toNumber(v) || 0)}
            type="number"
            step="0.01"
          />
          <Input
            label="Unidade"
            value={item.unit}
            onChange={v => setField("unit", v)}
          />
          {!isVB && !isAreaItem && (
            <Select
              label="Categoria de Solo"
              value={item.soilCategory || "1ª"}
              onChange={v => setField("soilCategory", v)}
              options={soilOptions}
            />
          )}
        </Row>

        {mostrarSugestaoRelacionado && (
          <div style={{
            padding: 12,
            background: "rgba(70, 130, 180, 0.10)",
            borderLeft: "3px solid rgba(70, 130, 180, 0.6)",
            margin: "2px 0",
            fontSize: 12,
            display: "flex",
            flexDirection: "column",
            gap: 8,
          }}>
            <div style={{ color: S.text }}>
              <strong>Serviço relacionado:</strong>{" "}
              Este item normalmente gera material que precisa ser transportado.
              Deseja adicionar <strong>{servicoRelacionadoPendente}</strong> ao orçamento?
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <Button
                onClick={() => {
                  onAddRelatedService?.(servicoRelacionadoPendente, item);
                  setSugestaoDispensada(servicoRelacionadoPendente);
                }}
                variant="primary"
                size="sm"
              >
                + Adicionar item relacionado
              </Button>
              <Button
                onClick={() => setSugestaoDispensada(servicoRelacionadoPendente)}
                variant="ghost"
                size="sm"
              >
                Dispensar
              </Button>
            </div>
          </div>
        )}

        {item.derivadoDe && (
          <div style={{
            padding: 10,
            background: "rgba(59, 130, 246, 0.08)",
            border: "1px solid rgba(59, 130, 246, 0.22)",
            borderRadius: 6,
            color: S.muted,
            fontSize: 11,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            flexWrap: "wrap",
          }}>
            <span>
              Quantidade calculada automaticamente do item pai
              {item.formulaDerivacao ? ` (${item.formulaDerivacao})` : ""}.
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onUpdate(index, "_unlinkDerivation", true)}
            >
              Desvincular
            </Button>
          </div>
        )}

        {!isVB && !isAreaItem && (
          <Row>
            <Input
              label="Fator Empolamento"
              value={item.fatorEmpolamento || fatorEmpolamentoItem}
              onChange={setFatorEmpolamento}
              type="number"
              step="0.01"
              min="1"
            />
            <div style={{
              fontSize: 11,
              color: fatorEmpolamentoInfo.status === "converted" ? "#f59e0b" : S.muted,
              alignSelf: "end",
              paddingBottom: 4
            }}>
              {fatorEmpolamentoInfo.status === "converted"
                ? `${fmt(fatorEmpolamentoInfo.raw, 2)} convertido para ${fmt(fatorEmpolamentoItem, 2)}x.`
                : "Use multiplicador: 1,36 = +36%."}
            </div>
            <Input
              label="Volume empolado (m³)"
              value={volumeEmpoladoItem > 0 ? volumeEmpoladoItem.toFixed(2) : ""}
              onChange={() => { }}
              readOnly
              placeholder="Quantidade in situ × fator"
            />
            <Input
              label="Volume in situ por viagem"
              value={item.volumeInSituPorViagem || ""}
              onChange={v => setField("volumeInSituPorViagem", toNumber(v) || 0)}
              type="number"
              step="0.01"
              min="0"
            />
            <Input
              label="Volume empolado por viagem"
              value={volumeEmpoladoPorViagem > 0 ? volumeEmpoladoPorViagem.toFixed(2) : ""}
              onChange={() => { }}
              readOnly
            />
          </Row>
        )}

        {!isVB && !isAreaItem && (
          <Row>
            <Input
              label="Volume de aterro in situ (m³)"
              value={item.volumeAterroInSitu || ""}
              onChange={v => setField("volumeAterroInSitu", toNumber(v) || 0)}
              type="number"
              step="0.01"
              min="0"
              placeholder="Ex: 511262.56"
            />
            <Input
              label="Fator empolamento aterro"
              value={item.fatorEmpolamentoAterro || volumesAterro.fatorEmpolamentoAterro}
              onChange={setFatorEmpolamentoAterro}
              type="number"
              step="0.01"
              min="1"
              placeholder="Ex: 1.36"
            />
            <Input
              label="Volume aterro empolado (m³)"
              value={volumesAterro.volumeAterroEmpolado > 0 ? volumesAterro.volumeAterroEmpolado.toFixed(2) : ""}
              onChange={() => { }}
              readOnly
              placeholder="Aterro in situ × fator"
            />
            <Input
              label="Volume transporte (m³)"
              value={item.volumeTransporte || ""}
              onChange={v => setField("volumeTransporte", toNumber(v) || 0)}
              type="number"
              step="0.01"
              min="0"
              placeholder="Opcional"
            />
          </Row>
        )}

        {!isVB && usaComposicaoTecnica && (
          <Row>
            <div>
              <Input
                label="Produtividade Informada"
                value={item.adjustedProductivity || ""}
                onChange={v => setField("adjustedProductivity", parseFloat(v) || 0)}
                type="number"
                step="0.01"
                min="0"
              />
              {(!(item.adjustedProductivity > 0) || isNaN(item.adjustedProductivity)) ? (
                <div style={{ fontSize: 11, color: "#ef4444", marginTop: 4, fontWeight: 600 }}>
                  ⚠ Informe uma produtividade válida
                </div>
              ) : (
                <div style={{ fontSize: 11, color: S.muted, marginTop: 4 }}>
                  Produtividade Real:{" "}
                  <strong style={{ color: S.text }}>{fmt(produtividade_utilizada)} {item.unit}/h</strong>
                  {" "}
                  <span style={{ color: S.muted }}>
                    (ef. {fmt(item.terrainFactor || 1, 2)}
                    {(item.soilCategory && item.soilCategory !== "1ª") ? ` × solo ${item.soilCategory}` : ""})
                  </span>
                </div>
              )}
            </div>
            {isAreaItem && (
              <Select
                label="Produtividade em"
                value={item.produtividadeUnidade || "hora"}
                onChange={v => setField("produtividadeUnidade", v)}
                options={[
                  { value: "hora", label: `${item.unit}/h` },
                  { value: "dia", label: `${item.unit}/dia` },
                ]}
              />
            )}
            {isAreaItem && (
              <Select
                label="Modo de prazo"
                value={item.modoCalculoPrazoItem || "automatico"}
                onChange={v => setField("modoCalculoPrazoItem", v)}
                options={[
                  { value: "automatico", label: "Automático por produtividade" },
                  { value: "manual", label: "Manual por prazo" },
                ]}
              />
            )}
            {isAreaItem && item.modoCalculoPrazoItem === "manual" && (
              <Input
                label="Prazo do item (dias úteis)"
                value={item.prazoDiasUteisItem || ""}
                onChange={v => setField("prazoDiasUteisItem", toNumber(v) || 0)}
                type="number"
                step="0.01"
                min="0"
              />
            )}
            {isAreaItem && (
              <Input
                label="Horas/dia do item"
                value={item.horasDiaItem || ""}
                onChange={v => setField("horasDiaItem", toNumber(v) || 0)}
                type="number"
                step="0.5"
                min="0"
                placeholder="Ex: 9"
              />
            )}
            <Input
              label="Distância Real DMT (km)"
              value={item.dmtDistance || ""}
              onChange={v => setField("dmtDistance", parseFloat(v) || 0)}
              type="number"
              step="0.1"
              min="0"
              placeholder="Apenas para transporte"
            />
            <Input
              label="Fator Eficiência (0–1)"
              value={item.terrainFactor}
              onChange={v => setField("terrainFactor", v)}
              type="number"
              step="0.01"
              min="0.1"
            />
            <Input
              label="Fator Logística"
              value={item.fatorLogistica || ""}
              onChange={v => setField("fatorLogistica", parseFloat(v) || 1)}
              type="number"
              step="0.01"
              min="0.1"
              placeholder="Ex: 0.9"
            />
            <Select
              label="Manutenção usa"
              value={item.manutencaoHorasBase || (isAreaItem ? "item" : "projeto")}
              onChange={v => setField("manutencaoHorasBase", v)}
              options={[
                { value: "item", label: "Execução do item" },
                { value: "maquina", label: "Horas-máquina" },
                { value: "projeto", label: "Horas-projeto" },
                { value: "manual", label: "Horas manuais" },
                { value: "fixo", label: "Valor fixo" },
              ]}
            />
            <Select
              label="Mão de obra usa"
              value={item.maoObraHorasBase || (isAreaItem ? "item" : "projeto")}
              onChange={v => setField("maoObraHorasBase", v)}
              options={[
                { value: "item", label: "Execução do item" },
                { value: "maquina", label: "Horas-máquina" },
                { value: "projeto", label: "Horas-projeto" },
                { value: "manual", label: "Horas manuais" },
                { value: "fixo", label: "Valor fixo" },
              ]}
            />
          </Row>
        )}

        <Row>
          <Select
            label="Modo de preço"
            value={modoPreco}
            onChange={v => setField("modoPreco", v)}
            options={[
              { value: "tecnico", label: "Composição técnica (custo + markup)" },
              ...(isAreaItem ? [{ value: "mercado", label: "Preço de mercado (área)" }] : []),
              { value: "preco_cravado", label: "Preço cravado de mercado (R$/un fixo)" },
            ]}
          />
          {modoPreco === "mercado" && isAreaItem && (
            <Input
              label={`Preço de mercado (R$/${item.unit || "m²"})`}
              value={item.precoUnitarioMercado || ""}
              onChange={v => setField("precoUnitarioMercado", toNumber(v) || 0)}
              type="number"
              step="0.01"
              min="0"
              placeholder="Ex: 1.10"
              hint="Área × preço informado, sem diesel, manutenção, mão de obra, indiretos ou markup."
            />
          )}
          {usaComposicaoTecnica && (
            <Select
              label="Modelo de horas-mÃ¡quina"
              value={modeloHorasMaquinaEfetivo}
              onChange={v => setField("modeloHorasMaquina", v)}
              options={[
                { value: "proprio", label: "PrÃ³prio do item" },
                { value: "global_obra", label: "Global da obra" },
              ]}
            />
          )}
        </Row>

        {usaComposicaoTecnica && modeloHorasMaquinaEfetivo === "global_obra" && (
          <div style={{
            fontSize: 11,
            color: S.muted,
            padding: "6px 10px",
            background: "rgba(70, 130, 180, 0.08)",
            borderLeft: "3px solid rgba(70, 130, 180, 0.6)",
          }}>
            <strong style={{ color: S.text }}>Modelo planilha RONMA:</strong>{" "}
            o diesel deste item usa as horas globais das escavadeiras da obra
            (volume de escavaÃ§Ã£o dividido pela produÃ§Ã£o das escavadeiras).
            ManutenÃ§Ã£o e mÃ£o de obra continuam seguindo as bases selecionadas no item.
          </div>
        )}

        {usaPrecoCravado && (
          <div style={{
            padding: 12,
            background: "rgba(50, 100, 50, 0.08)",
            borderLeft: "3px solid rgba(80, 160, 80, 0.6)",
            marginTop: 4,
            display: "flex",
            flexDirection: "column",
            gap: 8,
          }}>
            <div style={{ fontSize: 11, color: "#9b9" }}>
              📌 Modo preço cravado: o item será cobrado como
              {" "}<strong>qty × preço unitário</strong>, sem composição técnica,
              sem markup automático, sem indireto rateado. Use para serviços
              de mercado consagrado (limpeza, mobilização, transporte DMT
              curto, frete agregado simples).
            </div>
            <Row>
              <Input
                label={`Preço unitário cravado (R$/${item.unit || "un"})`}
                value={item.precoUnitCravado || ""}
                onChange={v => setField("precoUnitCravado", parseFloat(v) || 0)}
                type="number"
                step="0.01"
                min="0"
                placeholder="Ex: 1.10"
              />
              <Input
                label="Fonte do preço (justificativa)"
                value={item.fontePrecoCravado || ""}
                onChange={v => setField("fontePrecoCravado", v)}
                type="text"
                placeholder="Ex: Cotação mercado 2024, SINAPI ref XX, histórico obra Y"
              />
            </Row>
            {(item.precoUnitCravado || 0) > 0 && (
              <div style={{ fontSize: 12, color: "#bbb" }}>
                Total: <b style={{ color: S.text }}>{fmtBRL((item.quantity || 0) * (item.precoUnitCravado || 0))}</b>
                {" "}({fmt(item.quantity || 0, 2)} × R$ {fmt(item.precoUnitCravado || 0, 4)})
              </div>
            )}
            {!item.fontePrecoCravado && (item.precoUnitCravado || 0) > 0 && (
              <div style={{ fontSize: 11, color: "#f59e0b", fontWeight: 600 }}>
                ⚠ Sem fonte registrada. Adicione justificativa para auditoria futura.
              </div>
            )}
            {(() => {
              const svc = services.find(s => s.id === item.serviceId);
              const ref = svc && getReferenciaPrecoMercado(svc.name);
              if (!ref || ref.minR$ == null) return null;
              const p = toNumber(item.precoUnitCravado);
              const foraMin = p > 0 && p < ref.minR$;
              const foraMax = p > 0 && p > ref.maxR$;
              return (
                <div style={{ fontSize: 11, color: S.muted, marginTop: 4 }}>
                  💡 Referência de mercado: R$ {ref.minR$.toFixed(2)} a R$ {ref.maxR$.toFixed(2)}
                  {ref.medioR$ != null && <> (médio: R$ {ref.medioR$.toFixed(2)})</>}.
                  {foraMin && <span style={{ color: "#f59e0b" }}> ⚠ Abaixo do mínimo.</span>}
                  {foraMax && <span style={{ color: "#f59e0b" }}> ⚠ Acima do máximo.</span>}
                </div>
              );
            })()}
          </div>
        )}

        {!isVB && usaComposicaoTecnica && (
          <Row>
            {item.manutencaoHorasBase === "manual" && (
              <Input label="Horas manuais manutenção" value={item.manutencaoHorasManual || ""} onChange={v => setField("manutencaoHorasManual", toNumber(v) || 0)} type="number" step="0.01" min="0" />
            )}
            {item.manutencaoHorasBase === "fixo" && (
              <Input label="Valor fixo manutenção (R$)" value={item.manutencaoValorFixo || ""} onChange={v => setField("manutencaoValorFixo", toNumber(v) || 0)} type="number" step="0.01" min="0" />
            )}
            {item.maoObraHorasBase === "manual" && (
              <Input label="Horas manuais mão de obra" value={item.maoObraHorasManual || ""} onChange={v => setField("maoObraHorasManual", toNumber(v) || 0)} type="number" step="0.01" min="0" />
            )}
            {item.maoObraHorasBase === "fixo" && (
              <Input label="Valor fixo mão de obra (R$)" value={item.maoObraValorFixo || ""} onChange={v => setField("maoObraValorFixo", toNumber(v) || 0)} type="number" step="0.01" min="0" />
            )}
          </Row>
        )}

        {usaComposicaoTecnica && (
        <Input
          label={isVB ? "Valor da Verba (R$)" : "Custo Manual / Equipe (R$/h)"}
          value={item.manualCost || ""}
          onChange={v => setField("manualCost", parseFloat(v) || 0)}
          type="number"
          step="0.01"
          min="0"
          placeholder={isVB ? "Valor total da verba em R$" : "0,00 — deixe em branco se usar apenas equipamentos"}
        />
        )}

        {!isVB && usaComposicaoTecnica && (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <label style={{ fontSize: 12, color: S.muted, display: "flex", alignItems: "center", gap: 8 }}>
              <input
                type="checkbox"
                checked={item.rateiaIndireto !== false}
                onChange={e => setField("rateiaIndireto", e.target.checked)}
              />
              <span>
                Ratear custos indiretos da obra neste item
                <span style={{ color: S.muted, marginLeft: 6 }}>
                  (desmarcar para itens com preço de mercado consagrado)
                </span>
              </span>
            </label>
            {showRateioHint && (
              <div style={{ fontSize: 11, color: "#f59e0b", fontWeight: 600 }}>
                Este serviço normalmente tem preço de mercado e pode não ratear indireto. Considere desmarcar.
              </div>
            )}
          </div>
        )}

        {!isVB && usaComposicaoTecnica && (
          <Row>
            <Select
              label="Base dos indiretos"
              value={item.indiretoBase || "area"}
              onChange={v => setField("indiretoBase", v)}
              options={[
                { value: "area", label: "Rateio por área/quantidade" },
                { value: "horas_projeto", label: "Rateio por horas-projeto" },
                { value: "fixo", label: "Valor fixo" },
                { value: "percentual_direto", label: "% sobre custo direto" },
                { value: "mensal_prazo", label: "Custo mensal × prazo" },
              ]}
            />
            {item.indiretoBase === "fixo" && (
              <Input label="Indireto fixo (R$)" value={item.indiretoValorFixo || ""} onChange={v => setField("indiretoValorFixo", toNumber(v) || 0)} type="number" step="0.01" min="0" />
            )}
            {item.indiretoBase === "percentual_direto" && (
              <Input label="Indireto sobre direto (%)" value={item.indiretoPercentualDireto || ""} onChange={v => setField("indiretoPercentualDireto", toNumber(v) || 0)} type="number" step="0.01" min="0" />
            )}
            {item.indiretoBase === "mensal_prazo" && (
              <Input label="Indireto mensal (R$)" value={item.indiretoMensal || ""} onChange={v => setField("indiretoMensal", toNumber(v) || 0)} type="number" step="0.01" min="0" />
            )}
            <Input
              label="Markup do item"
              value={item.markup || ""}
              onChange={v => setField("markup", toNumber(v) || 0)}
              type="number"
              step="0.01"
              min="0"
              placeholder="Ex: 1.10"
            />
          </Row>
        )}

        {!isVB && usaComposicaoTecnica && (
          <EquipmentSelector
            equipmentLines={item.equipmentLines}
            equipmentOptions={equipmentOptions}
            equipmentMap={equipmentMap}
            params={params}
            onAdd={() =>
              onUpdate(index, "_addEqLine", { id: uid(), equipmentId: "", quantity: 1 })
            }
            onChange={(ei, k, v) => onUpdate(index, "_setEqLine", { ei, k, v })}
            onDelete={ei => onUpdate(index, "_delEqLine", ei)}
          />
        )}

        {!isVB && usaComposicaoTecnica && !isAreaItem && (
          <TransporteAgregadoBlock
            item={item}
            params={params}
            onSet={(k, v) => onUpdate(index, "_setTransporteAgregado", { k, v })}
          />
        )}

        {hasCalculation && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 8 }}>
            {!isVB && status !== "ok" && (
              <div style={{ padding: "8px 12px", background: "#ffeeba", color: "#856404", borderRadius: 4, fontSize: 13, fontWeight: 600 }}>
                ⚠️ Atenção:{" "}
                {status === "alerta"
                  ? "Risco de Prejuízo Operacional (Produtividade/Eficiência baixa)"
                  : status === "produtividade_invalida"
                    ? "Informe uma produtividade válida para calcular o custo"
                    : status}
              </div>
            )}

            {!isVB && divergencia && (
              <div style={{ padding: "8px 12px", background: "rgba(239, 68, 68, 0.10)", color: "#fecaca", borderRadius: 6, fontSize: 12, fontWeight: 700, border: "1px solid rgba(239, 68, 68, 0.35)" }}>
                Divergência vs planilha (&gt; {divergencia.limitePct}%):
                {" "}
                {divergencia.diffCostPct != null && (
                  <span>Custo {fmt(divergencia.diffCostPct)}%</span>
                )}
                {divergencia.diffCostPct != null && divergencia.diffPricePct != null ? " | " : ""}
                {divergencia.diffPricePct != null && (
                  <span>Preço {fmt(divergencia.diffPricePct)}%</span>
                )}
              </div>
            )}

            {/* ── Barra de Custo/Preço ── */}
            <div className="cost-bar" style={{ display: "flex", flexWrap: "wrap", gap: 16 }}>
              {usaPrecoCravado ? (
                <>
                  <span className="cost-bar__item">
                    📌 Preço cravado: <b style={{ color: S.text }}>{fmtBRL(preco_unitario)}/{item.unit}</b>
                  </span>
                  <span className="cost-bar__item">
                    Total: <b style={{ color: S.accent3 }}>{fmtBRL(total_item)}</b>
                  </span>
                  {item.fontePrecoCravado && (
                    <span className="cost-bar__item" style={{ color: S.muted, marginLeft: "auto" }}>
                      Fonte: {item.fontePrecoCravado}
                    </span>
                  )}
                </>
              ) : isVB ? (
                <>
                  <span className="cost-bar__item">
                    Verba Unitária: <b style={{ color: S.text }}>{fmtBRL(custo_unitario)}</b>
                  </span>
                  <span className="cost-bar__item" style={{ marginLeft: "auto" }}>
                    Total VB: <b style={{ color: S.accent }}>{fmtBRL(total_item)}</b>
                  </span>
                </>
              ) : (
                <>
                  <span className="cost-bar__item">
                    Custo {item.unit}: <b style={{ color: S.text }}>{fmtBRL(custo_unitario)}</b>
                  </span>
                  <span className="cost-bar__item">
                    Preço Unitário: <b style={{ color: S.accent }}>{fmtBRL(preco_unitario)}</b>
                  </span>
                  <span className="cost-bar__item">
                    Fator total: <b style={{ color: S.accent2 }}>{fmt(markup_aplicado)}×</b>
                  </span>
                  <span className="cost-bar__item">
                    Lucro Unid: <b style={{ color: S.accent3 }}>{fmtBRL(lucro_unitario)} ({fmt(margem_percentual)}%)</b>
                  </span>
                  <span className="cost-bar__item" style={{ marginLeft: "auto" }}>
                    Total do Item: <b style={{ color: S.text }}>{fmtBRL(total_item)}</b>
                  </span>
                </>
              )}
            </div>

            {!isVB && (
              <div style={{ display: "flex", justifyContent: "flex-end" }}>
                <Button onClick={() => setPanelOpen(true)} variant="primary" size="sm">
                  🔍 Abrir Painel de Composição
                </Button>
              </div>
            )}

            {!isVB && panelOpen && (
              <PainelComposicaoItem
                item={item}
                result={result}
                paramsDoOrcamento={params}
                volumeEmpoladoObra={volumeEmpoladoObra}
                totalHorasProjeto={totalHorasProjeto}
                onClose={() => setPanelOpen(false)}
              />
            )}

            {/* ══ PAINEL DE CALIBRAGEM RONMA ══ */}
            {calibracao?.temReferencia && (
              <div style={{ ...calibrationStyles.panel, ...getCalibrationPanelStyle() }}>
                {/* Header do painel */}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    {calibracao.status === "ok" ? (
                      <CheckCircle size={14} style={{ color: S.accent3 }} />
                    ) : (
                      <AlertTriangle size={14} style={{ color: "#f59e0b" }} />
                    )}
                    <span style={{ fontWeight: 700, fontSize: 12, color: calibracao.status === "ok" ? S.accent3 : "#f59e0b" }}>
                      {calibracao.isGeneric ? "ANÁLISE DE REFERÊNCIA" : "CALIBRAGEM RONMA"}
                    </span>
                  </div>
                  <div style={{ display: "flex", gap: 6 }}>
                    <span style={calibrationStyles.badge(calibracao.custo_dentro_faixa ? S.accent3 : "#f59e0b")}>
                      Custo {calibracao.custo_dentro_faixa ? "OK" : "⚠"}
                    </span>
                    <span style={calibrationStyles.badge(calibracao.preco_dentro_faixa ? S.accent3 : "#f59e0b")}>
                      Preço {calibracao.preco_dentro_faixa ? "OK" : "⚠"}
                    </span>
                    <span style={calibrationStyles.badge(
                      calibracao.markup_classificacao === "padrao" ? S.accent3
                        : calibracao.markup_classificacao === "conservador" ? S.accent2
                          : "#f59e0b"
                    )}>
                      Markup {fmt(calibracao.markup_real)}×
                    </span>
                  </div>
                </div>

                {/* Barras visuais */}
                <CalibrationBar
                  valor={custo_unitario}
                  faixa={calibracao.faixa_referencia.faixa_custo}
                  label={`Custo /${calibracao.faixa_referencia.unidade}`}
                  cor="#f59e0b"
                />
                <CalibrationBar
                  valor={preco_unitario}
                  faixa={calibracao.faixa_referencia.faixa_preco}
                  label={`Preço /${calibracao.faixa_referencia.unidade}`}
                  cor={S.accent2}
                />

                {/* Mensagem e sugestão */}
                <div style={{ fontSize: 12, marginTop: 6, color: S.text }}>
                  {calibracao.mensagem}
                </div>

                {calibracao.produtividade_sugerida && calibracao.status !== "ok" && (
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 8, fontSize: 12, color: S.accent2 }}>
                    <Target size={13} />
                    <span>
                      Produtividade sugerida: <strong>{fmt(calibracao.produtividade_sugerida)} {item.unit}/h</strong>
                      {" "}(atual: {fmt(produtividade_utilizada)})
                    </span>
                  </div>
                )}

                {/* Faixa de produtividade */}
                {calibracao.faixa_referencia.produtividade && (
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4, fontSize: 11, color: S.muted }}>
                    <TrendingUp size={11} />
                    <span>
                      Faixa de referência: {calibracao.faixa_referencia.produtividade.min}–{calibracao.faixa_referencia.produtividade.max} {calibracao.faixa_referencia.unidade}/h
                      {" | "}Eficiência: {calibracao.faixa_referencia.eficiencia.min}–{calibracao.faixa_referencia.eficiencia.max}
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────
// TransporteAgregadoBlock — composição de caminhão truck / frete.
// Não é equipamento operacional; entra como linha separada baseada em
// volume por viagem × valor do frete (por viagem ou por m³).
// ──────────────────────────────────────────────────────────────────
function TransporteAgregadoBlock({ item, params, onSet }) {
  const t = { ...TRANSPORTE_AGREGADO_DEFAULT, ...(item.transporteAgregado || {}) };
  const enabled = !!t.enabled;
  const calc = calcTransporteAgregado(item, params);

  const blockStyle = {
    marginTop: 4,
    padding: 14,
    border: `1px solid ${enabled ? "rgba(59, 130, 246, 0.45)" : "rgba(255,255,255,0.10)"}`,
    background: enabled ? "rgba(59, 130, 246, 0.06)" : "rgba(255,255,255,0.02)",
    borderRadius: 8,
    display: "flex",
    flexDirection: "column",
    gap: 10,
  };

  const labelInput = {
    fontSize: 11,
    color: S.muted,
    textTransform: "uppercase",
    fontWeight: 700,
    letterSpacing: 0.4,
  };

  const valueChip = {
    fontFamily: "monospace",
    fontSize: 12,
    fontWeight: 700,
    color: S.text,
    background: "rgba(0,0,0,0.25)",
    padding: "2px 8px",
    borderRadius: 4,
  };

  return (
    <div style={blockStyle}>
      <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", fontWeight: 700, color: S.text }}>
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => onSet("enabled", e.target.checked)}
        />
        🚚 Transporte Agregado / Caminhão Truck
        <span style={{ fontWeight: 500, fontSize: 11, color: S.muted, marginLeft: 6 }}>
          (frete por viagem ou por m³ — sem diesel/manut/operador próprios)
        </span>
      </label>

      {enabled && (
        <>
          <Row>
            <Input
              label="Descrição"
              value={t.descricao}
              onChange={(v) => onSet("descricao", v)}
            />
            <Input
              label="DMT (km)"
              value={t.dmtKm}
              onChange={(v) => onSet("dmtKm", v)}
              type="text"
              placeholder="0,00"
            />
            <Input
              label="Volume base de transporte"
              value={t.volumeBaseTransporte}
              onChange={(v) => onSet("volumeBaseTransporte", v)}
              type="text"
              placeholder="0,00"
            />
            <Select
              label="Tipo do volume base"
              value={t.tipoVolumeBase || t.volumeBaseTipo}
              onChange={(v) => onSet("tipoVolumeBase", v)}
              options={[
                { value: "in_situ", label: "In situ (volume no solo)" },
                { value: "empolado", label: "Empolado (volume após escavação)" },
              ]}
            />
          </Row>

          <Row>
            <Input
              label="Volume in situ por viagem (m³)"
              value={t.volumeInSituPorViagem}
              onChange={(v) => onSet("volumeInSituPorViagem", v)}
              type="text"
              placeholder="0,00"
            />
            <Input
              label="Acréscimo comercial empolamento (%)"
              value={t.acrescimoFreteEmpolamentoPct ?? t.fatorEmpolamentoTransporte}
              onChange={(v) => onSet("acrescimoFreteEmpolamentoPct", v)}
              type="text"
              placeholder="ex: 40 para 40%"
            />
            <Input
              label="Perda no carregamento (%)"
              value={t.perdaCarregamentoPct}
              onChange={(v) => onSet("perdaCarregamentoPct", v)}
              type="text"
              placeholder="ex: 10 para 10%"
            />
          </Row>

          <Row>
            <Select
              label="Modo do frete"
              value={t.modoFrete}
              onChange={(v) => onSet("modoFrete", v)}
              options={[
                { value: "por_viagem", label: "Por viagem (R$/viagem × Σ viagens)" },
                { value: "por_m3_in_situ", label: "Por m³ in situ (simples)" },
                { value: "por_m3_empolado", label: "Por m³ empolado (simples)" },
                { value: "planilha_m3_empolado", label: "Por m³ (planilha — frete × (1 + empol + perda))" },
              ]}
            />
            <Input
              label={t.modoFrete && t.modoFrete.includes("por_m3") ? "Valor do frete (R$/m³)" : "Valor do frete (R$/viagem)"}
              value={t.valorFreteBase ?? t.valorFretePorM3OuViagem}
              onChange={(v) => onSet("valorFreteBase", v)}
              type="text"
              placeholder="0,00"
            />
            <Input
              label="Markup transporte (×)"
              hint="Ex.: 1,99 = 99% de margem. Valor 1,00 = sem markup (nao recomendado)."
              value={t.markupTransporte}
              onChange={(v) => onSet("markupTransporte", v)}
              type="number"
              step="0.01"
              min="0"
              placeholder="1,99"
            />
          </Row>

          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
            gap: 8,
            padding: 10,
            background: "rgba(0,0,0,0.18)",
            borderRadius: 6,
          }}>
            <Computed label="Volume empolado total" valor={`${fmt(calc.volumeEmpoladoTotal, 2)} m³`} labelStyle={labelInput} valueStyle={valueChip} />
            <Computed label="Custo unitário empolado" valor={`${fmtBRL(calc.custoUnitarioEmpolado)} / m³`} labelStyle={labelInput} valueStyle={valueChip} />
            <Computed label="Custo total frete" valor={fmtBRL(calc.custoTotalFrete)} labelStyle={labelInput} valueStyle={valueChip} />
            <Computed label="Custo equivalente in situ" valor={`${fmtBRL(calc.custoUnitarioInSitu)} / m³`} labelStyle={labelInput} valueStyle={valueChip} />
            <Computed label="Preço unitário in situ" valor={`${fmtBRL(calc.precoUnitarioInSitu)} / m³`} labelStyle={labelInput} valueStyle={valueChip} />
            <Computed label="Total venda transporte" valor={fmtBRL(calc.totalVendaTransporte)} labelStyle={labelInput} valueStyle={valueChip} />
          </div>

          {calc.modoFrete === "planilha_m3_empolado" && (
            <div style={{
              marginTop: 10,
              padding: 12,
              background: "rgba(0,0,0,0.25)",
              borderRadius: 6,
              fontSize: 12,
              fontFamily: "monospace",
              color: S.text,
              borderLeft: `4px solid ${S.accent}`,
              lineHeight: 1.4,
            }}>
              <div style={{ fontWeight: 700, marginBottom: 8, color: S.accent, textTransform: "uppercase", fontSize: 10 }}>
                Decomposição Modo Planilha (RONMA)
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: "2px 20px" }}>
                <span>Frete base</span>
                <span>{fmtBRL(calc.freteBaseUnitario)}/m³ empolado</span>

                <span>+ Acréscimo por empolamento ({fmt(calc.acrescimoEmpolamentoPct * 100, 0)}%)</span>
                <span>{fmtBRL(calc.acrescimoEmpolamentoUnitario)}/m³</span>

                <span>+ Acréscimo por perda ({fmt(calc.acrescimoPerdaPct * 100, 0)}%)</span>
                <span>{fmtBRL(calc.acrescimoPerdaUnitario)}/m³</span>

                <div style={{ gridColumn: "span 2", borderBottom: "1px solid rgba(255,255,255,0.1)", margin: "4px 0" }} />

                <span style={{ fontWeight: 700 }}>= Custo total por m³ empolado</span>
                <span style={{ fontWeight: 700 }}>{fmtBRL(calc.custoUnitarioEmpolado)}/m³</span>

                <span>× Volume empolado total</span>
                <span>× {fmt(calc.volumeEmpoladoTotal, 2)} m³</span>

                <div style={{ gridColumn: "span 2", borderBottom: "1px solid rgba(255,255,255,0.25)", margin: "4px 0", height: 2, borderTop: "1px solid rgba(255,255,255,0.25)" }} />

                <span style={{ fontWeight: 700, color: S.accent3, fontSize: 13 }}>= Custo total frete</span>
                <span style={{ fontWeight: 700, color: S.accent3, fontSize: 13 }}>{fmtBRL(calc.custoTotalFrete)}</span>
                
                <span style={{ color: S.muted }}>Custo equivalente por m³ in situ</span>
                <span style={{ color: S.muted }}>{fmtBRL(calc.custoUnitarioInSitu)}/m³</span>
              </div>
            </div>
          )}

          {calc.validacoes && calc.validacoes.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {calc.validacoes.map((v, i) => (
                <div key={i} style={{
                  padding: "6px 10px",
                  background: v.severidade === "erro" ? "rgba(239, 68, 68, 0.12)" : "rgba(245, 158, 11, 0.12)",
                  color: v.severidade === "erro" ? "#fca5a5" : "#fde68a",
                  borderRadius: 4,
                  fontSize: 11.5,
                  fontWeight: 600,
                }}>
                  {v.severidade === "erro" ? "✕ " : "⚠ "}{v.mensagem}
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function Computed({ label, valor, labelStyle, valueStyle }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
      <span style={labelStyle}>{label}</span>
      <span style={valueStyle}>{valor}</span>
    </div>
  );
}
