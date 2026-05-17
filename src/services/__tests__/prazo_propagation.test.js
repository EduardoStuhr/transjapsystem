import { calcQuotationTotals } from "../costEngine";
import { INITIAL_EQUIPMENT, INITIAL_PARAMS } from "../../data/initialData";

const equipamentoExecutor = INITIAL_EQUIPMENT.find(
  (eq) => (eq.baseProductivity ?? eq.productivity ?? 0) > 0
);
const equipmentMap = Object.fromEntries(INITIAL_EQUIPMENT.map((e) => [e.id, e]));

const itemBase = {
  id: "1",
  desc: "Limpeza",
  unit: "m3",
  quantity: 320000,
  volumeInSitu: 320000,
  fatorEmpolamento: 1.36,
  equipmentLines: [{ equipmentId: equipamentoExecutor.id, quantity: 1 }],
};

test("prazo definido no meta propaga para params e ativa modelo novo", () => {
  const meta = { prazoMeses: 9, diasUteisMes: 22, horasDia: 9 };
  const items = [{ ...itemBase }];
  const params = {
    ...INITIAL_PARAMS,
    dieselPrice: 5.50,
    prazo_meses: meta.prazoMeses,
    dias_uteis_mes: meta.diasUteisMes,
    horas_dia: meta.horasDia,
  };

  const result = calcQuotationTotals(items, equipmentMap, params, {
    bdi: 0,
    adminPct: 0,
    mobilPct: 0,
    riskPct: 0,
  });
  const auditoria = result.itemsCalc[0].detalhes?.auditoria;

  expect(auditoria?.tipo).toBe("ok-novo");
  expect(auditoria?.contexto?.horasProjeto).toBe(1782);
});

test("item com prazo proprio sobrescreve o do meta", () => {
  const meta = { prazoMeses: 9, diasUteisMes: 22, horasDia: 9 };
  const items = [{ ...itemBase, prazoMeses: 4 }];
  const params = {
    ...INITIAL_PARAMS,
    dieselPrice: 5.50,
    prazo_meses: meta.prazoMeses,
    dias_uteis_mes: meta.diasUteisMes,
    horas_dia: meta.horasDia,
  };

  const result = calcQuotationTotals(items, equipmentMap, params, {
    bdi: 0,
    adminPct: 0,
    mobilPct: 0,
    riskPct: 0,
  });

  expect(result.itemsCalc[0].detalhes?.auditoria?.contexto?.horasProjeto).toBe(792);
});
