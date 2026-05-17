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
  adjustedProductivity: 4500,
  produtividadeUnidade: "dia",
  terrainFactor: 1,
  fatorLogistica: 1,
  modoPreco: "tecnico",
  modoCalculoPrazoItem: "automatico",
  horasDiaItem: 9,
  markup: 1.10,
  prazoMeses: 9,
  diasUteisMes: 22,
  horasDia: 9,
  equipmentLines: [{ equipmentId: trator.id, quantity: 1 }],
};

const pessoasIndiretas = [
  { tipo: "topografia", quantidade: 1 },
  { tipo: "alojamento", quantidade: 1 },
];

test("limpeza vegetal usa produtividade padrao da planilha em m2/h", () => {
  const r = calcItemCost(itemBase, equipmentMap, params, []);

  expect(r.detalhes.auditoria.contexto.produtividadeOriginal)
    .toBeCloseTo(4500, 1);
  expect(r.detalhes.auditoria.contexto.produtividadeConvertidaHora)
    .toBeCloseTo(500, 1);
  expect(r.detalhes.auditoria.contexto.produtividadeRealPorEquipamento)
    .toBeCloseTo(500, 1);
  expect(r.detalhes.auditoria.contexto.producaoConjuntoHora)
    .toBeCloseTo(500, 1);
  expect(r.detalhes.auditoria.contexto.produtividadeDiaria)
    .toBeCloseTo(4500, 1);
  expect(r.detalhes.auditoria.contexto.horasMaquinaNecessarias)
    .toBeCloseTo(640, 6);
  expect(r.detalhes.auditoria.contexto.diasUteisItem)
    .toBeCloseTo(320000 / 4500, 6);
  expect(r.detalhes.auditoria.contexto.horasItem)
    .toBeCloseTo(640, 6);
  expect(r.detalhes.auditoria.equipamentos[0].horas_diesel).toBeCloseTo(640, 6);
  expect(r.total_item).toBeCloseTo(r.preco_unitario * 320000, 6);
});

test("servico em M2 usa area como referencia, nao empolamento nem aterro", () => {
  const r = calcItemCost(itemBase, equipmentMap, params, []);
  const eq = r.detalhes.auditoria.equipamentos[0];

  expect(r.detalhes.auditoria.contexto.tipoComposicao).toBe("m2");
  expect(r.detalhes.auditoria.contexto.volumeEmpolado).toBe(0);
  expect(eq.volume_ref_diesel_tipo).toBe("area");
  expect(eq.volume_ref_diesel_label).toBe("ÁREA");
  expect(eq.volume_base_tipo).toBe("area");
  expect(eq.volume_base_alerta).toBeNull();
  expect(eq.volume_ref_diesel_info).toEqual(
    expect.objectContaining({ tipo: "area", label: "ÁREA", valor: 320000 })
  );
});

test("limpeza vegetal usa horas-maquina por padrao para manutencao e mao de obra", () => {
  const r = calcItemCost(itemBase, equipmentMap, params, []);
  const eq = r.detalhes.auditoria.equipamentos[0];

  expect(eq.horas_manutencao_base).toBe("item");
  expect(eq.horas_mo_base).toBe("item");
  expect(eq.horas_manutencao).toBeCloseTo(640, 6);
  expect(eq.horas_mo).toBeCloseTo(640, 6);
});

test("limpeza vegetal em modo manual usa prazo proprio do item", () => {
  const item = {
    ...itemBase,
    modoCalculoPrazoItem: "manual",
    prazoDiasUteisItem: 24.92,
    horasDiaItem: 9,
  };
  const r = calcItemCost(item, equipmentMap, params, []);
  const ctx = r.detalhes.auditoria.contexto;
  const eq = r.detalhes.auditoria.equipamentos[0];

  expect(ctx.horasGeraisContrato).toBe(1782);
  expect(ctx.diasUteisItem).toBeCloseTo(24.92, 6);
  expect(ctx.horasItem).toBeCloseTo(224.28, 6);
  expect(eq.horas_manutencao).toBeCloseTo(224.28, 6);
  expect(eq.horas_mo).toBeCloseTo(224.28, 6);
});

