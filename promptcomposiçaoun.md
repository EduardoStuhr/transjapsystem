# 🛠️ PROMPT — Refatoração do cálculo de composição unitária no `costEngine.js`

> **Como usar:** copie todo este conteúdo e cole como primeira mensagem no Claude Code (VS Code), com o repositório `transjapsystem` aberto. Este documento é uma especificação completa e autossuficiente — não depende de nenhum arquivo externo.

---

## 1. CONTEXTO

Este é um sistema (React + Zustand) para **criar orçamentos de terraplanagem do zero**. A engine de cálculo está em `src/services/costEngine.js`. Ela tem erros conceituais que precisam ser corrigidos.

O sistema **não copia números de uma obra existente**. Ele recebe inputs do usuário (volume, prazo, frota, equipe) e aplica fórmulas matemáticas para produzir custo unitário e preço final. Os "dados fixos" (preço do diesel, custo de manutenção por equipamento, custo de mão de obra, markups) são preenchidos manualmente pelo usuário no cadastro **uma vez**, e reusados em todos os orçamentos.

---

## 2. SEPARAÇÃO ARQUITETURAL (princípio fundamental)

Antes das correções de cálculo, é crítico respeitar essa separação:

### 2.1 Dados fixos no cadastro (preenchidos manualmente, editáveis quando o usuário quiser)

Vivem em `INITIAL_PARAMS` ou no cadastro de equipamentos. **Não mudam por orçamento.** São editáveis nas telas de Parâmetros e Equipamentos.

| Dado | Onde |
|---|---|
| Preço do diesel (R$/L) | Parâmetros |
| Custo de manutenção R$/h por equipamento | Cadastro de Equipamento |
| Categorias de operador → R$/h por categoria | Parâmetros (tabela) |
| Pessoas indiretas → R$/h por tipo de pessoa | Parâmetros (tabela) |
| Markup por categoria de equipamento | Parâmetros (tabela) |
| Alíquota de imposto sobre lucro | Parâmetros |
| Fator de empolamento (default) | Parâmetros (override possível por orçamento) |
| Dias úteis/mês (default) | Parâmetros (override possível) |
| Horas/dia (default) | Parâmetros (override possível) |
| Consumo de diesel (L/h) por equipamento | Cadastro de Equipamento |
| Produtividade base (m³/h, m²/h) por equipamento | Cadastro de Equipamento |

### 2.2 Dados do orçamento (inseridos a cada nova obra)

Vivem no item de orçamento. Mudam toda vez.

- Volume in situ (m³ ou m²)
- Prazo (meses, ou datas → meses)
- Frota alocada (quantidade de cada equipamento)
- Equipe indireta alocada (quantidade de cada tipo de pessoa)
- Overrides opcionais dos defaults (empolamento específico, etc.)

### 2.3 Dados calculados (nunca persistidos, recalculados em tempo real)

Não devem aparecer no cadastro de equipamento. Só são calculados dentro do contexto de um orçamento.

- Volume empolado = volume in situ × fator empolamento
- Horas do projeto = dias úteis × horas/dia × meses
- Horas-máquina necessárias = volume in situ ÷ produção conjunta da frota
- Diesel R$/h por equipamento = consumo × preço diesel
- Custo total de cada parcela (diesel, manutenção, MO, indireto) — em R$ no projeto inteiro
- Custos por m³ (diesel, manutenção, MO, indireto)
- Custo unitário R$/m³ do item
- Preço unitário R$/m³ (custo × markup)
- Total do item, receita, lucro, imposto, lucro líquido, margem

### 2.4 Implicação imediata

A tela atual de **Banco de Equipamentos** mostra colunas como `Indiretos/h` e `TOTAL/h` como se fossem propriedades do equipamento. Essas colunas devem ser **removidas** — esses valores variam de acordo com a obra (volume, prazo, equipe indireta) e não podem ser cravados no cadastro.

---

## 3. O ERRO ATUAL NO `costEngine.js`

Hoje a função `calcItemCost` calcula assim (linhas aproximadas 547-553):

```js
const custo_unitario = custo_total_hora / produtividade_utilizada;

const decompUnitDiesel    = sumDiesel    / produtividade_utilizada;
const decompUnitManut     = sumManut     / produtividade_utilizada;
const decompUnitOp        = sumOp        / produtividade_utilizada;
const decompUnitIndir     = sumIndireto  / produtividade_utilizada;

// onde produtividade_utilizada =
//   produtividade_base × eficiencia × fatorSolo × fatorLogistica
```

**Quatro problemas conceituais:**

### 3.1 Diesel não deve dividir por produtividade efetiva

