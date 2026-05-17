import React from "react";
import { LayoutDashboard, Truck, Settings, FileText, Layers, HardHat, Shield, Printer, DollarSign, BarChart3 } from "lucide-react";
import S from "../../styles/tokens";
import logo from "../../assets/logo.png";
import "../../styles/components.css";

const NAV = [
  { id: "dashboard",    label: "Dashboard",    icon: LayoutDashboard },
  { id: "params",       label: "Parâmetros",   icon: Settings        },
  { id: "equipamentos", label: "Equipamentos", icon: Truck           },
  { id: "servicos",     label: "Serviços",     icon: Layers          },
  { id: "orcamentos",   label: "Orçamentos",   icon: FileText        },
  { id: "composicao",   label: "Composição",   icon: DollarSign      },
  { id: "painelOrcamento", label: "Painel Orçamento", icon: BarChart3 },
  { id: "validacoes",   label: "Validações",   icon: Shield          },
  { id: "memoria",      label: "Memória",      icon: Printer         },
];

export default function Sidebar({ page, setPage, quotations }) {
  return (
    <div className="sidebar">
      <div className="sidebar__logo">
        <div className="sidebar__logo-frame">
          <img
            src={logo}
            alt="TransJap - Terraplenagem e Construções"
            className="sidebar__logo-img"
          />
        </div>
        <div className="sidebar__logo-sub">SISTEMA DE ORÇAMENTOS</div>
      </div>

      <nav className="sidebar__nav">
        {NAV.map(({ id, label, icon: Icon }) => {
          const active =
            page === id ||
            (page === "novo-orcamento"   && id === "orcamentos") ||
            (page === "editar-orcamento" && id === "orcamentos");
          return (
            <div
              key={id}
              onClick={() => setPage(id)}
              className={`sidebar__nav-item${active ? " sidebar__nav-item--active" : ""}`}
            >
              <Icon size={16} color={active ? S.accent : S.muted} />
              <span style={{ color: active ? S.accent : S.muted, fontWeight: active ? 700 : 500, fontSize: 13 }}>
                {label}
              </span>
              {id === "orcamentos" && quotations.length > 0 && (
                <span className="sidebar__nav-badge">{quotations.length}</span>
              )}
            </div>
          );
        })}
      </nav>

      <div className="sidebar__footer">
        <div className="sidebar__avatar">
          <HardHat size={14} color="#0f1117" />
        </div>
        <div>
          <div style={{ color: S.text, fontSize: 12, fontWeight: 600 }}>Administrador</div>
          <div style={{ color: S.muted, fontSize: 10 }}>TRANSJAP v1.0</div>
        </div>
      </div>
    </div>
  );
}
