import { computeWorkbook } from './engine';
import { storageManager } from '../storage/storageManager';

/**
 * Carrega overrides salvos anteriormente
 * @returns {Object}
 */
export function carregarOverridesSalvos() {
  const overrides = storageManager.carregarAlteracoes();
  return overrides || {};
}

/**
 * Calcula workbook e salva automaticamente
 * @param {Object} workbook - Workbook com dados
 * @param {Object} options - Opções de cálculo
 * @returns {Object} Resultado do cálculo
 */
export async function computeWorkbookWithPersistence(
  workbook,
  {
    overrides = {},
    autoSave = true,
    nome = 'Orçamento Salvo',
    onSaveProgress = null
  } = {}
) {
  try {
    // Executar cálculo
    if (onSaveProgress) onSaveProgress('Calculando...', 'processing');
    const resultado = computeWorkbook(workbook, { overrides });

    // Salvar resultado se autoSave ativado
    if (autoSave) {
      if (onSaveProgress) onSaveProgress('Salvando resultados...', 'saving');
      await storageManager.salvarAlteracoes(overrides, nome);
      if (onSaveProgress) onSaveProgress('✅ Salvo com sucesso!', 'success');
    }

    return resultado;
  } catch (error) {
    if (onSaveProgress) onSaveProgress(`❌ Erro: ${error.message}`, 'error');
    console.error('Erro ao calcular workbook:', error);
    throw error;
  }
}

/**
 * Exporta resultado como JSON
 * @param {Object} resultado - Resultado do cálculo
 * @param {String} nome - Nome do arquivo
 */
export function exportarResultado(resultado, nome = 'resultado') {
  const dataStr = JSON.stringify(resultado, null, 2);
  const blob = new Blob([dataStr], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${nome}_${new Date().toISOString().slice(0, 10)}.json`;
  link.click();
  URL.revokeObjectURL(url);
}

// Exportar função original também
export { computeWorkbook } from './engine';