O consumo de diesel é constante por hora real de operação (litros que a máquina queima ligada). Se a eficiência cai, a máquina leva mais horas pra produzir o mesmo volume — e queima mais combustível total proporcionalmente. O R$/m³ de diesel é, portanto, uma constante em relação à eficiência. Aplicar eficiência aqui conta a perda duas vezes.

### 3.2 Manutenção e mão de obra não escalam com produtividade

Manutenção (peças, óleos, mecânica) é cobrada **proporcional ao tempo que o equipamento fica alocado no contrato**, não ao volume produzido. Mão de obra do operador também — ele recebe pelo prazo do contrato, mesmo se a produção for menor. Dividir por produtividade significa "se a máquina é mais lenta, paga-se menos manutenção e MO", o que é falso (paga-se igual ou mais).

### 3.3 Indireto não é por hora de equipamento

O indireto representa o custo das pessoas que dão suporte à obra (topografia, alojamento, alimentação, vigilância, apontador, administrativo). Esse custo é fixo durante o prazo do contrato e independente de quantas horas cada equipamento opera. Tratá-lo como `R$/h por equipamento` distorce — ele deve ser rateado pelo volume da obra e pelo número de pessoas indiretas alocadas.

### 3.4 Markup hardcoded único

O sistema multiplica `fatorBase × ajusteFinal` (default `2,30 × 1,20 = 2,76`) em todos os equipamentos. Em prática, categorias diferentes têm margens diferentes (uma escavadeira não tem o mesmo markup que um caminhão de transporte). Precisa ser configurável **por categoria de equipamento**.

---

## 4. AS FÓRMULAS CORRETAS

Cada parcela (diesel, manutenção, MO, indireto) tem regra própria. Use estas definições matemáticas exatas — elas são autossuficientes.

### 4.1 Notação

- `volume_in_situ` — volume da obra inserido pelo usuário (m³)
- `fator_empolamento` — multiplicador do solo (default 1,36; editável)
- `volume_empolado = volume_in_situ × fator_empolamento`
- `prazo_meses` — duração do contrato
- `dias_uteis_mes` — default 22, editável
- `horas_dia` — default 9, editável
- `horas_projeto = dias_uteis_mes × horas_dia × prazo_meses`
- `qty_eq` — quantidade alocada de um equipamento `eq` no item
- `consumo_eq` — L/h do equipamento (cadastro)
- `produtividade_base_eq` — m³/h base do equipamento (cadastro)
- `custo_h_manutencao_eq` — R$/h tabelado pelo usuário (cadastro)
- `custo_h_operador_categoria` — R$/h da categoria do operador (parâmetros)
- `preco_diesel` — R$/L (parâmetros)

### 4.2 Diesel

```
Para cada equipamento eq alocado no item:
  diesel_h_eq      = consumo_eq × preco_diesel                  (R$/h)

Produção conjunta da frota do item:
  producao_conjunto = Σ_eq (produtividade_base_eq × qty_eq)     (m³/h)

Horas-máquina necessárias para concluir o serviço:
  horas_maquina = volume_in_situ ÷ producao_conjunto            (h)

Custo total de diesel do item:
  total_diesel = Σ_eq (diesel_h_eq × horas_maquina × qty_eq)    (R$)

Diesel rateado por m³ empolado:
  diesel_R$_m3 = total_diesel ÷ volume_empolado                 (R$/m³)
```

**Invariante crítico:** se o usuário dobra a frota (passa de 1 para 2 escavadeiras iguais), `producao_conjunto` dobra, `horas_maquina` cai pela metade, e `total_diesel` permanece constante. Isso é verdadeiro fisicamente: dois equipamentos terminam o serviço em metade do tempo, queimando o mesmo combustível total.

### 4.3 Manutenção

```
Para cada equipamento eq alocado no item:
  total_manut_eq = custo_h_manutencao_eq × horas_projeto × qty_eq   (R$)

Custo total de manutenção do item:
  total_manut = Σ_eq total_manut_eq

Manutenção rateada por m³ empolado:
  manut_R$_m3 = total_manut ÷ volume_empolado                       (R$/m³)
```

**Invariante:** se dobrar o prazo do contrato, `total_manut` dobra (o equipamento fica alocado o dobro do tempo). Se dobrar a frota, `total_manut` dobra (dois equipamentos = dois conjuntos de manutenção em paralelo).

### 4.4 Mão de obra do operador

```
Para cada equipamento eq alocado no item:
  custo_h_operador_eq = params.categorias_operador[eq.categoria_operador]
  total_mo_eq = custo_h_operador_eq × horas_projeto × qty_eq         (R$)

Custo total de MO do item:
  total_mo = Σ_eq total_mo_eq

MO rateada por m³ empolado:
  mo_R$_m3 = total_mo ÷ volume_empolado                              (R$/m³)
```

Mesmo invariante que manutenção: proporcional ao prazo e à quantidade.

