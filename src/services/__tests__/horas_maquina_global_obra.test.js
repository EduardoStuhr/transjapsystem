import { calcHorasMaquinaGlobalObra, calcQuotationTotals } from "../costEngine";
import { INITIAL_PARAMS } from "../../data/initialData";

const params = {
  ...INITIAL_PARAMS,
  dieselPrice: 1,
  prazo_meses: 9,
  dias_uteis_mes: 22,
  horas_dia: 9,
};

const escavadeira = { name: "Escavadeira 320DL", category: "Escavadeira", baseProductivity: 153.6, consumption: 93.5, custo_h_manutencao: 0 };
const patrol = { name: "Motoniveladora", category: "Motoniveladora", baseProductivity: 2000, consumption: 93.5, custo_h_manutencao: 0 };
const grade = { name: "Grade Agricola", category: "Grade", baseProductivity: 1500, consumption: 82.5, custo_h_manutencao: 0 };
const rolo = { name: "Rolo Compactador", category: "Compactador", baseProductivity: 250, consumption: 77, custo_h_manutencao: 0 };

const equipmentMap = {
  esc320dl: escavadeira,
  patrol,
  grade,
  rolo,
};

const itemEscavacao = {
  id: "esc",
  category: "Escavação",
  volumeInSitu: 537228.53,
  quantity: 537228.53,
  equipmentLines: [{ equipmentId: "esc320dl", quantity: 1 }],
};

const itemAterro = {
  id: "ate",
  category: "Aterro",
  unit: "M3",
  volumeInSitu: 511262.56,
  quantity: 511262.56,
  equipmentLines: [
    { equipmentId: "patrol", quantity: 1 },
    { equipmentId: "grade", quantity: 1 },
    { equipmentId: "rolo", quantity: 2 },
  ],
};

test("horas-maquina global da obra reproduz J24 da planilha RONMA", () => {
  const horasGlobal = calcHorasMaquinaGlobalObra([itemEscavacao], equipmentMap);

  expect(horasGlobal).toBeCloseTo(3497.58, 1);
});

test("item Aterro com modeloHorasMaquina=global_obra usa hora da escavadeira no diesel", () => {
  const totals = calcQuotationTotals([
    itemEscavacao,
    { ...itemAterro, modeloHorasMaquina: "global_obra" },
  ], equipmentMap, params, {});
  const aterro = totals.itemsCalc.find((item) => item.id === "ate");

  aterro.detalhes.auditoria.equipamentos.forEach((eq) => {
    expect(eq.horas_maquina_aplicada).toBeCloseTo(3497.58, 1);
    expect(eq.modelo_horas_maquina).toBe("global_obra");
  });

  const roloCalc = aterro.detalhes.auditoria.equipamentos.find((eq) => eq.categoria === "Compactador");
  expect(roloCalc.total_diesel).toBeCloseTo(77 * 3497.58 * 2, 0);
  expect(roloCalc.total_diesel_obra).toBeCloseTo(
    roloCalc.diesel_R$_m3_preciso * roloCalc.volume_base_total_preciso,
    2,
  );
});

test("item Aterro sem escolha manual usa modelo global por padrao", () => {
  const totals = calcQuotationTotals([itemEscavacao, itemAterro], equipmentMap, params, {});
  const aterro = totals.itemsCalc.find((item) => item.id === "ate");
  const roloCalc = aterro.detalhes.auditoria.equipamentos.find((eq) => eq.categoria === "Compactador");

  expect(roloCalc.horas_maquina_aplicada).toBeCloseTo(3497.58, 1);
  expect(roloCalc.modelo_horas_maquina).toBe("global_obra");
});

test("item tecnico fora de escavacao tambem herda horas globais por padrao", () => {
  const itemTecnico = {
    ...itemAterro,
    id: "regularizacao",
    category: "Regularizacao",
    desc: "Regularizacao e compactacao",
    modeloHorasMaquina: "proprio",
  };
  const totals = calcQuotationTotals([itemEscavacao, itemTecnico], equipmentMap, params, {});
  const regularizacao = totals.itemsCalc.find((item) => item.id === "regularizacao");

  regularizacao.detalhes.auditoria.equipamentos.forEach((eq) => {
    expect(eq.horas_maquina_aplicada).toBeCloseTo(3497.58, 1);
    expect(eq.horas_maquina_origem).toContain("Global da obra");
    expect(eq.modelo_horas_maquina).toBe("global_obra");
  });
});

test("item com escolha manual modeloHorasMaquina=proprio usa calculo do executor", () => {
  const totals = calcQuotationTotals([
    itemEscavacao,
    { ...itemAterro, modeloHorasMaquina: "proprio", modeloHorasMaquinaManual: true },
  ], equipmentMap, params, {});
  const aterro = totals.itemsCalc.find((item) => item.id === "ate");
  const roloCalc = aterro.detalhes.auditoria.equipamentos.find((eq) => eq.categoria === "Compactador");

  expect(roloCalc.horas_maquina_aplicada).toBeCloseTo(511262.56 / 500, 1);
  expect(roloCalc.horas_maquina_aplicada).not.toBeCloseTo(3497.58, 1);
});

test("fallback: sem item de escavacao, modelo global cai no calculo proprio", () => {
  const totals = calcQuotationTotals([
    {
      ...itemAterro,
      modeloHorasMaquina: "global_obra",
      equipmentLines: [{ equipmentId: "rolo", quantity: 2 }],
    },
  ], equipmentMap, params, {});
  const aterro = totals.itemsCalc[0];

  expect(totals.horasMaquinaGlobalObra).toBe(0);
  expect(aterro.detalhes.auditoria.equipamentos[0].horas_maquina_aplicada)
    .toBeCloseTo(511262.56 / 500, 1);
});
