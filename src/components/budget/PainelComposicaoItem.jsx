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
};

const DEPRECATED_VOLUME_TIPO_LABEL = {
  in_situ:  "in situ",
  empolado: "empolado",
};

export default function PainelComposicaoItem({ item, result, onClose }) {
  const aud  = result?.detalhes?.auditoria || {};
  const unit = item?.unit || "m³";
  const isNovo = aud.tipo === "ok-novo";
  const isVB   = aud.tipo === "VB";

  const ctx = aud.contexto || {};
  const eqs = useMemo(
    () => (Array.isArray(aud.equipamentos) ? aud.equipamentos : []),
    [aud.equipamentos],
  );
  const validacoes = aud.validacoes || [];

  const [selecionadoId, setSelecionadoId] = useState("todos");
  const eqsVisiveis = useMemo(() => {
    if (selecionadoId === "todos") return eqs;
    return eqs.filter((e) => (e.equipmentId || e.id) === selecionadoId);
  }, [eqs, selecionadoId]);

  if (!item || !result) return null;

  return (
    <ModalShell
      title={`Composição de Preço · ${item.desc || "(sem descrição)"} · ${fmt(item.quantity, 2)} ${unit}`}
      subtitle="auditoria do item"
      onClose={onClose}
    >
      {!isNovo && !isVB && (
        <Aviso severidade="alerta">
          Item ainda no modelo legado. Para ver a composição detalhada por
          equipamento (markup por categoria, rateio por tipo de volume),
          configure no item: <b>volume in situ</b>, <b>prazo (meses)</b>,{" "}
          <b>dias úteis/mês</b> e <b>horas/dia</b>.
        </Aviso>
      )}

      <PainelVariaveis ctx={ctx} item={item} result={result} unit={unit} />

      <PainelSeletor
        equipamentos={eqs}
        selecionado={selecionadoId}
        onChange={setSelecionadoId}
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
function PainelVariaveis({ ctx, item, result, unit }) {
  const vols = result?.detalhes?.volumes || {};
  const volumeInSitu     = ctx.volumeInSitu     ?? vols.inSitu          ?? item.volumeInSitu      ?? 0;
  const fatorEmpolamento = ctx.fatorEmpolamento ?? vols.fatorEmpolamento ?? item.fatorEmpolamento ?? 1.36;
  const volumeEmpolado   = ctx.volumeEmpolado   ?? vols.empolado        ?? (volumeInSitu * fatorEmpolamento);
  const prazoMeses       = ctx.prazoMeses   ?? item.prazoMeses   ?? 0;
  const diasUteisMes     = ctx.diasUteisMes ?? item.diasUteisMes ?? 0;
  const horasDia         = ctx.horasDia     ?? item.horasDia     ?? 0;
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
function PainelSeletor({ equipamentos, selecionado, onChange, disabled }) {
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
  const fmtFrete = porViagem ? `${fmtBRL(t.valorFrete)}/viagem` : `${fmtBRL(t.valorFrete)}/${unit}`;
  const linhasFormula = porViagem
    ? [
        { label: "Quantidade de viagens", expr: `${fmt(t.volumeBaseTransporte, 2)} ÷ ${fmt(t.volumeLiquidoPorViagem, 2)} = ${fmt(t.quantidadeViagens, 2)} viagens` },
        { label: "Custo total frete", expr: `${fmt(t.quantidadeViagens, 2)} × ${fmtBRL(t.valorFrete)} = ${fmtBRL(t.custoTotalFrete)}` },
      ]
    : [
        { label: "Custo total frete", expr: `${fmt(t.volumeBaseTransporte, 2)} ${unit} × ${fmtBRL(t.valorFrete)} = ${fmtBRL(t.custoTotalFrete)}` },
      ];
  linhasFormula.push(
    { label: "Custo unitário transporte", expr: `${fmtBRL(t.custoTotalFrete)} ÷ ${fmt(t.volumeBaseTransporte, 2)} ${unit} = ${fmtBRLPreciso(t.custoUnitarioTransporte, 6)}` },
    { label: "Preço unitário transporte", expr: `${fmtBRLPreciso(t.custoUnitarioTransporte, 6)} × ${fmt(t.markupTransporte, 2)} = ${fmtBRLPreciso(t.precoUnitarioTransporte, 6)}` },
    { label: "Total venda transporte", expr: `${fmtBRLPreciso(t.precoUnitarioTransporte, 8)} × ${fmt(t.volumeBaseTransporte, 2)} ${unit} = ${fmtBRL(t.totalVendaTransporte)}` },
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
        <Pill tone="info">FRETE {porViagem ? "POR VIAGEM" : "POR M³"}</Pill>
      </div>

      <div style={{ padding: 12, display: "flex", flexDirection: "column", gap: 14 }}>
        <div>
          <SubTitle>Parâmetros do frete</SubTitle>
          <SimpleTable
            head={["Parâmetro", "Valor"]}
            aligns={["left", "right"]}
            rows={[
              ["DMT", t.dmtKm > 0 ? `${fmt(t.dmtKm, 2)} km` : "—"],
              ["Volume in situ por viagem", `${fmt(t.volumeInSituPorViagem, 2)} ${unit}`],
              ["Fator empolamento transporte", `× ${fmt(t.fatorEmpolamentoTransporte, 3)}`],
              ["Volume empolado por viagem", `${fmt(t.volumeEmpoladoPorViagem, 2)} m³ empolado`],
              ["Perda no carregamento", `${fmt((t.perdaCarregamentoPct || 0) * 100, 2)}%  →  ${fmt(t.perdaCarregamentoM3, 2)} ${unit}`],
              ["Volume líquido por viagem", `${fmt(t.volumeLiquidoPorViagem, 2)} ${unit}`],
              ["Modo do frete", porViagem ? "por viagem" : "por m³"],
              ["Valor do frete", fmtFrete],
              ["Volume base de transporte", `${fmt(t.volumeBaseTransporte, 2)} ${unit}`],
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

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
            gap: 1,
            background: SS.gridLine,
            border: `1px solid ${SS.border}`,
          }}
        >
          <KpiCell label="Custo unitário transporte" valor={`${fmtBRL(t.custoUnitarioTransporte)} R$/${unit}`} />
          <KpiCell label="Markup transporte"          valor={`× ${fmt(t.markupTransporte, 2)}`} kind="key" />
          <KpiCell label="Preço unitário transporte" valor={`${fmtBRL(t.precoUnitarioTransporte)} R$/${unit}`} kind="ref" emphasize />
          <KpiCell
            label="Total transporte na obra"
            valor={fmtBRL(t.totalVendaTransporte)}
            hint={`= ${fmtBRLPreciso(t.precoUnitarioTransporte, 8)} × ${fmt(t.volumeBaseTransporte, 2)} ${unit} transporte agregado`}
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

function KpiCell({ label, valor, hint, kind = "formula", emphasize = false }) {
  const color =
    kind === "key" ? SS.formulaText :
    kind === "ref" ? SS.refText     :
                     SS.formulaText;
  const bg = kind === "key" ? SS.bgKeyInput : SS.bg;
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