### 4.5 Indireto rateado

```
Para cada pessoa indireta alocada no orçamento:
  custo_h_pessoa = params.pessoas_indiretas[pessoa.tipo]    (R$/h)
  total_pessoa   = custo_h_pessoa × horas_projeto × qty_pessoa   (R$)

Custo total das pessoas indiretas:
  total_indireto_pessoas = Σ_pessoa total_pessoa

Número total de pessoas indiretas alocadas:
  num_pessoas = Σ_pessoa qty_pessoa

Indireto rateado por m³ in situ por pessoa:
  indireto_m3_por_pessoa = (total_indireto_pessoas ÷ volume_in_situ) ÷ num_pessoas

Indireto atribuído a cada equipamento ATIVO (qty > 0) do item:
  indireto_R$_m3_eq = indireto_m3_por_pessoa     (mesmo valor para todos os equipamentos ativos)

Total de indireto no R$/m³ do item:
  indireto_R$_m3 = num_equipamentos_ativos_no_item × indireto_m3_por_pessoa
```

**Caso especial — Alimentação:**  
Se o tipo `alimentacao` não tem `custo_h_pessoa` cadastrado, calcular dinamicamente:

```
total_pessoas_obra = num_operadores_da_frota + num_pessoas_indiretas
custo_h_alimentacao = (total_pessoas_obra × valor_dia_alimentacao × dias_mes) ÷ horas_mes_referencia
```

Onde `valor_dia_alimentacao` (default 40), `dias_mes` (default 30) e `horas_mes_referencia` (default 180) são parâmetros editáveis. Esse custo varia com o tamanho total da equipe.

**Invariantes:**
- Se dobrar o volume da obra, `indireto_m3_por_pessoa` cai pela metade (o custo fixo se dilui).
- Se dobrar o número de pessoas indiretas (com tipos iguais), `total_indireto_pessoas` dobra mas `num_pessoas` também dobra → `indireto_m3_por_pessoa` permanece igual.
- Se zero pessoas indiretas alocadas, `indireto_R$_m3 = 0` (com alerta visual sugerindo alocação).

### 4.6 Custo unitário do item

```
custo_unitario_item = diesel_R$_m3 + manut_R$_m3 + mo_R$_m3 + indireto_R$_m3   (R$/m³)
```

**Não há eficiência, fator de solo, nem fator de logística aplicados ao custo.** Esses fatores podem aparecer na UI como informativos (ex: "produtividade real estimada"), mas não entram no cálculo de R$/m³.

### 4.7 Preço unitário (com markup por categoria)

```
Para cada equipamento eq do item:
  custo_eq_R$_m3   = diesel_eq_R$_m3 + manut_eq_R$_m3 + mo_eq_R$_m3 + indireto_eq_R$_m3
  markup_eq        = params.markup_por_categoria[eq.categoria]
                     (fallback: params.markup_por_categoria._default)
  preco_eq_R$_m3   = custo_eq_R$_m3 × markup_eq

preco_unitario_item = Σ_eq preco_eq_R$_m3                               (R$/m³)

markup_efetivo_item = preco_unitario_item ÷ custo_unitario_item         (× — informativo)
```

### 4.8 Totais do orçamento

```
Total do item     = preco_unitario_item × volume_in_situ
Receita total     = Σ_item total_do_item

Custo total do projeto = Σ_item (custo_unitario_item × volume_in_situ)

Lucro estimado    = Receita total − Custo total
Imposto           = Lucro estimado × aliquota_imposto_lucro
Lucro líquido     = Lucro estimado − Imposto
Margem líquida    = (Lucro líquido ÷ Receita total) × 100      (%)
```

---

## 5. MUDANÇAS NO CÓDIGO

### 5.1 `src/data/initialData.js` — adicionar em `INITIAL_PARAMS`

```js
// Tabela de R$/h por categoria de operador
// (valores iniciais sugeridos — usuário edita na tela de Parâmetros)
categorias_operador: {
  "operador_escavadeira": 32.6316,
  "operador_trator":      24.7368,
  "auxiliar":             21.0526,
},

// Tabela de R$/h por tipo de pessoa indireta
pessoas_indiretas: {
  "topografia":     88.8889,
  "laboratorio":    88.8889,
  "alojamento":     46.1111,
  "alimentacao":    null,    // null sinaliza "calcular dinamicamente"
  "vigilancia":    138.8889,
  "apontador":      21.0526,
  "administrativo": 24.7368,
},

// Parâmetros do cálculo dinâmico de alimentação
alimentacao_valor_dia:    40,
alimentacao_dias_mes:     30,
alimentacao_horas_ref:    180,

// Markup por categoria (substitui fatorBase × ajusteFinal globais)
markup_por_categoria: {
  "Escavadeira":     2.50,
  "Caminhão":        1.99,
  "Trator":          2.37,
  "Motoniveladora":  2.37,
  "Grade":           2.37,
  "Compactador":     2.37,
  "Pipa":            2.37,
  "Rolo":            2.37,
  "_default":        2.37,
},

// Imposto sobre lucro
aliquota_imposto_lucro: 0.3825,

// Defaults editáveis (com override por orçamento)
fator_empolamento: 1.36,
dias_uteis_mes:    22,
horas_dia:         9,
```

