import React, { useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import S from "../../styles/tokens";
import { fmt, fmtBRL } from "../../utils/format";
import { ASSUMPTIONS } from "../../config/assumptions.config";
import { calcIndiretoRateadoPorM3, calcNumOperadoresFrota, roundIndiretoLineTotal } from "../../services/costEngine";

// ──────────────────────────────────────────────────────────────────
// <PessoasIndiretas>
// Seção de NÍVEL DO ORÇAMENTO (não do item): aloca a equipe indireta
// (topografia, alojamento, alimentação, vigilância, laboratório…) que
// será rateada por volume in situ e distribuída como R$/m³ por
// equipamento ativo.
//
// Props:
//   - value:          array [{ tipo, quantidade }]
//   - onChange:       (newArray) => void
//   - params:         INITIAL_PARAMS do projeto (lê pessoas_indiretas)
//   - items:          itens do orçamento (para somar volume in situ e
//                     deduzir prazo / horas projeto)
// ──────────────────────────────────────────────────────────────────

const TIPO_LABEL = {
  topografia:    "Topografia",
  laboratorio:   "Laboratório",
  alojamento:    "Alojamento",
  alimentacao:   "Alimentação",
  vigilancia:    "Vigilância",
};

const tipoLabel = (k) => TIPO_LABEL[k] || (k ? k[0].toUpperCase() + k.slice(1) : k);

const toNum = (v, fallback = 0) => {
  const n = typeof v === "string" ? parseFloat(v.replace(",", ".")) : parseFloat(v);
  return Number.isFinite(n) ? n : fallback;
};

// Resolve R$/h para um tipo. Para alimentação sem valor cadastrado,
// calcula dinamicamente a partir dos parâmetros e do tamanho da equipe.
function resolveCustoHora(tipo, tabela, params, numOperadoresFrota, numPessoasIndiretas) {
  const raw = tabela?.[tipo];
  if (tipo === "alimentacao" && (raw == null || raw === 0)) {
    const valorDia = toNum(params?.alimentacao_valor_dia, ASSUMPTIONS.pessoasIndiretas.alimentacao.valorDia);
    const diasMes  = toNum(params?.alimentacao_dias_mes,  ASSUMPTIONS.pessoasIndiretas.alimentacao.diasMes);
    const horasRef = toNum(params?.alimentacao_horas_ref, ASSUMPTIONS.pessoasIndiretas.alimentacao.horasRef);
    const totalPessoasObra = toNum(numOperadoresFrota, 0) + numPessoasIndiretas;
    return {
      valor: horasRef > 0 ? (totalPessoasObra * valorDia * diasMes) / horasRef : 0,
      fonte: "dinamica",
      hint: `(${totalPessoasObra} pessoas × ${fmtBRL(valorDia)}/dia × ${fmt(diasMes, 0)} dias) ÷ ${fmt(horasRef, 0)} h`,
    };
  }
  return { valor: toNum(raw, 0), fonte: raw == null ? "vazio" : "tabela", hint: "" };
}

export default function PessoasIndiretas({ value = [], onChange, params, items = [], totalHorasProjeto = 0 }) {
  const tabela = params?.pessoas_indiretas || ASSUMPTIONS.pessoasIndiretas.porTipo;

  // Tipos cadastrados nos parâmetros (após filtro de descontinuados).
  const tiposDisponiveis = useMemo(() => Object.keys(tabela || {}), [tabela]);

  // Volume in situ do orçamento — soma dos itens (em modelo novo).
  // Se não houver, usa o primeiro item como fallback (spec seção 2.4).
  const volumeInSitu = useMemo(() => {
    if (!Array.isArray(items) || items.length === 0) return 0;
    const soma = items.reduce(
      (s, it) => s + toNum(it?.volumeInSitu, toNum(it?.quantity, 0)),
      0,
    );
    return soma > 0 ? soma : toNum(items[0]?.volumeInSitu, toNum(items[0]?.quantity, 0));
  }, [items]);

  // Horas projeto — usa o primeiro item com volumeInSitu > 0 (o orçamento
  // ainda não tem campos próprios de prazo/dias/horas no nível superior).
  const { horasProjeto, prazoMeses, diasUteisMes, horasDia } = useMemo(() => {
    const it = items.find((x) => toNum(x?.volumeInSitu, 0) > 0) || items[0] || {};
    const pm = toNum(it.prazoMeses,   toNum(params?.prazo_meses,   0));
    const du = toNum(it.diasUteisMes, toNum(params?.dias_uteis_mes, 22));
    const hd = toNum(it.horasDia,     toNum(params?.horas_dia,     9));
    const calculatedHoras = du * hd * pm;
    return {
      horasProjeto: totalHorasProjeto > 0 ? totalHorasProjeto : calculatedHoras,
      prazoMeses: pm,
      diasUteisMes: du,
      horasDia: hd,
    };
  }, [items, params, totalHorasProjeto]);

  const numOperadoresFrota = useMemo(() => {
    return calcNumOperadoresFrota(items, params);
  }, [items, params]);

  const numPessoasIndiretas = useMemo(
    () => value.reduce((s, p) => s + (toNum(p.quantidade, 0) > 0 ? toNum(p.quantidade, 0) : 0), 0),
    [value],
  );

  const linhas = useMemo(() => {
    return value.map((p, idx) => {
      const ch = resolveCustoHora(p.tipo, tabela, params, numOperadoresFrota, numPessoasIndiretas);
      const qty = toNum(p.quantidade, 0);
      const total = roundIndiretoLineTotal(p.tipo, ch.valor * horasProjeto * qty);
      return { idx, tipo: p.tipo, quantidade: qty, custoHora: ch.valor, fonte: ch.fonte, hint: ch.hint, total };
    });
  }, [value, tabela, params, numOperadoresFrota, numPessoasIndiretas, horasProjeto]);

  const totalIndireto = linhas.reduce((s, l) => s + l.total, 0);
  const custoTotalM3 = volumeInSitu > 0 ? totalIndireto / volumeInSitu : 0;
  const indiretoPorEquipamento = numPessoasIndiretas > 0 ? custoTotalM3 / numPessoasIndiretas : 0;

  // Garantia de consistência com o engine (canônico) — usa o mesmo cálculo:
  const breakdown = useMemo(
    () => calcIndiretoRateadoPorM3(
      params, value, numOperadoresFrota, volumeInSitu, horasProjeto, { withBreakdown: true },
    ),
    [params, value, numOperadoresFrota, volumeInSitu, horasProjeto],
  );

  // Tipos que ainda podem ser adicionados (não duplicar).
  const tiposJaUsados = new Set(value.map((p) => p.tipo));
  const tiposAdicionaveis = tiposDisponiveis.filter((t) => !tiposJaUsados.has(t));

  const [addOpen, setAddOpen] = useState(false);
  const [aviso, setAviso] = useState("");

  const addLinha = (tipo) => {
    if (tiposJaUsados.has(tipo)) {
      setAviso(`"${tipoLabel(tipo)}" já foi adicionado. Aumente a quantidade na linha existente.`);
      return;
    }
    setAviso("");
    onChange([...value, { tipo, quantidade: 1 }]);
    setAddOpen(false);
  };
  const removeLinha = (idx) => {
    setAviso("");
    onChange(value.filter((_, i) => i !== idx));
  };
  const setQty = (idx, qty) => {
    setAviso("");
    const v = Math.max(0, Math.floor(toNum(qty, 0)));
    onChange(value.map((p, i) => (i !== idx ? p : { ...p, quantidade: v })));
  };

  return (
    <div
      style={{
        marginTop: 16,
        border: `1px solid ${S.border}`,
        borderRadius: 10,
        background: "rgba(255,255,255,0.02)",
        padding: 16,
        display: "flex",
        flexDirection: "column",
        gap: 12,
      }}
    >
      <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
        <span style={{ fontSize: 16 }}>👥</span>
        <h3 style={{ margin: 0, fontSize: 14, fontWeight: 800, color: S.text, letterSpacing: 0.4, textTransform: "uppercase" }}>
          Pessoas Indiretas do Orçamento
        </h3>
        <span style={{ marginLeft: "auto", fontSize: 11, color: S.muted, fontStyle: "italic" }}>
          rateado por volume in situ — entra como R$/m³ em cada equipamento ativo
        </span>
      </div>

      <p style={{ margin: 0, fontSize: 12, color: S.muted, lineHeight: 1.5 }}>
        Os custos indiretos cobrem o orçamento inteiro (não item por item). O sistema soma
        <code style={{ color: S.accent2, margin: "0 4px" }}>R$/h × horas projeto × qty</code>
        de cada tipo, divide pelo volume in situ do orçamento e pela quantidade de pessoas
        para obter o R$/m³ que entra em cada equipamento ativo.
      </p>

      {/* Tabela de linhas */}
      <div style={{ border: `1px solid ${S.border}`, borderRadius: 8, overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
          <thead>
            <tr style={{ background: "rgba(0,0,0,0.25)" }}>
              <Th>Tipo</Th>
              <Th align="right">R$/h</Th>
              <Th align="right">Horas</Th>
              <Th align="right">Qtd</Th>
              <Th align="right">Total R$</Th>
              <Th align="center" w={32}></Th>
            </tr>
          </thead>
          <tbody>
            {linhas.length === 0 ? (
              <tr>
                <td colSpan={6} style={{ padding: 14, textAlign: "center", color: S.muted, fontStyle: "italic" }}>
                  Nenhuma pessoa indireta alocada — o indireto será zero no cálculo.
                </td>
              </tr>
            ) : (
              linhas.map((l) => (
                <tr key={l.idx} style={{ borderTop: `1px solid ${S.border}` }}>
                  <Td>
                    <span style={{ color: S.text, fontWeight: 600 }}>{tipoLabel(l.tipo)}</span>
                  </Td>
                  <Td align="right">
                    <span
                      title={l.fonte === "dinamica" ? `Calculado dinamicamente: ${l.hint}` : "Cadastrado em Parâmetros"}
                      style={{
                        color: l.fonte === "dinamica" ? S.accent2 : S.text,
                        fontFamily: "ui-monospace, monospace",
                        cursor: l.fonte === "dinamica" ? "help" : "default",
                        textDecoration: l.fonte === "dinamica" ? "underline dotted" : "none",
                      }}
                    >
                      {fmtBRL(l.custoHora)}
                    </span>
                  </Td>
                  <Td align="right">
                    <span style={{ color: S.muted, fontFamily: "ui-monospace, monospace" }}>
                      {fmt(horasProjeto, 0)}
                    </span>
                  </Td>
                  <Td align="right">
                    <input
                      type="number"
                      min="0"
                      step="1"
                      value={l.quantidade}
                      onChange={(e) => setQty(l.idx, e.target.value)}
                      style={{
                        width: 64,
                        textAlign: "right",
                        background: "rgba(0,0,0,0.30)",
                        color: S.text,
                        border: `1px solid ${S.border}`,
                        borderRadius: 4,
                        padding: "4px 6px",
                        fontFamily: "ui-monospace, monospace",
                      }}
                    />
                  </Td>
                  <Td align="right">
                    <span style={{ color: S.accent, fontWeight: 700, fontFamily: "ui-monospace, monospace" }}>
                      {fmtBRL(l.total)}
                    </span>
                  </Td>
                  <Td align="center">
                    <button
                      onClick={() => removeLinha(l.idx)}
                      title="Remover linha"
                      style={{
                        background: "transparent",
                        color: S.danger,
                        border: "none",
                        cursor: "pointer",
                        padding: 4,
                      }}
                    >
                      <Trash2 size={14} />
                    </button>
                  </Td>
                </tr>
              ))
            )}
          </tbody>
          {linhas.length > 0 && (
            <tfoot>
              <tr style={{ background: "rgba(0,0,0,0.30)", borderTop: `2px solid ${S.border}` }}>
                <Td colSpan={4} align="right">
                  <span style={{ color: S.muted, textTransform: "uppercase", fontSize: 11, letterSpacing: 0.4 }}>
                    Σ Total indireto
                  </span>
                </Td>
                <Td align="right">
                  <span style={{ color: S.accent3, fontWeight: 800, fontFamily: "ui-monospace, monospace" }}>
                    {fmtBRL(totalIndireto)}
                  </span>
                </Td>
                <Td />
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {/* Botão adicionar */}
      <div style={{ position: "relative" }}>
        {addOpen ? (
          <div
            style={{
              display: "flex",
              gap: 6,
              alignItems: "center",
              padding: 8,
              border: `1px solid ${S.border}`,
              borderRadius: 8,
              background: "rgba(0,0,0,0.25)",
            }}
          >
            <span style={{ fontSize: 12, color: S.muted, marginRight: 6 }}>Adicionar:</span>
            {tiposAdicionaveis.length === 0 ? (
              <span style={{ fontSize: 12, color: S.muted, fontStyle: "italic" }}>
                Todos os tipos cadastrados já foram adicionados.
              </span>
            ) : (
              tiposAdicionaveis.map((t) => (
                <button
                  key={t}
                  onClick={() => addLinha(t)}
                  style={{
                    background: "rgba(59,130,246,0.15)",
                    color: S.accent2,
                    border: `1px solid ${S.accent2}55`,
                    borderRadius: 6,
                    padding: "5px 10px",
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  + {tipoLabel(t)}
                </button>
              ))
            )}
            <button
              onClick={() => setAddOpen(false)}
              style={{
                marginLeft: "auto",
                background: "transparent",
                color: S.muted,
                border: `1px solid ${S.border}`,
                borderRadius: 6,
                padding: "4px 10px",
                fontSize: 11,
                cursor: "pointer",
              }}
            >
              Cancelar
            </button>
          </div>
        ) : (
          <button
            onClick={() => setAddOpen(true)}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              background: "rgba(16,185,129,0.10)",
              color: S.accent3,
              border: `1px solid ${S.accent3}55`,
              borderRadius: 8,
              padding: "6px 14px",
              fontSize: 12.5,
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            <Plus size={14} />
            Adicionar pessoa indireta
          </button>
        )}
        {aviso && (
          <div
            style={{
              marginTop: 8,
              padding: "6px 10px",
              borderRadius: 6,
              background: "rgba(245,158,11,0.10)",
              border: "1px solid rgba(245,158,11,0.35)",
              color: "#f59e0b",
              fontSize: 12,
            }}
          >
            ⚠ {aviso}
          </div>
        )}
      </div>

      {/* Cálculo do Indireto Rateado */}
      <div
        style={{
          marginTop: 4,
          padding: 14,
          borderRadius: 10,
          background: "rgba(59,130,246,0.05)",
          border: `1px solid ${S.accent2}33`,
          display: "flex",
          flexDirection: "column",
          gap: 8,
          fontSize: 12.5,
        }}
      >
        <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
          <span style={{ fontSize: 14 }}>📊</span>
          <h4 style={{ margin: 0, fontSize: 12, fontWeight: 800, color: S.accent2, letterSpacing: 0.4, textTransform: "uppercase" }}>
            Cálculo do Indireto Rateado
          </h4>
          <span style={{ marginLeft: "auto", fontSize: 10.5, color: S.muted, fontStyle: "italic" }}>
            horas projeto = {totalHorasProjeto > 0
              ? `${fmt(horasProjeto, 0)} h (valor fixado no orçamento)`
              : `${fmt(diasUteisMes, 0)} dias × ${fmt(horasDia, 0)} h × ${fmt(prazoMeses, 0)} meses = ${fmt(horasProjeto, 0)} h`}
          </span>
        </div>

        {linhas.length === 0 || numPessoasIndiretas <= 0 ? (
          <div style={{ color: "#f59e0b", fontSize: 12 }}>
            ⚠ Nenhuma pessoa indireta alocada. O indireto será considerado zero no cálculo.
          </div>
        ) : volumeInSitu <= 0 ? (
          <div style={{ color: "#f59e0b", fontSize: 12 }}>
            ⚠ Informe um volume in situ {">"} 0 em pelo menos um item para ver o rateio.
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "auto 1fr auto", gap: "4px 12px", fontFamily: "ui-monospace, monospace" }}>
            <span style={{ color: S.muted }}>Total indireto</span>
            <span style={{ color: S.muted }}>= Σ (R$/h × horas × qtd) de todas as linhas</span>
            <span style={{ color: S.accent3, fontWeight: 700 }}>{fmtBRL(totalIndireto)}</span>

            <span style={{ color: S.muted }}>÷ Volume in situ</span>
            <span style={{ color: S.muted }}>= soma volume in situ do orçamento</span>
            <span style={{ color: S.text }}>{fmt(volumeInSitu, 2)} m³</span>

            <span style={{ color: S.text, fontWeight: 700 }}>= Custo total indireto</span>
            <span />
            <span style={{ color: S.accent, fontWeight: 700 }}>{fmtBRL(custoTotalM3)} /m³</span>

            <span style={{ color: S.muted }}>÷ Qtd pessoas</span>
            <span style={{ color: S.muted }}>= Σ qtd (pessoas com qtd {">"} 0)</span>
            <span style={{ color: S.text }}>{numPessoasIndiretas}</span>

            <span style={{ color: S.text, fontWeight: 800 }}>= Indireto por equipamento</span>
            <span />
            <span style={{ color: S.accent, fontWeight: 800, fontSize: 13 }}>{fmtBRL(indiretoPorEquipamento)} /m³</span>
          </div>
        )}

        {breakdown?.ignorados?.length > 0 && (
          <div style={{ marginTop: 4, fontSize: 11, color: S.muted, fontStyle: "italic" }}>
            ℹ Tipos ignorados (são mão de obra direta):{" "}
            {breakdown.ignorados.map((i) => i.tipo).join(", ")}
          </div>
        )}

        <div style={{ marginTop: 4, padding: "6px 10px", borderRadius: 6, background: "rgba(0,0,0,0.20)", fontSize: 11.5, color: S.muted, fontStyle: "italic" }}>
          ⓘ Esse valor entra como parcela <b style={{ color: S.text }}>Indireto</b> em
          cada equipamento ativo do orçamento, antes do markup por categoria.
        </div>
      </div>
    </div>
  );
}

function Th({ children, align = "left", w }) {
  return (
    <th
      style={{
        padding: "8px 10px",
        textAlign: align,
        color: S.muted,
        fontSize: 10.5,
        fontWeight: 700,
        textTransform: "uppercase",
        letterSpacing: 0.4,
        width: w,
      }}
    >
      {children}
    </th>
  );
}

function Td({ children, align = "left", colSpan }) {
  return (
    <td
      colSpan={colSpan}
      style={{
        padding: "8px 10px",
        textAlign: align,
        verticalAlign: "middle",
        color: S.text,
      }}
    >
      {children}
    </td>
  );
}
