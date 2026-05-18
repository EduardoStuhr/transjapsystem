import { calcItemCost } from "../costEngine";
import { INITIAL_EQUIPMENT, INITIAL_PARAMS } from "../../data/initialData";

const equipmentMap = Object.fromEntries(INITIAL_EQUIPMENT.map((e) => [e.id, e]));
const eqByName = Object.fromEntries(INITIAL_EQUIPMENT.map((e) => [e.name, e]));

const indirectPersonnel = [
  { tipo: "topografia", quantidade: 1 },
  { tipo: "alojamento", quantidade: 1 },
  { tipo: "alimentacao", quantidade: 1 },
  { tipo: "vigilancia", quantidade: 1 },
];

const params = {
  ...INITIAL_PARAMS,
  dieselPrice: 5.50,
  hoursPerDay: 9,
  hoursPerMonth: 198,
  dias_uteis_mes: 22,
  horas_dia: 9,
  fator_empolamento: 1.36,
};

const calcEscavacao = (equipmentLines) =>
  calcItemCost(
    {
      unit: "M3",
      category: "Escavacao",
      desc: "Escavacao com duas escavadeiras",
      quantity: 537228.53,
      volumeInSitu: 537228.53,
      fatorEmpolamento: 1.36,
      prazoMeses: 9,
      diasUteisMes: 22,
      horasDia: 9,
      soilCategory: "1",
      equipmentLines,
    },
    equipmentMap,
    params,
    indirectPersonnel,
    { numOperadoresFrota: 8, horasProjeto: 1782 },
  );

test("Escavadeiras são consolidadas antes do markup para bater com a planilha", () => {
  const r = calcEscavacao([
    { equipmentId: eqByName["Escavadeira 312 DL"].id, quantity: 1 },
    { equipmentId: eqByName["Escavadeira 320DL"].id, quantity: 1 },
  ]);

  const grupo = r.detalhes.auditoria.consolidacaoCategorias.find(
    (g) => g.categoria === "Escavadeira",
  );

  expect(r.detalhes.auditoria.equipamentos).toHaveLength(2);
  expect(grupo.equipamentosIncluidos).toEqual([
    "Escavadeira 312 DL",
    "Escavadeira 320DL",
  ]);
  expect(grupo.markupCategoria).toBeCloseTo(2.50, 6);
  const diretoUnitario =
    grupo.somaDieselUnitario + grupo.somaManutencaoUnitaria + grupo.somaMaoDeObraUnitaria;
  const indiretoUnitario = grupo.indiretoUnicoAplicado / grupo.volumeReferencia;
  expect(grupo.volumeReferenciaCustosDiretos).toBeCloseTo(537228.53 * 1.36, 2);
  expect(grupo.custoTotalAgrupado).toBeCloseTo(
    (diretoUnitario + indiretoUnitario) * grupo.volumeReferencia,
    6,
  );
  expect(grupo.custoUnitarioAgrupado).toBeCloseTo(
    grupo.custoTotalAgrupado / 537228.53,
    6,
  );
  expect(grupo.precoUnitarioFinal).toBeCloseTo(grupo.custoUnitarioAgrupado * 2.50, 6);
  expect(grupo.totalFinalGrupo).toBeCloseTo(grupo.precoUnitarioFinal * 537228.53, 6);
  const somaTotaisIndividuais = r.detalhes.auditoria.equipamentos.reduce(
    (s, e) => s + e.total_maquina_obra_R$,
    0,
  );
  expect(r.total_item).not.toBeCloseTo(somaTotaisIndividuais, 2);
  expect(r.total_item).toBeCloseTo(grupo.totalFinalGrupo, 6);
});

test("indireto da categoria não duplica por modelo de escavadeira", () => {
  const misto = calcEscavacao([
    { equipmentId: eqByName["Escavadeira 312 DL"].id, quantity: 1 },
    { equipmentId: eqByName["Escavadeira 320DL"].id, quantity: 1 },
  ]);
  const duas320 = calcEscavacao([
    { equipmentId: eqByName["Escavadeira 320DL"].id, quantity: 2 },
  ]);

  const grupoMisto = misto.detalhes.auditoria.consolidacaoCategorias.find(
    (g) => g.categoria === "Escavadeira",
  );
  const grupoDuas320 = duas320.detalhes.auditoria.consolidacaoCategorias.find(
    (g) => g.categoria === "Escavadeira",
  );

  expect(grupoMisto.indiretoUnicoAplicado).toBeCloseTo(
    misto.detalhes.auditoria.contexto.indiretoBreakdown.totalIndiretoPorEquipamento,
    6,
  );
  expect(grupoMisto.indiretoUnicoAplicado).toBeCloseTo(grupoDuas320.indiretoUnicoAplicado, 6);
  expect(grupoMisto.somaIndiretosInformativoModelos).toBeGreaterThan(grupoMisto.indiretoUnicoAplicado);
  expect(grupoMisto.origemIndireto).toBe("calculo geral do projeto");
  expect(grupoMisto.criterioAgrupamentoIndireto).toBe("category/categoria");
  expect(misto.detalhes.auditoria.validacoes.some((v) =>
    /Indireto aplicado uma única vez no grupo da categoria/.test(v.mensagem)
  )).toBe(true);
});

test("consolidação soma unitários sem indireto e aplica markup uma única vez", () => {
  const r = calcEscavacao([
    { equipmentId: eqByName["Escavadeira 320DL"].id, quantity: 1 },
    { equipmentId: eqByName["Escavadeira 336DL"].id, quantity: 1 },
  ]);

  const grupo = r.detalhes.auditoria.consolidacaoCategorias.find(
    (g) => g.categoria === "Escavadeira",
  );
  const volumeEmpolado = 537228.53 * 1.36;
  const somaUnitariosMaquinas = r.detalhes.auditoria.equipamentos.reduce(
    (s, e) => s + e.custo_unitario_individual_sem_markup,
    0,
  );
  const indiretoUnitario = grupo.indiretoUnicoAplicado / grupo.volumeReferencia;

  expect(grupo.volumeReferenciaCustosDiretos).toBeCloseTo(volumeEmpolado, 2);
  expect(grupo.volumeReferenciaTotalFinal).toBeCloseTo(537228.53, 2);
  expect(grupo.somaDieselUnitario).toBeCloseTo(grupo.somaDiesel / volumeEmpolado, 6);
  expect(grupo.somaManutencaoUnitaria).toBeCloseTo(grupo.somaManutencao / volumeEmpolado, 6);
  expect(grupo.somaMaoDeObraUnitaria).toBeCloseTo(grupo.somaMaoDeObra / volumeEmpolado, 6);
  expect(grupo.custoUnitarioEquipamentos).toBeCloseTo(somaUnitariosMaquinas, 6);
  expect(grupo.custoUnitarioAgrupado).toBeCloseTo(somaUnitariosMaquinas + indiretoUnitario, 6);
  expect(grupo.precoUnitarioFinal).toBeCloseTo(grupo.custoUnitarioAgrupado * 2.50, 6);
  expect(grupo.somaDieselUnitario).toBeCloseTo(0.55, 2);
  expect(grupo.somaManutencaoUnitaria).toBeCloseTo(0.21, 2);
  expect(grupo.somaMaoDeObraUnitaria).toBeCloseTo(0.16, 2);
  expect(grupo.indireto_R$_m3).toBeCloseTo(0.30, 1);
  expect(grupo.precoUnitarioFinal).toBeCloseTo(3.05, 1);
  expect(r.preco_unitario).toBeCloseTo(grupo.precoUnitarioFinal, 6);
});
