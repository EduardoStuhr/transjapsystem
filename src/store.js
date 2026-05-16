import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { INITIAL_PARAMS, INITIAL_EQUIPMENT, INITIAL_SERVICES } from './data/initialData';
import { CALIBRATION_RANGES, CATEGORIAS_SEM_CALIBRAGEM } from './data/calibrationRanges';
import { ASSUMPTIONS } from './config/assumptions.config';
import { normalizeFatorEmpolamento } from './utils/empolamento';

// ── Migrações dos dados persistidos ──
// Cadastros salvos antes da refatoração não têm os novos campos.
// Aqui preenchemos os defaults sem sobrescrever o que o usuário já editou.
const mergeIfMissing = (target, defaults) => {
  const out = { ...defaults, ...target };
  // Para mapas (objetos), preserva chaves customizadas + completa com defaults.
  for (const k of Object.keys(defaults || {})) {
    if (defaults[k] && typeof defaults[k] === 'object' && !Array.isArray(defaults[k])) {
      out[k] = { ...defaults[k], ...(target?.[k] || {}) };
    }
  }
  return out;
};

// Tipos de pessoa indireta que foram movidos para mão de obra direta —
// devem ser silenciosamente removidos de cadastros antigos para não
// inflar o divisor do rateio (cada um seria contado como pessoa).
const TIPOS_INDIRETOS_DESCONTINUADOS = new Set(["apontador", "administrativo"]);

export const temPrecisaoBaixa = (v) => {
  if (typeof v !== "number" || !Number.isFinite(v)) return false;
  if (Number.isInteger(v)) return false;
  return Math.abs(v * 100 - Math.round(v * 100)) < 1e-9;
};

export const sanitizeTabelaRSh = (stored, defaults) => {
  if (!stored || typeof stored !== "object") return { ...defaults };
  const out = { ...defaults };
  for (const [k, v] of Object.entries(stored)) {
    if (v === null) {
      out[k] = null;
      continue;
    }
    const def = defaults[k];
    if (typeof v !== "number" || !Number.isFinite(v)) continue;
    if (
      typeof def === "number" &&
      Number.isFinite(def) &&
      temPrecisaoBaixa(v) &&
      Math.abs(def - v) < 1.0
    ) {
      out[k] = def;
    } else {
      out[k] = v;
    }
  }
  return out;
};

export const sanitizeEquipmentOperatorOverride = (eq, categoriasOperador = INITIAL_PARAMS.categorias_operador) => {
  if (!eq || typeof eq !== "object") return eq;
  const custoOperador = eq.custo_h_operador;
  const categoria = eq.categoria_operador;
  const defaultCategoria = categoria ? categoriasOperador?.[categoria] : null;
  if (
    typeof custoOperador === "number" &&
    Number.isFinite(custoOperador) &&
    custoOperador > 0 &&
    typeof defaultCategoria === "number" &&
    Number.isFinite(defaultCategoria) &&
    temPrecisaoBaixa(custoOperador) &&
    Math.abs(defaultCategoria - custoOperador) < 1.0
  ) {
    return { ...eq, custo_h_operador: 0 };
  }
  return eq;
};

const stripParamsLegado = (params) => {
  if (!params || typeof params !== "object") return params;
  const fatorEmpolamento = normalizeFatorEmpolamento(
    params.fator_empolamento,
    1 + ASSUMPTIONS.empolamento.fatorPadrao
  );
  const pi = params.pessoas_indiretas;
  if (pi && typeof pi === "object") {
    const filtrado = {};
    for (const [k, v] of Object.entries(pi)) {
      if (!TIPOS_INDIRETOS_DESCONTINUADOS.has(k)) filtrado[k] = v;
    }
    return { ...params, fator_empolamento: fatorEmpolamento, pessoas_indiretas: filtrado };
  }
  return { ...params, fator_empolamento: fatorEmpolamento };
};

