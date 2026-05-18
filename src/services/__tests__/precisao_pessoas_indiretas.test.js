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

test("alimentacao em modo agrupado segue formula da planilha sem multiplicar quantidade novamente", () => {
  const r = calcIndiretoRateadoPorM3(
    {
      ...INITIAL_PARAMS,
      alimentacao_modo_calculo: "agrupado",
      pessoas_indiretas: {
        ...INITIAL_PARAMS.pessoas_indiretas,
        alimentacao: null,
      },
    },
    [{ tipo: "alimentacao", quantidade: 13 }],
    0,
    volumeInSitu,
    horasProjeto,
    { withBreakdown: true },
  );
  const alimentacao = r.linhas.find((l) => l.tipo === "alimentacao");

  expect(alimentacao.custoHora).toBeCloseTo(86.6666667, 6);
  expect(alimentacao.quantidadeUsadaNoTotal).toBe(1);
  expect(alimentacao.total).toBeCloseTo(154440.00, 2);
  expect(alimentacao.custoHora).not.toBeCloseTo(133.3333333, 6);
  expect(alimentacao.alimentacao).toEqual(expect.objectContaining({
    modoCalculo: "agrupado",
    quantidadePessoas: 13,
    valorDiario: 40,
    diasMes: 30,
    horasRef: 180,
    horasTotaisProjeto: 1782,
    valorHoraCalculado: expect.any(Number),
  }));
});

test("alimentacao em modo por pessoa multiplica o valor unitario pela quantidade", () => {
  const r = calcIndiretoRateadoPorM3(
    {
      ...INITIAL_PARAMS,
      alimentacao_modo_calculo: "por_pessoa",
      pessoas_indiretas: {
        ...INITIAL_PARAMS.pessoas_indiretas,
        alimentacao: null,
      },
    },
    [{ tipo: "alimentacao", quantidade: 13 }],
    0,
    volumeInSitu,
    horasProjeto,
    { withBreakdown: true },
  );
  const alimentacao = r.linhas.find((l) => l.tipo === "alimentacao");

  expect(alimentacao.custoHora).toBeCloseTo(6.6666667, 6);
  expect(alimentacao.quantidadeUsadaNoTotal).toBe(13);
  expect(alimentacao.total).toBeCloseTo(154440.00, 2);
});
