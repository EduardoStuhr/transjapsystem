import { create } from 'zustand';
import { INITIAL_PARAMS, INITIAL_EQUIPMENT, INITIAL_SERVICES } from './data/initialData';
import { CALIBRATION_RANGES, CATEGORIAS_SEM_CALIBRAGEM } from './data/calibrationRanges';

export const useStore = create((set, get) => ({
  params: INITIAL_PARAMS,
  equipment: INITIAL_EQUIPMENT,
  services: INITIAL_SERVICES,
  quotations: [],
  alerts: [], // Alertas do Agente de Melhoria Contínua

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

    // Alerta 1: Variação no preço do Diesel
    if (p.dieselPrice > 6.00) {
      alerts.push({
        id: 'diesel-high',
        level: 'warning',
        message: `O preço do diesel está alto (R$ ${p.dieselPrice}). O lucro líquido pode estar comprometido. Considere repassar o custo para a DMT.`
      });
    }

    // Alerta 2: Produtividade/Consumo
    const escavadeirasAltaManut = state.equipment.filter(e => e.category === 'Escavadeira' && e.consumption > 35);
    if (escavadeirasAltaManut.length > 0) {
      alerts.push({
        id: 'esc-consumo',
        level: 'info',
        message: `Atenção ao consumo de escavadeiras pesadas (${escavadeirasAltaManut.length} encontradas). Em solo de 3ª categoria o consumo aumentará em +40%.`
      });
    }

    // Alerta 3: Markup fora do padrão
    if (p.markup_padrao && p.markup_padrao < 1.10) {
      alerts.push({
        id: 'markup-baixo',
        level: 'danger',
        message: `⚠️ Markup atual (${p.markup_padrao}×) está abaixo do mínimo profissional (1.10×). Risco de prejuízo operacional.`
      });
    } else if (p.markup_padrao && p.markup_padrao > 2.00) {
      alerts.push({
        id: 'markup-alto',
        level: 'warning',
        message: `Markup atual (${p.markup_padrao}×) está muito alto. Risco de perder competitividade.`
      });
    }

    // Alerta 4: Validação de serviços contra faixas RONMA
    state.services.forEach(svc => {
      if (CATEGORIAS_SEM_CALIBRAGEM.includes(svc.category)) return;
      const range = CALIBRATION_RANGES[svc.category];
      if (!range) return;

      const ef = svc.efficiency || 0.85;
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
}));
