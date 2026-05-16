import { uid } from "../utils/format";
import { ASSUMPTIONS } from "../config/assumptions.config";

// ══════════════════════════════════════════════════════════════════
// PARÂMETROS GLOBAIS — Calibrados a partir da planilha RONMA
// (Custo_Obra_Ronma_-_Rev_00_2.xlsx)
// Defaults vêm de src/config/assumptions.config.js (fonte única).
// ══════════════════════════════════════════════════════════════════
export const INITIAL_PARAMS = {
  dieselPrice:           ASSUMPTIONS.diesel.precoLitro,
  hoursPerDay:           ASSUMPTIONS.jornada.horasPorDia,
  hoursPerMonth:         ASSUMPTIONS.jornada.horasPorMes,
  fator_encargos:        ASSUMPTIONS.encargos.fator,
  percentual_manutencao: ASSUMPTIONS.manutencao.percentualSobreDiesel,
  percentual_indiretos:  ASSUMPTIONS.indireto.percentualLegadoSobreParcial,
  // ── Tabela R$/h por categoria de operador (espelho da planilha) ──
  // Chave canônica: `categorias_operador` (modelo novo).
  // `custo_hh_por_categoria_operador` mantido como alias para compat com versão anterior.
  categorias_operador:             { ...ASSUMPTIONS.maoDeObraDireta.porCategoriaOperador },
  custo_hh_por_categoria_operador: { ...ASSUMPTIONS.maoDeObraDireta.porCategoriaOperador },
  mao_de_obra_direta_base:         { ...ASSUMPTIONS.maoDeObraDireta.porCategoriaOperadorBase },
  pessoas_diretas_adicionais:      ASSUMPTIONS.maoDeObraDireta.pessoasFixasObra,

  // ── Pessoas indiretas: R$/h por tipo + cálculo dinâmico de alimentação ──
  pessoas_indiretas:        { ...ASSUMPTIONS.pessoasIndiretas.porTipo },
  pessoas_indiretas_base:   { ...ASSUMPTIONS.pessoasIndiretas.porTipoBase },
  alimentacao_valor_dia:    ASSUMPTIONS.pessoasIndiretas.alimentacao.valorDia,
  alimentacao_dias_mes:     ASSUMPTIONS.pessoasIndiretas.alimentacao.diasMes,
  alimentacao_horas_ref:    ASSUMPTIONS.pessoasIndiretas.alimentacao.horasRef,

  // ── Markup por categoria de equipamento (substitui fatorBase × ajusteFinal) ──
  markup_por_categoria:     { ...ASSUMPTIONS.markupPorCategoria },

  // ── Volume de referência (denominador) por parcela e categoria ──
  // O custo R$/m³ de cada parcela divide o total R$ pelo volume aqui escolhido:
  //   - Diesel/Manutenção/MO: por categoria (Patrol é exceção e usa in_situ porque trabalha sobre
  //             a área in situ, não sobre material remexido / empolado)
  //   - Indireto: sempre in situ (rateio por volume entregue)
  volume_ref_diesel_por_categoria: {
    "Escavadeira":    "empolado",
    "Motoniveladora": "in_situ",   // Patrol — exceção
    "Patrol":         "in_situ",   // alias defensivo
    "Trator":         "empolado",
    "Grade":          "empolado",
    "Compactador":    "empolado",
    "Rolo":           "empolado",
    "Pipa":           "empolado",
    "Caminhão":       "empolado",
    "_default":       "empolado",
  },
  volume_ref_manutencao_por_categoria: {
    "Motoniveladora": "in_situ",
    "Patrol":         "in_situ",
    "_default":       "empolado",
  },
  volume_ref_mo_por_categoria: {
    "Motoniveladora": "in_situ",
    "Patrol":         "in_situ",
    "_default":       "empolado",
  },
  volume_ref_manutencao: "empolado",
  volume_ref_mo:         "empolado",
  volume_ref_indireto:   "in_situ",

  // ── Imposto sobre lucro estimado ──
  aliquota_imposto_lucro:   ASSUMPTIONS.comercial.percentualImposto,

  // ── Defaults editáveis (overrideáveis por orçamento) ──
  fator_empolamento:        1 + ASSUMPTIONS.empolamento.fatorPadrao,
  dias_uteis_mes:           ASSUMPTIONS.jornada.diasUteisMes,
  horas_dia:                ASSUMPTIONS.jornada.horasPorDia,
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
  fatorBase:             ASSUMPTIONS.markup.fatorBase,
  ajusteFinal:           ASSUMPTIONS.markup.ajusteFinal,
  markup_padrao:         ASSUMPTIONS.markup.padraoLegado,
  laborRatio:            15,     // % faturamento mão de obra
  equipmentRatio:        85,     // % faturamento equipamentos
  defaultBDI:            ASSUMPTIONS.comercial.bdiPadrao,
  transportSpeed:        ASSUMPTIONS.transporte.velocidadeKmH,
  cycleTimeBase:         ASSUMPTIONS.transporte.cicloBaseMin,
  flatbedCostPerKm:      ASSUMPTIONS.transporte.custoPranchaPorKm,
  mobilizationDistance:  ASSUMPTIONS.transporte.distanciaMobilizacaoKm,
  totalClearingArea:     13321.10, // m² — referência RONMA
};

