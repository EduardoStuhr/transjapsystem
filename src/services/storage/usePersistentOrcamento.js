import { useEffect, useRef, useCallback } from 'react';
import { storageManager } from './storageManager';

/**
 * Hook para persistência automática de orçamento
 * Salva todas as alterações automaticamente com debounce
 *
 * @param {Object} dados - Dados atuais (overrides, orçamento, etc)
 * @param {String} nome - Nome do orçamento para salvar
 * @param {Number} debounceMs - Tempo de debounce em ms (padrão: 1000)
 * @returns {Object} Métodos de persistência
 */
export function usePersistentOrcamento(dados, nome = 'Padrão', debounceMs = 1000) {
  const debounceTimerRef = useRef(null);
  const ultimosDadosRef = useRef(dados);
  const fileInputRef = useRef(null);

  /**
   * Salva dados com debounce
   */
  useEffect(() => {
    // Limpar timer anterior
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    // Verificar se dados mudaram
    if (JSON.stringify(ultimosDadosRef.current) === JSON.stringify(dados)) {
      return;
    }

    // Agendar novo salvamento
    debounceTimerRef.current = setTimeout(() => {
      storageManager.salvarAlteracoes(dados, nome);
      ultimosDadosRef.current = dados;
    }, debounceMs);

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [dados, nome, debounceMs]);

  /**
   * Carrega dados salvos
   */
  const carregar = useCallback(() => {
    const dados = storageManager.carregarAlteracoes();
    if (dados) {
      console.log('📥 Dados carregados:', dados);
      return dados;
    }
    return null;
  }, []);

  /**
   * Exporta como JSON
   */
  const exportar = useCallback(() => {
    storageManager.exportarJSON(nome);
  }, [nome]);

  /**
   * Importa de arquivo JSON
   */
  const importar = useCallback(async () => {
    if (!fileInputRef.current) {
      fileInputRef.current = document.createElement('input');
      fileInputRef.current.type = 'file';
      fileInputRef.current.accept = '.json';
      fileInputRef.current.addEventListener('change', async (e) => {
        const file = e.target.files?.[0];
        if (file) {
          try {
            const dados = await storageManager.importarJSON(file);
            console.log('✅ Arquivo importado');
            window.location.reload(); // Recarregar para aplicar novos dados
          } catch (error) {
            console.error('❌ Erro ao importar:', error);
            alert('Erro ao importar arquivo');
          }
        }
      });
    }
    fileInputRef.current.click();
  }, []);

  /**
   * Limpa dados
   */
  const limpar = useCallback(async () => {
    if (window.confirm('⚠️ Tem certeza? Isso vai deletar TODOS os dados salvos!')) {
      await storageManager.limparTudo();
      window.location.reload();
    }
  }, []);

  /**
   * Obtém lista de orçamentos salvos
   */
  const listarOrcamentos = useCallback(async () => {
    const lista = await storageManager.listarOrcamentos();
    return lista;
  }, []);

  /**
   * Obtém info de armazenamento
   */
  const obterInfo = useCallback(async () => {
    const info = await storageManager.obterInfoArmazenamento();
    return info;
  }, []);

  /**
   * Carrega orçamento por ID
   */
  const carregarPorId = useCallback(async (id) => {
    const orcamento = await storageManager.carregarOrcamentoPorId(id);
    return orcamento;
  }, []);

  /**
   * Deleta orçamento por ID
   */
  const deletarPorId = useCallback(async (id) => {
    if (window.confirm('Tem certeza que quer deletar este orçamento?')) {
      await storageManager.deletarOrcamento(id);
      console.log(`✅ Orçamento ${id} deletado`);
    }
  }, []);

  return {
    carregar,
    exportar,
    importar,
    limpar,
    listarOrcamentos,
    obterInfo,
    carregarPorId,
    deletarPorId
  };
}

export default usePersistentOrcamento;