test("limpeza vegetal calcula referencia 112141,40 m2 por prazo automatico proprio", () => {
  const item = {
    ...itemBase,
    quantity: 112141.40,
    volumeInSitu: 112141.40,
    adjustedProductivity: 4500,
    produtividadeUnidade: "dia",
    modoCalculoPrazoItem: "automatico",
    horasDiaItem: 9,
  };
  const r = calcItemCost(item, equipmentMap, params, []);
  const ctx = r.detalhes.auditoria.contexto;

  expect(ctx.diasUteisItem).toBeCloseTo(112141.40 / 4500, 6);
  expect(ctx.horasItem).toBeCloseTo((112141.40 / 4500) * 9, 6);
  expect(ctx.horasGeraisContrato).toBe(1782);
});

test("limpeza vegetal calcula exemplo da planilha de forma dinamica", () => {
  const item = {
    ...itemBase,
    adjustedProductivity: 500,
    produtividadeUnidade: "hora",
    markup: 1.10,
  };
  const eqMap = {
    [trator.id]: {
      ...trator,
      consumption: 0,
      custo_h_manutencao: 0,
      custo_h_operador: 0,
      salario_operador_mensal: 0,
    },
  };
  const paramsPlanilha = {
    ...params,
    percentual_manutencao: 0,
    categorias_operador: { operador_trator: 0 },
  };
  const area = 320000;
  const custoDiretoDesejado = area / 640;
  eqMap[trator.id].custo_h_manutencao = custoDiretoDesejado;

  const r = calcItemCost(item, eqMap, paramsPlanilha, []);

  expect(r.detalhes.auditoria.contexto.horasMaquinaNecessarias).toBeCloseTo(640, 6);
  expect(r.custo_unitario).toBeCloseTo(1.00, 6);
  expect(r.preco_unitario).toBeCloseTo(1.10, 6);
  expect(r.total_item).toBeCloseTo(352000, 2);
});

test("limpeza vegetal avisa quando area, produtividade ou equipamento faltam", () => {
  const item = {
    ...itemBase,
    quantity: 0,
    volumeInSitu: 0,
    adjustedProductivity: 0,
    equipmentLines: [],
  };
  const r = calcItemCost(item, equipmentMap, params, []);
  const mensagens = r.detalhes.auditoria.validacoes.map((v) => v.mensagem);

  expect(mensagens).toEqual(expect.arrayContaining([
    "Área do item deve ser > 0.",
    "Aloque pelo menos um equipamento.",
    "Informe produtividade válida em m²/h ou m²/dia para limpeza vegetal.",
  ]));
});

test("item com rateiaIndireto=false nao absorve indireto rateado", () => {
  const item = { ...itemBase, rateiaIndireto: false };
  const r = calcItemCost(item, equipmentMap, params, pessoasIndiretas);
  const eq = r.detalhes.auditoria.equipamentos[0];

  expect(eq.total_indireto).toBe(0);
  expect(eq.indireto_R$_m3_preciso).toBe(0);
  expect(r.detalhes.auditoria.contexto.rateiaIndireto).toBe(false);
});

test("limpeza vegetal em preco de mercado usa preco unitario direto sem parcelas tecnicas", () => {
  const item = {
    ...itemBase,
    modoPreco: "mercado",
    precoUnitarioMercado: 1.10,
    rateiaIndireto: true,
    markup: 9,
    adjustedProductivity: 0,
    equipmentLines: [],
  };

  const r = calcItemCost(item, equipmentMap, params, pessoasIndiretas);

  expect(r.detalhes.auditoria.contexto.modoPreco).toBe("preco_mercado");
  expect(r.custo_unitario).toBeCloseTo(1.10, 6);
  expect(r.preco_unitario).toBeCloseTo(1.10, 6);
  expect(r.markup_aplicado).toBe(1);
  expect(r.total_item).toBeCloseTo(352000, 2);
  expect(r.detalhamento.diesel).toBe(0);
  expect(r.detalhamento.manutencao).toBe(0);
  expect(r.detalhamento.operador).toBe(0);
  expect(r.detalhamento.indiretos).toBe(0);
  expect(r.detalhes.auditoria.equipamentos).toHaveLength(0);
});