const migrateParams = (stored) => {
  const merged = stripParamsLegado(mergeIfMissing(stored || {}, INITIAL_PARAMS));
  merged.pessoas_indiretas = sanitizeTabelaRSh(
    merged.pessoas_indiretas,
    INITIAL_PARAMS.pessoas_indiretas,
  );
  merged.categorias_operador = sanitizeTabelaRSh(
    merged.categorias_operador,
    INITIAL_PARAMS.categorias_operador,
  );
  merged.custo_hh_por_categoria_operador = { ...merged.categorias_operador };
  return merged;
};

const migrateEquipment = (storedList) => (storedList || []).map(eq =>
  sanitizeEquipmentOperatorOverride({
    custo_h_manutencao: null,
    categoria_operador: null,
    custo_h_operador:   0,
    baseProductivity:   eq?.productivity ?? 0,
    ...eq,
  })
);

// Limpa `volumeEmpolado` (e `volumeEmpoladoPorViagem`) gravado por versões
// antigas como propriedade do item — agora é sempre derivado em tempo real.
const stripDerivedVolumes = (item) => {
  if (!item || typeof item !== "object") return item;
  const { volumeEmpolado, volumeEmpoladoPorViagem, ...rest } = item;
  if (rest.fatorEmpolamento !== null && rest.fatorEmpolamento !== undefined && rest.fatorEmpolamento !== "") {
    rest.fatorEmpolamento = normalizeFatorEmpolamento(rest.fatorEmpolamento, 1 + ASSUMPTIONS.empolamento.fatorPadrao);
  }
  return rest;
};

// Quotations antigos não tinham `indirectPersonnel` no nível do orçamento;
// garante default vazio e remove tipos descontinuados se persistidos.
const migrateIndirectPersonnel = (list) => {
  if (!Array.isArray(list)) return [];
  return list
    .filter((p) => p && typeof p === "object" && p.tipo)
    .filter((p) => !TIPOS_INDIRETOS_DESCONTINUADOS.has(p.tipo))
    .map((p) => ({ tipo: p.tipo, quantidade: Number(p.quantidade) || 0 }));
};

const migrateQuotations = (storedQuotations) =>
  (storedQuotations || []).map((q) => ({
    ...q,
    indirectPersonnel: migrateIndirectPersonnel(q?.indirectPersonnel),
    items: Array.isArray(q?.items) ? q.items.map(stripDerivedVolumes) : (q?.items || []),
  }));

const migrateState = (state) => {
  if (!state) return state;
  return {
    ...state,
    params:     migrateParams(state.params),
    equipment:  migrateEquipment(state.equipment),
    quotations: migrateQuotations(state.quotations),
  };
};

