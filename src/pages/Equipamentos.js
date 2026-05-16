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

const CATEGORIES = ["Escavadeira", "Trator", "Motoniveladora", "Grade", "Compactador", "Caminhão", "Pipa", "Rolo", "Outro"];
const CATEGORIAS_OPERADOR = ["", "operador_escavadeira", "operador_trator", "auxiliar"];
const LABEL_CATEGORIA_OPERADOR = {
  "": "— (usar legado por salário)",
  operador_escavadeira:        "Operador Escavadeira",
  operador_trator:             "Operador Trator / Patrol / Adm.",
  auxiliar:                    "Auxiliar (grade / rolo / pipa)",
};

const EMPTY_EQ = {
  name: "", category: "Escavadeira", consumption: 0,
  custo_h_manutencao: 0, categoria_operador: "", custo_h_operador: 0,
  salario_operador_mensal: 0, baseProductivity: 0, productivity: 0, viagensPorHora: 0, active: true,
};

export default function Equipamentos({ equipment, setEquipment, params }) {
  const [modal, setModal] = useState(null);
  const [form,  setForm]  = useState(EMPTY_EQ);

  const TEXT_FIELDS = new Set(["name", "category", "categoria_operador"]);
  const set = (k, v) =>
    setForm(f => ({ ...f, [k]: TEXT_FIELDS.has(k) ? v : parseFloat(v) || 0 }));

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
        <p style={{ fontSize: 12, color: S.muted, padding: "12px 16px 0", margin: 0 }}>
          Esta tela mostra apenas <b>dados fixos</b> do equipamento. Indiretos e custos totais
          dependem do orçamento (volume, prazo, equipe indireta) e são calculados em tempo real
          dentro do orçamento.
        </p>
        <table className="data-table">
          <thead>
            <tr>
              {["Equipamento","Categoria","Consumo","C.Diesel/h","C.Manut/h","Operador/h","Custo DIRETO/h","Produt.","Viagens/h",""].map(h => (
                <th key={h} style={{ textAlign: h === "" ? "center" : "left" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(equipment || []).map((eq, i) => {
              const c = calcEquipmentHourlyCost(eq, params, "1ª");
              const direto = c.custo_direto_hora ?? (c.diesel_hora + c.manutencao_hora + c.operador_hora);
              const prod = eq.baseProductivity ?? eq.productivity;
              return (
                <tr key={eq.id} style={{ background: i % 2 === 0 ? "transparent" : "#ffffff05", opacity: eq.active ? 1 : 0.4 }}>
                  <td style={{ color: S.text, fontWeight: 600 }}>{eq.name}</td>
                  <td><Badge color={S.accent2}>{eq.category}</Badge></td>
                  <td style={{ color: S.muted }}>{eq.consumption} L/h</td>
                  <td style={{ color: "#fb923c" }}>{fmtBRL(c.diesel_hora)}</td>
                  <td style={{ color: S.muted }}>{fmtBRL(c.manutencao_hora)}</td>
                  <td style={{ color: S.muted }}>{fmtBRL(c.operador_hora)}</td>
                  <td><span style={{ color: S.accent, fontWeight: 800, fontSize: 14 }}>{fmtBRL(direto)}</span></td>
                  <td style={{ color: S.muted }}>{prod} u/h</td>
                  <td style={{ color: S.muted }}>{eq.viagensPorHora || "-"}</td>
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
              <Input label="Consumo Combustível (L/h)" value={form.consumption}        onChange={v => set("consumption", v)}        type="number" step="0.1" />
              <Input label="Manutenção (R$/h)"          value={form.custo_h_manutencao} onChange={v => set("custo_h_manutencao", v)} type="number" step="0.50" />
            </Row>
            <Row>
              <Select
                label="Categoria do Operador"
                value={form.categoria_operador || ""}
                onChange={v => set("categoria_operador", v)}
                options={CATEGORIAS_OPERADOR.map(c => ({ value: c, label: LABEL_CATEGORIA_OPERADOR[c] }))}
              />
              <Input label="Operador R$/h (override)"  value={form.custo_h_operador}        onChange={v => set("custo_h_operador", v)}        type="number" step="0.000001" />
              <Input label="Salário Operador (R$/mês — legado)" value={form.salario_operador_mensal} onChange={v => set("salario_operador_mensal", v)} type="number" step="0.01" />
            </Row>
            <Input
              label="Produtividade Base (unid/h)"
              value={form.baseProductivity || form.productivity || 0}
              onChange={v => setForm(f => ({ ...f, baseProductivity: parseFloat(v) || 0, productivity: parseFloat(v) || 0 }))}
              type="number"
              step="0.1"
            />
            <Input
              label="Viagens por hora (escavadeira)"
              value={form.viagensPorHora || ""}
              onChange={v => set("viagensPorHora", v)}
              type="number"
              step="0.01"
              min="0"
              placeholder="Ex: 6"
            />
            <p style={{ fontSize: 12, color: S.muted, margin: 0 }}>
              <b>Manutenção:</b> R$/h direto da planilha; vazio (0) cai para o cálculo legado (% do diesel).{" "}
              <b>Operador:</b> R$/h direto vence; senão, usa a tabela por categoria; senão, usa salário × encargos / horas/mês.
            </p>

            {form.consumption > 0 && (() => {
              const c = calcEquipmentHourlyCost({ ...form }, params, "1ª");
              const direto = c.custo_direto_hora ?? (c.diesel_hora + c.manutencao_hora + c.operador_hora);
              return (
                <div className="card2" style={{ padding: 16 }}>
                  <SectionTitle>Custo Direto Horário (sem indireto)</SectionTitle>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8 }}>
                    {[["Diesel", c.diesel_hora, "#fb923c"], ["Manutenção", c.manutencao_hora, S.muted], ["Operador", c.operador_hora, S.muted], ["DIRETO/h", direto, S.accent]].map(([l, v, col]) => (
                      <div key={l} style={{ textAlign: "center" }}>
                        <div style={{ color: S.muted, fontSize: 10, marginBottom: 2 }}>{l}</div>
                        <div style={{ color: col, fontWeight: 700, fontSize: 13 }}>{fmtBRL(v)}</div>
                      </div>
                    ))}
                  </div>
                  <p style={{ fontSize: 11, color: S.muted, marginTop: 8, marginBottom: 0 }}>
                    Indireto não aparece aqui porque depende do orçamento (volume, prazo, equipe indireta).
                  </p>
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
