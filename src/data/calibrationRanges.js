// ══════════════════════════════════════════════════════════════════
// TABELA DE CALIBRAGEM — FAIXAS DE REFERÊNCIA DE MERCADO (RONMA)
// Atualizada com base em Custo_Obra_Ronma_-_Rev_00_2.xlsx
// ══════════════════════════════════════════════════════════════════
// REGRA DE OURO: Nunca ajustar preço direto.
// Ajustar: produtividade → eficiência → custo/h → markup
// ══════════════════════════════════════════════════════════════════

export const CALIBRATION_RANGES = {
  Limpeza: {
    label: "Limpeza de Terreno",
    unidade: "m²",
    produtividade: { min: 400, max: 550 },   // m²/h (ajustado p/ RONMA: 489.6)
    eficiencia:    { min: 0.80, max: 0.85 },
    faixa_custo:   { min: 0.75, max: 0.90 },
    faixa_preco:   { min: 1.20, max: 1.40 },
  },
  Destocamento: {
    label: "Destocamento de Árvores",
    unidade: "un",
    produtividade: { min: 3.0, max: 5.0 },   // un/h
    eficiencia:    { min: 0.80, max: 0.85 },
    faixa_custo:   { min: 25.00, max: 40.00 },
    faixa_preco:   { min: 45.00, max: 70.00 },
  },
  "Escavação": {
    label: "Escavação Mecânica",
    unidade: "m³",
    produtividade: { min: 350, max: 500 },   // m³/h (ajustado: RONMA 477)
    eficiencia:    { min: 0.80, max: 0.85 },
    faixa_custo:   { min: 3.00, max: 4.50 },
    faixa_preco:   { min: 5.00, max: 7.00 },
  },
  Transporte: {
    label: "Carga e Transporte",
    unidade: "m³",
    produtividade: { min: 20, max: 160 },    // varia muito por DMT
    eficiencia:    { min: 0.80, max: 0.85 },
    faixa_custo:   { min: 1.50, max: 5.00 },
    faixa_preco:   { min: 3.00, max: 8.00 },
  },
  Aterro: {
    label: "Aterro e Compactação",
    unidade: "m³",
    produtividade: { min: 400, max: 550 },   // m³/h consolidado
    eficiencia:    { min: 0.80, max: 0.85 },
    faixa_custo:   { min: 1.50, max: 2.50 },
    faixa_preco:   { min: 3.00, max: 5.00 },
  },
  Acabamento: {
    label: "Nivelamento e Regularização",
    unidade: "m³",
    produtividade: { min: 150, max: 250 },
    eficiencia:    { min: 0.85, max: 0.90 },
    faixa_custo:   { min: 1.00, max: 2.00 },
    faixa_preco:   { min: 2.00, max: 4.00 },
  },
};

// Categorias excluídas da calibragem (sem faixa de referência RONMA)
export const CATEGORIAS_SEM_CALIBRAGEM = ["Preliminar", "Apoio"];

// Perfis de markup profissional
export const MARKUP_PROFILES = {
  minimo:      { valor: 1.10, label: "Mínimo (1.10×)",      desc: "Margem reduzida — risco alto" },
  padrao:      { valor: 1.66, label: "Padrão (1.66×)",      desc: "Padrão profissional RONMA" },
  conservador: { valor: 1.80, label: "Conservador (1.80×)", desc: "Margem confortável — projetos de risco" },
  premium:     { valor: 2.20, label: "Premium (2.20×)",     desc: "Margem cheia — RONMA real (escavação)" },
};

// ══════════════════════════════════════════════════════════════════
// Funções de Validação
// ══════════════════════════════════════════════════════════════════

export const dentroFaixa = (valor, faixa) => {
  if (!faixa) return { dentro: true, status: "sem_referencia" };
  if (valor < faixa.min) return { dentro: false, status: "abaixo", desvio: faixa.min - valor };
  if (valor > faixa.max) return { dentro: false, status: "acima", desvio: valor - faixa.max };
  return { dentro: true, status: "ok", desvio: 0 };
};

export const calcProdutividadeSugerida = (custoHora, faixaCusto) => {
  if (!faixaCusto || custoHora <= 0) return null;
  const custoMedio = (faixaCusto.min + faixaCusto.max) / 2;
  return custoHora / custoMedio;
};

