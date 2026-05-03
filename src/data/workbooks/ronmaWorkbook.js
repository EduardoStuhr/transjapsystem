// Workbook seed built from the mapped spreadsheet (partial, extensible).
// This file is intentionally a direct transcription (no simplification).

export const RONMA_WORKBOOK = {
  sheets: {
    "Dados do Contrato": [
      { id: "F12", nome: "Preço diesel", valor: 5.5, formula: null, tipo: "manual", unidade: "R$/L", origem: "Dados do Contrato" },
      { id: "D3", nome: "Fator empolamento", valor: 1.36, formula: null, tipo: "manual", unidade: "×", origem: "Dados do Contrato" },
      { id: "B12", nome: "Área do terreno", valor: 13321.1, formula: null, tipo: "manual", unidade: "m²", origem: "Dados do Contrato" },
      { id: "B13", nome: "Denominador limpeza (30% área)", valor: null, formula: "B12*0.3", tipo: "calculado", unidade: "m²", origem: "Dados do Contrato" },
      { id: "B4", nome: "Volume escavação in situ", valor: 12981.27, formula: null, tipo: "manual", unidade: "m³", origem: "Dados do Contrato" },
      { id: "C4", nome: "Volume empolado", valor: null, formula: "B4*D3", tipo: "calculado", unidade: "m³", origem: "Dados do Contrato" },
      { id: "F8", nome: "Horas por dia", valor: 8, formula: null, tipo: "manual", unidade: "h/dia", origem: "Dados do Contrato" },
      // F9/F10/J16/J23 etc. ficam para o seed completo.
    ],

    "COMPOSIÇÃO DE PREÇO": [
      { id: "H3", nome: "Fator markup 1", valor: 2.3, formula: null, tipo: "manual", unidade: "×", origem: "COMPOSIÇÃO DE PREÇO" },
      { id: "J3", nome: "Fator markup 2", valor: 1.2, formula: null, tipo: "manual", unidade: "×", origem: "COMPOSIÇÃO DE PREÇO" },

      // Linha LIMPEZA (exemplo auditável)
      { id: "B6", nome: "Diesel (R$/m²) — Limpeza", valor: 2.4511, formula: "SUM('CUSTOS EQUIPAMENTOS'!D5,'CUSTOS EQUIPAMENTOS'!D6,'CUSTOS EQUIPAMENTOS'!D7,'CUSTOS EQUIPAMENTOS'!D8)/'Dados do Contrato'!B13", tipo: "calculado", unidade: "R$/m²", origem: "COMPOSIÇÃO DE PREÇO" },
      { id: "C6", nome: "Manutenção (R$/m²) — Limpeza", valor: 0.7015, formula: "SUM('CUSTOS EQUIPAMENTOS'!F5,'CUSTOS EQUIPAMENTOS'!F6,'CUSTOS EQUIPAMENTOS'!F7,'CUSTOS EQUIPAMENTOS'!F8)/'Dados do Contrato'!B13", tipo: "calculado", unidade: "R$/m²", origem: "COMPOSIÇÃO DE PREÇO" },
      { id: "D6", nome: "Mão de obra (R$/m²) — Limpeza", valor: 0.5386, formula: "SUM('CUSTOS EQUIPAMENTOS'!H5,'CUSTOS EQUIPAMENTOS'!H6,'CUSTOS EQUIPAMENTOS'!H7,'CUSTOS EQUIPAMENTOS'!H8)/'Dados do Contrato'!B13", tipo: "calculado", unidade: "R$/m²", origem: "COMPOSIÇÃO DE PREÇO" },
      { id: "E6", nome: "Indiretos (R$/m²) — Limpeza", valor: 0.1135, formula: "'CUSTOS EQUIPAMENTOS'!J24", tipo: "calculado", unidade: "R$/m²", origem: "COMPOSIÇÃO DE PREÇO" },
      { id: "F6", nome: "Custo total unitário (R$/m²) — Limpeza", valor: 3.8047, formula: "B6+C6+D6+E6", tipo: "calculado", unidade: "R$/m²", origem: "COMPOSIÇÃO DE PREÇO" },
      { id: "H6", nome: "Preço após markup 1 — Limpeza", valor: 8.7508, formula: "F6*H3", tipo: "calculado", unidade: "R$/m²", origem: "COMPOSIÇÃO DE PREÇO" },
      { id: "J6", nome: "Preço final calculado — Limpeza", valor: 10.501, formula: "H6*J3", tipo: "calculado", unidade: "R$/m²", origem: "COMPOSIÇÃO DE PREÇO" },
    ],

    // Placeholder: esta aba deve ser preenchida com o mapping completo.
    "CUSTOS EQUIPAMENTOS": [
      // Exemplo mínimo para o grafo não quebrar: ids referenciados acima.
      { id: "D5", nome: "Diesel total contrato (eq linha 5)", valor: 0, formula: null, tipo: "manual", unidade: "R$", origem: "CUSTOS EQUIPAMENTOS" },
      { id: "D6", nome: "Diesel total contrato (eq linha 6)", valor: 0, formula: null, tipo: "manual", unidade: "R$", origem: "CUSTOS EQUIPAMENTOS" },
      { id: "D7", nome: "Diesel total contrato (eq linha 7)", valor: 0, formula: null, tipo: "manual", unidade: "R$", origem: "CUSTOS EQUIPAMENTOS" },
      { id: "D8", nome: "Diesel total contrato (eq linha 8)", valor: 0, formula: null, tipo: "manual", unidade: "R$", origem: "CUSTOS EQUIPAMENTOS" },
      { id: "F5", nome: "Manutenção total contrato (eq linha 5)", valor: 0, formula: null, tipo: "manual", unidade: "R$", origem: "CUSTOS EQUIPAMENTOS" },
      { id: "F6", nome: "Manutenção total contrato (eq linha 6)", valor: 0, formula: null, tipo: "manual", unidade: "R$", origem: "CUSTOS EQUIPAMENTOS" },
      { id: "F7", nome: "Manutenção total contrato (eq linha 7)", valor: 0, formula: null, tipo: "manual", unidade: "R$", origem: "CUSTOS EQUIPAMENTOS" },
      { id: "F8", nome: "Manutenção total contrato (eq linha 8)", valor: 0, formula: null, tipo: "manual", unidade: "R$", origem: "CUSTOS EQUIPAMENTOS" },
      { id: "H5", nome: "MO total contrato (eq linha 5)", valor: 0, formula: null, tipo: "manual", unidade: "R$", origem: "CUSTOS EQUIPAMENTOS" },
      { id: "H6", nome: "MO total contrato (eq linha 6)", valor: 0, formula: null, tipo: "manual", unidade: "R$", origem: "CUSTOS EQUIPAMENTOS" },
      { id: "H7", nome: "MO total contrato (eq linha 7)", valor: 0, formula: null, tipo: "manual", unidade: "R$", origem: "CUSTOS EQUIPAMENTOS" },
      { id: "H8", nome: "MO total contrato (eq linha 8)", valor: 0, formula: null, tipo: "manual", unidade: "R$", origem: "CUSTOS EQUIPAMENTOS" },
      { id: "J24", nome: "Indiretos rateados (J24)", valor: 0, formula: null, tipo: "manual", unidade: "R$/un", origem: "CUSTOS EQUIPAMENTOS" },
    ],
  },
};

