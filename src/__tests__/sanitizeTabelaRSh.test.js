import { INITIAL_PARAMS } from "../data/initialData";
import { sanitizeEquipmentOperatorOverride, sanitizeTabelaRSh } from "../store";

test("restaura storage com R$/h truncado em duas casas", () => {
  const operadores = sanitizeTabelaRSh(
    { operador_escavadeira: 32.36 },
    INITIAL_PARAMS.categorias_operador,
  );
  const indiretas = sanitizeTabelaRSh(
    { topografia: 88.89 },
    INITIAL_PARAMS.pessoas_indiretas,
  );

  expect(operadores.operador_escavadeira).toBeCloseTo(32.631578947, 9);
  expect(indiretas.topografia).toBeCloseTo(88.888888889, 9);
});

test("mantem override manual com precisao maior que duas casas", () => {
  const operadores = sanitizeTabelaRSh(
    { operador_escavadeira: 32.63157 },
    INITIAL_PARAMS.categorias_operador,
  );

  expect(operadores.operador_escavadeira).toBe(32.63157);
});

test("remove override direto contaminado no cadastro do equipamento", () => {
  const eq = sanitizeEquipmentOperatorOverride({
    name: "Escavadeira 320DL",
    categoria_operador: "operador_escavadeira",
    custo_h_operador: 32.36,
  });

  expect(eq.custo_h_operador).toBe(0);
});

test("mantem override direto intencional distante do default", () => {
  const eq = sanitizeEquipmentOperatorOverride({
    name: "Escavadeira 320DL",
    categoria_operador: "operador_escavadeira",
    custo_h_operador: 45.00,
  });

  expect(eq.custo_h_operador).toBe(45);
});