### 5.2 `src/data/initialData.js` — adicionar em cada item de `INITIAL_EQUIPMENT`

Dois campos novos:

```js
{
  id: uid(),
  name: "Escavadeira 312 DL",
  category: "Escavadeira",
  consumption: 12,
  baseProductivity: 96,

  custo_h_manutencao: 34.50,                      // ← NOVO
  categoria_operador: "operador_escavadeira",     // ← NOVO

  // manter como fallback (caso usuário queira o cálculo via salário):
  salario_operador_mensal: 3500,
  fator_encargos: 1.70,
}
```

Os valores iniciais que o usuário pode ver no cadastro (ele edita à vontade depois):

| Equipamento | Categoria | Consumo (L/h) | custo_h_manutencao | categoria_operador | Produtividade base |
|---|---|---|---|---|---|
| Escavadeira 312 DL | Escavadeira | 12 | 34,50 | operador_escavadeira | 96 |
| Escavadeira 320DL | Escavadeira | 17 | 37,00 | operador_escavadeira | 153,6 |
| Escavadeira 336DL | Escavadeira | 37 | 48,00 | operador_escavadeira | 240 |
| Escavadeira 345 GC | Escavadeira | 39 | 53,00 | operador_escavadeira | 288 |
| Trator de Esteiras Leve | Trator | 28 | 43,50 | operador_trator | 393,6 |
| Trator de Esteiras Pesado | Trator | 39 | 43,50 | operador_trator | 320 |
| Motoniveladora (Patrol) | Motoniveladora | 17 | 39,00 | operador_trator | 2000 |
| Grade Agrícola | Grade | 15 | 18,00 | auxiliar | 1500 |
| Rolo Compactador Pé de Carneiro | Compactador | 15 | 35,00 | auxiliar | 250 |
| Caminhão Pipa | Pipa | 8 | 34,00 | auxiliar | 1 |
| Caminhão Caçamba Truck | Caminhão | 22 | 22,00 | auxiliar | 14 |

**Importante:** esses são apenas valores iniciais sugeridos para popular a base na primeira vez que o sistema rodar. **Todos eles devem ser editáveis na tela de Equipamentos.**

### 5.3 `src/services/costEngine.js` — refatorar `calcEquipmentHourlyCost`

Substituir o cálculo via `% do diesel` e `salário ÷ horasMes`:

```js
export const calcEquipmentHourlyCost = (eq, params) => {
  const dieselPrice = toNum(params?.dieselPrice, 0);
  const consumo     = toNum(eq?.consumption, 0);

  // Diesel — cálculo direto
  const diesel_hora = consumo * dieselPrice;

  // Manutenção — usa valor tabelado, fallback no % do diesel
  const manutencao_hora = eq?.custo_h_manutencao != null
    ? toNum(eq.custo_h_manutencao, 0)
    : diesel_hora * toNum(params?.percManutBase, 0.10);

  // Operador — usa categoria, fallback no cálculo via salário
  const custoCategoria = eq?.categoria_operador
    ? params?.categorias_operador?.[eq.categoria_operador]
    : null;

  const operador_hora = custoCategoria != null
    ? toNum(custoCategoria, 0)
    : (toNum(eq?.salario_operador_mensal, 0) * toNum(params?.fator_encargos, 1.7))
      / toNum(params?.hoursPerMonth, 160);

  // REMOVER: fator de solo aqui (não entra no custo)
  // REMOVER: indireto por equipamento (vai pra modelo rateado)

  return {
    diesel_hora,
    manutencao_hora,
    operador_hora,
    custo_direto_hora: diesel_hora + manutencao_hora + operador_hora,
  };
};
```

### 5.4 `src/services/costEngine.js` — nova função `calcIndiretoRateado`

