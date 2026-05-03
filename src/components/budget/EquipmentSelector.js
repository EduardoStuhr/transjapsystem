import React from "react";
import { Plus, X } from "lucide-react";
import Button from "../ui/Button";
import Select from "../ui/Select";
import Input from "../ui/Input";
import { SectionTitle } from "../ui/Card";
import { calcEquipmentHourlyCost } from "../../services/costEngine";
import { fmtBRL } from "../../utils/format";
import S from "../../styles/tokens";

export default function EquipmentSelector({
  equipmentLines,
  equipmentOptions,
  equipmentMap,
  params,
  onAdd,
  onChange,
  onDelete,
}) {
  return (
    <div>
      <SectionTitle>Equipamentos Alocados</SectionTitle>
      {equipmentLines.map((line, ei) => {
        const eq = equipmentMap[line.equipmentId];
        const c  = eq ? calcEquipmentHourlyCost(eq, params, "1ª") : null;
        return (
          <div
            key={line.id}
            className="card2"
            style={{ padding: 12, marginBottom: 8, display: "flex", gap: 10, alignItems: "center" }}
          >
            <Select
              value={line.equipmentId}
              onChange={v => onChange(ei, "equipmentId", v)}
              options={equipmentOptions}
              style={{ flex: 3 }}
            />
            <Input
              value={line.quantity}
              onChange={v => onChange(ei, "quantity", v)}
              type="number"
              step="0.5"
              min="0.5"
              style={{ flex: 1 }}
              placeholder="Qtd"
            />
            {c && (
              <span style={{ color: S.accent, fontWeight: 700, fontSize: 12, whiteSpace: "nowrap" }}>
                {fmtBRL(c.custo_total_hora * line.quantity)}/h
              </span>
            )}
            <Button onClick={() => onDelete(ei)} variant="danger" size="sm">
              <X size={12} />
            </Button>
          </div>
        );
      })}
      <Button onClick={onAdd} variant="ghost" size="sm">
        <Plus size={13} />Adicionar Equipamento
      </Button>
    </div>
  );
}
