import { calcItemCost } from "../costEngine";
import { INITIAL_EQUIPMENT, INITIAL_PARAMS } from "../../data/initialData";

const equipmentMap = Object.fromEntries(INITIAL_EQUIPMENT.map((e) => [e.id, e]));
const escavadeira320 = INITIAL_EQUIPMENT.find((e) => e.name === "Escavadeira 320DL");

const item = {
  id: "esc-test",
  desc: "Escavacao Escavadeira 320DL",
  category: "Escavacao",
  unit: "M3",
  quantity: 537228.53,
  volumeInSitu: 537228.53,
  fatorEmpolamento: 1.36,
  soilCategory: "1",
  baseProductivity: 153.6,
  adjustedProductivity: 153.6,
  prazoMeses: 9,
  diasUteisMes: 22,
  horasDia: 9,
  equipmentLines: [{ equipmentId: escavadeira320.id, quantity: 1 }],
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

const indirectPersonnel = [
  { tipo: "topografia", quantidade: 1 },
  { tipo: "alojamento", quantidade: 1 },
  { tipo: "alimentacao", quantidade: 1 },
  { tipo: "vigilancia", quantidade: 1 },
];

test("Escavadeira 320DL - parcelas batem com planilha", () => {
  const r = calcItemCost(
    item,
    equipmentMap,
    params,
    indirectPersonnel,
    { numOperadoresFrota: 8, horasProjeto: 1782 },
  );
  const eq = r.detalhes.auditoria.equipamentos[0];

  expect(eq.total_diesel).toBeCloseTo(327023.87, 0);
  expect(eq.total_manutencao).toBeCloseTo(65934.00, 0);
  expect(eq.total_mo).toBeCloseTo(58149.47, 0);
  expect(eq.total_maquina_obra_R$).toBeCloseTo(1223385.20, 0);
});