```js
/**
 * Calcula o indireto rateado por m³ por pessoa indireta.
 * Esse valor é o MESMO para todos os equipamentos ativos do orçamento.
 *
 * @param {object} params               - parâmetros globais
 * @param {Array} indirectPersonnel     - [{ tipo, quantidade }]
 * @param {number} numOperadoresFrota   - soma das qty da frota (para alimentação)
 * @param {number} volumeInSitu         - volume in situ do orçamento
 * @param {number} horasProjeto         - dias_uteis × horas_dia × meses
 * @returns {number} indireto em R$/m³ por pessoa
 */
export const calcIndiretoRateadoPorM3 = (
  params,
  indirectPersonnel = [],
  numOperadoresFrota = 0,
  volumeInSitu = 0,
  horasProjeto = 0
) => {
  if (volumeInSitu <= 0) return 0;
  if (!Array.isArray(indirectPersonnel) || indirectPersonnel.length === 0) return 0;

  const numPessoasIndiretas = indirectPersonnel.reduce(
    (s, p) => s + toNum(p.quantidade, 0),
    0
  );
  if (numPessoasIndiretas === 0) return 0;

  let totalIndireto = 0;
  for (const pessoa of indirectPersonnel) {
    let custoHora = params?.pessoas_indiretas?.[pessoa.tipo];

    // Caso especial: alimentação calculada dinamicamente
    if (pessoa.tipo === "alimentacao" && (custoHora == null)) {
      const totalPessoasObra = numOperadoresFrota + numPessoasIndiretas;
      const valorDia  = toNum(params?.alimentacao_valor_dia, 40);
      const diasMes   = toNum(params?.alimentacao_dias_mes, 30);
      const horasRef  = toNum(params?.alimentacao_horas_ref, 180);
      custoHora = (totalPessoasObra * valorDia * diasMes) / horasRef;
    }

    if (custoHora == null) continue;
    totalIndireto += toNum(custoHora, 0) * horasProjeto * toNum(pessoa.quantidade, 0);
  }

  return (totalIndireto / volumeInSitu) / numPessoasIndiretas;
};
```

### 5.5 `src/services/costEngine.js` — refatorar `calcItemCost`

Substituir o trecho que calcula `decompUnit*` (linhas ~547-553) e os fatores de markup (linhas ~614-617). A nova lógica:

```js
// === Variáveis do orçamento ===
const volumeInSitu     = toNum(item.volumeInSitu, 0);
const fatorEmpolamento = toNum(
  item.fatorEmpolamento,
  toNum(params?.fator_empolamento, 1.36)
);
const volumeEmpolado   = volumeInSitu * fatorEmpolamento;

const prazoMeses       = toNum(item.prazoMeses, toNum(params?.prazo_meses, 1));
const diasUteisMes     = toNum(item.diasUteisMes, toNum(params?.dias_uteis_mes, 22));
const horasDia         = toNum(item.horasDia, toNum(params?.horas_dia, 9));
const horasProjeto     = diasUteisMes * horasDia * prazoMeses;

// === Produção conjunta e horas-máquina ===
const equipmentLines = (item.equipmentLines || []).filter(l => toNum(l.qty, 0) > 0);

const producaoConjuntoHora = equipmentLines.reduce((s, l) => {
  const eq = equipmentMap[l.equipmentId];
  return s + toNum(eq?.baseProductivity, 0) * toNum(l.qty, 0);
}, 0);

const horasMaquinaNecessarias = producaoConjuntoHora > 0
  ? volumeInSitu / producaoConjuntoHora
  : 0;

// === Indireto rateado (mesmo para todos os equipamentos ativos) ===
const indirectPersonnel  = item.indirectPersonnel || [];
const numOperadoresFrota = equipmentLines.reduce((s, l) => s + toNum(l.qty, 0), 0);

const indiretoR$M3PorPessoa = calcIndiretoRateadoPorM3(
  params,
  indirectPersonnel,
  numOperadoresFrota,
  volumeInSitu,
  horasProjeto
);

// === Calcular cada parcela R$/m³ POR EQUIPAMENTO ===
let custo_unitario = 0;
let preco_unitario = 0;
let dieselR$M3_total   = 0;
let manutR$M3_total    = 0;
let moR$M3_total       = 0;
let indiretoR$M3_total = 0;
const detalheEquipamentos = [];

for (const line of equipmentLines) {
  const qty = toNum(line.qty, 0);
  const eq  = equipmentMap[line.equipmentId];
  if (!eq) continue;

  const { diesel_hora, manutencao_hora, operador_hora } = calcEquipmentHourlyCost(eq, params);

  // Diesel — proporcional a horas-máquina, rateado por volume empolado
  const totalDieselEq = diesel_hora * horasMaquinaNecessarias * qty;
  const dieselEqM3    = volumeEmpolado > 0 ? totalDieselEq / volumeEmpolado : 0;

  // Manutenção e MO — proporcionais ao prazo, rateadas por volume empolado
  const totalManutEq = manutencao_hora * horasProjeto * qty;
  const manutEqM3    = volumeEmpolado > 0 ? totalManutEq / volumeEmpolado : 0;

  const totalMOEq = operador_hora * horasProjeto * qty;
  const moEqM3    = volumeEmpolado > 0 ? totalMOEq / volumeEmpolado : 0;

  // Indireto — mesmo R$/m³ para cada equipamento ativo
  const indiretoEqM3 = indiretoR$M3PorPessoa;

  const custoEqM3 = dieselEqM3 + manutEqM3 + moEqM3 + indiretoEqM3;

  // Markup por categoria
  const markupEq = toNum(
    params?.markup_por_categoria?.[eq.category],
    toNum(params?.markup_por_categoria?._default, 2.37)
  );
  const precoEqM3 = custoEqM3 * markupEq;

  custo_unitario       += custoEqM3;
  preco_unitario       += precoEqM3;
  dieselR$M3_total     += dieselEqM3;
  manutR$M3_total      += manutEqM3;
  moR$M3_total         += moEqM3;
  indiretoR$M3_total   += indiretoEqM3;

  detalheEquipamentos.push({
    equipamento: eq.name,
    categoria: eq.category,
    qty,
    diesel_R$_m3:    dieselEqM3,
    manutencao_R$_m3: manutEqM3,
    mo_R$_m3:        moEqM3,
    indireto_R$_m3:  indiretoEqM3,
    custo_R$_m3:     custoEqM3,
    markup:          markupEq,
    preco_R$_m3:     precoEqM3,
  });
}

const markup_efetivo = custo_unitario > 0 ? preco_unitario / custo_unitario : 0;

const quantidade = toNum(item.quantity, volumeInSitu);
const total_item = preco_unitario * quantidade;
const lucro_unitario   = preco_unitario - custo_unitario;
const margem_percentual = preco_unitario > 0 ? (lucro_unitario / preco_unitario) * 100 : 0;
```

