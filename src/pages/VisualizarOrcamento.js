import React from "react";
import { X, Printer } from "lucide-react";
import Button from "../components/ui/Button";
import { fmt, fmtBRL, today } from "../utils/format";

const escapeHtml = (value) =>
  String(value ?? "").replace(/[&<>"']/g, (ch) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[ch]));

export default function VisualizarOrcamento({ q, onClose }) {
  const print = () => {
    const el  = document.getElementById("print-area");
    if (!el) return;
    const win = window.open("", "_blank");
    if (!win) return;
    // Mitiga reverse-tabnabbing: a nova aba não consegue navegar a aba de origem.
    try { win.opener = null; } catch (_) { /* ignore */ }

    const safeNumber = escapeHtml(q.number);
    // O conteúdo de #print-area é DOM gerado pelo React (texto já escapado).
    const safeBody = el.innerHTML;

    win.document.write(`<html><head><title>Orçamento ${safeNumber}</title><style>
      * { box-sizing: border-box; font-family: Arial, sans-serif; }
      body { margin: 0; padding: 20px; color: #111; }
      h1 { color: #1a1a2e; font-size: 22px; }
      h2 { color: #333; font-size: 14px; border-bottom: 2px solid #f59e0b; padding-bottom: 4px; }
      table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
      th { background: #f1f5f9; color: #333; font-size: 11px; padding: 8px; text-align: left; border: 1px solid #e2e8f0; }
      td { padding: 8px; border: 1px solid #e2e8f0; font-size: 12px; }
      .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 24px; border-bottom: 3px solid #f59e0b; padding-bottom: 16px; }
      .logo { font-size: 28px; font-weight: 900; color: #1a1a2e; }
      .logo span { color: #f59e0b; }
      .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 20px; }
      .info-box { background: #f8fafc; padding: 12px; border-radius: 6px; }
      .info-box label { font-size: 10px; color: #64748b; font-weight: 700; display: block; margin-bottom: 2px; }
      .summary-line { display: flex; justify-content: space-between; padding: 6px 0; border-bottom: 1px solid #f1f5f9; }
      .final-price { background: #1a1a2e; color: white; padding: 12px 16px; border-radius: 8px; display: flex; justify-content: space-between; align-items: center; }
      .final-price .value { font-size: 24px; font-weight: 900; color: #f59e0b; }
      .footer { margin-top: 30px; font-size: 10px; color: #94a3b8; text-align: center; border-top: 1px solid #e2e8f0; padding-top: 12px; }
      @media print { body { padding: 10px; } }
    </style></head><body>${safeBody}</body></html>`);
    win.document.close();
    win.print();
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.8)", zIndex: 2000, overflowY: "auto", padding: 24 }}>
      <div style={{ maxWidth: 860, margin: "0 auto", background: "#fff", borderRadius: 12, overflow: "hidden" }}>
        <div style={{ background: "#1a1d2e", padding: "16px 24px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ color: "#e2e8f0", fontWeight: 700 }}>Visualizar Orçamento</span>
          <div style={{ display: "flex", gap: 8 }}>
            <Button onClick={print} variant="primary"><Printer size={14} />Imprimir / PDF</Button>
            <Button onClick={onClose} variant="ghost"><X size={14} /></Button>
          </div>
        </div>

        <div id="print-area" style={{ padding: 32, color: "#111" }}>
          <div style={{ display: "flex", justifyContent: "space-between", borderBottom: "3px solid #f59e0b", paddingBottom: 16, marginBottom: 24 }}>
            <div>
              <div style={{ fontSize: 28, fontWeight: 900, color: "#1a1a2e" }}>TRANS<span style={{ color: "#f59e0b" }}>JAP</span></div>
              <div style={{ fontSize: 11, color: "#64748b", marginTop: 2 }}>Terraplanagem e Serviços de Construção</div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 18, fontWeight: 700, color: "#1a1a2e" }}>ORÇAMENTO</div>
              <div style={{ fontSize: 13, color: "#f59e0b", fontWeight: 700 }}>Nº {q.number}</div>
              <div style={{ fontSize: 11, color: "#64748b" }}>Data: {q.createdAt}</div>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 20 }}>
            {[["Cliente", q.client], ["CNPJ", q.cnpj], ["Projeto / Obra", q.project], ["Localização", q.location], ["Prazo de Execução", q.prazo], ["Status", q.status?.toUpperCase()]].map(([l, v]) => (
              <div key={l} style={{ background: "#f8fafc", padding: 12, borderRadius: 6 }}>
                <div style={{ fontSize: 10, color: "#64748b", fontWeight: 700, marginBottom: 2 }}>{l}</div>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{v || "—"}</div>
              </div>
            ))}
          </div>

          <h2 style={{ color: "#333", fontSize: 14, borderBottom: "2px solid #f59e0b", paddingBottom: 4, marginBottom: 12 }}>PLANILHA DE SERVIÇOS</h2>
          <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 20 }}>
            <thead>
              <tr style={{ background: "#f1f5f9" }}>
                {["Item", "Descrição do Serviço", "Unid.", "Quant.", "Preço Unit. (R$)", "Valor Total (R$)"].map(h => (
                  <th key={h} style={{ padding: "8px 10px", fontSize: 11, textAlign: "left", border: "1px solid #e2e8f0" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(q.items || []).map((it, i) => (
                <tr key={it.id} style={{ background: i % 2 ? "#fafafa" : "#fff" }}>
                  <td style={{ padding: "8px 10px", border: "1px solid #e2e8f0", fontSize: 12 }}>{i + 1}</td>
                  <td style={{ padding: "8px 10px", border: "1px solid #e2e8f0", fontSize: 12, fontWeight: 600 }}>{it.desc}</td>
                  <td style={{ padding: "8px 10px", border: "1px solid #e2e8f0", fontSize: 12 }}>{it.unit}</td>
                  <td style={{ padding: "8px 10px", border: "1px solid #e2e8f0", fontSize: 12 }}>{fmt(it.quantity)}</td>
                  <td style={{ padding: "8px 10px", border: "1px solid #e2e8f0", fontSize: 12, textAlign: "right" }}>{fmtBRL(it.preco_unitario)}</td>
                  <td style={{ padding: "8px 10px", border: "1px solid #e2e8f0", fontSize: 12, fontWeight: 700, textAlign: "right" }}>{fmtBRL(it.total_item)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
            <div>
              {[["Subtotal dos Serviços", q.subtotalPrice ?? q.subtotal], [`Custos Indiretos (${(q.adminPct || 0) + (q.mobilPct || 0) + (q.riskPct || 0)}%)`, q.indirect], [`BDI / Margem (${q.bdi}%)`, q.bdiVal]].map(([l, v]) => (
                <div key={l} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid #f1f5f9", fontSize: 13 }}>
                  <span style={{ color: "#64748b" }}>{l}</span>
                  <span style={{ fontWeight: 600 }}>{fmtBRL(v)}</span>
                </div>
              ))}
              <div style={{ background: "#1a1a2e", color: "#fff", padding: "12px 16px", borderRadius: 8, display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 12 }}>
                <span style={{ fontSize: 14, fontWeight: 600 }}>PREÇO FINAL TOTAL</span>
                <span style={{ fontSize: 22, fontWeight: 900, color: "#f59e0b" }}>{fmtBRL(q.precoFinal)}</span>
              </div>
            </div>
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#64748b", marginBottom: 8 }}>INFORMAÇÕES DE FATURAMENTO</div>
              <div style={{ background: "#f8fafc", padding: 12, borderRadius: 6, marginBottom: 8 }}>
                <div style={{ fontSize: 11, color: "#64748b" }}>A – Prestação de Serviços (Mão de Obra) — 15%</div>
                <div style={{ fontSize: 16, fontWeight: 700 }}>{fmtBRL(q.laborFat)}</div>
              </div>
              <div style={{ background: "#f8fafc", padding: 12, borderRadius: 6 }}>
                <div style={{ fontSize: 11, color: "#64748b" }}>B – Equipamentos — 85%</div>
                <div style={{ fontSize: 16, fontWeight: 700 }}>{fmtBRL(q.equipFat)}</div>
              </div>
              {q.notes && (
                <div style={{ marginTop: 12, background: "#fffbeb", padding: 12, borderRadius: 6, fontSize: 12 }}>
                  <b>Observações:</b> {q.notes}
                </div>
              )}
            </div>
          </div>

          <div style={{ marginTop: 24, fontSize: 11, color: "#94a3b8", borderTop: "1px solid #e2e8f0", paddingTop: 12, textAlign: "center" }}>
            TRANSJAP — Terraplanagem e Serviços de Construção · Proposta válida por 30 dias · Orçamento gerado em {today()}
          </div>
        </div>
      </div>
    </div>
  );
}
