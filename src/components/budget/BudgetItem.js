import React, { useState } from "react";
import { Trash2, AlertTriangle, CheckCircle, TrendingUp, Target } from "lucide-react";
import Button from "../ui/Button";
import Input from "../ui/Input";
import Select from "../ui/Select";
import { Row } from "../ui/Card";
import EquipmentSelector from "./EquipmentSelector";
import PainelComposicaoItem from "./PainelComposicaoItem";
import { calcItemCost } from "../../services/costEngine";
import { fmt, fmtBRL, uid } from "../../utils/format";
import S from "../../styles/tokens";

const calcVolumeComEmpolamento = (volume, fator) => {
  const v = parseFloat(volume) || 0;
  const f = parseFloat(fator) || 0;
  if (v <= 0 || f <= 0) return 0;
  return f < 1 ? Math.max(v - (v * f), 0) : v * f;
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
  volumeEmpoladoObra,
  totalHorasProjeto,
  onUpdate,
  onDelete,
}) {
  const [panelOpen, setPanelOpen] = useState(false);
  const result = calcItemCost(item, equipmentMap, params);
  const {
    custo_unitario,
    preco_unitario,
    total_item,
    produtividade_informada,
    produtividade_utilizada,
    lucro_unitario,
    margem_percentual,
    markup_aplicado,
    calibracao,
    status,
    detalhes,
    divergencia,
  } = result;

  const setField = (k, v) => onUpdate(index, k, v);

  const isVB = item.unit === "VB";
  const fatorEmpolamentoPadrao = parseFloat(params?.fator_empolamento) || 1.36;
  const volumeInSituItem = parseFloat(item.volumeInSitu) || parseFloat(item.quantity) || 0;
  const fatorEmpolamentoItem = parseFloat(item.fatorEmpolamento) || fatorEmpolamentoPadrao;
  const volumeEmpoladoItem = calcVolumeComEmpolamento(volumeInSituItem, fatorEmpolamentoItem);
  const volumeInSituPorViagem = parseFloat(item.volumeInSituPorViagem) || 0;
  const volumeEmpoladoPorViagem = calcVolumeComEmpolamento(volumeInSituPorViagem, fatorEmpolamentoItem);

  const hasCalculation =
    isVB
      ? (item.manualCost || 0) > 0
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
              fontSize: 10, fontWeight: 600, padding: "2px 8px", borderRadius: 4,
              background: "rgba(59, 130, 246, 0.15)", color: S.accent2,
            }}>
              {item.category}
            </span>
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
            label={isVB ? "Quantidade" : "Quantidade in situ"}
            value={item.quantity}
            onChange={v => setField("quantity", parseFloat(v) || 0)}
            type="number"
            step="0.01"
          />
          <Input
            label="Unidade"
            value={item.unit}
            onChange={v => setField("unit", v)}
          />
          {!isVB && (
            <Select
              label="Categoria de Solo"
              value={item.soilCategory || "1ª"}
              onChange={v => setField("soilCategory", v)}
              options={soilOptions}
            />
          )}
        </Row>

        {!isVB && (
          <Row>
            <Input
              label="Fator Empolamento"
              value={item.fatorEmpolamento || fatorEmpolamentoItem}
              onChange={v => setField("fatorEmpolamento", parseFloat(v) || 0)}
              type="number"
              step="0.01"
              min="0"
            />
            <Input
              label="Volume empolado (m³)"
              value={volumeEmpoladoItem > 0 ? volumeEmpoladoItem.toFixed(2) : ""}
              onChange={() => {}}
              readOnly
              placeholder="Quantidade in situ × fator"
            />
            <Input
              label="Volume in situ por viagem"
              value={item.volumeInSituPorViagem || ""}
              onChange={v => setField("volumeInSituPorViagem", parseFloat(v) || 0)}
              type="number"
              step="0.01"
              min="0"
            />
            <Input
              label="Volume empolado por viagem"
              value={volumeEmpoladoPorViagem > 0 ? volumeEmpoladoPorViagem.toFixed(2) : ""}
              onChange={() => {}}
              readOnly
            />
          </Row>
        )}

        {!isVB && (
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
          </Row>
        )}

        <Input
          label={isVB ? "Valor da Verba (R$)" : "Custo Manual / Equipe (R$/h)"}
          value={item.manualCost || ""}
          onChange={v => setField("manualCost", parseFloat(v) || 0)}
          type="number"
          step="0.01"
          min="0"
          placeholder={isVB ? "Valor total da verba em R$" : "0,00 — deixe em branco se usar apenas equipamentos"}
        />

        {!isVB && (
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

        {hasCalculation && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
            {!isVB && status !== "ok" && (
              <div style={{ padding: '8px 12px', background: '#ffeeba', color: '#856404', borderRadius: 4, fontSize: 13, fontWeight: 600 }}>
                ⚠️ Atenção:{" "}
                {status === "alerta"
                  ? "Risco de Prejuízo Operacional (Produtividade/Eficiência baixa)"
                  : status === "produtividade_invalida"
                  ? "Informe uma produtividade válida para calcular o custo"
                  : status}
              </div>
            )}

            {!isVB && divergencia && (
              <div style={{ padding: '8px 12px', background: 'rgba(239, 68, 68, 0.10)', color: '#fecaca', borderRadius: 6, fontSize: 12, fontWeight: 700, border: '1px solid rgba(239, 68, 68, 0.35)' }}>
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
            <div className="cost-bar" style={{ display: 'flex', flexWrap: 'wrap', gap: 16 }}>
              {isVB ? (
                <>
                  <span className="cost-bar__item">
                    Verba Unitária: <b style={{ color: S.text }}>{fmtBRL(custo_unitario)}</b>
                  </span>
                  <span className="cost-bar__item" style={{ marginLeft: 'auto' }}>
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
                  <span className="cost-bar__item" style={{ marginLeft: 'auto' }}>
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