### 5.6 `src/services/costEngine.js` — adicionar lucro e imposto em `calcQuotationTotals`

Antes do `return`:

```js
const lucroEstimado     = subtotalPrice - subtotalCost;
const aliquotaIR        = toNum(params?.aliquota_imposto_lucro, 0.3825);
const impostoSobreLucro = lucroEstimado > 0 ? lucroEstimado * aliquotaIR : 0;
const lucroLiquido      = lucroEstimado - impostoSobreLucro;
const margemLiquida     = subtotalPrice > 0 ? (lucroLiquido / subtotalPrice) * 100 : 0;

return {
  ...,
  lucroEstimado,
  impostoSobreLucro,
  lucroLiquido,
  margemLiquida,
  aliquotaIR,
};
```

### 5.7 UI — `src/components/budget/ComposicaoPreco.js`

Atualizar as colunas FÓRMULA e EXECUÇÃO do painel **DECOMPOSIÇÃO UNITÁRIA — R$/m³**:

| Componente | Fórmula a exibir |
|---|---|
| Diesel | `Σ (consumo × R$/L × horas_máquina × qty) ÷ volume_empolado` |
| Manutenção | `Σ (manut R$/h × horas_projeto × qty) ÷ volume_empolado` |
| Mão de obra | `Σ (operador R$/h × horas_projeto × qty) ÷ volume_empolado` |
| Indireto | `(custo_pessoas_indiretas ÷ volume_in_situ) ÷ num_pessoas_indiretas × num_eq_ativos` |

Atualizar painel **FATORES DE MARKUP** para mostrar markup **por equipamento** (com a categoria), em vez de `fatorBase × ajusteFinal` global. Pode ser uma tabela:

```
Equipamento          Categoria      Custo R$/m³   Markup    Preço R$/m³
[nome]               [categoria]    [custo]       [markup]× [preço]
                                                            ────────
                                                            [soma]
```

Adicionar painel **RESULTADO DO ORÇAMENTO** (no nível do orçamento, não do item) com:

```
Receita total
Custo total do projeto
Lucro estimado
Imposto sobre lucro (alíquota %)
Lucro líquido
Margem líquida
```

### 5.8 UI — `src/pages/Equipamentos.js`

**Remover** as colunas `Indiretos/h` e `TOTAL/h` da tabela. Manter:

```
Equipamento | Categoria | Consumo | C.Diesel/h | C.Manut/h | Operador/h | Custo DIRETO/h | Produt.
```

Onde `Custo DIRETO/h = C.Diesel/h + C.Manut/h + Operador/h`.

Adicionar campos editáveis no modal de edição/criação de equipamento:
- `custo_h_manutencao` (R$/h, número)
- `categoria_operador` (select com as opções da `params.categorias_operador`)

### 5.9 UI — `src/pages/Parametros.js`

Adicionar seções editáveis para:
- Tabela de categorias de operador (R$/h por categoria, adicionar/remover linhas)
- Tabela de pessoas indiretas (R$/h por tipo, adicionar/remover linhas)
- Tabela de markup por categoria de equipamento
- Alíquota de imposto sobre lucro
- Fator de empolamento default
- Dias úteis/mês default
- Horas/dia default
- Parâmetros de alimentação (valor/dia, dias/mês, horas/mês de referência)

