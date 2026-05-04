# 💾 Sistema de Persistência - TRANSJAP

## 📋 Visão Geral

Implementação completa de persistência de dados para o GitHub Pages, salvando **automaticamente todas as alterações** (serviços, máquinas, orçamentos, etc) no navegador do usuário.

## 🎯 Características

✅ **Salvamento Automático** - Todas as mudanças salvam automaticamente  
✅ **Sem Servidor** - Funciona totalmente no navegador (localStorage + IndexedDB)  
✅ **Persistência Dupla** - localStorage + IndexedDB para máxima confiabilidade  
✅ **Histórico Completo** - Mantém todos os orçamentos salvos  
✅ **Exportar/Importar** - Baixa e carrega arquivos JSON  
✅ **Interface Amigável** - Componente React com painel de controle  

---

## 📁 Estrutura de Arquivos

```
src/services/storage/
├── storageManager.js           # Gerenciador principal de armazenamento
├── usePersistentOrcamento.js  # Hooks React para persistência

src/services/spreadsheetEngine/
├── engineWithPersistence.js    # Engine integrado com persistência

src/components/
└── PersistencePanel.jsx        # UI para gerenciar dados
```

---

## 🚀 Como Usar

### 1️⃣ **Inicializar o StorageManager**

```javascript
import { storageManager } from './services/storage/storageManager';

// Ao iniciar a aplicação
await storageManager.initIndexedDB();
```

### 2️⃣ **Usar o Hook usePersistentOrcamento**

```javascript
import { usePersistentOrcamento } from './services/storage/usePersistentOrcamento';

export function MeuComponente() {
  const [overrides, setOverrides] = useState({});
  
  // Hook que salva automaticamente
  const { carregar, exportar, importar, limpar } = usePersistentOrcamento(
    overrides,
    'Meu Orçamento',
    1000 // debounce de 1s
  );

  // Ao abrir a página, carregar dados salvos
  useEffect(() => {
    const dados = carregar();
    if (dados) {
      setOverrides(dados);
    }
  }, []);

  return (
    <>
      <input 
        value={overrides.servico || ''}
        onChange={(e) => setOverrides({...overrides, servico: e.target.value})}
      />
      <button onClick={exportar}>Exportar</button>
    </>
  );
}
```

### 3️⃣ **Usar o Componente PersistencePanel**

```javascript
import { PersistencePanel } from './components/PersistencePanel';

export function App() {
  return (
    <div>
      <PersistencePanel 
        orcamentoNome="Meu Orçamento"
        onCarregar={(dados) => console.log(dados)}
      />
    </div>
  );
}
```

### 4️⃣ **Integrar com o Engine**

```javascript
import { computeWorkbook, carregarOverridesSalvos } from './services/spreadsheetEngine/engineWithPersistence';

// Carregar dados anteriores
const overridesSalvos = carregarOverridesSalvos();

// Executar com salvamento automático
const resultado = await computeWorkbook(workbook, {
  overrides: overridesSalvos,
  autoSave: true,
  nome: 'Meu Orçamento',
  onSaveProgress: (msg, status) => console.log(msg)
});
```

---

## 📊 API do StorageManager

### Métodos Principais

```javascript
// Inicializar
await storageManager.initIndexedDB();

// Salvar orçamento completo
await storageManager.salvarOrcamento(orcamento, 'Nome do Orçamento');

// Salvar apenas alterações (mais leve)
await storageManager.salvarAlteracoes(overrides, 'Nome');

// Carregar dados
const dados = storageManager.carregarOrcamento();
const overrides = storageManager.carregarAlteracoes();

// Histórico
const lista = await storageManager.listarOrcamentos();
const orc = await storageManager.carregarOrcamentoPorId(id);
await storageManager.deletarOrcamento(id);

// Importar/Exportar
storageManager.exportarJSON('meu-orcamento');
await storageManager.importarJSON(file);

// Informações
const info = await storageManager.obterInfoArmazenamento();
// { usado: bytes, disponivel: bytes, percentual: % }

// Limpar tudo
storageManager.limparTudo();
```

---

## 🔄 Fluxo de Salvamento Automático

```
1. Usuário altera um campo (ex: valor de serviço)
   ↓
2. onChange dispara atualização do estado
   ↓
3. Hook usePersistentOrcamento ativa debounce (1s padrão)
   ↓
4. storageManager.salvarAlteracoes() é chamado
   ↓
5. Dados salvos em localStorage (acesso rápido)
   ↓
6. Dados salvos em IndexedDB (backup persistente)
   ↓
7. Console mostra: "Alterações salvas com sucesso"
   ↓
8. Na próxima abertura da página → dados restaurados automaticamente
```

