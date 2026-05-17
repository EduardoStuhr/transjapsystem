import React, { useMemo, useState } from "react";
import { SS } from "../../styles/spreadsheetTheme";
import { fmt, fmtBRL, fmtBRLPreciso } from "../../utils/format";

// ──────────────────────────────────────────────────────────────────
// <PainelComposicaoItem> — modal de composição de preço de UM item.
//
// Estrutura visual (4 painéis numerados):
//   1) Variáveis do orçamento (volume in situ, fator, empolado, prazo,
//      horas projeto, horas-máquina, produção conjunto…)
//   2) Seletor de equipamento (dropdown — Todos ou um específico)
//   3) Composição por equipamento (um card por equipamento visível
//      com: tabela R$/h × horas × qty → Total R$; rateio em R$/m³ com
//      volume de referência e tipo (in situ/empolado); markup por
//      categoria; preço unitário; total da máquina na obra)
//   4) Resumo do item (Σ custo, Σ preço, markup efetivo, volume, total)
//
// Dados vêm de `result.detalhes.auditoria`:
//   - aud.contexto       → variáveis derivadas (modelo novo)
//   - aud.equipamentos[] → detalheEquipamentos com diesel_R$_m3, markup,
//                          volume_ref_*_tipo, total_maquina_obra_R$, …
//
// Para itens que ainda não estão no modelo novo (sem prazoMeses ou sem
// volumeInSitu), exibimos um aviso pedindo configuração + dados básicos.
// ──────────────────────────────────────────────────────────────────

const SEVERIDADE = {
  ok:     { bg: SS.okBg,   color: SS.okText,   icon: "✓" },
  info:   { bg: SS.infoBg, color: SS.infoText, icon: "ℹ" },
  alerta: { bg: SS.warnBg, color: SS.warnText, icon: "⚠" },
  erro:   { bg: SS.errBg,  color: SS.errText,  icon: "✕" },
};

const VOLUME_TIPO_LABEL = {
  in_situ: "in situ",
  empolado: "empolado",
  aterro_in_situ: "aterro in situ",
  aterro_empolado: "aterro empolado",
  transporte: "transporte",
  transporte_agregado: "transporte agregado",
  in_situ_fallback: "in situ fallback",
  area: "ÁREA",
};

const DEPRECATED_VOLUME_TIPO_LABEL = {
  in_situ:  "in situ",
  empolado: "empolado",
};

const toNumber = (value, fallback = 0) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

const toPositiveNumber = (value, fallback = 0) => {
  const n = toNumber(value, 0);
  return n > 0 ? n : fallback;
};

export default function PainelComposicaoItem({ item, result, paramsDoOrcamento = {}, onClose }) {
  const aud  = result?.detalhes?.auditoria || {};
  const unit = item?.unit || "m³";
  const isNovo = aud.tipo === "ok-novo";
  const isVB   = aud.tipo === "VB";
  const prazoEfetivo = toPositiveNumber(item?.prazoMeses, toPositiveNumber(paramsDoOrcamento?.prazo_meses, 0));
  const diasEfetivos = toPositiveNumber(item?.diasUteisMes, toPositiveNumber(paramsDoOrcamento?.dias_uteis_mes, 0));
  const horasEfetivas = toPositiveNumber(item?.horasDia, toPositiveNumber(paramsDoOrcamento?.horas_dia, 0));
  const usaModeloNovoPorPrazo = prazoEfetivo > 0 && diasEfetivos > 0 && horasEfetivas > 0;

  const ctx = aud.contexto || {};
  const eqs = useMemo(
    () => (Array.isArray(aud.equipamentos) ? aud.equipamentos : []),
    [aud.equipamentos],
  );
  const validacoes = aud.validacoes || [];

  const [selecionadosIds, setSelecionadosIds] = useState(["todos"]);
  const eqsVisiveis = useMemo(() => {
    const ids = Array.isArray(selecionadosIds)
      ? selecionadosIds.filter((id) => id !== "todos")
      : [];
    if (selecionadosIds.includes("todos") || ids.length === 0) return eqs;
    const selecionados = new Set(ids);
    return eqs.filter((e) => selecionados.has(e.equipmentId || e.id));
  }, [eqs, selecionadosIds]);

  if (!item || !result) return null;

  return (
    <ModalShell
      title={`Composição de Preço · ${item.desc || "(sem descrição)"} · ${fmt(item.quantity, 2)} ${unit}`}
      subtitle="auditoria do item"
      onClose={onClose}
    >
      {!isNovo && !isVB && !usaModeloNovoPorPrazo && (
        <Aviso severidade="alerta">
          Item ainda no modelo legado. Para ver a composição detalhada por
          equipamento (markup por categoria, rateio por tipo de volume),
          configure no item: <b>volume in situ</b>, <b>prazo (meses)</b>,{" "}
          <b>dias úteis/mês</b> e <b>horas/dia</b>.
        </Aviso>
      )}

      <PainelVariaveis ctx={ctx} item={item} result={result} unit={unit} paramsDoOrcamento={paramsDoOrcamento} />

      <PainelSeletor
        equipamentos={eqs}
        selecionados={selecionadosIds}
        onChange={setSelecionadosIds}
        disabled={!isNovo}
      />

      <Section n={3} title="Composição por equipamento">
        {eqsVisiveis.length === 0 ? (
          <Aviso severidade="info">Nenhum equipamento alocado neste item.</Aviso>
        ) : !isNovo ? (
          <Aviso severidade="info">
            Cards por equipamento exigem modelo novo (volume + prazo + frota).
          </Aviso>
        ) : (
          eqsVisiveis.map((eq) =>
            eq.tipo === "transporte_agregado" ? (
              <CardTransporteAgregado
                key={eq.equipmentId || eq.id || eq.equipamento}
                eq={eq}
                unit={unit}
              />
            ) : (
              <CardComposicaoEquipamento
                key={eq.equipmentId || eq.id || eq.equipamento}
                eq={eq}
                ctx={ctx}
                unit={unit}
              />
            ),
          )
        )}
      </Section>

      <ResumoItem result={result} item={item} unit={unit} />

      {validacoes.length > 0 && <PainelValidacoes validacoes={validacoes} />}

      {aud.indiretoModel && (
        <div
          style={{
            padding: 10,
            fontSize: 11,
            color: SS.mutedText,
            background: SS.bgAlt,
            border: `1px solid ${SS.gridLine}`,
            fontFamily: SS.fontMono,
          }}
        >
          <b>Modo indireto:</b> {aud.indiretoModel.modo}
          {aud.indiretoModel.modo === "absoluto" && (
            <>
              {" "}· R$ {fmt(aud.indiretoModel.indiretoTotalMensal, 2)}/mês ÷{" "}
              {fmt(aud.indiretoModel.horasMes, 0)} h = R${" "}
              {fmt(aud.indiretoModel.indiretoHora, 2)}/h
            </>
          )}
        </div>
      )}
    </ModalShell>
  );
}

