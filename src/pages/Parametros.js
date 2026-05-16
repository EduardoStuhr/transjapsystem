import React, { useState } from "react";
import { Save } from "lucide-react";
import Button from "../components/ui/Button";
import Input from "../components/ui/Input";
import { Row, SectionTitle } from "../components/ui/Card";
import { fmt, fmtBRL } from "../utils/format";
import { normalizeFatorEmpolamento } from "../utils/empolamento";
import { MARKUP_PROFILES } from "../data/calibrationRanges";
import { ASSUMPTIONS } from "../config/assumptions.config";
import S from "../styles/tokens";

const OPERADOR_LABEL = {
  operador_escavadeira: "Operador Escavadeira",
  operador_trator: "Operador Trator/Patrol",
  auxiliar: "Auxiliar",
};

const OPERADOR_ALIAS = {
  operador_escavadeira: "Operador Escavadeira",
  operador_trator: "Operador Trator/Patrol",
  auxiliar: "Auxiliar",
};

const PESSOA_INDIRETA_LABEL = {
  topografia: "Topografia",
  laboratorio: "Laboratorio",
  alojamento: "Alojamento",
  vigilancia: "Vigilancia",
};

const cloneBaseMap = (map) =>
  Object.fromEntries(
    Object.entries(map || {}).map(([k, v]) => [
      k,
      v && typeof v === "object" ? { ...v } : v,
    ])
  );

const deriveOperadorRSh = (base) => {
  const salario = Number(base?.salarioMensal);
  const encargos = Number(base?.fatorEncargos);
  const horas = Number(base?.horasMes);
  return Number.isFinite(salario) && Number.isFinite(encargos) && horas > 0
    ? (salario * encargos) / horas
    : 0;
};

const derivePessoaRSh = (base) => {
  if (base == null) return null;
  const salario = Number(base?.salarioMensal);
  const horas = Number(base?.horasMes);
  return Number.isFinite(salario) && horas > 0 ? salario / horas : 0;
};

const hydrateParams = (params) => ({
  ...params,
  mao_de_obra_direta_base: cloneBaseMap(
    params.mao_de_obra_direta_base || ASSUMPTIONS.maoDeObraDireta.porCategoriaOperadorBase
  ),
  pessoas_indiretas_base: cloneBaseMap(
    params.pessoas_indiretas_base || ASSUMPTIONS.pessoasIndiretas.porTipoBase
  ),
});

const hasOverride = (value, derived) =>
  typeof value === "number" && Number.isFinite(value) && Math.abs(value - derived) > 1e-9;

