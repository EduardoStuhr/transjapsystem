---
name: engenharia-orcamento-terraplanagem
description: Implementa e valida cálculos de orçamento baseados na aba “Composição de Preço” (fonte da verdade), retornando valores intermediários e marcando divergências. Use quando o usuário pedir “replicar planilha”, “composição de preço”, “auditoria”, “diferença máxima 1%”, ou regras de produtividade/fatores.
disable-model-invocation: true
---

# engenharia-orcamento-terraplanagem

## Instructions

## 🎯 OBJETIVO

Implementar e validar cálculos de orçamento com base na aba "Composição de Preço" da planilha.

A planilha é a fonte da verdade.

O sistema deve:

* reproduzir fielmente os cálculos
* exibir todos os valores intermediários
* permitir auditoria completa

---

## 🧩 ESTRUTURA DO CÁLCULO

### 1) CUSTO BASE (por hora)

custo_hora = diesel + manutencao + mao_de_obra + indiretos

---

### 2) PRODUTIVIDADE

produtividade_final = produtividade_base × eficiencia × fator_solo

Regras:

* nunca permitir 0
* usar fallback padrão (ex: 13.5)
* mostrar todas as variáveis

---

### 3) CONVERSÃO

custo_unitario = custo_hora / produtividade_final

---

### 4) FATORES DA PLANILHA

valor_fator_1 = custo_unitario × 2.3
valor_fator_2 = valor_fator_1 × 1.2

resultado_final_unitario = valor_fator_2

---

### 5) TOTAL

total = resultado_final_unitario × quantidade

---

## ⚙️ PARÂMETROS PADRÃO

const parametros = {
produtividadePadrao: 13.5,
fatorBase: 2.3,
ajusteFinal: 1.2,
indiretosPadrao: 0.11,
rateio: 0.57
}

---

## 📊 DETALHAMENTO OBRIGATÓRIO (AUDITORIA)

O sistema deve retornar:

{
custo: {
diesel,
manutencao,
maoDeObra,
indiretos,
custoHora
},

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
}

---

## 🧠 REGRAS IMPORTANTES

* NÃO simplificar fórmulas
* NÃO esconder etapas intermediárias
* NÃO aplicar fatores duplicados
* NÃO permitir divisão por zero
* SEMPRE usar parseFloat
* SEMPRE mostrar valores mesmo que sejam 0

---

## 🚨 VALIDAÇÃO COM PLANILHA

Para cada item:

* comparar custo_unitario com a planilha
* comparar preço final
* permitir diferença máxima de 1%

Se diferença maior:

* marcar como divergente
* exibir alerta

---

## 🎯 INTERFACE (OBRIGATÓRIO)

Cada item deve ter:

[🔍 Ver composição de preço]

Ao clicar, mostrar:

### Custo base

Diesel
Manutenção
Mão de obra
Indiretos
Total

### Produtividade

Base
Eficiência
Fator solo
Final

### Conversão

Custo hora ÷ produtividade

### Fatores

× 2.3
× 1.2

### Resultado

Preço unitário
Quantidade
Total

---

## 💡 OBJETIVO FINAL

Transformar o sistema em:

* ferramenta auditável
* fiel à planilha
* confiável para orçamento real
* equivalente a softwares profissionais

---

## 🧠 COMPORTAMENTO DA IA

Ao trabalhar com esse projeto:

* sempre priorizar a lógica da planilha
* nunca inventar fórmulas
* sempre explicar cálculos
* sempre manter transparência

---

## 🚀 RESULTADO ESPERADO

Sistema que:

* replica 100% a composição de preço
* mostra todos os cálculos
* elimina dúvidas no orçamento
* pode ser usado profissionalmente

