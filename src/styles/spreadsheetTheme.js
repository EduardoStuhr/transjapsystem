// ══════════════════════════════════════════════════════════════════
// SPREADSHEET THEME — paleta Excel-like para telas tipo planilha.
// Convive com o tema dark (tokens.js) — não substitui.
// Use apenas em componentes da pasta src/components/spreadsheet/
// e nas páginas: DadosContrato, EquipamentosCustos, Composicao,
// PrecoFinal, Memoria, Validacoes.
// ══════════════════════════════════════════════════════════════════

export const SS = {
  // Fundos
  bg:           "#FFFFFF",
  bgAlt:        "#FAFAFA",      // zebrado linhas pares
  bgHeader:     "#F2F2F2",      // cabeçalhos cinza Excel
  bgKeyInput:   "#FFFFCC",      // assumptions-chave (markup, %imposto, fator empolamento)
  bgSelected:   "#D4E4F7",      // célula selecionada
  bgError:      "#FFE4E4",      // célula com erro

  // Texto / fórmulas (codificação Excel financeiro)
  inputText:    "#0000FF",      // azul: input editável
  formulaText:  "#000000",      // preto: fórmula/calculado
  refText:      "#008000",      // verde: referência a outra aba/tabela
  errorText:    "#C00000",      // vermelho: erro/validação falha
  mutedText:    "#595959",      // cinza médio para labels secundários
  headerText:   "#1F4E78",      // azul Excel para títulos de cabeçalho

  // Grid
  gridLine:     "#D4D4D4",
  gridLineBold: "#7F7F7F",
  border:       "#BFBFBF",

  // Acentos
  accentBlue:   "#1F4E78",
  accentGreen:  "#548235",
  accentAmber:  "#BF8F00",
  accentRed:    "#C00000",

  // Estados de validação
  okBg:         "#E2EFDA",
  okText:       "#375623",
  warnBg:       "#FFF2CC",
  warnText:     "#7F6000",
  errBg:        "#FBE5E5",
  errText:      "#9C0006",
  infoBg:       "#DDEBF7",
  infoText:     "#1F4E78",

  // Tipografia
  fontMono:     "'JetBrains Mono', 'Roboto Mono', 'Consolas', 'Courier New', monospace",
  fontUI:       "'Segoe UI', system-ui, -apple-system, sans-serif",
  fontSizeCell: 12,
  fontSizeHdr:  11,
  fontSizeTitle: 14,

  // Densidade
  rowHeight:        28,
  rowHeightCompact: 24,
  cellPaddingX:     8,
  cellPaddingY:     4,
};

// Resolve a cor de texto da célula a partir do "kind".
// kind: "input" | "formula" | "ref" | "key" | "error" | "header" | "muted"
export const cellColor = (kind) => {
  switch (kind) {
    case "input":   return SS.inputText;
    case "formula": return SS.formulaText;
    case "ref":     return SS.refText;
    case "error":   return SS.errorText;
    case "header":  return SS.headerText;
    case "muted":   return SS.mutedText;
    case "key":     return SS.formulaText;
    default:        return SS.formulaText;
  }
};

// Resolve o fundo da célula. "key" recebe amarelo, "error" recebe rosa claro,
// linha alternada recebe bgAlt, demais ficam transparentes.
export const cellBg = (kind, { rowIndex = 0, selected = false } = {}) => {
  if (selected) return SS.bgSelected;
  if (kind === "key")   return SS.bgKeyInput;
  if (kind === "error") return SS.bgError;
  if (kind === "header") return SS.bgHeader;
  return rowIndex % 2 === 1 ? SS.bgAlt : SS.bg;
};

export default SS;
