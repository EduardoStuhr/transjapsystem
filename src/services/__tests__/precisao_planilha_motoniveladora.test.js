import { calcItemCost } from "../costEngine";
import { INITIAL_EQUIPMENT, INITIAL_PARAMS } from "../../data/initialData";

const equipmentMap = Object.fromEntries(INITIAL_EQUIPMENT.map((e) => [e.id, e]));

const findEq = (predicate) => {
  const eq = INITIAL_EQUIPMENT.find(predicate);
  if (!eq) throw new Error("Equipamento esperado nao encontrado");
  return eq;
};

const params = {
  ...INITIAL_PARAMS,
  dieselPrice: 5.50,
  hoursPerDay: 9,
  hoursPerMonth: 198,
  dias_uteis_mes: 22,
  horas_dia: 9,
  fator_empolamento: 1.36,
};

// Golden file: valores precisos da planilha RONMA para a Motoniveladora
// no aterro Joao Checon, extraidos do XLSX em precisao dupla.
const GOLDEN = {
  motoniveladora_no_aterro: {
    diesel_R_m3: 0.6087239583333334,
    manut_R_m3: 0.1293639412635066,
    mo_R_m3: 0.0820527022858949,
    indir_R_m3: 0.2934644963848067,
    custo_unit: 1.1136050982675414,
    preco_unit: 2.6392440828940731,
    total_aterro: 1349346.686285,
  },
  grade_no_aterro: {
    total_aterro: 949538.73,
  },
  pipa_no_aterro: {
    total_aterro: 773505.99,
  },
};

// A composicao que gera as horas da Patrol vem do item de escavacao/carga,
// mas a totalizacao da linha auditada usa o volume de aterro Joao Checon.
const itemAterro = {
  id: "ate",
  desc: "Aterro",
  category: "Escavacao",
  unit: "m3",
  quantity: 511262.56,
  volumeInSitu: 537228.53,
  volumeAterroInSitu: 511262.56,
  fatorEmpolamento: 1.36,
  prazoMeses: 9,
  diasUteisMes: 22,
  horasDia: 9,
  equipmentLines: [
    { equipmentId: findEq((e) => e.name.includes("320DL")).id, quantity: 1 },
    { equipmentId: findEq((e) => e.category === "Motoniveladora").id, quantity: 1 },
    { equipmentId: findEq((e) => e.category === "Grade").id, quantity: 1 },
    { equipmentId: findEq((e) => e.category === "Compactador").id, quantity: 2 },
    { equipmentId: findEq((e) => e.category === "Pipa").id, quantity: 1 },
  ],
};

const indirectPersonnel = [
  { tipo: "topografia", quantidade: 1 },
  { tipo: "alojamento", quantidade: 1 },
  { tipo: "alimentacao", quantidade: 1 },
  { tipo: "vigilancia", quantidade: 1 },
];

const calculaAterro = () =>
  calcItemCost(itemAterro, equipmentMap, params, indirectPersonnel, {
    numOperadoresFrota: 8,
  });

test("Motoniveladora no Aterro bate com planilha em precisao de 4 casas", () => {
  const r = calculaAterro();
  const patrol = r.detalhes.auditoria.equipamentos.find((e) => e.categoria === "Motoniveladora");
  const g = GOLDEN.motoniveladora_no_aterro;

  expect(patrol.diesel_R$_m3_preciso).toBeCloseTo(g.diesel_R_m3, 4);
  expect(patrol.manutencao_R$_m3_preciso).toBeCloseTo(g.manut_R_m3, 4);
  expect(patrol.mo_R$_m3_preciso).toBeCloseTo(g.mo_R_m3, 4);
  expect(patrol.indireto_R$_m3_preciso).toBeCloseTo(g.indir_R_m3, 4);
  expect(patrol.custo_R$_m3_preciso).toBeCloseTo(g.custo_unit, 4);
  expect(patrol.preco_R$_m3_preciso).toBeCloseTo(g.preco_unit, 4);
  expect(patrol.total_maquina_obra_preciso_R$).toBeCloseTo(g.total_aterro, 0);
  expect(patrol.volume_referencia_total_final).toBeCloseTo(itemAterro.volumeAterroInSitu, 6);
  expect(patrol.volume_referencia_total_final_tipo).toBe("aterro_in_situ");
  expect(patrol.volume_referencia_total_final_origem).toBe("item.volumeAterroInSitu");
});

test("Consolidação de categoria usa volume de aterro in situ para Motoniveladora", () => {
  const r = calculaAterro();
  const grupo = r.detalhes.auditoria.consolidacaoCategorias.find((g) => g.categoria === "Motoniveladora");

  expect(grupo).toBeDefined();
  expect(grupo.volumeReferenciaTotalFinal).toBeCloseTo(itemAterro.volumeAterroInSitu, 6);
  expect(grupo.volumeReferenciaTotalFinalTipo).toBe("aterro_in_situ");
  expect(grupo.totalFinalGrupo).toBeCloseTo(grupo.precoUnitarioFinal * itemAterro.volumeAterroInSitu, 6);
});

test("delta residual em precisao dupla e menor que R$ 1,00 para equipamentos com golden", () => {
  const r = calculaAterro();
  const equipamentos = r.detalhes.auditoria.equipamentos;
  const checks = [
    ["Motoniveladora", GOLDEN.motoniveladora_no_aterro.total_aterro],
    ["Grade", GOLDEN.grade_no_aterro.total_aterro],
    ["Pipa", GOLDEN.pipa_no_aterro.total_aterro],
  ];

  for (const [categoria, total] of checks) {
    const eq = equipamentos.find((e) => e.categoria === categoria);
    expect(Math.abs(eq.total_maquina_obra_preciso_R$ - total)).toBeLessThan(1);
  }
});
