/**
 * 🔧 Engine com Persistência Integrada
 * Versão do computeWorkbook que salva automaticamente
 */

import { computeWorkbook } from './engine.js';
import { storageManager } from '../storage/storageManager.js';

/**
 * Versão do computeWorkbook com salvamento automático
 */
export async function computeWorkbookWithPersistence(
  workbook,
  {
    overrides = {},
    autoSave = true,
    nome = 'Cálculo Automático',
    onSaveProgress = null,
  } = {}
) {
  try {
    // Executar cálculo normal
    const resultado = computeWorkbook(workbook, { overrides });

    // Salvar resultado se autoSave ativado
    if (autoSave) {
      const dadosComResultado = {
        workbook,
        overrides,
        resultado,
        timestamp: new Date().toISOString(),
      };

      await storageManager.salvarOrcamento(dadosComResultado, nome);

      if (onSaveProgress) {
        onSaveProgress(`✅ Resultado salvo: ${nome}`, 'success');
      }
    }

    return resultado;
  } catch (error) {
    console.error('❌ Erro ao processar com persistência:', error);
    if (onSaveProgress) {
      onSaveProgress(`❌ Erro: ${error.message}`, 'error');
    }
    throw error;
  }
}

/**
 * Carregar overrides salvos anteriormente
 */
export function carregarOverridesSalvos() {
  try {
    const dados = storageManager.carregarAlteracoes();
    if (dados && dados.overrides) {
      console.log('✅ Overrides carregados do storage');
      return dados.overrides;
    }
    return {};
  } catch (error) {
    console.error('❌ Erro ao carregar overrides:', error);
    return {};
  }
}

/**
 * Salvar overrides manualmente
 */
export async function salvarOverridesSalvos(overrides, nome = 'Alterações') {
  try {
    await storageManager.salvarAlteracoes(overrides, nome);
    console.log('✅ Alterações salvas');
  } catch (error) {
    console.error('❌ Erro ao salvar alterações:', error);
    throw error;
  }
}

// Exportar também o engine original para casos onde persistência não é necessária
export { computeWorkbook };
