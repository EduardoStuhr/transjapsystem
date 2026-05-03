import { uid } from "../utils/format";

// ══════════════════════════════════════════════════════════════════
// PARÂMETROS GLOBAIS — Calibrados a partir da planilha RONMA
// (Custo_Obra_Ronma_-_Rev_00_2.xlsx)
// ══════════════════════════════════════════════════════════════════
export const INITIAL_PARAMS = {
  dieselPrice:           5.50,
  hoursPerDay:           8,
  hoursPerMonth:         160,
  fator_encargos:        1.70,   // 70% de encargos sobre o salário
  percentual_manutencao: 0.10,   // 10% sobre o diesel
  percentual_indiretos:  0.10,   // legado — usado apenas se modo absoluto estiver desligado
  // ── Custos indiretos do PROJETO (modo absoluto, R$/mês) ──
  // Quando a soma > 0, o engine rateia o indireto pelo tempo real de obra
  // (dias_obra_mes × hoursPerDay) e aloca por produtividade real do serviço.
  // Caso fiquem zerados, o engine usa o modo legado (10% por equipamento).
  indiretos_admin_mensal:        4500,
  indiretos_alojamento_mensal:   1500,
  indiretos_alimentacao_mensal:   800,
  indiretos_vigilancia_mensal:    500,
  indiretos_outros_mensal:        700,
  dias_obra_mes:                   19,  // dias úteis efetivos / mês (RONMA referência)
  // Fatores da planilha (Composição de Preço)
  produtividadePadrao:   13.5,
  fatorBase:             2.3,
  ajusteFinal:           1.2,
  markup_padrao:         1.66,   // legado (calibragem antiga) — preferir fatorBase/ajusteFinal
  laborRatio:            15,     // % faturamento mão de obra
  equipmentRatio:        85,     // % faturamento equipamentos
  defaultBDI:            20,
  transportSpeed:        25,     // km/h
  cycleTimeBase:         10,     // min (carga + descarga)
  flatbedCostPerKm:      15.00,
  mobilizationDistance:  100,
  totalClearingArea:     13321.10, // m² — referência RONMA
};

// ══════════════════════════════════════════════════════════════════
// EQUIPAMENTOS — Produtividades verificadas contra "Dados do Contrato"
// e "CUSTOS EQUIPAMENTOS" da planilha RONMA
// ══════════════════════════════════════════════════════════════════
export const INITIAL_EQUIPMENT = [
  { id: uid(), name: "Escavadeira 312 DL",              category: "Escavadeira",    consumption: 12, salario_operador_mensal: 3500, active: true, productivity: 96     },
  { id: uid(), name: "Escavadeira 320DL",               category: "Escavadeira",    consumption: 17, salario_operador_mensal: 3500, active: true, productivity: 153.6  },
  { id: uid(), name: "Escavadeira 336DL",               category: "Escavadeira",    consumption: 37, salario_operador_mensal: 3500, active: true, productivity: 240    },
  { id: uid(), name: "Escavadeira 345 GC",              category: "Escavadeira",    consumption: 39, salario_operador_mensal: 3500, active: true, productivity: 288    },
  { id: uid(), name: "Trator de Esteiras Leve",         category: "Trator",         consumption: 28, salario_operador_mensal: 2500, active: true, productivity: 393.6  },
  { id: uid(), name: "Trator de Esteiras Pesado",       category: "Trator",         consumption: 39, salario_operador_mensal: 2500, active: true, productivity: 320    },
  { id: uid(), name: "Motoniveladora (Patrol)",         category: "Motoniveladora", consumption: 17, salario_operador_mensal: 2500, active: true, productivity: 2000   },
  { id: uid(), name: "Grade Agrícola",                  category: "Grade",          consumption: 15, salario_operador_mensal: 2000, active: true, productivity: 1500   },
  { id: uid(), name: "Rolo Compactador Pé de Carneiro", category: "Compactador",    consumption: 15, salario_operador_mensal: 2000, active: true, productivity: 250    },
  { id: uid(), name: "Caminhão Pipa",                   category: "Caminhão",       consumption: 8,  salario_operador_mensal: 2000, active: true, productivity: 1      },
  { id: uid(), name: "Caminhão Caçamba Truck",          category: "Caminhão",       consumption: 22, salario_operador_mensal: 2000, active: true, productivity: 14     },
];

