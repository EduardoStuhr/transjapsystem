import { calcItemCost } from "../costEngine";
import { INITIAL_EQUIPMENT, INITIAL_PARAMS } from "../../data/initialData";

const trator = INITIAL_EQUIPMENT.find((eq) => eq.name === "Trator de Esteiras Leve");
const equipmentMap = {
  [trator.id]: {
    ...trator,
    baseProductivity: 489.6,
    productivity: 489.6,
  },
};

const params = {
  ...INITIAL_PARAMS,
  dieselPrice: 5.50,
  prazo_meses: 9,
  dias_uteis_mes: 22,
  horas_dia: 9,
};

const itemBase = {
  id: "limpeza",
  desc: "Limpeza vegetal",
  category: "Limpeza",
  unit: "M²",
  quantity: 320000,
  volumeInSitu: 320000,
  fatorEmpolamento: 1.36,
  adjustedProductivity: 403.92,
  prazoMeses: 9,
  diasUteisMes: 22,
  horasDia: 9,
  equipmentLines: [{ equipmentId: trator.id, quantity: 1 }],
};

const pessoasIndiretas = [
  { tipo: "topografia", quantidade: 1 },
  { tipo: "alojamento", quantidade: 1 },
];

test("produtividade do item sobrescreve a do equipamento", () => {
  const r = calcItemCost(itemBase, equipmentMap, params, []);

  expect(r.detalhes.auditoria.contexto.producaoConjuntoHora)
    .toBeCloseTo(403.92, 1);
});

test("servico em M2 usa rotulo AREA, nao EMPOLADO", () => {
  const r = calcItemCost(itemBase, equipmentMap, params, []);
  const eq = r.detalhes.auditoria.equipamentos[0];

  expect(eq.volume_ref_diesel_tipo).toBe("area");
  expect(eq.volume_ref_diesel_label).toBe("ÁREA");
  expect(eq.volume_ref_diesel_info).toEqual(
    expect.objectContaining({ tipo: "area", label: "ÁREA", valor: 320000 })
  );
});

test("item com rateiaIndireto=false nao absorve indireto rateado", () => {
  const item = { ...itemBase, rateiaIndireto: false };
  const r = calcItemCost(item, equipmentMap, params, pessoasIndiretas);
  const eq = r.detalhes.auditoria.equipamentos[0];

  expect(eq.total_indireto).toBe(0);
  expect(eq.indireto_R$_m3_preciso).toBe(0);
  expect(r.detalhes.auditoria.contexto.rateiaIndireto).toBe(false);
});
