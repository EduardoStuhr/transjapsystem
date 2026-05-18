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

const tipoLabel = (t) => VOLUME_TIPO_LABEL[t] || t || "—";

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
  const consolidacaoCategorias = Array.isArray(aud.consolidacaoCategorias)
    ? aud.consolidacaoCategorias
    : (Array.isArray(aud.consolidacao_categorias) ? aud.consolidacao_categorias : []);
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

  if (item.modoPreco === "preco_cravado") {
    return (
      <ModalShell
        title={`Item com preço cravado · ${item.desc || "(sem descrição)"} · ${fmt(item.quantity, 2)} ${unit}`}
        subtitle="preço de mercado"
        onClose={onClose}
      >
        <Aviso severidade="info">
          📌 <b>Item com preço cravado de mercado.</b> Não usa composição
          técnica detalhada — preço definido por mercado consagrado.
        </Aviso>

        <div style={{ border: `1px solid ${SS.border}` }}>
          <CravadoRow label="Preço unitário"   valor={`${fmtBRL(item.precoUnitCravado || 0)} / ${unit}`} />
          <CravadoRow label="Quantidade"       valor={`${fmt(item.quantity || 0, 2)} ${unit}`} />
          <CravadoRow label="Total"            valor={fmtBRL((item.quantity || 0) * (item.precoUnitCravado || 0))} emphasize />
          <CravadoRow label="Fonte do preço"   valor={item.fontePrecoCravado || "(não informada)"} />
        </div>

        <Aviso severidade="alerta">
          Itens em preço cravado não absorvem indireto rateado da obra.
          Para gerenciar lucratividade, ajuste o preço de venda no item
          ou use composição técnica.
        </Aviso>

        {validacoes.length > 0 && <PainelValidacoes validacoes={validacoes} />}
      </ModalShell>
    );
  }

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

      <PainelConsolidacaoCategorias grupos={consolidacaoCategorias} unit={unit} isNovo={isNovo} />

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

function PainelConsolidacaoCategorias({ grupos, unit, isNovo }) {
  if (!isNovo) return null;
  return (
    <Section n="3B" title={grupos?.length === 1 ? `Consolidação da categoria ${grupos[0].categoria}` : "Consolidação por categoria"} hint="custos unitários somados antes do markup">
      {!grupos?.length ? (
        <Aviso severidade="info">Nenhuma categoria consolidada para este item.</Aviso>
      ) : (
        <>
          <SimpleTable
            head={[
              "Categoria",
              "Diesel unit.",
              "Manutenção unit.",
              "Mão de obra unit.",
              "Indireto único",
              "Custo unit. consolidado",
              "Markup",
              "Preço unitário",
              "Total",
            ]}
            aligns={["left", "right", "right", "right", "right", "right", "right", "right", "right"]}
            rows={grupos.map((g) => {
              const equipamentos = g.equipamentosIncluidos || g.equipamentos_incluidos || [];
              return [
                <span title={equipamentos.join(", ")}>{g.categoria}</span>,
                `${fmtBRL(g.somaDieselUnitario ?? g.soma_diesel_unitario)} / ${unit}`,
                `${fmtBRL(g.somaManutencaoUnitaria ?? g.soma_manutencao_unitaria)} / ${unit}`,
                `${fmtBRL(g.somaMaoDeObraUnitaria ?? g.soma_mao_de_obra_unitaria)} / ${unit}`,
                `${fmtBRL(g.indireto_R$_m3 ?? ((g.indiretoUnicoAplicado ?? g.indireto_unico_aplicado ?? 0) / (g.volumeReferencia || g.volume_referencia || 1)))} / ${unit}`,
                `${fmtBRL(g.custoUnitarioAgrupado ?? g.custo_unitario_agrupado)} / ${unit}`,
                `× ${fmt(g.markupCategoria ?? g.markup_categoria, 2)}`,
                <Strong color={SS.refText}>
                  {fmtBRL(g.precoUnitarioFinal ?? g.preco_unitario_final)} / {unit}
                </Strong>,
                <Strong color={SS.refText}>{fmtBRL(g.totalFinalGrupo ?? g.total_final_grupo)}</Strong>,
              ];
            })}
          />

          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 10 }}>
            {grupos.map((g) => {
              const equipamentos = g.equipamentosIncluidos || g.equipamentos_incluidos || [];
              return (
                <div
                  key={g.categoria}
                  style={{
                    padding: "8px 10px",
                    border: `1px solid ${SS.gridLine}`,
                    background: SS.bgAlt,
                    fontSize: 11,
                    color: SS.mutedText,
                    fontFamily: SS.fontUI,
                    lineHeight: 1.5,
                  }}
                >
                  <b style={{ color: SS.text }}>Categoria: {g.categoria}</b>
                  {" "}· Equipamentos incluídos: {equipamentos.join(", ") || "—"}
                  {" "}· Indireto aplicado uma única vez: {fmtBRL(g.indiretoUnicoAplicado ?? g.indireto_unico_aplicado ?? g.somaIndiretos ?? g.soma_indiretos)}
                  {" "}· Origem do indireto: {g.origemIndireto || g.origem_indireto || "cálculo geral do projeto"}
                  {" "}· Base de rateio: {tipoLabel(g.baseRateioIndireto || g.base_rateio_indireto)}
                  {" "}· Volume dos custos diretos: {fmt(g.volumeReferenciaCustosDiretos ?? g.volume_referencia_custos_diretos, 2)} {unit} {tipoLabel(g.volumeReferenciaCustosDiretosTipo || g.volume_referencia_custos_diretos_tipo)}
                  {" "}· Volume do total final: {fmt(g.volumeReferenciaTotalFinal ?? g.volume_referencia_total_final ?? g.volumeReferencia ?? g.volume_referencia, 2)} {unit} {tipoLabel(g.volumeReferenciaTotalFinalTipo || g.volume_referencia_total_final_tipo || "in_situ")}
                  {" "}· Markup aplicado uma vez: × {fmt(g.markupCategoria ?? g.markup_categoria, 2)}
                </div>
              );
            })}
          </div>
        </>
      )}
    </Section>
  );
}

