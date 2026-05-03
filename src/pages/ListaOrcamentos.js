import React from "react";
import { Plus, Eye, Edit2, Trash2, FileText } from "lucide-react";
import Button from "../components/ui/Button";
import Select from "../components/ui/Select";
import { StatusBadge } from "../components/ui/Card";
import { fmtBRL } from "../utils/format";
import S from "../styles/tokens";

const STATUS_OPTS = [
  { value: "rascunho",  label: "Rascunho"  },
  { value: "enviado",   label: "Enviado"   },
  { value: "aprovado",  label: "Aprovado"  },
  { value: "reprovado", label: "Reprovado" },
];

export default function ListaOrcamentos({ quotations, onDelete, onStatusChange, onNew, onEdit, onView }) {
  const del          = (id) => { if (window.confirm("Excluir orçamento?")) onDelete(id); };
  const changeStatus = (id, status) => onStatusChange(id, status);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div className="page-header">
        <h1 className="page-title">Orçamentos</h1>
        <Button onClick={onNew}><Plus size={15} />Novo Orçamento</Button>
      </div>

      {quotations.length === 0 && (
        <div className="card" style={{ padding: 60, textAlign: "center" }}>
          <FileText size={40} color={S.muted} style={{ marginBottom: 16 }} />
          <p style={{ color: S.muted, margin: 0 }}>Nenhum orçamento criado ainda.</p>
          <Button onClick={onNew} style={{ marginTop: 16 }}><Plus size={14} />Criar primeiro orçamento</Button>
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {[...quotations]
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
          .map(q => (
            <div key={q.id} className="card" style={{ padding: "16px 20px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ flex: 1 }}>
                <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 4 }}>
                  <span style={{ color: S.muted, fontSize: 11, fontWeight: 700 }}>{q.number}</span>
                  <StatusBadge status={q.status} />
                </div>
                <div style={{ color: S.text, fontWeight: 700, fontSize: 15 }}>{q.project}</div>
                <div style={{ color: S.muted, fontSize: 12, marginTop: 2 }}>{q.client} · {q.location} · {q.createdAt}</div>
              </div>
              <div style={{ textAlign: "right", marginRight: 24 }}>
                <div style={{ color: S.accent, fontWeight: 800, fontSize: 18 }}>{fmtBRL(q.precoFinal)}</div>
                <div style={{ color: S.muted, fontSize: 11 }}>{q.items?.length || 0} itens</div>
              </div>
              <Select value={q.status} onChange={v => changeStatus(q.id, v)} options={STATUS_OPTS} style={{ width: 130 }} />
              <div style={{ display: "flex", gap: 6, marginLeft: 12 }}>
                <Button onClick={() => onView(q)} variant="ghost" size="sm"><Eye size={13} /></Button>
                <Button onClick={() => onEdit(q)} variant="ghost" size="sm"><Edit2 size={13} /></Button>
                <Button onClick={() => del(q.id)} variant="danger" size="sm"><Trash2 size={13} /></Button>
              </div>
            </div>
          ))}
      </div>
    </div>
  );
}