// ══════════════════════════════════════════════════════════════════
// EQUIPAMENTOS — Produtividades verificadas contra "Dados do Contrato"
// e "CUSTOS EQUIPAMENTOS" da planilha RONMA
// ══════════════════════════════════════════════════════════════════
// Cada equipamento pode declarar:
//   - custo_h_manutencao   (R$/h)  → manutenção tabelada (planilha CUSTOS EQUIPAMENTOS coluna E)
//   - categoria_operador   (string snake_case) → resolve R$/h via params.categorias_operador
//   - custo_h_operador     (R$/h)  → override direto (vence categoria_operador)
//   - baseProductivity     (un/h)  → produção do equipamento (usada pelo modelo novo)
//   - productivity         (un/h)  → alias retro-compat
//   - viagensPorHora       → viagens/h da escavadeira (cálculo de diesel por ciclo)
//   - salario_operador_mensal      → legado (usado quando os campos acima estão vazios)
export const INITIAL_EQUIPMENT = [
  { id: uid(), name: "Escavadeira 312 DL",              category: "Escavadeira",    consumption: 12, custo_h_manutencao: 34.50, categoria_operador: "operador_escavadeira", salario_operador_mensal: 3500, active: true, baseProductivity: 96,    productivity: 96,    viagensPorHora: 0 },
  { id: uid(), name: "Escavadeira 320DL",               category: "Escavadeira",    consumption: 17, custo_h_manutencao: 37.00, categoria_operador: "operador_escavadeira", salario_operador_mensal: 3500, active: true, baseProductivity: 153.6, productivity: 153.6, viagensPorHora: 0 },
  { id: uid(), name: "Escavadeira 336DL",               category: "Escavadeira",    consumption: 37, custo_h_manutencao: 48.00, categoria_operador: "operador_escavadeira", salario_operador_mensal: 3500, active: true, baseProductivity: 240,   productivity: 240,   viagensPorHora: 0 },
  { id: uid(), name: "Escavadeira 345 GC",              category: "Escavadeira",    consumption: 39, custo_h_manutencao: 53.00, categoria_operador: "operador_escavadeira", salario_operador_mensal: 3500, active: true, baseProductivity: 288,   productivity: 288,   viagensPorHora: 0 },
  { id: uid(), name: "Trator de Esteiras Leve",         category: "Trator",         consumption: 28, custo_h_manutencao: 43.50, categoria_operador: "operador_trator",      salario_operador_mensal: 2500, active: true, baseProductivity: 393.6, productivity: 393.6  },
  { id: uid(), name: "Trator de Esteiras Pesado",       category: "Trator",         consumption: 39, custo_h_manutencao: 43.50, categoria_operador: "operador_trator",      salario_operador_mensal: 2500, active: true, baseProductivity: 320,   productivity: 320    },
  { id: uid(), name: "Motoniveladora (Patrol)",         category: "Motoniveladora", consumption: 17, custo_h_manutencao: 39.00, categoria_operador: "operador_trator",      salario_operador_mensal: 2500, active: true, baseProductivity: 2000,  productivity: 2000   },
  { id: uid(), name: "Grade Agrícola",                  category: "Grade",          consumption: 15, custo_h_manutencao: 18.00, categoria_operador: "auxiliar",             salario_operador_mensal: 2000, active: true, baseProductivity: 1500,  productivity: 1500   },
  { id: uid(), name: "Rolo Compactador Pé de Carneiro", category: "Compactador",    consumption: 28, custo_h_manutencao: 35.00, categoria_operador: "auxiliar",             salario_operador_mensal: 2000, active: true, baseProductivity: 250,   productivity: 250    },
  { id: uid(), name: "Caminhão Pipa",                   category: "Pipa",           consumption: 8,  custo_h_manutencao: 34.00, categoria_operador: "auxiliar",             salario_operador_mensal: 2000, active: true, baseProductivity: 1,     productivity: 1      },
  { id: uid(), name: "Caminhão Caçamba Truck",          category: "Caminhão",       consumption: 22, custo_h_manutencao: 22.00, categoria_operador: "auxiliar",             salario_operador_mensal: 2000, active: true, baseProductivity: 14,    productivity: 14     },
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
