import React, { useState } from "react";
import { Plus, Edit2, Trash2, Save } from "lucide-react";
import Button from "../components/ui/Button";
import Input from "../components/ui/Input";
import Select from "../components/ui/Select";
import Modal from "../components/ui/Modal";
import { Badge, Row, SectionTitle } from "../components/ui/Card";
import { calcEquipmentHourlyCost } from "../services/costEngine";
import { uid, fmtBRL } from "../utils/format";
import S from "../styles/tokens";

const CATEGORIES = ["Escavadeira", "Trator", "Motoniveladora", "Grade", "Compactador", "Caminhão", "Outro"];

const EMPTY_EQ = {
  name: "", category: "Escavadeira", consumption: 0,
  maintenanceCost: 0, operatorCost: 0, productivity: 0, active: true,
};

export default function Equipamentos({ equipment, setEquipment, params }) {
  const [modal, setModal] = useState(null);
  const [form,  setForm]  = useState(EMPTY_EQ);

  const set = (k, v) =>
    setForm(f => ({ ...f, [k]: k === "name" || k === "category" ? v : parseFloat(v) || 0 }));

  const openNew  = () => { setForm({ ...EMPTY_EQ }); setModal("new"); };
  const openEdit = (eq) => { setForm({ ...eq }); setModal("edit"); };

  const save = () => {
    if (modal === "new") setEquipment(prev => [...prev, { ...form, id: uid() }]);
    else setEquipment(prev => prev.map(e => e.id === form.id ? form : e));
    setModal(null);
  };

  const del    = (id) => setEquipment(prev => prev.filter(e => e.id !== id));
  const toggle = (id) => setEquipment(prev => prev.map(e => e.id === id ? { ...e, active: !e.active } : e));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div className="page-header">
        <h1 className="page-title">Banco de Equipamentos</h1>
        <Button onClick={openNew}><Plus size={15} />Novo Equipamento</Button>
      </div>

      <div className="card" style={{ overflow: "hidden" }}>
        <table className="data-table">
          <thead>
            <tr>
              {["Equipamento","Categoria","Consumo","C.Diesel/h","C.Manut/h","Operador/h","Indiretos/h","TOTAL/h","Produt.",""].map(h => (
                <th key={h} style={{ textAlign: h === "" ? "center" : "left" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(equipment || []).map((eq, i) => {
              const c = calcEquipmentHourlyCost(eq, params, "1ª");
              return (
                <tr key={eq.id} style={{ background: i % 2 === 0 ? "transparent" : "#ffffff05", opacity: eq.active ? 1 : 0.4 }}>
                  <td style={{ color: S.text, fontWeight: 600 }}>{eq.name}</td>
                  <td><Badge color={S.accent2}>{eq.category}</Badge></td>
                  <td style={{ color: S.muted }}>{eq.consumption} L/h</td>
                  <td style={{ color: "#fb923c" }}>{fmtBRL(c.diesel_hora)}</td>
                  <td style={{ color: S.muted }}>{fmtBRL(c.manutencao_hora)}</td>
                  <td style={{ color: S.muted }}>{fmtBRL(c.operador_hora)}</td>
                  <td style={{ color: S.muted }}>{fmtBRL(c.indiretos_hora)}</td>
                  <td><span style={{ color: S.accent, fontWeight: 800, fontSize: 14 }}>{fmtBRL(c.custo_total_hora)}</span></td>
                  <td style={{ color: S.muted }}>{eq.productivity} u/h</td>
                  <td>
                    <div style={{ display: "flex", gap: 6, justifyContent: "center" }}>
                      <Button onClick={() => toggle(eq.id)} variant="ghost" size="sm">{eq.active ? "🟢" : "⚫"}</Button>
                      <Button onClick={() => openEdit(eq)} variant="ghost" size="sm"><Edit2 size={13} /></Button>
                      <Button onClick={() => del(eq.id)} variant="danger" size="sm"><Trash2 size={13} /></Button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {modal && (
        <Modal title={modal === "new" ? "Novo Equipamento" : "Editar Equipamento"} onClose={() => setModal(null)} width={620}>
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <Row>
              <Input  label="Nome do Equipamento" value={form.name}     onChange={v => set("name", v)} />
              <Select label="Categoria"           value={form.category} onChange={v => set("category", v)} options={CATEGORIES.map(c => ({ value: c, label: c }))} />
            </Row>
            <SectionTitle>Parâmetros de Custo (R$/h)</SectionTitle>
            <Row>
              <Input label="Consumo Combustível (L/h)" value={form.consumption}    onChange={v => set("consumption", v)}    type="number" step="0.1" />
              <Input label="Salário Operador (R$/mês)"     value={form.salario_operador_mensal}   onChange={v => set("salario_operador_mensal", v)}   type="number" step="0.01" />
            </Row>
            <Input label="Produtividade Base (unid/h)" value={form.productivity} onChange={v => set("productivity", v)} type="number" step="0.1" />

            {form.consumption > 0 && (() => {
              const c = calcEquipmentHourlyCost({ ...form }, params, "1ª");
              return (
                <div className="card2" style={{ padding: 16 }}>
                  <SectionTitle>Custo Horário Calculado</SectionTitle>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 8 }}>
                    {[["Diesel", c.diesel_hora, "#fb923c"], ["Manutenção", c.manutencao_hora, S.muted], ["Operador", c.operador_hora, S.muted], ["Indiretos", c.indiretos_hora, S.muted], ["TOTAL", c.custo_total_hora, S.accent]].map(([l, v, col]) => (
                      <div key={l} style={{ textAlign: "center" }}>
                        <div style={{ color: S.muted, fontSize: 10, marginBottom: 2 }}>{l}</div>
                        <div style={{ color: col, fontWeight: 700, fontSize: 13 }}>{fmtBRL(v)}</div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}

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