// ──────────────────────────────────────────────────────────────────
// 1 — Painel de variáveis do orçamento
// ──────────────────────────────────────────────────────────────────
function PainelVariaveis({ ctx, item, result, unit, paramsDoOrcamento = {} }) {
  const vols = result?.detalhes?.volumes || {};
  const volumeInSitu     = ctx.volumeInSitu     ?? vols.inSitu          ?? item.volumeInSitu      ?? 0;
  const fatorEmpolamento = ctx.fatorEmpolamento ?? vols.fatorEmpolamento ?? item.fatorEmpolamento ?? 1.36;
  const volumeEmpolado   = ctx.volumeEmpolado   ?? vols.empolado        ?? (volumeInSitu * fatorEmpolamento);
  const prazoMeses       = toPositiveNumber(ctx.prazoMeses, toPositiveNumber(item.prazoMeses, toPositiveNumber(paramsDoOrcamento.prazo_meses, 0)));
  const diasUteisMes     = toPositiveNumber(ctx.diasUteisMes, toPositiveNumber(item.diasUteisMes, toPositiveNumber(paramsDoOrcamento.dias_uteis_mes, 0)));
  const horasDia         = toPositiveNumber(ctx.horasDia, toPositiveNumber(item.horasDia, toPositiveNumber(paramsDoOrcamento.horas_dia, 0)));
  const horasProjeto     = ctx.horasProjeto ?? (diasUteisMes * horasDia * prazoMeses);
  const producaoConjunto = ctx.producaoConjuntoHora ?? 0;
  const horasMaquina     = ctx.horasMaquinaNecessarias ?? 0;

  const cells = [
    {
      label: "Volume in situ",
      valor: volumeInSitu,
      unidade: unit,
      tip: "informado pelo usuário",
    },
    {
      label: "Fator empolamento",
      valor: fatorEmpolamento,
      unidade: "×",
      tip: "parâmetro (editável por orçamento)",
      decimais: 3,
      kind: "key",
    },
    {
      label: "Volume empolado",
      valor: volumeEmpolado,
      unidade: unit,
      tip: `= ${fmt(volumeInSitu, 2)} × ${fmt(fatorEmpolamento, 3)}`,
      kind: "ref",
    },
    { label: "Prazo",          valor: prazoMeses,   unidade: "meses", decimais: 0, tip: "informado pelo usuário" },
    { label: "Dias úteis/mês", valor: diasUteisMes, unidade: "dias",  decimais: 0, tip: "parâmetro" },
    { label: "Horas/dia",      valor: horasDia,     unidade: "h",     decimais: 0, tip: "parâmetro" },
    {
      label: "Horas projeto",
      valor: horasProjeto,
      unidade: "h",
      decimais: 0,
      tip: `= ${diasUteisMes} × ${horasDia} × ${prazoMeses}`,
      kind: "ref",
    },
    {
      label: "Produção conjunto",
      valor: producaoConjunto,
      unidade: `${unit}/h`,
      tip: "Σ produtividade base × qty (sem fatores)",
    },
    {
      label: "Horas-máquina",
      valor: horasMaquina,
      unidade: "h",
      decimais: 2,
      tip: `= ${fmt(volumeInSitu, 2)} ÷ ${fmt(producaoConjunto, 2)}`,
      kind: "ref",
    },
  ];

  return (
    <Section n={1} title="Variáveis do orçamento">
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
          gap: 1,
          background: SS.gridLine,
          border: `1px solid ${SS.border}`,
        }}
      >
        {cells.map((c) => (
          <VarCell key={c.label} {...c} />
        ))}
      </div>
    </Section>
  );
}

