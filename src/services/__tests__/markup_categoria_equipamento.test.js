import { calcItemCost } from "../costEngine";
import { INITIAL_EQUIPMENT, INITIAL_PARAMS } from "../../data/initialData";

const pipa = INITIAL_EQUIPMENT.find((eq) => eq.category === "Pipa");

const params = {
  ...INITIAL_PARAMS,
  dieselPrice: 5.50,
  prazo_meses: 1,
  dias_uteis_mes: 22,
  horas_dia: 8,
  markup_por_categoria: {
    ...INITIAL_PARAMS.markup_por_categoria,
    Caminhão: 1.99,
    Pipa: 2.37,
  },
};

const itemPipa = {
  id: "pipa",
  desc: "Umectacao com caminhao pipa",
  category: "Apoio",
  unit: "M3",
  quantity: 100,
  volumeInSitu: 100,
  prazoMeses: 1,
  diasUteisMes: 22,
  horasDia: 8,
  markup: 1.99,
  markupManual: false,
  equipmentLines: [{ equipmentId: pipa.id, quantity: 1 }],
};

test("caminhao pipa usa markup da categoria Pipa, mesmo se cadastro legado vier como Caminhao", () => {
  const pipaLegado = { ...pipa, category: "Caminhão" };
  const r = calcItemCost(itemPipa, { [pipa.id]: pipaLegado }, params, []);
  const eq = r.detalhes.auditoria.equipamentos[0];

  expect(eq.categoria).toBe("Pipa");
  expect(eq.markup).toBeCloseTo(2.37, 6);
  expect(eq.markup).not.toBeCloseTo(1.99, 6);
});

test("markup manual do item continua podendo sobrescrever a categoria", () => {
  const r = calcItemCost(
    { ...itemPipa, markup: 1.42, markupManual: true },
    { [pipa.id]: pipa },
    params,
    [],
  );
  const eq = r.detalhes.auditoria.equipamentos[0];

  expect(eq.markup).toBeCloseTo(1.42, 6);
});
