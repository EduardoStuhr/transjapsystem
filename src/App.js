import React, { useState, useCallback, useEffect } from "react";
import Layout from "./components/layout/Layout";
import Dashboard from "./pages/Dashboard";
import Parametros from "./pages/Parametros";
import Equipamentos from "./pages/Equipamentos";
import Servicos from "./pages/Servicos";
import ListaOrcamentos from "./pages/ListaOrcamentos";
import NovoOrcamento from "./pages/NovoOrcamento";
import VisualizarOrcamento from "./pages/VisualizarOrcamento";
import PersistencePanel from "./components/PersistencePanel";
import { useStore } from "./store";
import { storageManager } from "./services/storage/storageManager";
import "./styles/global.css";
import "./styles/components.css";

export default function App() {
  const { params, setParams, equipment, setEquipment, services, setServices, quotations, saveQuotation, deleteQuotation, updateQuotationStatus, runContinuousImprovementAgent } = useStore();

  const [page, setPage] = useState("dashboard");
  const [editQ, setEditQ] = useState(null);
  const [viewQ, setViewQ] = useState(null);

  // Inicializa o Agente e o Sistema de Persistência
  useEffect(() => {
    runContinuousImprovementAgent();
    storageManager.initIndexedDB(); // 💾 Inicializa armazenamento
  }, [runContinuousImprovementAgent]);

  const handleSaveQ = useCallback((q) => {
    saveQuotation(q);
    setPage("orcamentos");
    setEditQ(null);
  }, [saveQuotation]);

  const handleEdit = useCallback((q) => {
    setEditQ(q);
    setPage("editar-orcamento");
  }, []);

  return (
    <Layout page={page} setPage={setPage} quotations={quotations}>
      {/* 💾 Painel de Persistência - Gerencia salvamentos */}
      <PersistencePanel orcamentoNome="TRANSJAP" />

      {page === "dashboard"    && <Dashboard    quotations={quotations} equipment={equipment} params={params} />}
      {page === "params"       && <Parametros   params={params} setParams={setParams} />}
      {page === "equipamentos" && <Equipamentos equipment={equipment} setEquipment={setEquipment} params={params} />}
      {page === "servicos"     && <Servicos     services={services} setServices={setServices} />}
      {page === "orcamentos"   && (
        <ListaOrcamentos
          quotations={quotations}
          onDelete={deleteQuotation}
          onStatusChange={updateQuotationStatus}
          onNew={() => { setEditQ(null); setPage("novo-orcamento"); }}
          onEdit={handleEdit}
          onView={setViewQ}
        />
      )}
      {(page === "novo-orcamento" || page === "editar-orcamento") && (
        <NovoOrcamento
          services={services}
          equipment={equipment}
          params={params}
          onSave={handleSaveQ}
          editQuotation={editQ}
          onCancel={() => setPage("orcamentos")}
        />
      )}
      {viewQ && <VisualizarOrcamento q={viewQ} onClose={() => setViewQ(null)} />}
    </Layout>
  );
}
