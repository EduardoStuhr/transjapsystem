import { calcItemCost } from "../costEngine";
import { derivarQuantidade, recalcularItensDerivados } from "../../utils/itemDerivation";
import { INITIAL_SERVICES } from "../../data/initialData";

const services = [
  {
    id: "limpeza-vegetal",
    name: "Limpeza de Camada Vegetal",
    espessuraCamadaPadrao: 0.20,
  },
  {
    id: "transp-veg",
    name: "Transporte de material vegetal (DMT <= 1km)",
  },
];

test("item 2.2 do RONMA com preco cravado bate com a planilha", () => {
  const item = {
    id: "transp-limp",
    desc: "Transporte de material vegetal (DMT <= 1km)",
    category: "Transporte",
    unit: "M3",
    quantity: 64000,
    modoPreco: "preco_cravado",
    precoUnitCravado: 7.21,
    fontePrecoCravado: "Cotacao RONMA",
  };

  const r = calcItemCost(item, {}, {}, []);

  expect(r.preco_unitario).toBeCloseTo(7.21, 6);
  expect(r.markup_aplicado).toBe(1);
  expect(r.detalhamento.indiretos).toBe(0);
  expect(r.total_item).toBeCloseTo(461440, 0);
});

test("derivacao automatica: transporte = limpeza_area x espessura", () => {
  const limpeza = {
    id: "limpeza-1",
    serviceId: "limpeza-vegetal",
    quantity: 320000,
  };
  const transporte = {
    id: "transp-1",
    serviceId: "transp-veg",
    derivadoDe: "limpeza-1",
  };

  const novaQty = derivarQuantidade(transporte, limpeza, services);

  expect(novaQty).toBe(64000);
});

test("se area da limpeza muda, transporte derivado recalcula", () => {
  const items = [
    {
      id: "limpeza-1",
      serviceId: "limpeza-vegetal",
      quantity: 350000,
    },
    {
      id: "transp-1",
      serviceId: "transp-veg",
      derivadoDe: "limpeza-1",
      quantity: 64000,
      volumeInSitu: 64000,
    },
  ];

  const recalculados = recalcularItensDerivados(items, services);

  expect(recalculados[1].quantity).toBe(70000);
  expect(recalculados[1].volumeInSitu).toBe(70000);
});

test("catalogo tem par limpeza-transporte RONMA e total combinado de referencia", () => {
  const limpeza = INITIAL_SERVICES.find((service) => service.name === "Limpeza de Camada Vegetal");
  const transporte = INITIAL_SERVICES.find((service) => service.name === "Transporte de material vegetal (DMT ≤ 1km)");

  expect(limpeza).toEqual(expect.objectContaining({
    espessuraCamadaPadrao: 0.20,
    modoPrecoDefault: "preco_cravado",
    precoCravadoSugerido: 1.10,
    servicoRelacionado: "Transporte de material vegetal (DMT ≤ 1km)",
  }));
  expect(transporte).toEqual(expect.objectContaining({
    modoPrecoDefault: "preco_cravado",
    precoCravadoSugerido: 7.21,
    servicoRelacionado: "Limpeza de Camada Vegetal",
  }));

  const limpezaCalc = calcItemCost({
    id: "limpeza-1",
    unit: "M2",
    quantity: 320000,
    modoPreco: "preco_cravado",
    precoUnitCravado: limpeza.precoCravadoSugerido,
    fontePrecoCravado: "Cotacao RONMA",
  }, {}, {}, []);
  const transporteCalc = calcItemCost({
    id: "transp-1",
    unit: "M3",
    quantity: 64000,
    modoPreco: "preco_cravado",
    precoUnitCravado: transporte.precoCravadoSugerido,
    fontePrecoCravado: "Cotacao RONMA",
  }, {}, {}, []);

  expect(limpezaCalc.total_item).toBeCloseTo(352000, 0);
  expect(transporteCalc.total_item).toBeCloseTo(461440, 0);
  expect(limpezaCalc.total_item + transporteCalc.total_item).toBeCloseTo(813440, 0);
});
