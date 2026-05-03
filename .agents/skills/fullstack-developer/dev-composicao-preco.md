# skill: dev-composicao-preco-orcamento

## 🎯 OBJETIVO

Implementar no sistema de orçamento uma funcionalidade que permita visualizar, por item, toda a composição de preço (igual à planilha), exibindo todos os cálculos intermediários.

A funcionalidade deve ser clara, auditável e integrada à interface.

---

## 🧩 CONTEXTO DO SISTEMA

* Sistema em React (frontend)
* Existe um motor de cálculo (costEngine)
* Os itens do orçamento já possuem:

  * quantidade
  * custo unitário
  * preço final

Agora precisamos:
👉 expor o "como chegou no valor"

---

## 🎯 FUNCIONALIDADE PRINCIPAL

Para cada item do orçamento:

Adicionar um botão:

[🔍 Ver composição de preço]

Ao clicar:

👉 expandir uma área abaixo do item (accordion)
OU
👉 abrir painel lateral (drawer)

NÃO usar alert simples.

---

## 🧱 ARQUITETURA

### 1. CAMADA DE CÁLCULO (OBRIGATÓRIO)

O costEngine deve retornar um objeto detalhado:

function calcularItem(dados) {
return {
custo: {
diesel,
manutencao,
maoDeObra,
indiretos,
custoHora
},

```
produtividade: {
  base,
  eficiencia,
  fatorSolo,
  final
},

conversao: {
  custoHora,
  produtividade,
  custoUnitario
},

fatores: {
  fatorBase: 2.3,
  valorAposFator1,
  ajusteFinal: 1.2,
  valorAposFator2
},

resultado: {
  precoUnitario,
  quantidade,
  total
}
```

}
}

---

### 2. CAMADA DE UI

Cada item da tabela deve ter:

<button>🔍 Ver composição</button>

Estado:

const [expandedItem, setExpandedItem] = useState(null)

---

### 3. COMPONENTE DE DETALHAMENTO

Criar componente:

<ComposicaoPreco detalhes={item.detalhes} />

---

## 🎨 LAYOUT (OBRIGATÓRIO)

Dividir em blocos visuais:

---

### 📊 BLOCO 1 — CUSTO BASE

* Diesel
* Manutenção
* Mão de obra
* Indiretos
* Total (destacado)

---

### ⚙️ BLOCO 2 — PRODUTIVIDADE

* Base
* Eficiência
* Fator solo
* Final (destacado)

---

### 🔄 BLOCO 3 — CONVERSÃO

Mostrar fórmula:

"Custo hora ÷ produtividade = custo unitário"

---

### 💰 BLOCO 4 — FATORES

Mostrar passo a passo:

* custo_unitario × 2.3
* resultado × 1.2

Mostrar valores intermediários

---

### 📦 BLOCO 5 — RESULTADO FINAL

* Preço unitário
* Quantidade
* Total

---

## 🎯 UX (IMPORTANTE)

* Layout parecido com planilha
* Valores finais em negrito
* Separadores visuais
* Fundo levemente diferente
* Texto explicativo nas fórmulas

Exemplo:

R$ 3,80 ÷ 13,5 = R$ 0,28

---

## ⚙️ REGRAS DE IMPLEMENTAÇÃO

* Não duplicar cálculos na UI (usar dados do engine)
* Não recalcular no frontend
* Sempre consumir objeto detalhado
* Garantir consistência com a planilha
* Evitar NaN / undefined

---

## 🚨 VALIDAÇÃO

Adicionar validação:

* Se produtividade = 0 → alertar
* Se valores divergirem da planilha → marcar item

---

## 🔥 DIFERENCIAL (OPCIONAL MAS RECOMENDADO)

Adicionar toggle:

[Modo simples] [Modo detalhado]

---

## 🧠 COMPORTAMENTO DA IA

Ao implementar:

* seguir arquitetura limpa
* separar lógica e UI
* manter código reutilizável
* evitar gambiarra
* manter padrão profissional

---

## 🚀 RESULTADO FINAL

O sistema deve:

* mostrar exatamente como o preço foi calculado
* permitir auditoria por item
* replicar a aba de composição de preço
* aumentar confiança no orçamento
