// ──────────────────────────────────────────────────────────────────
// Preços de referência de mercado para serviços de terraplenagem.
// Valores baseados em cotações regionais (ES) 2024-2025.
// Atualizar periodicamente conforme novas referências forem coletadas.
// ──────────────────────────────────────────────────────────────────

export const PRECOS_MERCADO = {
  "Limpeza de Camada Vegetal": {
    unit: "M²",
    minR$: 0.80,
    maxR$: 1.50,
    medioR$: 1.10,
    fonte: "Cotação regional ES 2024",
  },
  "Transporte DMT curto (até 1km)": {
    unit: "M³",
    minR$: 5.00,
    maxR$: 9.00,
    medioR$: 7.20,
    fonte: "Cotação regional ES 2024",
  },
  "Mobilização e Desmobilização": {
    unit: "VB",
    fonte: "Negociado caso a caso (não há referência fixa)",
  },
};

// Resolve referência por nome do serviço (case-insensitive, busca por inclusão).
export const getReferenciaPrecoMercado = (nomeServico) => {
  if (!nomeServico) return null;
  const norm = String(nomeServico).toLowerCase();
  for (const [chave, ref] of Object.entries(PRECOS_MERCADO)) {
    if (norm.includes(chave.toLowerCase())) return { ...ref, chave };
  }
  return null;
};