---

## 6. CRITÉRIO DE ACEITE FUNCIONAL

Estes testes devem ser executados **manualmente** após a refatoração, criando orçamentos sintéticos no sistema. Eles validam a lógica das fórmulas. **Use os números abaixo como inputs e confira os outputs.**

### 6.1 Invariante do diesel — frota dobrada deve consumir o mesmo total

**Cenário A:** 1 escavadeira (consumo 17 L/h, produtividade 100 m³/h), volume 100.000 m³, diesel R$ 5,50.

- Horas-máquina necessárias: `100.000 ÷ 100 = 1.000 h`
- Total diesel esperado: `17 × 5,50 × 1.000 × 1 = R$ 93.500`

**Cenário B:** 2 escavadeiras iguais, mesmo volume.

- Produção conjunta: `100 × 2 = 200 m³/h`
- Horas-máquina necessárias: `100.000 ÷ 200 = 500 h`
- Total diesel esperado: `17 × 5,50 × 500 × 2 = R$ 93.500`

✅ **Os dois cenários devem produzir o mesmo total de diesel.** Se não produzirem, há erro na fórmula de horas-máquina ou no rateio.

### 6.2 Invariante da manutenção — proporcional ao prazo

**Cenário A:** prazo 6 meses, 1 escavadeira com manutenção R$ 40/h.

- Horas projeto: `22 × 9 × 6 = 1.188 h`
- Total manutenção esperado: `40 × 1.188 × 1 = R$ 47.520`

**Cenário B:** prazo 12 meses, mesma escavadeira.

- Horas projeto: `22 × 9 × 12 = 2.376 h`
- Total manutenção esperado: `40 × 2.376 × 1 = R$ 95.040`

✅ **Dobrar o prazo dobra a manutenção total.**

### 6.3 Invariante do indireto — diluição por volume

**Cenário A:** volume 100.000 m³, 1 topógrafo (R$ 89/h, prazo 6 meses → 1.188 h projeto).

- Total indireto: `89 × 1.188 × 1 = R$ 105.732`
- Indireto/m³ por pessoa: `(105.732 ÷ 100.000) ÷ 1 = R$ 1,0573/m³`

**Cenário B:** volume 200.000 m³, mesmo topógrafo, mesmo prazo.

- Total indireto: idem, R$ 105.732
- Indireto/m³ por pessoa: `(105.732 ÷ 200.000) ÷ 1 = R$ 0,5287/m³`

✅ **Dobrar o volume divide o indireto/m³ pela metade.**

### 6.4 Invariante do indireto — rateio entre pessoas

**Cenário A:** 1 topógrafo (R$ 89/h), 1.188 h projeto, volume 100.000 m³.

- Total indireto: R$ 105.732
- num_pessoas: 1
- Indireto/m³ por pessoa: `(105.732 ÷ 100.000) ÷ 1 = R$ 1,0573/m³`

**Cenário B:** 2 topógrafos iguais, mesmo cenário.

- Total indireto: `89 × 1.188 × 2 = R$ 211.464`
- num_pessoas: 2
- Indireto/m³ por pessoa: `(211.464 ÷ 100.000) ÷ 2 = R$ 1,0573/m³`

✅ **O indireto/m³ por pessoa permanece constante** quando o número de pessoas escala junto com o custo total.

### 6.5 Invariante do markup — por categoria

**Cenário:** item com 1 escavadeira (custo R$ 1,00/m³) e 1 caminhão (custo R$ 2,00/m³).

- Markup escavadeira: 2,50 → preço escav: `1,00 × 2,50 = R$ 2,50/m³`
- Markup caminhão: 1,99 → preço cam: `2,00 × 1,99 = R$ 3,98/m³`
- Preço total do item: `R$ 6,48/m³`
- Markup efetivo: `6,48 ÷ 3,00 = 2,16×`

✅ **O markup efetivo deve ser uma média ponderada dos markups das categorias.**

### 6.6 Invariante do lucro líquido

**Cenário:** receita total R$ 1.000.000, custo total R$ 600.000, alíquota 38,25%.

- Lucro estimado: `1.000.000 − 600.000 = R$ 400.000`
- Imposto: `400.000 × 0,3825 = R$ 153.000`
- Lucro líquido: `400.000 − 153.000 = R$ 247.000`
- Margem líquida: `247.000 ÷ 1.000.000 × 100 = 24,7%`

✅ **Confere o cálculo aritmético direto.**

### 6.7 Casos de borda