export const gerarCalibracao = (category, custoUnitario, precoUnitario, custoHora, prodUtilizada, unit, hasEquipment, refCost, refPrice) => {
  let range = CALIBRATION_RANGES[category];

  if (!range && !CATEGORIAS_SEM_CALIBRAGEM.includes(category)) {
    const isQualifyingUnit = ["m2", "m²", "m3", "m³", "M2", "M²", "M3", "M³"].includes(String(unit).trim());
    if (isQualifyingUnit && hasEquipment) {
      const baseCusto = refCost > 0 ? refCost : (custoUnitario > 0 ? custoUnitario : 10);
      const basePreco = refPrice > 0 ? refPrice : (precoUnitario > 0 ? precoUnitario : baseCusto * 1.66);
      
      range = {
        label: category || "Análise de Serviço",
        unidade: unit,
        produtividade: null,
        eficiencia: { min: 0.80, max: 0.85 },
        faixa_custo: { min: baseCusto * 0.85, max: baseCusto * 1.15 },
        faixa_preco: { min: basePreco * 0.85, max: basePreco * 1.15 },
        isGeneric: true,
      };
    }
  }

  if (!range || CATEGORIAS_SEM_CALIBRAGEM.includes(category)) {
    return {
      status: "sem_referencia",
      temReferencia: false,
      mensagem: "Categoria sem faixa de referência (excluída da calibragem)",
    };
  }

  const validCusto = dentroFaixa(custoUnitario, range.faixa_custo);
  const validPreco = dentroFaixa(precoUnitario, range.faixa_preco);
  const validProd  = dentroFaixa(prodUtilizada, range.produtividade);

  const markupReal = custoUnitario > 0 ? precoUnitario / custoUnitario : 0;
  const prodSugerida = calcProdutividadeSugerida(custoHora, range.faixa_custo);

  let status = "ok";
  let mensagem = range.isGeneric ? "✅ Custo compatível com a referência" : "✅ Dentro da faixa de mercado";

  if (!validCusto.dentro && validCusto.status === "acima") {
    status = "alerta_custo_alto";
    mensagem = range.isGeneric 
      ? `⚠️ Custo acima da referência (R$ ${custoUnitario.toFixed(2)} vs alvo R$ ${((range.faixa_custo.min + range.faixa_custo.max)/2).toFixed(2)}). Ajustar produtividade.`
      : `⚠️ Custo acima da faixa (R$ ${custoUnitario.toFixed(2)} vs R$ ${range.faixa_custo.min.toFixed(2)}–${range.faixa_custo.max.toFixed(2)}). Ajustar produtividade.`;
  } else if (!validCusto.dentro && validCusto.status === "abaixo") {
    status = "alerta_custo_baixo";
    mensagem = range.isGeneric
      ? `⚠️ Custo muito abaixo da referência — verificar se produtividade é realista.`
      : `⚠️ Custo abaixo da faixa — verificar se produtividade é realista.`;
  }

  if (!validPreco.dentro && validPreco.status === "acima") {
    status = "alerta_preco_alto";
    mensagem = range.isGeneric
      ? `🔴 Preço acima da referência (R$ ${precoUnitario.toFixed(2)}).`
      : `🔴 Preço acima do mercado (R$ ${precoUnitario.toFixed(2)} vs máx R$ ${range.faixa_preco.max.toFixed(2)}). Risco de não competir.`;
  } else if (!validPreco.dentro && validPreco.status === "abaixo") {
    status = status === "ok" ? "alerta_preco_baixo" : status;
    mensagem = status === "alerta_preco_baixo"
      ? `⚠️ Preço abaixo da referência. Verificar markup.`
      : mensagem;
  }

  let markupClassificacao = "personalizado";
  if (markupReal <= 1.15)      markupClassificacao = "minimo";
  else if (markupReal <= 1.55) markupClassificacao = "abaixo_padrao";
  else if (markupReal <= 1.75) markupClassificacao = "padrao";
  else if (markupReal <= 2.00) markupClassificacao = "conservador";
  else                         markupClassificacao = "premium";

  return {
    status,
    temReferencia: true,
    faixa_referencia: range,
    custo_dentro_faixa: validCusto.dentro,
    preco_dentro_faixa: validPreco.dentro,
    prod_dentro_faixa: validProd.dentro,
    validacao: { custo: validCusto, preco: validPreco, produtividade: validProd },
    markup_real: markupReal,
    markup_classificacao: markupClassificacao,
    produtividade_sugerida: prodSugerida,
    mensagem,
    isGeneric: !!range.isGeneric,
  };
};
