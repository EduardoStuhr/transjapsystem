import { calcQuotationTotals } from "../costEngine";
import { INITIAL_EQUIPMENT, INITIAL_PARAMS } from "../../data/initialData";

const eqByName = Object.fromEntries(INITIAL_EQUIPMENT.map((e) => [e.name, e]));
const equipmentMap = Object.fromEntries(INITIAL_EQUIPMENT.map((e) => [e.id, e]));

const params = {
  ...INITIAL_PARAMS,
  dieselPrice: 5.50,
  hoursPerDay: 9,
  hoursPerMonth: 198,
  dias_uteis_mes: 22,
  horas_dia: 9,
  fator_empolamento: 1.36,
};

const frota = [
  { equipmentId: eqByName["Escavadeira 320DL"].id, quantity: 1 },
  { equipmentId: eqByName["Motoniveladora (Patrol)"].id, quantity: 1 },
  { equipmentId: eqByName["Grade Agrícola"].id, quantity: 1 },
  { equipmentId: eqByName["Rolo Compactador Pé de Carneiro"].id, quantity: 2 },
  { equipmentId: eqByName["Caminhão Pipa"].id, quantity: 1 },
];

const indirectPersonnel = [
  { tipo: "topografia", quantidade: 1 },
  { tipo: "alojamento", quantidade: 1 },
  { tipo: "alimentacao", quantidade: 1 },
  { tipo: "vigilancia", quantidade: 1 },
];

const itemEscavacao = {
  id: "esc",
  desc: "Escavacao",
  category: "Escavação",
  unit: "m³",
  quantity: 537228.53,
  volumeInSitu: 537228.53,
  fatorEmpolamento: 1.36,
  soilCategory: "1ª",
  baseProductivity: 153.6,
  prazoMeses: 9,
  diasUteisMes: 22,
  horasDia: 9,
  equipmentLines: frota,
};

const calcula = () =>
  calcQuotationTotals([itemEscavacao], equipmentMap, params, {
    bdi: 0,
    adminPct: 0,
    mobilPct: 0,
    riskPct: 0,
    indirectPersonnel,
    volumeEmpoladoObra: 695317.0816,
  });

test("Escavacao: horas-maquina vem so das escavadeiras", () => {
  const t = calcula();
  const ctx = t.itemsCalc[0].detalhes.auditoria.contexto;

  expect(ctx.producaoConjuntoHora).toBeCloseTo(153.6, 1);
  expect(ctx.horasMaquinaNecessarias).toBeCloseTo(3497.58, 1);
  expect(ctx.numAuxiliares).toBe(4);
  expect(ctx.equipamentosExecutores).toEqual([
    expect.objectContaining({
      nome: "Escavadeira 320DL",
      categoria: "Escavadeira",
      qty: 1,
    }),
  ]);
});

test("Categoria nao mapeada mantem fallback da frota inteira", () => {
  const itemSemMapa = { ...itemEscavacao, category: "Sem mapa" };
  const t = calcQuotationTotals([itemSemMapa], equipmentMap, params, {
    bdi: 0,
    adminPct: 0,
    mobilPct: 0,
    riskPct: 0,
    indirectPersonnel,
    volumeEmpoladoObra: 695317.0816,
  });
  const esperado = frota.reduce((s, l) => {
    const eq = equipmentMap[l.equipmentId];
    return s + (eq.baseProductivity ?? eq.productivity ?? 0) * l.quantity;
  }, 0);

  expect(t.itemsCalc[0].detalhes.auditoria.contexto.producaoConjuntoHora)
    .toBeCloseTo(esperado, 6);
});

test("Patrol no item de escavacao herda horas das escavadeiras", () => {
  const t = calcula();
  const patrol = t.itemsCalc[0].detalhes.auditoria.equipamentos
    .find((e) => e.categoria === "Motoniveladora");

  expect(patrol.is_executor).toBe(false);
  expect(patrol.total_diesel).toBeCloseTo(327023.88, 0);
  expect(patrol.horas_diesel).toBeCloseTo(3497.58, 1);
});

test("Rolo usa consumo e quantidade da planilha", () => {
  const t = calcula();
  const rolo = t.itemsCalc[0].detalhes.auditoria.equipamentos
    .find((e) => e.equipamento.includes("Rolo Compactador"));

  expect(rolo.is_executor).toBe(false);
  expect(rolo.qty).toBe(2);
  expect(rolo.diesel_hora).toBeCloseTo(154.00, 2);
  expect(rolo.total_diesel).toBeCloseTo(1077255.13, 0);
  expect(rolo.total_manutencao).toBeCloseTo(124740.00, 0);
  expect(rolo.total_mo).toBeCloseTo(75031.58, 0);
  expect(rolo.custo_R$_m3).toBeCloseTo(2.04130582, 6);
  expect(rolo.preco_R$_m3).toBeCloseTo(4.83789479, 6);
  expect(rolo.total_maquina_obra_R$).toBeCloseTo(2473434.47, 0);
});

test("Custo total do item com frota mista bate sem a linha separada de caminhoes", () => {
  const t = calcula();

  expect(t.subtotalPrice).toBeCloseTo(6769211.09, 0);
});