---

## 💾 Armazenamento Local

### localStorage
- **Tamanho:** 5-10MB por domínio
- **Acesso:** Rápido e síncrono
- **Uso:** Cache primário

### IndexedDB
- **Tamanho:** Até GB (depende do navegador)
- **Acesso:** Assíncrono
- **Uso:** Armazenamento persistente e histórico

---

## 🎨 Exemplo Completo

```javascript
import React, { useState, useEffect } from 'react';
import { usePersistentOrcamento } from './services/storage/usePersistentOrcamento';
import { PersistencePanel } from './components/PersistencePanel';
import { computeWorkbook } from './services/spreadsheetEngine/engineWithPersistence';

export function Orcamento() {
  const [overrides, setOverrides] = useState({});
  const [resultado, setResultado] = useState(null);

  // Persistência automática
  const persistence = usePersistentOrcamento(overrides, 'Orçamento Atual');

  // Carregar dados salvos ao iniciar
  useEffect(() => {
    const dados = persistence.carregar();
    if (dados) {
      setOverrides(dados);
    }
  }, []);

  // Recalcular quando overrides mudam
  useEffect(() => {
    const res = computeWorkbook(workbook, { 
      overrides,
      autoSave: true 
    });
    setResultado(res);
  }, [overrides]);

  return (
    <div>
      <h1>Orçamento de Terraplenagem</h1>

      {/* Painel de persistência */}
      <PersistencePanel 
        orcamentoNome="Meu Orçamento"
        onCarregar={(dados) => setOverrides(dados.overrides)}
      />

      {/* Campos de entrada */}
      <input
        placeholder="Valor do Serviço"
        value={overrides.servico || ''}
        onChange={(e) => setOverrides({...overrides, servico: e.target.value})}
      />

      <input
        placeholder="Valor da Máquina"
        value={overrides.maquina || ''}
        onChange={(e) => setOverrides({...overrides, maquina: e.target.value})}
      />

      {/* Resultado */}
      {resultado && <pre>{JSON.stringify(resultado.trace, null, 2)}</pre>}

      {/* Botões */}
      <button onClick={persistence.exportar}>📥 Exportar</button>
      <button onClick={persistence.limpar}>🗑️ Limpar</button>
    </div>
  );
}
```

---

## ⚙️ Configuração

### Debounce (Tempo de espera para salvar)

```javascript
// Padrão: 1000ms (1 segundo)
const persistence = usePersistentOrcamento(overrides, 'Nome', 1000);

// Mais rápido: 500ms
const persistence = usePersistentOrcamento(overrides, 'Nome', 500);

// Mais lento: 2000ms (menos atualizações ao DB)
const persistence = usePersistentOrcamento(overrides, 'Nome', 2000);
```

### AutoSave no Engine

```javascript
// Com salvamento automático
const resultado = computeWorkbook(workbook, { autoSave: true });

// Sem salvamento automático
const resultado = computeWorkbook(workbook, { autoSave: false });
```

---

## 🐛 Troubleshooting

### "localStorage cheio"
→ Limpe dados antigos com `storageManager.limparTudo()`

### "IndexedDB não inicializado"
→ Chame `await storageManager.initIndexedDB()` no componente raiz

### Dados não salvam
→ Verifique o console para erros  
→ Certifique-se de estar esperando as Promises (`await`)

### Quer resetar tudo?
```javascript
// Limpar localStorage
localStorage.clear();

// Limpar IndexedDB
indexedDB.databases().forEach(db => indexedDB.deleteDatabase(db.name));
```

---

## 📈 Limite de Armazenamento

| Navegador | localStorage | IndexedDB |
|-----------|--------------|-----------|
| Chrome | 10MB | ~1GB |
| Firefox | 10MB | ~1GB |
| Safari | 5MB | 50MB |
| Edge | 10MB | ~1GB |

---

## 🎓 Boas Práticas

✅ Sempre espere `initIndexedDB()` antes de usar  
✅ Use debounce para não sobrecarregar o storage  
✅ Exporte dados regularmente como backup  
✅ Monitore o uso de armazenamento com `obterInfoArmazenamento()`  
✅ Implemente UI para carregar/deletar orçamentos antigos  

---

## 📝 Licença

MIT - Use livremente em seu projeto!

---

**Desenvolvido para TRANSJAP - Sistema de Orçamentos** 🚀
