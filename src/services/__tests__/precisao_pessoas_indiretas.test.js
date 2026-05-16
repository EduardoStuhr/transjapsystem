import { calcIndiretoRateadoPorM3 } from "../costEngine";
import { INITIAL_PARAMS } from "../../data/initialData";

const params = INITIAL_PARAMS;
const indirectPersonnel = [
  { tipo: "topografia", quantidade: 1 },
  { tipo: "alojamento", quantidade: 1 },
  { tipo: "alimentacao", quantidade: 1 },
  { tipo: "vigilancia", quantidade: 1 },
];
const horasProjeto = 1782;
const volumeInSitu = 537228.53;
// O engine local soma operadores diretos + pessoas indiretas para alimentacao.
// Para as 12 pessoas totais da planilha, sao 8 operadores diretos + 4 indiretos.
const numOperadoresFrota = 8;

test("totais batem com planilha (delta < R$ 0,50)", () => {
  const r = calcIndiretoRateadoPorM3(
    params,
    indirectPersonnel,
    numOperadoresFrota,
    volumeInSitu,
    horasProjeto,
    { withBreakdown: true },
  );
  const linha = (t) => r.linhas.find((l) => l.tipo === t);

  expect(linha("topografia").total).toBeCloseTo(158400.00, 0);
  expect(linha("alojamento").total).toBeCloseTo(82170.00, 0);
  expect(linha("alimentacao").total).toBeCloseTo(142560.00, 0);
  expect(linha("vigilancia").total).toBeCloseTo(247500.00, 0);
  expect(r.totalIndireto).toBeCloseTo(630630.00, 0);
});

test("arredonda somente o total de alojamento quando valor legado vier com 4 casas", () => {
  const paramsLegado = {
    ...INITIAL_PARAMS,
    pessoas_indiretas: {
      ...INITIAL_PARAMS.pessoas_indiretas,
      topografia: 88.8889,
      alojamento: 46.1111,
    },
  };

  const r = calcIndiretoRateadoPorM3(
    paramsLegado,
    [
      { tipo: "topografia", quantidade: 1 },
      { tipo: "alojamento", quantidade: 1 },
    ],
    0,
    volumeInSitu,
    horasProjeto,
    { withBreakdown: true },
  );
  const linha = (t) => r.linhas.find((l) => l.tipo === t);

  expect(linha("alojamento").total).toBe(82170);
  expect(linha("topografia").total).toBeCloseTo(158400.0198, 4);
});
