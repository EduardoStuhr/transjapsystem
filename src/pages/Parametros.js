import React, { useState } from "react";
import { Save } from "lucide-react";
import Button from "../components/ui/Button";
import Input from "../components/ui/Input";
import { Row, SectionTitle } from "../components/ui/Card";
import { fmt, fmtBRL } from "../utils/format";
import { MARKUP_PROFILES } from "../data/calibrationRanges";
import S from "../styles/tokens";

export default function Parametros({ params, setParams }) {
  const [local, setLocal] = useState({ ...params });
  const set  = (k, v) => setLocal(p => ({ ...p, [k]: parseFloat(v) || 0 }));
  const save = () => setParams(local);

  // Preview do modelo de indireto (sem mock — calculado dos próprios campos)
  const indiretoTotalMensal =
    (parseFloat(local.indiretos_admin_mensal) || 0) +
    (parseFloat(local.indiretos_alojamento_mensal) || 0) +
    (parseFloat(local.indiretos_alimentacao_mensal) || 0) +
    (parseFloat(local.indiretos_vigilancia_mensal) || 0) +
    (parseFloat(local.indiretos_outros_mensal) || 0);
  const horasObraMes = (parseFloat(local.dias_obra_mes) || 0) * (parseFloat(local.hoursPerDay) || 0);
  const indiretoHora = horasObraMes > 0 ? indiretoTotalMensal / horasObraMes : 0;
  const modoIndireto = (indiretoTotalMensal > 0 && horasObraMes > 0) ? "absoluto" : "percentual (legado)";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <h1 className="page-title">Parâmetros Globais</h1>

      <div className="card" style={{ padding: 24 }}>
        <SectionTitle>Combustível e Manutenção</SectionTitle>
        <Row>
          <Input label="Preço do Diesel (R$/L)"  value={local.dieselPrice}            onChange={v => set("dieselPrice", v)}            type="number" step="0.01" />
          <Input label="Fator Manutenção (%)"    value={fmt((local.percentual_manutencao || 0.10) * 100)} onChange={v => set("percentual_manutencao", v / 100)} type="number" step="0.1" />
          <Input label="Fator Indiretos legado (%)" value={fmt((local.percentual_indiretos || 0.10) * 100)}  onChange={v => set("percentual_indiretos", v / 100)}  type="number" step="0.01" />
        </Row>
        <p style={{ fontSize: 12, color: S.muted, marginTop: 8 }}>
          O <b>Fator Indiretos legado</b> só é usado quando a estrutura absoluta abaixo está zerada. Quando configurada, o engine rateia o indireto pelo tempo real de obra e produtividade do serviço (sem multiplicar por equipamento).
        </p>
      </div>

      <div className="card" style={{ padding: 24 }}>
        <SectionTitle>Custos Indiretos do Projeto (modo absoluto)</SectionTitle>
        <p style={{ fontSize: 13, color: S.muted, marginBottom: 12 }}>
          Informe os <b>custos mensais reais</b> da estrutura de obra. O sistema rateia automaticamente:
          <code style={{ color: S.accent2, marginLeft: 6 }}>
            indireto/h = total_mensal ÷ (dias_obra × horas/dia)
          </code>
          {" "}e aloca por item via{" "}
          <code style={{ color: S.accent2 }}>indireto_unitário = indireto/h ÷ produtividade_real</code>.
        </p>
        <Row>
          <Input label="Administrativo (R$/mês)" value={local.indiretos_admin_mensal}        onChange={v => set("indiretos_admin_mensal", v)}        type="number" step="50" min="0" />
          <Input label="Alojamento (R$/mês)"     value={local.indiretos_alojamento_mensal}   onChange={v => set("indiretos_alojamento_mensal", v)}   type="number" step="50" min="0" />
          <Input label="Alimentação (R$/mês)"    value={local.indiretos_alimentacao_mensal}  onChange={v => set("indiretos_alimentacao_mensal", v)}  type="number" step="50" min="0" />
        </Row>
        <Row>
          <Input label="Vigilância (R$/mês)" value={local.indiretos_vigilancia_mensal} onChange={v => set("indiretos_vigilancia_mensal", v)} type="number" step="50" min="0" />
          <Input label="Outros (R$/mês)"     value={local.indiretos_outros_mensal}     onChange={v => set("indiretos_outros_mensal", v)}     type="number" step="50" min="0" />
          <Input label="Dias úteis de obra/mês" value={local.dias_obra_mes}            onChange={v => set("dias_obra_mes", v)}              type="number" step="1"  min="1" />
        </Row>
        <div style={{
          marginTop: 12, padding: "10px 12px", borderRadius: 8,
          background: modoIndireto === "absoluto" ? "rgba(59,130,246,0.06)" : "rgba(245,158,11,0.08)",
          border: `1px solid ${modoIndireto === "absoluto" ? "rgba(59,130,246,0.25)" : "rgba(245,158,11,0.25)"}`,
          color: S.text, fontSize: 12.5, display: "flex", flexWrap: "wrap", gap: 16,
        }}>
          <span><b>Modo:</b> <span style={{ color: modoIndireto === "absoluto" ? S.accent2 : "#f59e0b", fontWeight: 700 }}>{modoIndireto}</span></span>
          <span><b>Total/mês:</b> {fmtBRL(indiretoTotalMensal)}</span>
          <span><b>Horas obra/mês:</b> {fmt(horasObraMes, 0)} h</span>
          <span><b>Indireto/h:</b> <span style={{ color: S.accent }}>{fmtBRL(indiretoHora)}/h</span></span>
        </div>
      </div>

      <div className="card" style={{ padding: 24 }}>
        <SectionTitle>Jornada de Trabalho</SectionTitle>
        <Row>
          <Input label="Horas por Dia (h)"  value={local.hoursPerDay}   onChange={v => set("hoursPerDay", v)}   type="number" />
          <Input label="Horas por Mês (h)"  value={local.hoursPerMonth} onChange={v => set("hoursPerMonth", v)} type="number" />
        </Row>
      </div>

      {/* ══ MARKUP PROFISSIONAL (RONMA) ══ */}
      <div className="card" style={{ padding: 24 }}>
        <SectionTitle>Markup Profissional (RONMA)</SectionTitle>
        <p style={{ fontSize: 13, color: S.muted, marginBottom: 16 }}>
          O markup unificado é aplicado sobre o custo unitário para gerar o preço de venda. 
          <strong> Regra de ouro:</strong> nunca ajuste preço direto — ajuste produtividade, eficiência, custo/h e markup.
        </p>
        
        <Row>
          <Input
            label="Markup Padrão (×)"
            value={local.markup_padrao || 1.66}
            onChange={v => set("markup_padrao", v)}
            type="number"
            step="0.01"
            min="1.0"
          />
          <Input label="Fator de Encargos (×)"  value={local.fator_encargos} onChange={v => set("fator_encargos", v)} type="number" step="0.01" />
        </Row>

        {/* Referência rápida de perfis */}
        <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
          {Object.entries(MARKUP_PROFILES).map(([key, profile]) => {
            const isActive = Math.abs((local.markup_padrao || 1.66) - profile.valor) < 0.05;
            return (
              <div
                key={key}
                onClick={() => set("markup_padrao", profile.valor)}
                style={{
                  flex: 1, padding: "12px 14px", borderRadius: 8, cursor: "pointer",
                  background: isActive ? `${S.accent}22` : "rgba(255,255,255,0.03)",
                  border: `1px solid ${isActive ? S.accent : S.border}`,
                  textAlign: "center",
                  transition: "all 0.2s ease",
                }}
              >
                <div style={{ fontSize: 20, fontWeight: 900, color: isActive ? S.accent : S.text }}>{profile.valor}×</div>
                <div style={{ fontSize: 11, fontWeight: 700, color: isActive ? S.accent : S.muted, marginTop: 2 }}>{key.toUpperCase()}</div>
                <div style={{ fontSize: 10, color: S.muted, marginTop: 4 }}>{profile.desc}</div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="card" style={{ padding: 24 }}>
        <SectionTitle>Orçamento e Fiscal</SectionTitle>
        <Row>
          <Input label="BDI Padrão (%)"           value={local.defaultBDI}      onChange={v => set("defaultBDI", v)}      type="number" />
          <Input label="% Mão de Obra (faturamento)"    value={local.laborRatio}     onChange={v => set("laborRatio", v)}     type="number" />
          <Input label="% Equipamentos (faturamento)"   value={local.equipmentRatio} onChange={v => set("equipmentRatio", v)} type="number" />
        </Row>
      </div>

      <div className="card" style={{ padding: 24 }}>
        <SectionTitle>Transporte e Mobilização</SectionTitle>
        <Row>
          <Input label="Velocidade Média Transporte (km/h)" value={local.transportSpeed}       onChange={v => set("transportSpeed", v)}       type="number" />
          <Input label="Tempo Ciclo Base (min)"              value={local.cycleTimeBase}        onChange={v => set("cycleTimeBase", v)}        type="number" />
          <Input label="Custo Prancha (R$/km)"               value={local.flatbedCostPerKm}     onChange={v => set("flatbedCostPerKm", v)}     type="number" step="0.01" />
          <Input label="Distância Mobilização (km)"          value={local.mobilizationDistance}  onChange={v => set("mobilizationDistance", v)}  type="number" />
        </Row>
      </div>

      <div>
        <Button onClick={save} variant="success" size="lg">
          <Save size={16} />Salvar Parâmetros
        </Button>
      </div>
    </div>
  );
}
