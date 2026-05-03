import React, { useState } from "react";
import { Plus, Edit2, Trash2, Save } from "lucide-react";
import Button from "../components/ui/Button";
import Input from "../components/ui/Input";
import Select from "../components/ui/Select";
import Modal from "../components/ui/Modal";
import { Badge, Row } from "../components/ui/Card";
import { uid, fmt } from "../utils/format";
import S from "../styles/tokens";

const UNITS = ["M³", "M²", "VB", "Unid", "km", "h", "t"];
const CATS  = ["Preliminar", "Limpeza", "Escavação", "Transporte", "Aterro", "Compactação", "Acabamento", "Apoio", "Outro"];
const CAT_COLORS = {
  Preliminar: S.muted, Limpeza: "#84cc16", Escavação: "#f97316",
  Transporte: S.accent2, Aterro: "#a855f7", Compactação: "#ec4899",
  Acabamento: S.accent3, Apoio: S.accent,
};

const EMPTY_SVC = { name: "", unit: "M³", category: "Escavação", desc: "", baseProductivity: 0, efficiency: 0.85 };

export default function Servicos({ services, setServices }) {
  const [modal, setModal] = useState(null);
  const [form,  setForm]  = useState({});

  const set = (k, v) =>
    setForm(f => ({ ...f, [k]: ["name", "unit", "category", "desc"].includes(k) ? v : parseFloat(v) || 0 }));

  const openNew  = () => { setForm({ ...EMPTY_SVC }); setModal("new"); };
  const openEdit = (s)  => { setForm({ ...s }); setModal("edit"); };
  const del      = (id) => setServices(prev => prev.filter(s => s.id !== id));

  const save = () => {
    if (modal === "new") setServices(prev => [...prev, { ...form, id: uid() }]);
    else setServices(prev => prev.map(s => s.id === form.id ? form : s));
    setModal(null);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div className="page-header">
        <h1 className="page-title">Catálogo de Serviços</h1>
        <Button onClick={openNew}><Plus size={15} />Novo Serviço</Button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
        {services.map(s => (
          <div key={s.id} className="card" style={{ padding: 20 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
              <Badge color={CAT_COLORS[s.category] || S.muted}>{s.category}</Badge>
              <Badge color={S.accent}>{s.unit}</Badge>
            </div>
            <div style={{ color: S.text, fontWeight: 700, fontSize: 14, marginBottom: 6 }}>{s.name}</div>
            <div style={{ color: S.muted, fontSize: 12, marginBottom: 12, lineHeight: 1.5 }}>{s.desc}</div>
            <div style={{ display: "flex", gap: 12, fontSize: 12 }}>
              <span style={{ color: S.muted }}>Prod. Base: <b style={{ color: S.text }}>{s.baseProductivity} {s.unit}/h</b></span>
              <span style={{ color: S.muted }}>Efic.: <b style={{ color: S.accent }}>{fmt(s.efficiency * 100)}%</b></span>
            </div>
            <div style={{ display: "flex", gap: 6, marginTop: 14, justifyContent: "flex-end" }}>
              <Button onClick={() => openEdit(s)} variant="ghost" size="sm"><Edit2 size={12} /></Button>
              <Button onClick={() => del(s.id)} variant="danger" size="sm"><Trash2 size={12} /></Button>
            </div>
          </div>
        ))}
      </div>

      {modal && (
        <Modal title={modal === "new" ? "Novo Serviço" : "Editar Serviço"} onClose={() => setModal(null)} width={580}>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <Input label="Nome do Serviço" value={form.name} onChange={v => set("name", v)} />
            <Input label="Descrição"       value={form.desc} onChange={v => set("desc", v)} />
            <Row>
              <Select label="Unidade"   value={form.unit}     onChange={v => set("unit", v)}     options={UNITS.map(u => ({ value: u, label: u }))} />
              <Select label="Categoria" value={form.category} onChange={v => set("category", v)} options={CATS.map(c  => ({ value: c, label: c }))} />
            </Row>
            <Row>
              <Input label="Produtividade Base (unid/h)"  value={form.baseProductivity} onChange={v => set("baseProductivity", v)} type="number" step="0.1" />
              <Input label="Fator de Eficiência (0–1)"    value={form.efficiency}        onChange={v => set("efficiency", v)}        type="number" step="0.01" min="0" />
            </Row>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 8 }}>
              <Button onClick={() => setModal(null)} variant="ghost">Cancelar</Button>
              <Button onClick={save} variant="success"><Save size={14} />Salvar</Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