export const useStore = create(
  persist(
    (set, get) => ({
      params: INITIAL_PARAMS,
      equipment: INITIAL_EQUIPMENT,
      services: INITIAL_SERVICES,
      quotations: [],
      alerts: [],

      setParams: (newParams) => {
        set((state) => ({ params: typeof newParams === 'function' ? newParams(state.params) : newParams }));
        get().runContinuousImprovementAgent();
      },

      setEquipment: (newEq) => {
        set((state) => ({ equipment: typeof newEq === 'function' ? newEq(state.equipment || []) : (newEq || []) }));
        get().runContinuousImprovementAgent();
      },

      setServices: (newSvcs) => {
        set((state) => ({ services: typeof newSvcs === 'function' ? newSvcs(state.services || []) : (newSvcs || []) }));
      },

      saveQuotation: (q) => {
        set((state) => {
          const exists = state.quotations.find(x => x.id === q.id);
          return {
            quotations: exists ? state.quotations.map(x => x.id === q.id ? q : x) : [...state.quotations, q]
          };
        });
      },

      deleteQuotation: (id) => {
        set((state) => ({ quotations: state.quotations.filter(q => q.id !== id) }));
      },

      updateQuotationStatus: (id, status) => {
        set((state) => ({
          quotations: state.quotations.map(q => q.id === id ? { ...q, status } : q)
        }));
      },

      // ── Agente de Melhoria Contínua (com Calibragem RONMA) ──
      runContinuousImprovementAgent: () => {
        const state = get();
        const alerts = [];
        const p = state.params;

        if (p.dieselPrice > 6.00) {
          alerts.push({
            id: 'diesel-high',
            level: 'warning',
            message: `O preço do diesel está alto (R$ ${p.dieselPrice}). O lucro líquido pode estar comprometido. Considere repassar o custo para a DMT.`
          });
        }

        const escavadeirasAltaManut = state.equipment.filter(e => e.category === 'Escavadeira' && e.consumption > 35);
        if (escavadeirasAltaManut.length > 0) {
          alerts.push({
            id: 'esc-consumo',
            level: 'info',
            message: `Atenção ao consumo de escavadeiras pesadas (${escavadeirasAltaManut.length} encontradas). Em solo de 3ª categoria o consumo aumentará em +40%.`
          });
        }

        if (p.markup_padrao && p.markup_padrao < ASSUMPTIONS.markup.minimoProfissional) {
          alerts.push({
            id: 'markup-baixo',
            level: 'danger',
            message: `⚠️ Markup atual (${p.markup_padrao}×) está abaixo do mínimo profissional (${ASSUMPTIONS.markup.minimoProfissional}×). Risco de prejuízo operacional.`
          });
        } else if (p.markup_padrao && p.markup_padrao > ASSUMPTIONS.markup.alertaAlto) {
          alerts.push({
            id: 'markup-alto',
            level: 'warning',
            message: `Markup atual (${p.markup_padrao}×) está muito alto. Risco de perder competitividade.`
          });
        }

        state.services.forEach(svc => {
          if (CATEGORIAS_SEM_CALIBRAGEM.includes(svc.category)) return;
          const range = CALIBRATION_RANGES[svc.category];
          if (!range) return;

          const ef = svc.efficiency || ASSUMPTIONS.produtividade.eficienciaPadrao;
          if (ef < range.eficiencia.min) {
            alerts.push({
              id: `eff-low-${svc.id}`,
              level: 'warning',
              message: `Serviço "${svc.name}" — eficiência (${ef}) abaixo da faixa RONMA (${range.eficiencia.min}–${range.eficiencia.max}).`
            });
          }

          const prod = svc.baseProductivity || 0;
          if (prod > 0 && prod < range.produtividade.min * 0.5) {
            alerts.push({
              id: `prod-low-${svc.id}`,
              level: 'info',
              message: `Serviço "${svc.name}" — produtividade base (${prod}) muito abaixo da faixa RONMA (${range.produtividade.min}–${range.produtividade.max}).`
            });
          }
        });

        set({ alerts });
      }
    }),
    {
      name: 'transjap-storage',
      version: 6,
      partialize: (state) => ({
        params: state.params,
        equipment: state.equipment,
        services: state.services,
        quotations: state.quotations,
      }),
      // Roda na primeira carga após bump de versão. Garante que todo estado
      // antigo ganhe os campos novos (categorias_operador, pessoas_indiretas,
      // markup_por_categoria, baseProductivity, etc.).
      migrate: (persistedState, version) => {
        const state = migrateState(persistedState);
        if (version < 6 && state?.params) {
          state.params.pessoas_indiretas = sanitizeTabelaRSh(
            state.params.pessoas_indiretas,
            INITIAL_PARAMS.pessoas_indiretas,
          );
          state.params.categorias_operador = sanitizeTabelaRSh(
            state.params.categorias_operador,
            INITIAL_PARAMS.categorias_operador,
          );
          state.params.custo_hh_por_categoria_operador = { ...state.params.categorias_operador };
        }
        return state;
      },
      // Roda em toda carga: garante merge defensivo mesmo sem version bump.
      merge: (persistedState, currentState) => ({
        ...currentState,
        ...migrateState(persistedState),
      }),
    }
  )
);
