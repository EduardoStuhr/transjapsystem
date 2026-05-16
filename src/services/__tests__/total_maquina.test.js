import { calcItemCost } from "../costEngine";
import { INITIAL_EQUIPMENT, INITIAL_PARAMS } from "../../data/initialData";

const volumeInSitu = 537228.53;
const indirectPersonnel = [
  { tipo: "topografia", quantidade: 1 },
  { tipo: "alojamento", quantidade: 1 },
  { tipo: "alimentacao", quantidade: 1 },
  { tipo: "vigilancia", quantidade: 1 },
];

test("total da maquina usa operadores da frota do orcamento para fechar com a planilha", () => {
  const escavadeira320 = INITIAL_EQUIPMENT.find((e) => e.name === "Escavadeira 320DL");
  const equipmentMap = Object.fromEntries(INITIAL_EQUIPMENT.map((e) => [e.id, e]));
  const item = {
    unit: "M3",
    category: "Escavacao",
    desc: "Escavacao + Carga + Transporte",
    quantity: volumeInSitu,
    volumeInSitu,
    fatorEmpolamento: 1.36,
    prazoMeses: 9,
    diasUteisMes: 22,
    horasDia: 9,
    adjustedProductivity: 477.1,
    terrainFactor: 1,
    fatorLogistica: 1,
    soilCategory: "1",
    equipmentLines: [{ equipmentId: escavadeira320.id, quantity: 1 }],
  };

  const r = calcItemCost(
    item,
    equipmentMap,
    INITIAL_PARAMS,
    indirectPersonnel,
    { numOperadoresFrota: 8 },
  );
  const eq = r.detalhes.auditoria.equipamentos[0];

  expect(eq.preco_R$_m3).toBeCloseTo(2.27721563, 7);
  expect(eq.total_maquina_obra_R$).toBeCloseTo(1223385.20, 2);
});

test("total da maquina usa totalHorasProjeto do orcamento quando informado", () => {
  const escavadeira320 = INITIAL_EQUIPMENT.find((e) => e.name === "Escavadeira 320DL");
  const equipmentMap = Object.fromEntries(INITIAL_EQUIPMENT.map((e) => [e.id, e]));
  const item = {
    unit: "M3",
    category: "Escavacao",
    quantity: volumeInSitu,
    volumeInSitu,
    fatorEmpolamento: 1.36,
    prazoMeses: 8.987654321,
    diasUteisMes: 22,
    horasDia: 9,
    adjustedProductivity: 477.1,
    terrainFactor: 1,
    fatorLogistica: 1,
    soilCategory: "1",
    equipmentLines: [{ equipmentId: escavadeira320.id, quantity: 1 }],
  };

  const r = calcItemCost(
    item,
    equipmentMap,
    INITIAL_PARAMS,
    indirectPersonnel,
    { numOperadoresFrota: 8, horasProjeto: 1782 },
  );
  const eq = r.detalhes.auditoria.equipamentos[0];

  expect(r.detalhes.auditoria.contexto.horasProjeto).toBe(1782);
  expect(eq.total_maquina_obra_R$).toBeCloseTo(1223385.20, 2);
});