export default function Parametros({ params, setParams }) {
  const [local, setLocal] = useState(() => hydrateParams(params));
  const [focusedPessoaIndireta, setFocusedPessoaIndireta] = useState(null);
  const set  = (k, v) => setLocal(p => ({ ...p, [k]: parseFloat(v) || 0 }));
  const setFatorEmpolamento = (v) => {
    const parsed = parseFloat(v);
    setLocal(p => ({
      ...p,
      fator_empolamento: Number.isFinite(parsed) ? normalizeFatorEmpolamento(parsed, 1.36) : 0,
    }));
  };
  const save = () => setParams(local);

  // Helpers para editar tabelas (objetos chave→número)
  const setMapValue = (mapKey, k, v) => setLocal(p => ({
    ...p,
    [mapKey]: { ...(p?.[mapKey] || {}), [k]: parseFloat(v) || 0 },
  }));
  const setMapNullable = (mapKey, k, v) => setLocal(p => ({
    ...p,
    [mapKey]: { ...(p?.[mapKey] || {}), [k]: (v === "" || v == null) ? null : parseFloat(v) || 0 },
  }));
  const setOperadorBase = (tipo, campo, value) => setLocal((p) => {
    const baseAtual = p.mao_de_obra_direta_base?.[tipo]
      || ASSUMPTIONS.maoDeObraDireta.porCategoriaOperadorBase[tipo];
    const derivadoAtual = deriveOperadorRSh(baseAtual);
    const valorAtual = p.categorias_operador?.[tipo];
    const manterOverride = hasOverride(valorAtual, derivadoAtual);
    const baseLinha = {
      ...baseAtual,
      [campo]: parseFloat(value) || 0,
    };
    const derivado = deriveOperadorRSh(baseLinha);
    const alias = OPERADOR_ALIAS[tipo];
    const nextBase = { ...(p.mao_de_obra_direta_base || {}), [tipo]: baseLinha };
    if (alias) nextBase[alias] = { ...baseLinha };
    const nextCategorias = {
      ...(p.categorias_operador || {}),
      [tipo]: manterOverride ? valorAtual : derivado,
    };
    if (alias) nextCategorias[alias] = nextCategorias[tipo];
    return {
      ...p,
      mao_de_obra_direta_base: nextBase,
      categorias_operador: nextCategorias,
      custo_hh_por_categoria_operador: { ...nextCategorias },
    };
  });
  const setOperadorOverride = (tipo, value) => setLocal((p) => {
    const baseLinha = p.mao_de_obra_direta_base?.[tipo]
      || ASSUMPTIONS.maoDeObraDireta.porCategoriaOperadorBase[tipo];
    const derivado = deriveOperadorRSh(baseLinha);
    const parsed = parseFloat(value);
    const nextValue = value === "" || value == null || !Number.isFinite(parsed) ? derivado : parsed;
    const alias = OPERADOR_ALIAS[tipo];
    const nextCategorias = {
      ...(p.categorias_operador || {}),
      [tipo]: nextValue,
    };
    if (alias) nextCategorias[alias] = nextValue;
    return {
      ...p,
      categorias_operador: nextCategorias,
      custo_hh_por_categoria_operador: { ...nextCategorias },
    };
  });
  const setPessoaBase = (tipo, campo, value) => setLocal((p) => {
    const baseAtual = p.pessoas_indiretas_base?.[tipo]
      || ASSUMPTIONS.pessoasIndiretas.porTipoBase[tipo];
    if (baseAtual == null) return p;
    const derivadoAtual = derivePessoaRSh(baseAtual);
    const valorAtual = p.pessoas_indiretas?.[tipo];
    const manterOverride = hasOverride(valorAtual, derivadoAtual);
    const baseLinha = {
      ...baseAtual,
      [campo]: parseFloat(value) || 0,
    };
    const derivado = derivePessoaRSh(baseLinha);
    return {
      ...p,
      pessoas_indiretas_base: {
        ...(p.pessoas_indiretas_base || {}),
        [tipo]: baseLinha,
      },
      pessoas_indiretas: {
        ...(p.pessoas_indiretas || {}),
        [tipo]: manterOverride ? valorAtual : derivado,
      },
    };
  });
  const setPessoaOverride = (tipo, value) => setLocal((p) => {
    const baseLinha = p.pessoas_indiretas_base?.[tipo]
      || ASSUMPTIONS.pessoasIndiretas.porTipoBase[tipo];
    const derivado = derivePessoaRSh(baseLinha);
    const parsed = parseFloat(value);
    const nextValue = value === "" || value == null || !Number.isFinite(parsed) ? derivado : parsed;
    return {
      ...p,
      pessoas_indiretas: {
        ...(p.pessoas_indiretas || {}),
        [tipo]: nextValue,
      },
    };
  });
  const valorPessoaIndireta = (k) => {
    const v = (local.pessoas_indiretas || {})[k];
    if (v == null || v === "") return "";
    if (focusedPessoaIndireta === k) return v;
    const n = Number(v);
    return Number.isFinite(n) ? n.toFixed(4) : v;
  };

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
          <Input label="Fator Manutenção (%)"    value={fmt((local.percentual_manutencao || ASSUMPTIONS.manutencao.percentualSobreDiesel) * 100)} onChange={v => set("percentual_manutencao", v / 100)} type="number" step="0.1" />
          <Input label="Fator Indiretos legado (%)" value={fmt((local.percentual_indiretos || ASSUMPTIONS.indireto.percentualLegadoSobreParcial) * 100)}  onChange={v => set("percentual_indiretos", v / 100)}  type="number" step="0.01" />
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
            value={local.markup_padrao || ASSUMPTIONS.markup.padraoLegado}
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
            const isActive = Math.abs((local.markup_padrao || ASSUMPTIONS.markup.padraoLegado) - profile.valor) < 0.05;
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

      {/* ══ Tabela: R$/h por categoria de operador ══ */}
      <div className="card" style={{ padding: 24 }}>
        <SectionTitle>Mão de Obra Direta — base de cálculo</SectionTitle>
        {Object.keys(OPERADOR_LABEL).map((k) => {
          const base = local.mao_de_obra_direta_base?.[k]
            || ASSUMPTIONS.maoDeObraDireta.porCategoriaOperadorBase[k];
          const derivado = deriveOperadorRSh(base);
          const valorAtual = (local.categorias_operador || {})[k];
          const override = hasOverride(valorAtual, derivado) ? valorAtual : "";
          return (
            <Row key={k}>
              <Input
                label={`${OPERADOR_LABEL[k]} — salário mensal (R$)`}
                value={base?.salarioMensal ?? 0}
                onChange={v => setOperadorBase(k, "salarioMensal", v)}
                type="number"
                step="0.01"
              />
              <Input
                label="Fator encargos (×)"
                value={base?.fatorEncargos ?? 1}
                onChange={v => setOperadorBase(k, "fatorEncargos", v)}
                type="number"
                step="0.01"
              />
              <Input
                label="Horas/mês"
                value={base?.horasMes ?? 0}
                onChange={v => setOperadorBase(k, "horasMes", v)}
                type="number"
                step="1"
              />
              <Input
                label="R$/h derivado"
                value={derivado.toFixed(6)}
                onChange={() => {}}
                type="number"
                readOnly
              />
              <Input
                label="Override R$/h"
                value={override}
                onChange={v => setOperadorOverride(k, v)}
                type="number"
                step="0.000001"
                placeholder="opcional"
              />
            </Row>
          );
        })}
      </div>

      {/* ══ Tabela: Pessoas indiretas + alimentação dinâmica ══ */}
      <div className="card" style={{ padding: 24 }}>
        <SectionTitle>Pessoas Indiretas — base de cálculo</SectionTitle>
        {Object.keys(PESSOA_INDIRETA_LABEL).map((k) => {
          const base = local.pessoas_indiretas_base?.[k]
            || ASSUMPTIONS.pessoasIndiretas.porTipoBase[k];
          const derivado = derivePessoaRSh(base);
          const valorAtual = (local.pessoas_indiretas || {})[k];
          const override = hasOverride(valorAtual, derivado) ? valorPessoaIndireta(k) : "";
          return (
            <Row key={k}>
              <Input
                label={`${PESSOA_INDIRETA_LABEL[k]} — salário mensal (R$)`}
                value={base?.salarioMensal ?? 0}
                onChange={v => setPessoaBase(k, "salarioMensal", v)}
                type="number"
                step="0.01"
              />
              <Input
                label="Horas/mês"
                value={base?.horasMes ?? 0}
                onChange={v => setPessoaBase(k, "horasMes", v)}
                type="number"
                step="1"
              />
              <Input
                label="R$/h derivado"
                value={(derivado || 0).toFixed(6)}
                onChange={() => {}}
                type="number"
                readOnly
              />
              <Input
                label="Override R$/h"
                value={override}
                onChange={v => setPessoaOverride(k, v)}
                onFocus={() => setFocusedPessoaIndireta(k)}
                onBlur={() => setFocusedPessoaIndireta(null)}
                type="number"
                step="0.000001"
                placeholder="opcional"
              />
            </Row>
          );
        })}
        <Row>
          <Input
            label="Alimentação — R$/h"
            value={valorPessoaIndireta("alimentacao")}
            onChange={v => setMapNullable("pessoas_indiretas", "alimentacao", v)}
            onFocus={() => setFocusedPessoaIndireta("alimentacao")}
            onBlur={() => setFocusedPessoaIndireta(null)}
            type="number"
            step="0.0001"
            placeholder="vazio = dinâmico"
          />
        </Row>
        <SectionTitle>Cálculo dinâmico de alimentação</SectionTitle>
        <Row>
          <Input label="Valor por pessoa/dia (R$)" value={local.alimentacao_valor_dia}  onChange={v => set("alimentacao_valor_dia", v)}  type="number" step="1" />
          <Input label="Dias por mês"              value={local.alimentacao_dias_mes}   onChange={v => set("alimentacao_dias_mes", v)}   type="number" step="1" />
          <Input label="Horas/mês de referência"   value={local.alimentacao_horas_ref}  onChange={v => set("alimentacao_horas_ref", v)}  type="number" step="1" />
        </Row>
      </div>

      {/* ══ Tabela: Markup por categoria de equipamento ══ */}
      <div className="card" style={{ padding: 24 }}>
        <SectionTitle>Markup por Categoria de Equipamento</SectionTitle>
        <p style={{ fontSize: 13, color: S.muted, marginTop: 0, marginBottom: 12 }}>
          Substitui o <code>fatorBase × ajusteFinal</code> global. <code>_default</code> é o fallback
          quando uma categoria não tem markup específico.
        </p>
        <Row>
          {Object.keys(local.markup_por_categoria || {}).map(k => (
            <Input
              key={k}
              label={k}
              value={(local.markup_por_categoria || {})[k] ?? 0}
              onChange={v => setMapValue("markup_por_categoria", k, v)}
              type="number"
              step="0.01"
            />
          ))}
        </Row>
      </div>

      {/* ══ Defaults gerais editáveis ══ */}
      <div className="card" style={{ padding: 24 }}>
        <SectionTitle>Defaults do Orçamento (overrideáveis por obra)</SectionTitle>
        <Row>
          <Input label="Fator de empolamento (×)" value={local.fator_empolamento}      onChange={setFatorEmpolamento}      type="number" step="0.01" min="1" />
          <Input label="Dias úteis/mês"           value={local.dias_uteis_mes}         onChange={v => set("dias_uteis_mes", v)}         type="number" step="1" />
          <Input label="Horas/dia"                value={local.horas_dia}              onChange={v => set("horas_dia", v)}              type="number" step="0.5" />
          <Input label="Alíquota imposto s/ lucro (0–1)" value={local.aliquota_imposto_lucro} onChange={v => set("aliquota_imposto_lucro", v)} type="number" step="0.0001" />
        </Row>
        <p style={{ fontSize: 12, color: S.muted, marginTop: 8 }}>
          Empolamento e multiplicador: 1,36 representa +36%. Valores entre 0 e 1 sao convertidos para 1 + valor.
        </p>
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