| Cenário | Comportamento esperado |
|---|---|
| `indirectPersonnel = []` (sem pessoas indiretas) | `indireto_R$_m3 = 0`, sem erro de divisão. Alerta visual: "Aloque pelo menos uma pessoa indireta para que o overhead seja contabilizado." |
| `equipmentLines = []` (sem equipamentos) | Custo e preço = 0. Alerta: "Item sem equipamentos alocados." |
| `volumeInSitu = 0` | Sem divisão por zero. Custo e preço = 0. Alerta visual. |
| Equipamento sem `custo_h_manutencao` | Usa fallback `diesel_hora × percManutBase`. Aviso: "Manutenção desse equipamento usando cálculo legado. Cadastre R$/h direto para precisão." |
| Equipamento sem `categoria_operador` | Usa fallback `(salario × encargos) ÷ horasMes`. Aviso semelhante. |
| `producao_conjunto = 0` (frota com produtividade zero) | `horas_maquina = 0`, total diesel = 0, sem divisão por zero. Alerta. |

---

## 7. NOTAS DE IMPLEMENTAÇÃO

### 7.1 Migração de dados existentes

Cadastros já salvos no `localStorage`/`IndexedDB` não vão ter os novos campos (`custo_h_manutencao`, `categoria_operador`, `markup_por_categoria`, etc). Adicionar lógica de migração na carga dos params e equipamentos:

```js
function migrateParams(stored) {
  return {
    ...INITIAL_PARAMS,           // defaults novos
    ...stored,                   // valores que o usuário já tinha
    categorias_operador:    stored.categorias_operador    ?? INITIAL_PARAMS.categorias_operador,
    pessoas_indiretas:      stored.pessoas_indiretas      ?? INITIAL_PARAMS.pessoas_indiretas,
    markup_por_categoria:   stored.markup_por_categoria   ?? INITIAL_PARAMS.markup_por_categoria,
    aliquota_imposto_lucro: stored.aliquota_imposto_lucro ?? INITIAL_PARAMS.aliquota_imposto_lucro,
  };
}

function migrateEquipment(stored) {
  return {
    ...stored,
    custo_h_manutencao: stored.custo_h_manutencao ?? null,  // null → fallback no cálculo
    categoria_operador: stored.categoria_operador ?? null,  // null → fallback no cálculo
  };
}
```

### 7.2 Compatibilidade retroativa

Manter os fallbacks (cálculo via salário, % do diesel) para não quebrar orçamentos salvos antes da refatoração. Os cálculos novos só entram em ação quando os campos novos estão preenchidos.

### 7.3 Eficiência, fator de solo, fator logística

Esses fatores podem **continuar existindo na UI** como informativos (ex: "produtividade real estimada", "produtividade nominal × eficiência"). Mas **não devem entrar no cálculo de custo** (R$/m³). Eles podem ser usados apenas para:
- Estimar prazo realista (horas necessárias × eficiência)
- Mostrar produtividade real ao usuário
- Alertar quando produtividade real é baixa demais

Essa separação evita duplicar a perda de eficiência (uma vez na produtividade, outra no custo).

### 7.4 Commits sugeridos

Fazer em pelo menos 4 commits, cada um passando os testes da seção 6:

1. `chore(schema): adiciona campos custo_h_manutencao, categoria_operador, markup_por_categoria, pessoas_indiretas`
2. `refactor(costEngine): calcEquipmentHourlyCost usa valores tabelados com fallback`
3. `feat(costEngine): implementa calcIndiretoRateadoPorM3 e refatora calcItemCost`
4. `feat(ui): markup por categoria, painel lucro/imposto, limpeza da tela de equipamentos`

### 7.5 Não tocar (por enquanto)

- `src/services/spreadsheetEngine/` — esse parser de fórmulas Excel é uma camada separada, usada para auditoria. Não precisa mudar.
- `src/components/budget/SpreadsheetAuditPanel.js` — pode continuar funcionando após a refatoração (ele lê o resultado, não o cálculo).
- Persistência (`localStorage`/`IndexedDB`) — só adicionar a lógica de migração, não trocar o mecanismo.

---

## 8. RESUMO EXECUTIVO

Após a refatoração, o `costEngine.js` deve atender estas três propriedades:

1. **Cada parcela do custo tem regra própria:** diesel proporcional a horas-máquina, manutenção e MO proporcionais ao prazo, indireto rateado por volume e por número de pessoas.
2. **Cadastros são fonte da verdade:** cadastros (Parâmetros, Equipamentos) guardam dados fixos editáveis pelo usuário. A engine consulta esses cadastros e calcula tudo em tempo real para cada orçamento.
3. **Tela de Banco de Equipamentos só mostra dados fixos:** colunas calculadas (Indiretos/h, TOTAL/h) saem dali e renascem no contexto do orçamento.

Os critérios de aceite (seção 6) provam que o sistema satisfaz invariantes lógicos universais — independentes de qualquer obra específica.