// ══════════════════════════════════════════════════════════════════
// ASSUMPTIONS — Fonte única de constantes do sistema.
// Valores aqui são DEFAULTS: o engine usa quando o usuário não
// configurou nada nos parâmetros do projeto. Inputs do usuário
// (params, item.fatorBase, etc.) sempre têm prioridade.
// Nunca repita números mágicos em outros arquivos: importe daqui.
// ══════════════════════════════════════════════════════════════════

export const ASSUMPTIONS = {
  diesel: {
    precoLitro: 5.50,
  },

  jornada: {
    horasPorDia: 8,
    horasPorMes: 160,
    diasUteisMes: 22,
  },

  encargos: {
    fator: 1.70,
  },

  // Tabela R$/h por categoria de operador — espelha CUSTOS EQUIPAMENTOS!G[i] da planilha.
  // Usada quando o equipamento declara `categoria_operador` mas não custo_h_operador direto.
  // Chaves em snake_case são o padrão (modelo novo). As com espaço são aliases retro-compat.
  maoDeObraDireta: {
    porCategoriaOperadorBase: {
      // Salario base sem encargos. O R$/h e derivado por salario * encargos / horas.
      // Estes valores reproduzem a planilha: 6200/190, 4700/190 e 4000/190.
      operador_escavadeira:     { salarioMensal: 6200 / 1.70, fatorEncargos: 1.70, horasMes: 190 },
      operador_trator:          { salarioMensal: 4700 / 1.70, fatorEncargos: 1.70, horasMes: 190 },
      auxiliar:                 { salarioMensal: 4000 / 1.70, fatorEncargos: 1.70, horasMes: 190 },
      "Operador Escavadeira":   { salarioMensal: 6200 / 1.70, fatorEncargos: 1.70, horasMes: 190 },
      "Operador Trator/Patrol": { salarioMensal: 4700 / 1.70, fatorEncargos: 1.70, horasMes: 190 },
      "Auxiliar":               { salarioMensal: 4000 / 1.70, fatorEncargos: 1.70, horasMes: 190 },
    },
    get porCategoriaOperador() {
      return Object.fromEntries(
        Object.entries(this.porCategoriaOperadorBase).map(([k, v]) => [
          k,
          (v.salarioMensal * v.fatorEncargos) / v.horasMes,
        ])
      );
    },
  },

  // Pessoas indiretas — R$/h por tipo (espelha CUSTOS EQUIPAMENTOS!I17:I21).
  // alimentacao = null sinaliza cálculo dinâmico (depende do tamanho da equipe).
  // NOTA: apontador e administrativo NÃO entram aqui — são mão de obra direta
  // e ficam em `maoDeObraDireta.porCategoriaOperador` (auxiliar / operador_trator).
  pessoasIndiretas: {
    porTipoBase: {
      topografia:  { salarioMensal: 16000, horasMes: 180 },
      laboratorio: { salarioMensal: 16000, horasMes: 180 },
      alojamento:  { salarioMensal:  8300, horasMes: 180 },
      alimentacao: null,
      vigilancia:  { salarioMensal: 25000, horasMes: 180 },
    },
    get porTipo() {
      return Object.fromEntries(
        Object.entries(this.porTipoBase).map(([k, v]) => [
          k,
          v?.salarioMensal != null ? v.salarioMensal / v.horasMes : v,
        ])
      );
    },
    alimentacao: {
      valorDia:   40,
      diasMes:    30,
      horasRef:  180,
    },
  },

  // Markup por categoria de equipamento — espelha COMPOSIÇÃO DE PREÇO!H[r].
  markupPorCategoria: {
    Escavadeira:     2.50,
    Caminhão:        1.99,
    Trator:          2.37,
    Motoniveladora:  2.37,
    Grade:           2.37,
    Compactador:     2.37,
    Pipa:            2.37,
    Rolo:            2.37,
    _default:        2.37,
  },

  manutencao: {
    percentualSobreDiesel: 0.10,
    ajusteSoloPesado: 1.20,
  },

  indireto: {
    percentualLegadoSobreParcial: 0.10,
    diasObraMesPadrao: 22,
  },

  fatorSolo: {
    "1ª":     1.00,
    "1":      1.00,
    "leve":   1.00,
    "2ª":     0.85,
    "2":      0.85,
    "medio":  0.85,
    "3ª":     0.70,
    "3":      0.70,
    "pesado": 0.70,
  },

  markup: {
    fatorBase:                2.30,
    ajusteFinal:              1.20,
    multiplicadorTransporte:  1.20,
    padraoLegado:             1.66,
    minimoProfissional:       1.10,
    alertaAlto:               2.00,
  },

  comercial: {
    bdiPadrao:         20,
    percentualImposto: 0.3825,
  },

  transporte: {
    velocidadeKmH:           25,
    cicloBaseMin:            10,
    custoPranchaPorKm:       15.00,
    distanciaMobilizacaoKm:  100,
    fatorEmpolamentoCarga:   0.36,
    perdaCarregamento:       0.10,
    volumePorViagemInSitu:   15,
  },

  empolamento: {
    fatorPadrao: 0.36,
  },

  limpezaVegetal: {
    profundidadeCamadaM:          0.20,
    percentualAreaTerrenoPadrao:  0.30,
  },

  produtividade: {
    eficienciaPadrao: 0.85,
  },

  faixasCalibracao: {
    eficienciaPadrao:        { min: 0.80, max: 0.85 },
    eficienciaAcabamento:    { min: 0.85, max: 0.90 },
    desvioCustoPercentual:   0.15,
    desvioPrecoPercentual:   0.15,
  },
};

// Acesso seguro ao fator de solo, com fallback para 1ª categoria.
export const getFatorSolo = (categoria) =>
  ASSUMPTIONS.fatorSolo[categoria] ?? ASSUMPTIONS.fatorSolo["1ª"];