// ══════════════════════════════════════════════════════════════════
// SERVIÇOS — CATÁLOGO CALIBRADO
// Cada serviço carrega:
//   - baseProductivity         → produtividade informada (já dividida pela eficiência)
//   - efficiency               → eficiência operacional padrão
//   - referenceUnitCost        → custo unitário extraído da planilha RONMA
//   - referenceUnitPrice       → preço unitário praticado na planilha RONMA
//   - markup                   → markup real observado (custo→preço)
// ══════════════════════════════════════════════════════════════════
export const INITIAL_SERVICES = [
  {
    id: uid(),
    name: "Mobilização / Desmobilização",
    unit: "VB",
    category: "Preliminar",
    desc: "Mobilização e desmobilização de equipe e equipamentos",
    baseProductivity: 1,
    efficiency: 1.00,
    referenceUnitCost: 7000.00,
    referenceUnitPrice: 12000.00,
    markup: 1.71,
  },
  {
    id: uid(),
    name: "Equipe de Topografia",
    unit: "VB",
    category: "Apoio",
    desc: "Equipe de topografia para marcações e levantamentos",
    baseProductivity: 1,
    efficiency: 1.00,
    referenceUnitCost: 9481.33,
    referenceUnitPrice: 22000.00,
    markup: 2.32, // ⚠️ markup elevado — revisar se contrato permitir
  },
  {
    id: uid(),
    name: "Limpeza de Camada Vegetal",
    unit: "M²",
    category: "Limpeza",
    desc: "Limpeza da camada vegetal (até 20 cm) com escavadeira",
    baseProductivity: 489.6,
    efficiency: 0.825,
    referenceUnitCost: 0.795,
    referenceUnitPrice: 1.32,
    markup: 1.66,
  },
  {
    id: uid(),
    name: "Destocamento de Árvores (Ø > 30 cm)",
    unit: "Unid",
    category: "Limpeza",
    desc: "Destocamento com escavadeira hidráulica, DMT até 1 km",
    baseProductivity: 3.7,
    efficiency: 0.825,
    referenceUnitCost: 30.00,
    referenceUnitPrice: 53.24,
    markup: 1.77,
  },
  {
    id: uid(),
    name: "Carga / Transporte Camada Vegetal – DMT 12 km",
    unit: "M³",
    category: "Transporte", // ← reclassificado de "Limpeza" para "Transporte"
    desc: "Carga, descarga e transporte da camada vegetal para bota fora",
    baseProductivity: 30,
    efficiency: 0.825,
    referenceUnitCost: 3.80,
    referenceUnitPrice: 6.68,
    markup: 1.76,
  },
  {
    id: uid(),
    name: "Carga / Transporte Bota Fora – DMT 1 km",
    unit: "M³",
    category: "Transporte",
    desc: "Carga, descarga e transporte para bota fora licenciado",
    baseProductivity: 153.6,
    efficiency: 0.85,
    referenceUnitCost: 1.82,
    referenceUnitPrice: 3.02,
    markup: 1.66,
  },
  {
    id: uid(),
    name: "Escavação + Carga + Transporte – DMT 1 km",
    unit: "M³",
    category: "Escavação",
    desc: "Escavação mecânica, carga e transporte, material 1ª cat.",
    baseProductivity: 477.1,
    efficiency: 0.825,
    referenceUnitCost: 3.06,
    referenceUnitPrice: 6.68,
    markup: 2.18, // ⚠️ acima do padrão 1.66 — preço de mercado RONMA
  },
  {
    id: uid(),
    name: "Aterro + Espalhamento + Compactação 100% PN",
    unit: "M³",
    category: "Aterro",
    desc: "Aterro, espalhamento e compactação conforme normas vigentes",
    baseProductivity: 492,
    efficiency: 0.80,
    referenceUnitCost: 1.84,
    referenceUnitPrice: 10.77,
    markup: 5.86, // 🔴 muito acima do padrão — reavaliar (faixa esperada 3–5)
  },
  {
    id: uid(),
    name: "Nivelamento e Regularização Final",
    unit: "M³",
    category: "Acabamento",
    desc: "Nivelamento e regularização final da área",
    baseProductivity: 200,
    efficiency: 0.90,
    referenceUnitCost: 1.50,
    referenceUnitPrice: 2.85,
    markup: 1.90,
  },
];
