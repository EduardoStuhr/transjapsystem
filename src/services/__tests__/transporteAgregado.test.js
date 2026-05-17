import { calcTransporteAgregado } from "../transportAgregadoEngine";

describe("Transporte Agregado — espelhamento da planilha RONMA", () => {
  const baseItem = {
    transporteAgregado: {
      enabled: true,
      descricao: "Caminhão agregado",
      dmtKm: 2,
      volumeInSituPorViagem: 15,
      acrescimoFreteEmpolamentoPct: 40,  // 40%
      perdaCarregamentoPct: 10,         // 10%
      valorFreteBase: 1.65,
      volumeBaseTransporte: 537228.53,
      tipoVolumeBase: "in_situ",
      markupTransporte: 1,
    },
  };

  test("modo planilha_m3_empolado bate com Dados Transporte 2", () => {
    const item = {
      fatorEmpolamento: 1.36,
      ...baseItem,
      transporteAgregado: { ...baseItem.transporteAgregado, modoFrete: "planilha_m3_empolado" },
    };
    const r = calcTransporteAgregado(item);

    // Total frete: 1.65 * (1 + 0.4 + 0.1) * (537228.53 * 1.36) = 1.808.311,23
    expect(r.custoTotalFrete).toBeCloseTo(1808311.23, 0);

    // Custo unitário empolado: 1.65 * 1.5 = 2.475
    expect(r.custoUnitarioEmpolado).toBeCloseTo(2.475, 3);

    // Custo unitário in situ: 1808311.23 / 537228.53 = 3.366
    expect(r.custoUnitarioInSitu).toBeCloseTo(3.366, 3);
  });

  test("prova a separação: mudar item.fatorEmpolamento não afeta a taxa do frete, mas afeta o volume total", () => {
    // Caso Base: 1.36 material, 40% acréscimo -> R$ 1.808.311,23
    const rBase = calcTransporteAgregado({
      fatorEmpolamento: 1.36,
      transporteAgregado: { ...baseItem.transporteAgregado }
    });

    // Caso Alterado: 1.30 material, 40% acréscimo
    const rAlt = calcTransporteAgregado({
      fatorEmpolamento: 1.30,
      transporteAgregado: { ...baseItem.transporteAgregado }
    });

    // A taxa por m³ empolado (1.65 * (1 + 0.40 + 0.10) = 2.475) deve ser a mesma
    expect(rAlt.custoUnitarioEmpolado).toBeCloseTo(2.475, 3);
    expect(rAlt.custoUnitarioEmpolado).toBe(rBase.custoUnitarioEmpolado);

    // Mas o volume total deve ser diferente (537228.53 * 1.30 vs 537228.53 * 1.36)
    expect(rAlt.volumeEmpoladoTotal).toBeLessThan(rBase.volumeEmpoladoTotal);
    expect(rAlt.custoTotalFrete).toBeLessThan(rBase.custoTotalFrete);

    // Verificação exata para 1.30
    // vol = 537228.53 * 1.30 = 698397.089
    // custo = 698397.089 * 2.475 = 1728532.795
    expect(rAlt.custoTotalFrete).toBeCloseTo(1728532.80, 0);
  });

  test("modo por_viagem: 39.794,71 viagens × R$ 1,65 = R$ 65.661,26", () => {
    const item = {
      fatorEmpolamento: 1.36,
      ...baseItem,
      transporteAgregado: {
        ...baseItem.transporteAgregado,
        modoFrete: "por_viagem",
        perdaCarregamentoPct: 10 // 10% perda no carregamento in situ
      },
    };
    const r = calcTransporteAgregado(item);

    // vol_liquido_viagem = 15 * (1 - 0.1) = 13.5
    // viagens = 537228.53 / 13.5 = 39794.7059
    // custo = 39794.7059 * 1.65 = 65661.26
    expect(r.custoTotalFrete).toBeCloseTo(65661.26, 0);
  });

  test("decomposicao expoe venda por parcela e total (modo planilha)", () => {
    const item = {
      fatorEmpolamento: 1.36,
      transporteAgregado: {
        enabled: true,
        modoFrete: "por_m3_planilha",
        valorFretePorM3OuViagem: 1.65,
        fatorEmpolamentoTransporte: 0.40,
        perdaCarregamentoPct: 0.10,
        volumeBaseTransporte: 537228.53,
        volumeBaseTipo: "in_situ",
        markupTransporte: 1.99,
        volumeInSituPorViagem: 15,
      },
    };
    const r = calcTransporteAgregado(item);
    const d = r.decomposicaoPlanilha;

    expect(d.somaPorM3Empolado).toBeCloseTo(2.475, 4);
    expect(d.totalCusto).toBeCloseTo(1808311.23, 0);

    expect(d.markup).toBeCloseTo(1.99, 2);

    expect(d.precoBase).toBeCloseTo(1.65 * 1.99, 4);
    expect(d.precoEmpolamento).toBeCloseTo(0.66 * 1.99, 4);
    expect(d.precoPerda).toBeCloseTo(0.165 * 1.99, 4);
    expect(d.precoSomaPorM3Empolado).toBeCloseTo(2.475 * 1.99, 4);

    expect(d.totalVendaBase).toBeCloseTo(1205540.82 * 1.99, 0);
    expect(d.totalVendaEmpolamento).toBeCloseTo(482216.33 * 1.99, 0);
    expect(d.totalVendaPerda).toBeCloseTo(120554.08 * 1.99, 0);
    expect(d.totalVendaGeral).toBeCloseTo(1808311.23 * 1.99, 0);

    expect(d.totalVendaBase + d.totalVendaEmpolamento + d.totalVendaPerda)
      .toBeCloseTo(d.totalVendaGeral, 1);

    expect(d.custoUnitInSitu).toBeCloseTo(1808311.23 / 537228.53, 4);
    expect(d.precoUnitInSitu).toBeCloseTo(3598539.35 / 537228.53, 4);
  });

  test("totalVendaTransporte do engine = decomposicaoPlanilha.totalVendaGeral", () => {
    const item = {
      fatorEmpolamento: 1.36,
      transporteAgregado: {
        enabled: true,
        modoFrete: "por_m3_planilha",
        valorFretePorM3OuViagem: 1.65,
        fatorEmpolamentoTransporte: 0.40,
        perdaCarregamentoPct: 0.10,
        volumeBaseTransporte: 537228.53,
        volumeBaseTipo: "in_situ",
        markupTransporte: 1.99,
        volumeInSituPorViagem: 15,
      },
    };
    const r = calcTransporteAgregado(item);
    expect(r.totalVendaTransporte).toBeCloseTo(r.decomposicaoPlanilha.totalVendaGeral, 2);
  });

  test("markup = 1 dispara warning e venda = custo", () => {
    const item = {
      fatorEmpolamento: 1.36,
      transporteAgregado: {
        enabled: true,
        modoFrete: "por_m3_planilha",
        valorFretePorM3OuViagem: 1.65,
        fatorEmpolamentoTransporte: 0.40,
        perdaCarregamentoPct: 0.10,
        volumeBaseTransporte: 537228.53,
        volumeBaseTipo: "in_situ",
        markupTransporte: 1,
        volumeInSituPorViagem: 15,
      },
    };
    const r = calcTransporteAgregado(item);
    expect(r.totalVendaTransporte).toBeCloseTo(r.custoTotalFrete, 1);
    expect(r.validacoes.some(v => v.mensagem.includes("Markup transporte = 1,00"))).toBe(true);
  });

  test("markup = 1.99 (planilha) dispara calculo correto sem warning", () => {
    const item = {
      fatorEmpolamento: 1.36,
      transporteAgregado: {
        enabled: true,
        modoFrete: "por_m3_planilha",
        valorFretePorM3OuViagem: 1.65,
        fatorEmpolamentoTransporte: 0.40,
        perdaCarregamentoPct: 0.10,
        volumeBaseTransporte: 537228.53,
        volumeBaseTipo: "in_situ",
        markupTransporte: 1.99,
        volumeInSituPorViagem: 15,
      },
    };
    const r = calcTransporteAgregado(item);
    expect(r.custoTotalFrete).toBeCloseTo(1808311.23, 0);
    expect(r.totalVendaTransporte).toBeCloseTo(3598539.35, 0);
    expect(r.validacoes.filter(v => v.mensagem.includes("Markup transporte")).length).toBe(0);
  });

  test("markup < 1 dispara warning de prejuizo", () => {
    const item = {
      fatorEmpolamento: 1.36,
      transporteAgregado: {
        enabled: true,
        modoFrete: "por_m3_planilha",
        valorFretePorM3OuViagem: 1.65,
        fatorEmpolamentoTransporte: 0.40,
        perdaCarregamentoPct: 0.10,
        volumeBaseTransporte: 537228.53,
        volumeBaseTipo: "in_situ",
        markupTransporte: 0.5,
        volumeInSituPorViagem: 15,
      },
    };
    const r = calcTransporteAgregado(item);
    expect(r.validacoes.some(v => v.mensagem.includes("VENDA ABAIXO DO CUSTO"))).toBe(true);
  });

  test("markup > 5 dispara warning de plausibilidade", () => {
    const item = {
      fatorEmpolamento: 1.36,
      transporteAgregado: {
        enabled: true,
        modoFrete: "por_m3_planilha",
        valorFretePorM3OuViagem: 1.65,
        fatorEmpolamentoTransporte: 0.40,
        perdaCarregamentoPct: 0.10,
        volumeBaseTransporte: 537228.53,
        volumeBaseTipo: "in_situ",
        markupTransporte: 5.5,
        volumeInSituPorViagem: 15,
      },
    };
    const r = calcTransporteAgregado(item);
    expect(r.validacoes.some(v => v.mensagem.includes("parece alto demais"))).toBe(true);
  });
});
