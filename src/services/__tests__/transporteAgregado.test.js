import { calcTransporteAgregado } from "../transportAgregadoEngine";

describe("Transporte Agregado — espelhamento da planilha RONMA", () => {
  const baseItem = {
    transporteAgregado: {
      enabled: true,
      descricao: "Caminhão agregado",
      dmtKm: 2,
      volumeInSituPorViagem: 15,
      fatorEmpolamentoTransporte: 0.40,  // 40%
      perdaCarregamentoPct: 0.10,         // 10%
      valorFretePorM3OuViagem: 1.65,
      volumeBaseTransporte: 537228.53,
      volumeBaseTipo: "in_situ",
      markupTransporte: 1,
    },
  };

  test("modo por_m3_planilha bate com Dados Transporte 2", () => {
    const item = {
      ...baseItem,
      transporteAgregado: { ...baseItem.transporteAgregado, modoFrete: "por_m3_planilha" },
    };
    const r = calcTransporteAgregado(item);
    expect(r.custoTotalFrete).toBeCloseTo(1808311.23, 0);
    expect(r.custoUnitarioTransporte * 1.36 * 1.36 / 1.36).toBeCloseTo(2.475, 3);
    expect(r.decomposicaoPlanilha.somaPorM3Empolado).toBeCloseTo(2.475, 3);
  });

  test("normalização de fator '40' (sem decimal) com rescue", () => {
    const item = {
      fatorEmpolamento: 1.36,   // fator do material
      transporteAgregado: {
        ...baseItem.transporteAgregado,
        fatorEmpolamentoTransporte: 40,   // acréscimo comercial digitado errado
        modoFrete: "por_m3_planilha",
      },
    };
    const r = calcTransporteAgregado(item);
    // Resgatado para 1,40×
    expect(r.fatorEmpolamentoTransporte).toBeCloseTo(1.40, 2);
    expect(r.custoTotalFrete).toBeCloseTo(1808311.23, 0);
  });

  test("prova a separação: mudar item.fatorEmpolamento não afeta a taxa do frete, mas afeta o volume total", () => {
    // Caso Base: 1.36 material, 1.40 transporte -> R$ 1.808.311,23
    const rBase = calcTransporteAgregado({
      fatorEmpolamento: 1.36,
      transporteAgregado: { ...baseItem.transporteAgregado, fatorEmpolamentoTransporte: 1.40 }
    });

    // Caso Alterado: 1.30 material, 1.40 transporte
    const rAlt = calcTransporteAgregado({
      fatorEmpolamento: 1.30,
      transporteAgregado: { ...baseItem.transporteAgregado, fatorEmpolamentoTransporte: 1.40 }
    });

    // A taxa por m³ empolado (1.65 * (1 + 0.40 + 0.10) = 2.475) deve ser a mesma
    expect(rAlt.decomposicaoPlanilha.somaPorM3Empolado).toBeCloseTo(2.475, 3);
    expect(rAlt.decomposicaoPlanilha.somaPorM3Empolado).toBe(rBase.decomposicaoPlanilha.somaPorM3Empolado);

    // Mas o volume total deve ser diferente (537228.53 * 1.30 vs 537228.53 * 1.36)
    expect(rAlt.volumeEmpoladoTotal).toBeLessThan(rBase.volumeEmpoladoTotal);
    expect(rAlt.custoTotalFrete).toBeLessThan(rBase.custoTotalFrete);

    // Verificação exata para 1.30
    // vol = 537228.53 * 1.30 = 698397.089
    // custo = 698397.089 * 2.475 = 1728532.795
    expect(rAlt.custoTotalFrete).toBeCloseTo(1728532.80, 0);
  });

  test("warning para R$/viagem implausível", () => {
    const item = {
      ...baseItem,
      transporteAgregado: { ...baseItem.transporteAgregado, modoFrete: "por_viagem" },
    };
    const r = calcTransporteAgregado(item);
    const alerta = r.validacoes.find((v) => v.severidade === "alerta" && v.mensagem.includes("frete"));
    expect(alerta).toBeTruthy();
  });

  test("modo por_viagem antigo: 39.794,71 viagens × R$ 1,65 = R$ 65.661,26", () => {
    const item = {
      ...baseItem,
      transporteAgregado: { ...baseItem.transporteAgregado, modoFrete: "por_viagem" },
    };
    const r = calcTransporteAgregado(item);
    expect(r.quantidadeViagens).toBeCloseTo(39794.71, 0);
    expect(r.custoTotalFrete).toBeCloseTo(65661.26, 0);
  });
});
