/**
 * StorageManager
 * Gerencia persistência de dados usando localStorage e IndexedDB
 * Salva automaticamente todas as alterações (serviços, máquinas, orçamentos, etc)
 */

const DB_NAME = 'TRANSJAP_DB';
const DB_VERSION = 1;
const STORE_NAME = 'orcamentos';
const LOCAL_STORAGE_KEY = 'transjap_orcamento_atual';
const LOCAL_STORAGE_OVERRIDES = 'transjap_overrides';

class StorageManager {
  constructor() {
    this.db = null;
    this.isInitialized = false;
  }

  /**
   * Inicializa o IndexedDB
   */
  async initIndexedDB() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.db = request.result;
        this.isInitialized = true;
        console.log('✅ IndexedDB inicializado');
        resolve(this.db);
      };

      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
          store.createIndex('nome', 'nome', { unique: false });
          store.createIndex('data', 'data', { unique: false });
          console.log('✅ ObjectStore criado');
        }
      };
    });
  }

  /**
   * Salva alterações (overrides) com debounce automático
   * @param {Object} overrides - Valores alterados pelo usuário
   * @param {String} nome - Nome do orçamento
   */
  async salvarAlteracoes(overrides, nome = 'Padrão') {
    try {
      // Salvar em localStorage (acesso rápido)
      const dados = {
        overrides,
        nome,
        data: new Date().toISOString(),
        timestamp: Date.now()
      };
      localStorage.setItem(LOCAL_STORAGE_OVERRIDES, JSON.stringify(dados));

      // Salvar em IndexedDB (backup persistente)
      if (this.isInitialized && this.db) {
        await this._salvarNoIndexedDB(dados);
      }

      console.log(`✅ Alterações salvas: ${nome}`);
      return true;
    } catch (error) {
      console.error('❌ Erro ao salvar alterações:', error);
      return false;
    }
  }

  /**
   * Carrega as alterações salvas
   * @returns {Object|null}
   */
  carregarAlteracoes() {
    try {
      const dados = localStorage.getItem(LOCAL_STORAGE_OVERRIDES);
      if (dados) {
        const parsed = JSON.parse(dados);
        console.log('✅ Alterações carregadas do localStorage');
        return parsed.overrides;
      }
      return null;
    } catch (error) {
      console.error('❌ Erro ao carregar alterações:', error);
      return null;
    }
  }

  /**
   * Salva orçamento completo
   * @param {Object} orcamento - Orçamento completo
   * @param {String} nome - Nome do orçamento
   */
  async salvarOrcamento(orcamento, nome = 'Orçamento') {
    try {
      const dados = {
        orcamento,
        nome,
        data: new Date().toISOString(),
        timestamp: Date.now(),
        tipo: 'orcamento_completo'
      };

      // localStorage
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(dados));

      // IndexedDB
      if (this.isInitialized && this.db) {
        await this._salvarNoIndexedDB(dados);
      }

      console.log(`✅ Orçamento salvo: ${nome}`);
      return true;
    } catch (error) {
      console.error('❌ Erro ao salvar orçamento:', error);
      return false;
    }
  }

  /**
   * Carrega orçamento completo
   * @returns {Object|null}
   */
  carregarOrcamento() {
    try {
      const dados = localStorage.getItem(LOCAL_STORAGE_KEY);
      if (dados) {
        const parsed = JSON.parse(dados);
        console.log('✅ Orçamento carregado do localStorage');
        return parsed.orcamento;
      }
      return null;
    } catch (error) {
      console.error('❌ Erro ao carregar orçamento:', error);
      return null;
    }
  }

  /**
   * Salva dados no IndexedDB (interno)
   */
  private async _salvarNoIndexedDB(dados) {
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error('IndexedDB não inicializado'));
        return;
      }

      const transaction = this.db.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.add(dados);

      request.onsuccess = () => {
        console.log('✅ Dados salvos em IndexedDB');
        resolve(request.result);
      };
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Lista todos os orçamentos salvos
   * @returns {Array}
   */
  async listarOrcamentos() {
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error('IndexedDB não inicializado'));
        return;
      }

      const transaction = this.db.transaction([STORE_NAME], 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const index = store.index('data');
      const request = index.getAll();

      request.onsuccess = () => {
        const resultados = request.result.reverse(); // Mais recente primeiro
        console.log(`✅ ${resultados.length} orçamentos encontrados`);
        resolve(resultados);
      };
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Carrega orçamento por ID
   * @param {Number} id
   * @returns {Object|null}
   */
  async carregarOrcamentoPorId(id) {
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error('IndexedDB não inicializado'));
        return;
      }

      const transaction = this.db.transaction([STORE_NAME], 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.get(id);

      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Deleta orçamento
   * @param {Number} id
   */
  async deletarOrcamento(id) {
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error('IndexedDB não inicializado'));
        return;
      }

      const transaction = this.db.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.delete(id);

      request.onsuccess = () => {
        console.log(`✅ Orçamento ${id} deletado`);
        resolve(true);
      };
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Exporta orçamento como JSON
   * @param {String} nome - Nome do arquivo
   */
  exportarJSON(nome = 'orcamento') {
    const overrides = this.carregarAlteracoes();
    if (!overrides) {
      alert('❌ Nenhum orçamento para exportar');
      return;
    }

    const dataStr = JSON.stringify(overrides, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${nome}_${Date.now()}.json`;
    link.click();
    URL.revokeObjectURL(url);
    console.log(`✅ Arquivo exportado: ${link.download}`);
  }

  /**
   * Importa orçamento de arquivo JSON
   * @param {File} file
   */
  async importarJSON(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = async (e) => {
        try {
          const dados = JSON.parse(e.target.result);
          await this.salvarAlteracoes(dados, `Importado_${new Date().toLocaleString()}`);
          console.log('✅ Arquivo importado com sucesso');
          resolve(dados);
        } catch (error) {
          console.error('❌ Erro ao importar arquivo:', error);
          reject(error);
        }
      };
      reader.onerror = () => reject(reader.error);
      reader.readAsText(file);
    });
  }

  /**
   * Obtém informações de armazenamento
   * @returns {Object}
   */
  async obterInfoArmazenamento() {
    try {
      if (navigator.storage && navigator.storage.estimate) {
        const estimate = await navigator.storage.estimate();
        return {
          usado: estimate.usage || 0,
          disponivel: estimate.quota || 0,
          percentual: Math.round((estimate.usage / estimate.quota) * 100)
        };
      }
      return { usado: 0, disponivel: 0, percentual: 0 };
    } catch (error) {
      console.error('❌ Erro ao obter info de armazenamento:', error);
      return null;
    }
  }

  /**
   * Limpa todos os dados
   */
  async limparTudo() {
    try {
      localStorage.removeItem(LOCAL_STORAGE_KEY);
      localStorage.removeItem(LOCAL_STORAGE_OVERRIDES);

      if (this.db) {
        const transaction = this.db.transaction([STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        await new Promise((resolve, reject) => {
          const request = store.clear();
          request.onsuccess = () => resolve();
          request.onerror = () => reject(request.error);
        });
      }

      console.log('✅ Todos os dados foram limpos');
      return true;
    } catch (error) {
      console.error('❌ Erro ao limpar dados:', error);
      return false;
    }
  }
}

// Exportar instância única
export const storageManager = new StorageManager();
export default StorageManager;
