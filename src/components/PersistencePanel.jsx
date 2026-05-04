import React, { useState, useEffect } from 'react';
import { usePersistentOrcamento } from '../services/storage/usePersistentOrcamento';
import '../styles/persistence-panel.css';

export function PersistencePanel({ orcamentoNome = 'Orçamento', onCarregar = null }) {
  const [isOpen, setIsOpen] = useState(false);
  const [orcamentos, setOrcamentos] = useState([]);
  const [info, setInfo] = useState(null);
  const [loading, setLoading] = useState(false);

  const { carregar, exportar, importar, limpar, listarOrcamentos, obterInfo, carregarPorId, deletarPorId } =
    usePersistentOrcamento({}, orcamentoNome);

  /**
   * Carrega lista de orçamentos salvos
   */
  const carregarLista = async () => {
    setLoading(true);
    try {
      const lista = await listarOrcamentos();
      const infoStorage = await obterInfo();
      setOrcamentos(lista);
      setInfo(infoStorage);
    } catch (error) {
      console.error('Erro ao carregar lista:', error);
    } finally {
      setLoading(false);
    }
  };

  /**
   * Abre o painel
   */
  const abrir = async () => {
    setIsOpen(true);
    await carregarLista();
  };

  /**
   * Fecha o painel
   */
  const fechar = () => {
    setIsOpen(false);
  };

  /**
   * Carrega um orçamento específico
   */
  const handleCarregar = async (id) => {
    const orcamento = await carregarPorId(id);
    if (orcamento && onCarregar) {
      onCarregar(orcamento);
      fechar();
    }
  };

  /**
   * Deleta um orçamento
   */
  const handleDeletar = async (id) => {
    await deletarPorId(id);
    await carregarLista();
  };

  /**
   * Formata tamanho em bytes
   */
  const formatarTamanho = (bytes) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
  };

  return (
    <>
      {/* Botão flutuante */}
      <button className="persistence-btn" onClick={abrir} title="Gerenciador de Orçamentos">
        💾
      </button>

      {/* Modal */}
      {isOpen && (
        <div className="persistence-modal-overlay" onClick={fechar}>
          <div className="persistence-modal" onClick={(e) => e.stopPropagation()}>
            {/* Header */}
            <div className="persistence-modal-header">
              <h2>💾 Gerenciar Orçamentos</h2>
              <button className="persistence-close-btn" onClick={fechar}>
                ✕
              </button>
            </div>

            {/* Body */}
            <div className="persistence-modal-body">
              {/* Botões de ação */}
              <div className="persistence-actions">
                <button className="persistence-action-btn export" onClick={exportar}>
                  📥 Exportar JSON
                </button>
                <button className="persistence-action-btn import" onClick={importar}>
                  📤 Importar JSON
                </button>
              </div>

              {/* Info de armazenamento */}
              {info && (
                <div className="persistence-storage-info">
                  <p>
                    <strong>Uso:</strong> {formatarTamanho(info.usado)} / {formatarTamanho(info.disponivel)}
                  </p>
                  <div className="persistence-progress">
                    <div
                      className="persistence-progress-bar"
                      style={{ width: `${Math.min(info.percentual, 100)}%` }}
                    />
                  </div>
                  <p className="persistence-storage-percent">{info.percentual}% utilizado</p>
                </div>
              )}

              {/* Lista de orçamentos */}
              <div className="persistence-list">
                <h3>Orçamentos Salvos ({orcamentos.length})</h3>
                {loading ? (
                  <p className="persistence-loading">Carregando...</p>
                ) : orcamentos.length === 0 ? (
                  <p className="persistence-empty">Nenhum orçamento salvo ainda</p>
                ) : (
                  <div className="persistence-items">
                    {orcamentos.map((orc) => (
                      <div key={orc.id} className="persistence-item">
                        <div className="persistence-item-info">
                          <h4>{orc.nome || 'Sem nome'}</h4>
                          <p>{new Date(orc.data).toLocaleString('pt-BR')}</p>
                        </div>
                        <div className="persistence-item-actions">
                          <button
                            className="persistence-item-btn load"
                            onClick={() => handleCarregar(orc.id)}
                            title="Carregar este orçamento"
                          >
                            ↻
                          </button>
                          <button
                            className="persistence-item-btn delete"
                            onClick={() => handleDeletar(orc.id)}
                            title="Deletar este orçamento"
                          >
                            🗑️
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Botão de limpar tudo */}
              <div className="persistence-footer">
                <button className="persistence-clear-btn" onClick={limpar}>
                  🗑️ Limpar Tudo
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default PersistencePanel;