// ──────────────────────────────────────────────────────────────────
// 1 — Painel de variáveis do orçamento
// ──────────────────────────────────────────────────────────────────
function PainelVariaveis({ ctx, item, result, unit, paramsDoOrcamento = {} }) {
  const vols = result?.detalhes?.volumes || {};
  const isArea = ctx.isArea || ctx.tipoComposicao === "m2" || String(unit || "").toUpperCase() === "M2" || String(unit || "").toUpperCase() === "M²";
  const volumeInSitu     = ctx.volumeInSitu     ?? vols.inSitu          ?? item.volumeInSitu      ?? 0;
  const fatorEmpolamento = ctx.fatorEmpolamento ?? vols.fatorEmpolamento ?? item.fatorEmpolamento ?? 1.36;
  const volumeEmpolado   = ctx.volumeEmpolado   ?? vols.empolado        ?? (volumeInSitu * fatorEmpolamento);
  const prazoMeses       = toPositiveNumber(ctx.prazoMeses, toPositiveNumber(item.prazoMeses, toPositiveNumber(paramsDoOrcamento.prazo_meses, 0)));
  const diasUteisMes     = toPositiveNumber(ctx.diasUteisMes, toPositiveNumber(item.diasUteisMes, toPositiveNumber(paramsDoOrcamento.dias_uteis_mes, 0)));
  const horasDia         = toPositiveNumber(ctx.horasDia, toPositiveNumber(item.horasDia, toPositiveNumber(paramsDoOrcamento.horas_dia, 0)));
  const horasProjeto     = ctx.horasGeraisContrato ?? ctx.horasProjeto ?? (diasUteisMes * horasDia * prazoMeses);
  const diasUteisItem    = ctx.diasUteisItem ?? 0;
  const horasItem        = ctx.horasItem ?? 0;
  const producaoConjunto = ctx.producaoConjuntoHora ?? 0;
  const horasMaquina     = ctx.horasMaquinaNecessarias ?? 0;

  const cells = [
    {
      label: isArea ? "Área do item" : "Volume in situ",
      valor: volumeInSitu,
      unidade: unit,
      tip: "informado pelo usuário",
    },
    ...(isArea && ctx.modoPreco ? [
      {
        label: "Modo de preço",
        valor: ctx.modoPreco === "preco_mercado" ? "preço de mercado" : "composição técnica",
        unidade: "",
        tip: ctx.modoPreco === "preco_mercado"
          ? "área × preço unitário informado"
          : "composição por produtividade, frota e parcelas técnicas",
        kind: "key",
      },
    ] : []),
    ...(isArea ? [
      {
        label: "Volume empolado",
        valor: "não aplicável",
        unidade: "",
        tip: "serviços em área não usam empolamento",
        kind: "muted",
      },
    ] : [
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
    ]),
    { label: "Prazo",          valor: prazoMeses,   unidade: "meses", decimais: 0, tip: "informado pelo usuário" },
    { label: "Dias úteis/mês", valor: diasUteisMes, unidade: "dias",  decimais: 0, tip: "parâmetro" },
    { label: "Horas/dia",      valor: horasDia,     unidade: "h",     decimais: 0, tip: "parâmetro" },
    {
      label: "Horas gerais do contrato",
      valor: horasProjeto,
      unidade: "h",
      decimais: 0,
      tip: `= ${diasUteisMes} × ${horasDia} × ${prazoMeses}`,
      kind: "ref",
    },
    ...(ctx.reproduzPlanilhaJoaoChecon ? [
      {
        label: "Modo equipamentos",
        valor: "João Checon",
        unidade: "",
        tip: "diesel por Dados do Contrato!J24; manutenção e mão de obra por horas totais do projeto",
        kind: "key",
      },
    ] : []),
    ...(ctx.horasFrenteEscavacao > 0 && !ctx.reproduzPlanilhaJoaoChecon ? [
      {
        label: "Horas frente escavação",
        valor: ctx.horasFrenteEscavacao,
        unidade: "h",
        decimais: 2,
        tip: "variável global do orçamento equivalente a Dados do Contrato!J24",
        kind: "ref",
      },
    ] : []),
    ...(isArea ? [
      {
        label: "Dias úteis do item",
        valor: diasUteisItem,
        unidade: "dias",
        tip: ctx.modoCalculoPrazoItem === "manual" ? "prazo informado no item" : "área ÷ produtividade diária",
      },
      {
        label: "Horas do item",
        valor: horasItem,
        unidade: "h",
        tip: `= ${fmt(diasUteisItem, 2)} × ${fmt(ctx.horasDiaItem || horasDia, 2)} h/dia`,
        kind: "ref",
      },
    ] : []),
    {
      label: "Produção conjunto",
      valor: producaoConjunto,
      unidade: `${unit}/h`,
      tip: ctx.reproduzPlanilhaJoaoChecon
        ? "produção total das escavadeiras selecionadas"
        : (isArea ? "produtividade informada em m²/h" : "Σ produtividade base × qty (sem fatores)"),
    },
    ...(ctx.reproduzPlanilhaJoaoChecon ? [
      {
        label: "Produção escavadeiras",
        valor: ctx.producaoTotalEscavadeirasSelecionadas || 0,
        unidade: `${unit}/h`,
        tip: "Σ produções m³/h das escavadeiras selecionadas",
        kind: "ref",
      },
      {
        label: "Dados Contrato!J24",
        valor: ctx.dadosContratoJ24 || ctx.horasProducaoConjunta || horasMaquina,
        unidade: "h",
        decimais: 2,
        tip: `= ${fmt(ctx.horasFrenteEscavacaoInfo?.volumeEscavacao || volumeInSitu, 2)} ÷ ${fmt(ctx.horasFrenteEscavacaoInfo?.producaoEscavadeiras || ctx.producaoTotalEscavadeirasSelecionadas || producaoConjunto, 2)}`,
        kind: "ref",
      },
    ] : []),
    ...(isArea ? [
      {
        label: "Produtividade original",
        valor: ctx.produtividadeOriginal || 0,
        unidade: ctx.produtividadeUnidadeOriginal === "dia" ? `${unit}/dia` : `${unit}/h`,
        tip: "valor informado pelo usuário",
      },
      {
        label: "Produtividade diária",
        valor: ctx.produtividadeDiaria || (producaoConjunto * horasDia),
        unidade: `${unit}/dia`,
        tip: `= ${fmt(ctx.produtividadeRealPorEquipamento || producaoConjunto, 2)} × ${fmt(ctx.horasDiaItem || horasDia, 0)} h/dia × ${fmt(ctx.quantidadeEquipamentos || 1, 2)} eq`,
      },
      {
        label: "Produtividade convertida",
        valor: ctx.produtividadeConvertidaHora || producaoConjunto,
        unidade: `${unit}/h`,
        tip: ctx.produtividadeUnidadeOriginal === "dia" ? "produtividade diária ÷ horas/dia" : "igual ao valor informado",
      },
      {
        label: "Produtividade real",
        valor: ctx.produtividadeRealPorEquipamento || 0,
        unidade: `${unit}/h/eq`,
        tip: `= convertida × eficiência (${fmt(ctx.fatorEficiencia || 1, 2)}) × logística (${fmt(ctx.fatorLogistica || 1, 2)})`,
      },
      {
        label: "Qtd equipamentos",
        valor: ctx.quantidadeEquipamentos || 0,
        unidade: "eq",
        tip: "soma das quantidades nas linhas de equipamento",
      },
    ] : []),
    {
      label: "Horas-máquina",
      valor: horasMaquina,
      unidade: "h",
      decimais: 2,
      tip: `= ${fmt(volumeInSitu, 2)} ${isArea ? "m²" : unit} ÷ ${fmt(producaoConjunto, 2)} ${unit}/h`,
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
        <span>{typeof valor === "string" ? valor : fmt(valor, decimais)}</span>
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
  const dieselExcecao = eq.volume_ref_diesel_tipo === "in_situ";
  const usaFallbackManut = !(eq.custoManutencaoDireto > 0);
  const prodZero = !(eq.baseProductivity > 0);
  const isArea = ctx.isArea || ctx.tipoComposicao === "m2";
  const volumeInSitu = ctx.volumeInSitu ?? 0;
  const usaFrenteEscavacaoDiesel = eq.base_horas_diesel === "frente_escavacao";
  const supBase = (base) => {
    if (base === "maquina" || base === "proprio_item" || base === "global_obra") return { simbolo: "ⓜ", label: "horas-máquina" };
    if (base === "frente_escavacao") return { simbolo: "Ⓕ", label: "frente de escavação" };
    if (base === "manual") return { simbolo: "ⓘ", label: "horas manuais" };
    return { simbolo: "ⓟ", label: "horas-projeto" };
  };
  const baseManut = supBase(eq.horas_manutencao_base);
  const baseMO = supBase(eq.horas_mo_base);

  // Valores precisos (sem arredondamento) — vindos do costEngine. Fórmulas
  // auditáveis precisam usar esses números crus para bater com a planilha.
  const custoSemMarkup = eq.custo_unitario_individual_sem_markup_preciso
    ?? eq.custo_unitario_sem_indireto_preciso
    ?? eq.custo_unitario_individual_sem_markup
    ?? eq.custo_unitario_sem_indireto
    ?? 0;
  const totalSemMarkup = eq.total_individual_sem_markup_preciso
    ?? eq.total_individual_sem_markup
    ?? (custoSemMarkup * volumeInSitu);
  const volumeConsolidacao = eq.volume_referencia_consolidacao ?? volumeInSitu;
  const volumeConsolidacaoLabel = tipoLabel(eq.volume_referencia_consolidacao_tipo || "empolado");

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
        {usaFrenteEscavacaoDiesel && (
          <span style={pill(SS.infoBg, SS.infoText)} title="Diesel usa horasFrenteEscavacao / Dados do Contrato!J24">
            DIESEL + FRENTE ESC
          </span>
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
                <>{fmt(eq.horas_diesel, 2)} <Sup label={usaFrenteEscavacaoDiesel ? "frente de escavação" : "horas-máquina"}>{usaFrenteEscavacaoDiesel ? "Ⓕ" : "ⓜ"}</Sup></>,
                fmt(eq.qty, 0),
                fmtBRL(eq.total_diesel),
              ],
              [
                "🔧 Manutenção",
                fmtBRL(eq.manutencao_hora),
                <>{fmt(eq.horas_manutencao, 2)} <Sup label={baseManut.label}>{baseManut.simbolo}</Sup></>,
                fmt(eq.qty, 0),
                fmtBRL(eq.total_manutencao),
              ],
              [
                "👷 Mão de obra",
                fmtBRL(eq.operador_hora),
                <>{fmt(eq.horas_mo, 2)} <Sup label={baseMO.label}>{baseMO.simbolo}</Sup></>,
                fmt(eq.qty, 0),
                fmtBRL(eq.total_mo),
              ],
            ]}
          />
          <div style={{ fontSize: 10.5, color: SS.mutedText, marginTop: 4, fontFamily: SS.fontUI }}>
            ⓜ horas-máquina necessárias = {isArea ? "área ÷ produtividade" : "volumeInSitu ÷ Σ produção base"} ·{" "}
            Ⓕ frente de escavação = volume in situ da escavação ÷ produção das escavadeiras ·{" "}
            ⓟ horas gerais do contrato = meses × dias úteis/mês × horas/dia · execução do item = dias úteis do item × horas/dia do item
          </div>
          {usaFrenteEscavacaoDiesel && (
            <div style={{ fontSize: 10.5, color: SS.mutedText, marginTop: 4, fontFamily: SS.fontUI, lineHeight: 1.5 }}>
              <b style={{ color: SS.text }}>Origem das horas do diesel:</b> Frente de escavação.{" "}
              {eq.horas_maquina_origem}
              {" "}Item de origem: {eq.item_origem_horas_diesel || "Escavação e Carga"}.
              {" "}Item alocado: {eq.item_alocado_horas_diesel || "—"}.
            </div>
          )}
          {(eq.formula_diesel || eq.formula_manutencao || eq.formula_mao_obra) && (
            <div style={{ fontSize: 10.5, color: SS.mutedText, marginTop: 6, fontFamily: SS.fontUI, lineHeight: 1.5 }}>
              <b style={{ color: SS.text }}>Fórmulas:</b>{" "}
              Diesel: {eq.formula_diesel_descricao || "custo_h_diesel × horas × qty"} ({eq.formula_diesel || "—"}).{" "}
              Manutenção: {eq.formula_manutencao_descricao || "custo_h_manutencao × horas × qty"} ({eq.formula_manutencao || "—"}).{" "}
              Mão de obra: {eq.formula_mao_obra_descricao || "custo_h_mao_obra × horas × qty"} ({eq.formula_mao_obra || "—"}).
            </div>
          )}
        </div>

        {/* ── Rateio em R$/m³ ── */}
        <div>
          {eq.horas_maquina_origem && (
            <div style={{ fontSize: 10.5, color: SS.mutedText, marginBottom: 6, fontFamily: SS.fontUI }}>
              Origem das horas-mÃ¡quina do diesel: {eq.horas_maquina_origem}
            </div>
          )}
          <SubTitle>Rateio individual sem indireto e sem markup</SubTitle>
          <SimpleTable
            head={["Parcela", "Total R$", "÷ Volume de referência", "Tipo", `R$/${unit}`]}
            aligns={["left", "right", "right", "left", "right"]}
            rows={[
              [
                "⛽ Diesel",
                fmtBRL(eq.total_diesel),
                <>{fmt(volumeConsolidacao, 2)} {unit}</>,
                <Pill tone="info">{volumeConsolidacaoLabel}</Pill>,
                <Strong color={SS.accentBlue}>{fmtBRL(eq.diesel_unitario_consolidacao ?? eq.diesel_R$_m3)}</Strong>,
              ],
              [
                "🔧 Manutenção",
                fmtBRL(eq.total_manutencao),
                <>{fmt(volumeConsolidacao, 2)} {unit}</>,
                <Pill tone="info">{volumeConsolidacaoLabel}</Pill>,
                <Strong color={SS.accentBlue}>{fmtBRL(eq.manutencao_unitaria_consolidacao ?? eq.manutencao_R$_m3)}</Strong>,
              ],
              [
                "👷 Mão de obra",
                fmtBRL(eq.total_mo),
                <>{fmt(volumeConsolidacao, 2)} {unit}</>,
                <Pill tone="info">{volumeConsolidacaoLabel}</Pill>,
                <Strong color={SS.accentBlue}>{fmtBRL(eq.mao_obra_unitaria_consolidacao ?? eq.mo_R$_m3)}</Strong>,
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
          <KpiCell label="Custo unitário sem indireto" valor={`${fmtBRL(custoSemMarkup)} R$/${unit}`} />
          <KpiCell label="Markup individual" valor="não aplicado" kind="muted" />
          <KpiCell label="Indireto individual" valor="não aplicado" kind="muted" />
          <KpiCell
            label="Total individual sem markup"
            valor={fmtBRL(totalSemMarkup)}
            hint={`= ${fmtBRLPreciso(custoSemMarkup, 8)} × ${fmt(volumeConsolidacao, 2)} ${unit} ${volumeConsolidacaoLabel}`}
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
  const usaUnitarioEmpolado = t.modoFrete === "planilha_m3_empolado";

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
            label={usaUnitarioEmpolado ? "Custo unit. m³ empolado (entra no item)" : "Custo unit. equiv. in situ"}
            valor={`${fmtBRLPreciso(t.custoUnitarioTransporte ?? t.custoUnitarioInSitu, 4)}/${unit}`}
            kind="formula"
          />
          <KpiCell
            label="Custo unit. m³ empolado"
            valor={t.decomposicaoPlanilha ? `${fmtBRLPreciso(t.decomposicaoPlanilha.somaPorM3Empolado, 4)}/m³ emp.` : "—"}
            kind="formula"
          />
          <KpiCell
            label={usaUnitarioEmpolado ? "Preço unit. venda (entra no item)" : "Preço unit. equiv. in situ"}
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

function CravadoRow({ label, valor, emphasize }) {
  return (
    <div style={{
      display: "flex",
      justifyContent: "space-between",
      padding: "10px 14px",
      borderBottom: `1px solid ${SS.gridLine}`,
      background: emphasize ? SS.bgHeader : SS.bg,
      fontFamily: SS.fontUI,
      fontSize: 13,
      fontWeight: emphasize ? 800 : 500,
      color: emphasize ? SS.accentGreen : SS.formulaText,
    }}>
      <span>{label}</span>
      <span style={{ fontFamily: SS.fontMono }}>{valor}</span>
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