function VarCell({ label, valor, unidade, decimais = 2, tip, kind = "formula" }) {
  const color =
    kind === "key"   ? SS.formulaText :
    kind === "ref"   ? SS.refText     :
    kind === "muted" ? SS.mutedText   :
                       SS.formulaText;
  const bg = kind === "key" ? SS.bgKeyInput : SS.bg;
  return (
    <div
      title={tip}
      style={{
        background: bg,
        padding: "10px 14px",
        display: "flex",
        flexDirection: "column",
        gap: 4,
      }}
    >
      <div
        style={{
          fontSize: 10,
          fontWeight: 700,
          color: SS.mutedText,
          letterSpacing: 0.5,
          textTransform: "uppercase",
          fontFamily: SS.fontUI,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: 16,
          fontWeight: 700,
          color,
          fontFamily: SS.fontMono,
          fontVariantNumeric: "tabular-nums",
          display: "flex",
          alignItems: "baseline",
          gap: 6,
        }}
      >
        <span>{fmt(valor, decimais)}</span>
        <span style={{ fontSize: 11, color: SS.mutedText, fontWeight: 500 }}>{unidade}</span>
      </div>
      {tip && (
        <div style={{ fontSize: 10, color: SS.mutedText, fontStyle: "italic", fontFamily: SS.fontUI }}>
          {tip}
        </div>
      )}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────
// 2 — Seletor de equipamento
// ──────────────────────────────────────────────────────────────────
function PainelSeletor({ equipamentos, selecionados = ["todos"], onChange, disabled }) {
  const idsSelecionados = Array.isArray(selecionados) ? selecionados : ["todos"];
  const todosAtivo = idsSelecionados.includes("todos") || idsSelecionados.length === 0;
  const idsIndividuais = idsSelecionados.filter((id) => id !== "todos");
  const selecionadosSet = new Set(idsIndividuais);
  const bloqueado = disabled || equipamentos.length === 0;

  const toggleTodos = () => {
    if (bloqueado) return;
    onChange(["todos"]);
  };

  const toggleEquipamento = (id) => {
    if (bloqueado) return;
    const base = todosAtivo ? [] : idsIndividuais;
    const next = selecionadosSet.has(id)
      ? base.filter((x) => x !== id)
      : [...base, id];
    onChange(next.length > 0 ? next : ["todos"]);
  };

  const hintSelecao = todosAtivo
    ? `${equipamentos.length} equipamento(s) alocado(s) - todos selecionados`
    : `${idsIndividuais.length} de ${equipamentos.length} equipamento(s) selecionado(s)`;

  return (
    <Section n={2} title="Ver composicao de" hint={hintSelecao}>
      <div
        style={{
          background: SS.bgKeyInput,
          color: SS.formulaText,
          border: `1px solid ${SS.border}`,
          padding: "8px 12px",
          fontSize: 13,
          fontWeight: 600,
          fontFamily: SS.fontUI,
          maxWidth: 760,
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
          gap: 8,
          opacity: bloqueado ? 0.65 : 1,
        }}
      >
        <label style={checkOptionStyle(bloqueado, todosAtivo)}>
          <input
            type="checkbox"
            checked={todosAtivo}
            disabled={bloqueado}
            onChange={toggleTodos}
          />
          <span>Todos os equipamentos</span>
        </label>
        {equipamentos.map((eq) => {
          const id = eq.equipmentId || eq.id;
          const ativo = todosAtivo || selecionadosSet.has(id);
          return (
            <label key={id} style={checkOptionStyle(bloqueado, ativo)}>
              <input
                type="checkbox"
                checked={ativo}
                disabled={bloqueado}
                onChange={() => toggleEquipamento(id)}
              />
              <span>
                {eq.equipamento || eq.nome}
                {eq.qty != null && eq.qty !== 1 ? ` (${fmt(eq.qty, 0)}x)` : ""}
                {eq.categoria ? ` - ${eq.categoria}` : ""}
              </span>
            </label>
          );
        })}
      </div>
    </Section>
  );
}

const checkOptionStyle = (disabled, active) => ({
  display: "flex",
  alignItems: "center",
  gap: 8,
  minHeight: 28,
  padding: "5px 8px",
  border: `1px solid ${active ? SS.accentBlue : "transparent"}`,
  background: active ? "rgba(37, 99, 235, 0.12)" : "transparent",
  color: active ? SS.formulaText : SS.mutedText,
  cursor: disabled ? "not-allowed" : "pointer",
  userSelect: "none",
});

function PainelSeletorSingle({ equipamentos, selecionado, onChange, disabled }) {
  return (
    <Section n={2} title="Ver composição de" hint={`${equipamentos.length} equipamento(s) alocado(s)`}>
      <select
        value={selecionado}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled || equipamentos.length === 0}
        style={{
          background: SS.bgKeyInput,
          color: SS.formulaText,
          border: `1px solid ${SS.border}`,
          padding: "8px 12px",
          fontSize: 13,
          fontWeight: 600,
          fontFamily: SS.fontUI,
          minWidth: 320,
          cursor: disabled ? "not-allowed" : "pointer",
        }}
      >
        <option value="todos">Todos os equipamentos</option>
        {equipamentos.map((eq) => (
          <option key={eq.equipmentId || eq.id} value={eq.equipmentId || eq.id}>
            {eq.equipamento || eq.nome}
            {eq.qty != null && eq.qty !== 1 ? ` (×${fmt(eq.qty, 0)})` : ""}
            {eq.categoria ? ` — ${eq.categoria}` : ""}
          </option>
        ))}
      </select>
    </Section>
  );
}

// ──────────────────────────────────────────────────────────────────
// 3 — Card por equipamento
// ──────────────────────────────────────────────────────────────────
function CardComposicaoEquipamento({ eq, ctx, unit }) {
  const tipoLabel = (t) => VOLUME_TIPO_LABEL[t] || t || "—";
  const dieselExcecao = eq.volume_ref_diesel_tipo === "in_situ";
  const usaFallbackManut = !(eq.custoManutencaoDireto > 0);
  const prodZero = !(eq.baseProductivity > 0);
  const volumeInSitu = ctx.volumeInSitu ?? 0;

  // Valores precisos (sem arredondamento) — vindos do costEngine. Fórmulas
  // auditáveis precisam usar esses números crus para bater com a planilha.
  const custoPreciso = eq.custo_R$_m3_preciso ?? eq.custo_R$_m3 ?? 0;
  const markupPreciso = eq.markup_preciso ?? eq.markup ?? 0;
  const precoPreciso = eq.preco_R$_m3_preciso ?? eq.preco_R$_m3 ?? 0;
  const volumeTotalizacao = eq.volume_base_total_preciso ?? eq.volume_base_total ?? eq.volume_totalizacao ?? volumeInSitu;
  const totalMaquinaPreciso = eq.total_maquina_obra_preciso_R$ ?? eq.total_maquina_obra_R$ ?? 0;
  const volumeTotalizacaoLabel = tipoLabel(eq.volume_base_tipo || eq.volume_totalizacao_tipo || "in_situ");

  return (
    <div
      style={{
        border: `1px solid ${SS.border}`,
        background: SS.bg,
        marginBottom: 14,
      }}
    >
      <div
        style={{
          padding: "10px 14px",
          background: SS.bgHeader,
          borderBottom: `2px solid ${SS.accentBlue}`,
          display: "flex",
          alignItems: "center",
          gap: 10,
          flexWrap: "wrap",
        }}
      >
        <span style={{ fontSize: 18 }}>⚙️</span>
        <span style={{ fontSize: 14, fontWeight: 800, color: SS.headerText, fontFamily: SS.fontUI }}>
          {eq.equipamento || eq.nome}
        </span>
        <span
          style={{
            fontSize: 11,
            color: SS.mutedText,
            fontWeight: 600,
            fontFamily: SS.fontMono,
          }}
        >
          · qty {fmt(eq.qty, 0)} · Categoria: <b style={{ color: SS.formulaText }}>{eq.categoria}</b>
        </span>
        {eq.is_executor ? (
          <Pill tone="success">EXECUTOR</Pill>
        ) : (
          <Pill tone="muted">AUXILIAR · herda horas dos executores</Pill>
        )}
        {dieselExcecao && (
          <span style={pill(SS.warnBg, SS.warnText)} title="Diesel rateado por m³ in situ pela tabela volume_ref_diesel_por_categoria">
            diesel ÷ in situ
          </span>
        )}
        {usaFallbackManut && (
          <span style={pill(SS.warnBg, SS.warnText)} title="Sem custo_h_manutencao cadastrado — usando fallback (% diesel)">
            ⚠ manut. fallback
          </span>
        )}
        {prodZero && (
          <span style={pill(SS.errBg, SS.errText)} title="Produtividade base zero — horas-máquina e diesel ficarão zerados">
            ⚠ prod. zero
          </span>
        )}
      </div>

      <div style={{ padding: 12, display: "flex", flexDirection: "column", gap: 14 }}>
        {/* ── Tabela: totais R$ por parcela ── */}
        <div>
          <SubTitle>Totais R$ por parcela (R$/h × horas × qty)</SubTitle>
          <SimpleTable
            head={["Parcela", "R$/h", "Horas", "Qty", "Total R$"]}
            aligns={["left", "right", "right", "right", "right"]}
            rows={[
              [
                "⛽ Diesel",
                fmtBRL(eq.diesel_hora),
                <>{fmt(eq.horas_diesel, 2)} <Sup label="horas-máquina">ⓜ</Sup></>,
                fmt(eq.qty, 0),
                fmtBRL(eq.total_diesel),
              ],
              [
                "🔧 Manutenção",
                fmtBRL(eq.manutencao_hora),
                <>{fmt(eq.horas_manutencao, 0)} <Sup label="horas-projeto">ⓟ</Sup></>,
                fmt(eq.qty, 0),
                fmtBRL(eq.total_manutencao),
              ],
              [
                "👷 Mão de obra",
                fmtBRL(eq.operador_hora),
                <>{fmt(eq.horas_mo, 0)} <Sup label="horas-projeto">ⓟ</Sup></>,
                fmt(eq.qty, 0),
                fmtBRL(eq.total_mo),
              ],
              [
                "🏢 Indireto",
                <span style={{ color: SS.mutedText }}>—</span>,
                <span style={{ color: SS.mutedText }}>—</span>,
                fmt(eq.qty, 0),
                <span style={{ color: SS.mutedText, fontStyle: "italic" }}>rateado por pessoas indiretas</span>,
              ],
            ]}
          />
          <div style={{ fontSize: 10.5, color: SS.mutedText, marginTop: 4, fontFamily: SS.fontUI }}>
            ⓜ horas-máquina necessárias = volumeInSitu ÷ Σ produção base ·{" "}
            ⓟ horas-projeto = dias × horas/dia × meses
          </div>
        </div>

        {/* ── Rateio em R$/m³ ── */}
        <div>
          <SubTitle>Rateio em R$/{unit}</SubTitle>
          <SimpleTable
            head={["Parcela", "Total R$", "÷ Volume de referência", "Tipo", `R$/${unit}`]}
            aligns={["left", "right", "right", "left", "right"]}
            rows={[
              [
                "⛽ Diesel",
                fmtBRL(eq.total_diesel),
                <>{fmt(eq.volume_ref_diesel, 2)} {unit}</>,
                <Pill tone={eq.volume_ref_diesel_tipo === "in_situ" ? "warn" : "info"}>
                  {tipoLabel(eq.volume_ref_diesel_tipo)}
                </Pill>,
                <Strong color={SS.accentBlue}>{fmtBRL(eq.diesel_R$_m3)}</Strong>,
              ],
              [
                "🔧 Manutenção",
                fmtBRL(eq.total_manutencao),
                <>{fmt(eq.volume_ref_manutencao, 2)} {unit}</>,
                <Pill tone="info">{tipoLabel(eq.volume_ref_manutencao_tipo)}</Pill>,
                <Strong color={SS.accentBlue}>{fmtBRL(eq.manutencao_R$_m3)}</Strong>,
              ],
              [
                "👷 Mão de obra",
                fmtBRL(eq.total_mo),
                <>{fmt(eq.volume_ref_mo, 2)} {unit}</>,
                <Pill tone="info">{tipoLabel(eq.volume_ref_mo_tipo)}</Pill>,
                <Strong color={SS.accentBlue}>{fmtBRL(eq.mo_R$_m3)}</Strong>,
              ],
              [
                "🏢 Indireto",
                <span style={{ color: SS.mutedText, fontStyle: "italic" }}>rateado por pessoas</span>,
                <>{fmt(eq.volume_ref_indireto, 2)} {unit}</>,
                <Pill tone="warn">{tipoLabel(eq.volume_ref_indireto_tipo)}</Pill>,
                <Strong color={SS.accentBlue}>{fmtBRL(eq.indireto_R$_m3)}</Strong>,
              ],
            ]}
          />
        </div>

        {/* ── KPIs do equipamento ── */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
            gap: 1,
            background: SS.gridLine,
            border: `1px solid ${SS.border}`,
          }}
        >
          <KpiCell label={`Custo unitário desta máquina`}        valor={`${fmtBRL(custoPreciso)} R$/${unit}`} />
          <KpiCell label={`Markup (${eq.categoria})`}            valor={`× ${fmt(markupPreciso, 2)}`} kind="key" />
          <KpiCell label={`Preço unitário desta máquina`}        valor={`${fmtBRL(precoPreciso)} R$/${unit}`} kind="ref" emphasize />
          <KpiCell
            label="Total desta máquina na obra"
            valor={fmtBRL(totalMaquinaPreciso)}
            hint={`= ${fmtBRLPreciso(precoPreciso, 8)} × ${fmt(volumeTotalizacao, 2)} ${unit} ${volumeTotalizacaoLabel}`}
            kind="ref"
            emphasize
          />
        </div>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────
// Card de Transporte Agregado / Caminhão Truck
// ──────────────────────────────────────────────────────────────────
function CardTransporteAgregado({ eq, unit }) {
  const t = eq.transporteAgregado || {};
  const porViagem = t.modoFrete === "por_viagem";

  const linhasFormula = [];
  if (t.modoFrete === "planilha_m3_empolado") {
    linhasFormula.push(
      { label: "Custo unitário empolado", expr: `${fmtBRL(t.freteBaseUnitario)} + ${fmtBRL(t.acrescimoEmpolamentoUnitario)} + ${fmtBRL(t.acrescimoPerdaUnitario)} = ${fmtBRL(t.custoUnitarioEmpolado)}/m³ emp.` },
      { label: "Custo total frete", expr: `${fmtBRL(t.custoUnitarioEmpolado)}/m³ emp × ${fmt(t.volumeEmpoladoTotal, 2)} m³ emp = ${fmtBRL(t.custoTotalFrete)}` },
    );
  } else if (porViagem) {
    linhasFormula.push(
      { label: "Quantidade de viagens", expr: `${fmt(t.volumeBaseInSitu, 2)} ÷ ${fmt(t.volumeInSituPorViagem * (1 - t.acrescimoPerdaPct), 2)} = ${fmt(t.quantidadeViagens, 2)} viagens` },
      { label: "Custo total frete", expr: `${fmt(t.quantidadeViagens, 2)} × ${fmtBRL(t.valorFreteBase)} = ${fmtBRL(t.custoTotalFrete)}` },
    );
  } else {
    linhasFormula.push(
      { label: "Custo total frete", expr: `${fmt(t.volumeBaseTransporte, 2)} × ${fmtBRL(t.valorFreteBase)} = ${fmtBRL(t.custoTotalFrete)}` },
    );
  }

  linhasFormula.push(
    { label: "Custo equivalente in situ", expr: `${fmtBRL(t.custoTotalFrete)} ÷ ${fmt(t.volumeBaseInSitu, 2)} = ${fmtBRLPreciso(t.custoUnitarioInSitu, 4)}/m³` },
    { label: "Preço unitário in situ", expr: `${fmtBRLPreciso(t.custoUnitarioInSitu, 4)} × ${fmt(t.markupTransporte, 2)} = ${fmtBRLPreciso(t.precoUnitarioInSitu, 4)}/m³` },
    { label: "Markup transporte", expr: `× ${fmt(t.markupTransporte, 2)}  (+${(((t.markupTransporte || 1) - 1) * 100).toFixed(0)}%)` },
    { label: "Preço unit. (empolado)", expr: t.decomposicaoPlanilha
      ? `${fmtBRLPreciso(t.decomposicaoPlanilha.somaPorM3Empolado, 4)} × ${fmt(t.markupTransporte, 2)} = ${fmtBRLPreciso(t.decomposicaoPlanilha.precoSomaPorM3Empolado, 4)}/m³ emp.`
      : "—" },
    { label: "Preço total venda", expr: `${fmtBRL(t.custoTotalFrete)} × ${fmt(t.markupTransporte, 2)} = ${fmtBRL(t.totalVendaTransporte)}` },
  );

  return (
    <div
      style={{
        border: `1px solid ${SS.border}`,
        background: SS.bg,
        marginBottom: 14,
      }}
    >
      <div
        style={{
          padding: "10px 14px",
          background: SS.bgHeader,
          borderBottom: `2px solid ${SS.accentBlue}`,
          display: "flex",
          alignItems: "center",
          gap: 10,
          flexWrap: "wrap",
        }}
      >
        <span style={{ fontSize: 18 }}>🚚</span>
        <span style={{ fontSize: 14, fontWeight: 800, color: SS.headerText, fontFamily: SS.fontUI }}>
          {eq.equipamento || "Caminhão agregado / Transporte"}
        </span>
        <span style={{ fontSize: 11, color: SS.mutedText, fontWeight: 600, fontFamily: SS.fontMono }}>
          · Categoria: <b style={{ color: SS.formulaText }}>Transporte Agregado</b>
        </span>
        <Pill tone="info">MODO: {String(t.modoFrete || "planilha").toUpperCase().replace(/_/g, " ")}</Pill>
      </div>

      <div style={{ padding: 12, display: "flex", flexDirection: "column", gap: 14 }}>
        <div>
          <SubTitle>Parâmetros do frete</SubTitle>
          <SimpleTable
            head={["Parâmetro", "Valor"]}
            aligns={["left", "right"]}
            rows={[
              ["DMT", t.dmtKm > 0 ? `${fmt(t.dmtKm, 2)} km` : "—"],
              ["Volume base in situ", `${fmt(t.volumeBaseInSitu, 2)} ${unit}`],
              ["Fator empolamento material", `× ${fmt(t.fatorEmpolamentoMaterial, 3)}`],
              ["Volume empolado total", `${fmt(t.volumeEmpoladoTotal, 2)} m³`],
              ["Frete base unitário", `${fmtBRL(t.freteBaseUnitario)} / m³ emp`],
              ["Acréscimo empolamento", `${fmt(t.acrescimoEmpolamentoPct * 100, 0)}%  (→ ${fmtBRL(t.acrescimoEmpolamentoUnitario)})`],
              ["Acréscimo perda", `${fmt(t.acrescimoPerdaPct * 100, 0)}%  (→ ${fmtBRL(t.acrescimoPerdaUnitario)})`],
              ["Custo unitário empolado", `${fmtBRL(t.custoUnitarioEmpolado)} / m³ emp`],
              ["Markup transporte", `× ${fmt(t.markupTransporte, 2)}`],
            ]}
          />
        </div>

        <div>
          <SubTitle>Fórmula auditável</SubTitle>
          <SimpleTable
            head={["Etapa", "Cálculo"]}
            aligns={["left", "left"]}
            rows={linhasFormula.map((l) => [l.label, l.expr])}
          />
        </div>

        {t.decomposicaoPlanilha && (
          <DecomposicaoPlanilha t={t} unit={unit} />
        )}

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
            gap: 1,
            background: SS.gridLine,
            border: `1px solid ${SS.border}`,
          }}
        >
          <KpiCell label="Custo total" valor={fmtBRL(t.custoTotalFrete)} kind="formula" />
          <KpiCell
            label={`Markup × ${fmt(t.markupTransporte, 2)}`}
            valor={t.markupTransporte === 1
              ? "neutro"
              : `${(((t.markupTransporte || 1) - 1) * 100).toFixed(0)}%${t.markupTransporte < 1 ? " (PREJUIZO)" : ""}`
            }
            kind={t.markupTransporte === 1 ? "muted" : t.markupTransporte < 1 ? "danger" : "key"}
          />
          <KpiCell
            label="Preço total venda"
            valor={fmtBRL(t.totalVendaTransporte)}
            hint={`= ${fmtBRL(t.custoTotalFrete)} × ${fmt(t.markupTransporte, 2)} markup`}
            kind="ref"
            emphasize
          />
          <KpiCell
            label="Custo unit. equiv. in situ"
            valor={`${fmtBRLPreciso(t.custoUnitarioTransporte ?? t.custoUnitarioInSitu, 4)}/${unit}`}
            kind="formula"
          />
          <KpiCell
            label="Custo unit. m³ empolado"
            valor={t.decomposicaoPlanilha ? `${fmtBRLPreciso(t.decomposicaoPlanilha.somaPorM3Empolado, 4)}/m³ emp.` : "—"}
            kind="formula"
          />
          <KpiCell
            label="Preço unit. equiv. in situ"
            valor={`${fmtBRLPreciso(t.precoUnitarioTransporte ?? t.precoUnitarioInSitu, 4)}/${unit}`}
            kind="ref"
            emphasize
          />
        </div>

        {Array.isArray(t.validacoes) && t.validacoes.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {t.validacoes.map((v, i) => (
              <Aviso key={i} severidade={v.severidade}>{v.mensagem}</Aviso>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function DecomposicaoPlanilhaLegacy({ t, unit }) {
  const empPct = (t.acrescimoEmpolamentoPct * 100).toFixed(0);
  const perdaPct = (t.acrescimoPerdaPct * 100).toFixed(0);
  return (
    <div>
      <SubTitle>Decomposição (modo planilha)</SubTitle>
      <SimpleTable
        head={["Parcela", "R$/m³ empolado"]}
        aligns={["left", "right"]}
        rows={[
          ["Frete base", fmtBRLPreciso(t.freteBaseUnitario, 4)],
          [`Acréscimo por empolamento (${empPct}%)`, fmtBRLPreciso(t.acrescimoEmpolamentoUnitario, 4)],
          [`Acréscimo por perda (${perdaPct}%)`, fmtBRLPreciso(t.acrescimoPerdaUnitario, 4)],
          [<Strong>= Custo total por m³ empolado</Strong>, <Strong>{fmtBRLPreciso(t.custoUnitarioEmpolado, 4)}</Strong>],
          [`× Volume empolado total`, `${fmt(t.volumeEmpoladoTotal, 2)} m³ empolado`],
          [<Strong>= Custo total frete</Strong>, <Strong>{fmtBRL(t.custoTotalFrete)}</Strong>],
          [<span style={{ color: SS.mutedText }}>Custo equivalente por m³ in situ</span>, <span style={{ color: SS.mutedText }}>{fmtBRL(t.custoUnitarioInSitu)}</span>],
        ]}
      />
    </div>
  );
}

function DecomposicaoPlanilha({ t }) {
  const d = t.decomposicaoPlanilha || {};
  const empPct = ((d.fatorEmpAcresc || 0) * 100).toFixed(0);
  const perdaPct = ((d.perdaCarregamentoPct || 0) * 100).toFixed(0);
  const markupPct = ((d.markup || 1) * 100).toFixed(0);
  const markupNeutro = d.markup === 1;
  const volStr = `${fmt(d.volumeEmpoladoTotal, 2)} m³ emp.`;

  return (
    <div>
      <SubTitle>Decomposicao (modo planilha - Dados Transporte 2 + COMPOSICAO!L11)</SubTitle>

      <div style={{ marginBottom: 10 }}>
        <div style={{
          fontSize: 11, fontWeight: 700, color: SS.formulaText,
          fontFamily: SS.fontUI, padding: "4px 8px",
          background: SS.bgHeader, borderTop: `1px solid ${SS.border}`,
          borderLeft: `1px solid ${SS.border}`, borderRight: `1px solid ${SS.border}`,
        }}>
          CUSTO (R$/m³ empolado × m³ empolado = R$)
        </div>
        <SimpleTable
          head={["Parcela", "R$/m³ emp.", "× m³ emp.", "= Total R$"]}
          aligns={["left", "right", "right", "right"]}
          rows={[
            ["Frete base", fmtBRLPreciso(d.parcelaBase, 4), volStr, fmtBRL(d.totalBase)],
            [`Acrescimo empolamento (${empPct}%)`, fmtBRLPreciso(d.parcelaEmpolamento, 4), volStr, fmtBRL(d.totalEmpolamento)],
            [`Acrescimo perda (${perdaPct}%)`, fmtBRLPreciso(d.parcelaPerda, 4), volStr, fmtBRL(d.totalPerda)],
            [<Strong>= Custo total</Strong>, <Strong>{fmtBRLPreciso(d.somaPorM3Empolado, 4)}</Strong>, <Strong>{volStr}</Strong>, <Strong>{fmtBRL(d.totalCusto)}</Strong>],
          ]}
        />
      </div>

      {markupNeutro && (
        <div style={{
          padding: "8px 12px",
          background: SS.bgWarning || "rgba(255, 200, 0, 0.08)",
          border: `1px dashed ${SS.warningBorder || "rgba(255, 200, 0, 0.4)"}`,
          fontSize: 11,
          fontFamily: SS.fontMono,
          color: SS.warningText || "#cc8800",
          marginBottom: 10,
        }}>
          <Strong>Markup transporte = x 1,00 (0%)</Strong>: venda = custo.
          Sem margem para o empreiteiro. Para aplicar markup, digite valor &gt; 1 no campo
          "Markup transporte (x)" do item (ex.: 1,99 para 99% de margem).
        </div>
      )}

      {!markupNeutro && (
      <div style={{ marginBottom: 10 }}>
        <div style={{
          fontSize: 11, fontWeight: 700, color: SS.refText,
          fontFamily: SS.fontUI, padding: "4px 8px",
          background: SS.bgHeader, borderTop: `1px solid ${SS.border}`,
          borderLeft: `1px solid ${SS.border}`, borderRight: `1px solid ${SS.border}`,
        }}>
          VENDA (custo × markup {markupPct}% = preco)
        </div>
        <SimpleTable
          head={["Parcela", `R$/m³ emp. × ${fmt(d.markup, 2)}`, "× m³ emp.", "= Venda R$"]}
          aligns={["left", "right", "right", "right"]}
          rows={[
            ["Frete base", fmtBRLPreciso(d.precoBase, 4), volStr, fmtBRL(d.totalVendaBase)],
            [`Acrescimo empolamento (${empPct}%)`, fmtBRLPreciso(d.precoEmpolamento, 4), volStr, fmtBRL(d.totalVendaEmpolamento)],
            [`Acrescimo perda (${perdaPct}%)`, fmtBRLPreciso(d.precoPerda, 4), volStr, fmtBRL(d.totalVendaPerda)],
            [<Strong>= Preco total de venda</Strong>, <Strong>{fmtBRLPreciso(d.precoSomaPorM3Empolado, 4)}</Strong>, <Strong>{volStr}</Strong>, <Strong>{fmtBRL(d.totalVendaGeral)}</Strong>],
          ]}
        />
      </div>
      )}

      <div style={{
        fontSize: 11, color: SS.mutedText, fontFamily: SS.fontMono,
        padding: "6px 4px 0 4px", lineHeight: 1.6,
      }}>
        Custo equivalente in situ: {fmtBRLPreciso(d.custoUnitInSitu, 4)}/m³ in situ
        ({fmtBRL(d.totalCusto)} ÷ {fmt(d.volumeInSitu, 2)} m³ in situ)
        <br />
        Preco equivalente in situ: {fmtBRLPreciso(d.precoUnitInSitu, 4)}/m³ in situ
        ({fmtBRL(d.totalVendaGeral)} ÷ {fmt(d.volumeInSitu, 2)} m³ in situ)
        <br />
        <span style={{ color: SS.formulaText }}>
          Soma totais R$ custo = {fmtBRL((d.totalBase || 0) + (d.totalEmpolamento || 0) + (d.totalPerda || 0))} = Total Custo
        </span>
        <br />
        <span style={{ color: SS.refText }}>
          Soma totais R$ venda = {fmtBRL((d.totalVendaBase || 0) + (d.totalVendaEmpolamento || 0) + (d.totalVendaPerda || 0))} = Total Venda
        </span>
      </div>
    </div>
  );
}

function KpiCell({ label, valor, hint, kind = "formula", emphasize = false }) {
  const color =
    kind === "key" ? SS.formulaText :
    kind === "ref" ? SS.refText     :
    kind === "muted" ? SS.mutedText :
    kind === "danger" ? (SS.errText || "#b91c1c") :
                     SS.formulaText;
  const bg =
    kind === "key" ? SS.bgKeyInput :
    kind === "danger" ? (SS.errBg || "rgba(220, 38, 38, 0.10)") :
    kind === "muted" ? (SS.bgAlt || SS.bg) :
    SS.bg;
  return (
    <div
      style={{
        background: bg,
        padding: "10px 14px",
        display: "flex",
        flexDirection: "column",
        gap: 4,
      }}
    >
      <div
        style={{
          fontSize: 10,
          fontWeight: 700,
          color: SS.mutedText,
          letterSpacing: 0.5,
          textTransform: "uppercase",
          fontFamily: SS.fontUI,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: emphasize ? 17 : 15,
          fontWeight: 800,
          color,
          fontFamily: SS.fontMono,
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {valor}
      </div>
      {hint && (
        <div style={{ fontSize: 10, color: SS.mutedText, fontStyle: "italic", fontFamily: SS.fontUI }}>
          {hint}
        </div>
      )}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────
// 4 — Resumo do item
// ──────────────────────────────────────────────────────────────────
function ResumoItem({ result, item, unit }) {
  const custoUn = result.custo_unitario ?? 0;
  const precoUn = result.preco_unitario ?? 0;
  const markupEf = custoUn > 0 ? precoUn / custoUn : (result.markup_aplicado ?? 0);
  const volume   = result.volumeInSitu ?? item.quantity ?? 0;
  const totalIt  = result.total_item ?? 0;

  return (
    <Section n={4} title="Resumo do item" hint="Σ de todos os equipamentos">
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(5, minmax(0, 1fr))",
          gap: 1,
          background: SS.gridLine,
          border: `1px solid ${SS.border}`,
        }}
      >
        <KpiCell label={`Σ Custo unitário`}      valor={`${fmtBRL(custoUn)} R$/${unit}`} />
        <KpiCell label={`Σ Preço unitário`}      valor={`${fmtBRL(precoUn)} R$/${unit}`} kind="ref" emphasize />
        <KpiCell label="Markup efetivo do item"  valor={`× ${fmt(markupEf, 2)}`} kind="key" />
        <KpiCell label="Volume do item"          valor={`${fmt(volume, 2)} ${unit}`} />
        <KpiCell label="TOTAL DO ITEM"           valor={fmtBRL(totalIt)} kind="ref" emphasize />
      </div>
    </Section>
  );
}

// ──────────────────────────────────────────────────────────────────
// Validações
// ──────────────────────────────────────────────────────────────────
function PainelValidacoes({ validacoes }) {
  return (
    <Section n="!" title="Validações">
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {validacoes.map((v, i) => {
          const c = SEVERIDADE[v.severidade] || SEVERIDADE.info;
          return (
            <div
              key={i}
              style={{
                padding: "8px 12px",
                background: c.bg,
                color: c.color,
                border: `1px solid ${c.color}33`,
                fontFamily: SS.fontUI,
                fontSize: 12.5,
                display: "flex",
                gap: 10,
                alignItems: "flex-start",
              }}
            >
              <span style={{ fontSize: 14, fontWeight: 800 }}>{c.icon}</span>
              <span>{v.mensagem}</span>
            </div>
          );
        })}
      </div>
    </Section>
  );
}

// ──────────────────────────────────────────────────────────────────
// Helpers visuais
// ──────────────────────────────────────────────────────────────────
function Section({ n, title, hint, children }) {
  return (
    <section style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <h3
        style={{
          margin: 0,
          fontSize: 12,
          fontWeight: 800,
          color: SS.headerText,
          letterSpacing: 0.6,
          textTransform: "uppercase",
          borderBottom: `2px solid ${SS.accentBlue}`,
          paddingBottom: 4,
          display: "flex",
          alignItems: "center",
          gap: 8,
          fontFamily: SS.fontUI,
        }}
      >
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            minWidth: 20,
            height: 20,
            padding: "0 6px",
            background: SS.accentBlue,
            color: "#FFFFFF",
            fontSize: 11,
            fontWeight: 800,
          }}
        >
          {n}
        </span>
        {title}
        {hint && (
          <span
            style={{
              marginLeft: "auto",
              fontSize: 11,
              color: SS.mutedText,
              fontWeight: 500,
              textTransform: "none",
              letterSpacing: 0,
              fontStyle: "italic",
            }}
          >
            {hint}
          </span>
        )}
      </h3>
      {children}
    </section>
  );
}

function SubTitle({ children }) {
  return (
    <div
      style={{
        fontSize: 11,
        fontWeight: 700,
        color: SS.mutedText,
        textTransform: "uppercase",
        letterSpacing: 0.4,
        marginBottom: 6,
        fontFamily: SS.fontUI,
      }}
    >
      {children}
    </div>
  );
}

function SimpleTable({ head, rows, aligns = [] }) {
  return (
    <div style={{ border: `1px solid ${SS.border}`, overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: SS.fontUI }}>
        <thead>
          <tr>
            {head.map((h, i) => (
              <th
                key={i}
                style={{
                  padding: "6px 10px",
                  background: SS.bgHeader,
                  color: SS.headerText,
                  fontSize: SS.fontSizeHdr,
                  fontWeight: 700,
                  textTransform: "uppercase",
                  letterSpacing: 0.4,
                  borderBottom: `2px solid ${SS.accentBlue}`,
                  border: `1px solid ${SS.border}`,
                  textAlign: aligns[i] || (i === 0 ? "left" : "right"),
                  whiteSpace: "nowrap",
                }}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((cells, ri) => (
            <tr key={ri} style={{ background: ri % 2 === 1 ? SS.bgAlt : SS.bg }}>
              {cells.map((c, ci) => (
                <td
                  key={ci}
                  style={{
                    padding: "6px 10px",
                    border: `1px solid ${SS.gridLine}`,
                    textAlign: aligns[ci] || (ci === 0 ? "left" : "right"),
                    color: SS.formulaText,
                    fontFamily: ci === 0 ? SS.fontUI : SS.fontMono,
                    fontSize: 12,
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Sup({ children, label }) {
  return (
    <sup
      title={label}
      style={{ color: SS.accentBlue, fontWeight: 700, marginLeft: 2, cursor: "help" }}
    >
      {children}
    </sup>
  );
}

function Strong({ children, color }) {
  return <span style={{ fontWeight: 800, color: color || SS.formulaText }}>{children}</span>;
}

function pill(bg, color) {
  return {
    display: "inline-flex",
    alignItems: "center",
    padding: "1px 6px",
    fontSize: 10,
    fontWeight: 800,
    color,
    background: bg,
    letterSpacing: 0.3,
    textTransform: "uppercase",
    fontFamily: SS.fontUI,
    border: `1px solid ${color}33`,
  };
}

function Pill({ tone = "info", children }) {
  const map = {
    info: { bg: SS.infoBg, color: SS.infoText },
    warn: { bg: SS.warnBg, color: SS.warnText },
    success: { bg: SS.okBg, color: SS.okText },
    muted: { bg: SS.bgAlt, color: SS.mutedText },
    ok:   { bg: SS.okBg,   color: SS.okText   },
    err:  { bg: SS.errBg,  color: SS.errText  },
  };
  const p = map[tone] || map.info;
  return <span style={pill(p.bg, p.color)}>{children}</span>;
}

function Aviso({ severidade = "info", children }) {
  const c = SEVERIDADE[severidade] || SEVERIDADE.info;
  return (
    <div
      style={{
        padding: "10px 14px",
        background: c.bg,
        color: c.color,
        border: `1px solid ${c.color}33`,
        fontFamily: SS.fontUI,
        fontSize: 12.5,
        display: "flex",
        gap: 10,
        alignItems: "flex-start",
      }}
    >
      <span style={{ fontSize: 14, fontWeight: 800 }}>{c.icon}</span>
      <span>{children}</span>
    </div>
  );
}

function ModalShell({ title, subtitle, onClose, children }) {
  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1000,
        background: "rgba(0,0,0,0.65)",
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "center",
        padding: "32px 16px",
        overflowY: "auto",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "min(1180px, 100%)",
          background: SS.bg,
          fontFamily: SS.fontUI,
          color: SS.formulaText,
          border: `1px solid ${SS.border}`,
          boxShadow: "0 12px 32px rgba(0,0,0,0.45)",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div
          style={{
            padding: "12px 18px",
            background: SS.headerText,
            color: "#FFFFFF",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <div>
            {subtitle && (
              <div
                style={{
                  fontSize: 11,
                  opacity: 0.8,
                  letterSpacing: 1,
                  textTransform: "uppercase",
                }}
              >
                {subtitle}
              </div>
            )}
            <div style={{ fontSize: 16, fontWeight: 800 }}>{title}</div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: "rgba(255,255,255,0.12)",
              color: "#FFFFFF",
              border: "1px solid rgba(255,255,255,0.25)",
              padding: "6px 14px",
              cursor: "pointer",
              fontFamily: SS.fontUI,
              fontSize: 13,
              fontWeight: 700,
            }}
          >
            Fechar ✕
          </button>
        </div>

        <div style={{ padding: 18, display: "flex", flexDirection: "column", gap: 18 }}>
          {children}
        </div>
      </div>
    </div>
  );
}
