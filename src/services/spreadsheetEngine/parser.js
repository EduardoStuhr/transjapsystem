export function lexer(formula) {
  const tokens = [];
  let i = 0;
  const f = formula.replace(/^=/, '').trim();

  while (i < f.length) {
    let char = f[i];

    // Whitespace
    if (/\s/.test(char)) {
      i++;
      continue;
    }

    // Two-character operators
    if (i + 1 < f.length) {
      const twoChar = f.slice(i, i + 2);
      if (['<=', '>=', '<>'].includes(twoChar)) {
        tokens.push({ type: 'operator', value: twoChar });
        i += 2;
        continue;
      }
    }

    // Single-character operators and punctuation
    if (['+', '-', '*', '/', '=', '<', '>', '(', ')', ',', ':'].includes(char)) {
      tokens.push({ type: char === '(' || char === ')' || char === ',' || char === ':' ? 'punctuation' : 'operator', value: char });
      i++;
      continue;
    }

    // Strings
    if (char === '"' || char === "'") {
      const quote = char;
      let str = '';
      i++;
      while (i < f.length && f[i] !== quote) {
        str += f[i];
        i++;
      }
      i++; // consume closing quote
      // If it's a single quoted string and the next token is an exclamation mark, it's a sheet reference!
      if (quote === "'" && f[i] === '!') {
        tokens.push({ type: 'sheet', value: str });
        i++; // consume '!'
      } else {
        tokens.push({ type: 'string', value: str });
      }
      continue;
    }

    // Numbers
    if (/[0-9.]/.test(char)) {
      let numStr = '';
      while (i < f.length && /[0-9.]/.test(f[i])) {
        numStr += f[i];
        i++;
      }
      tokens.push({ type: 'number', value: parseFloat(numStr) });
      continue;
    }

    // Identifiers (Functions, Cell Refs, Sheet Refs without quotes)
    if (/[A-Za-z_]/.test(char)) {
      let idStr = '';
      while (i < f.length && /[A-Za-z0-9_.]/.test(f[i])) {
        idStr += f[i];
        i++;
      }
      
      // Lookahead for '!'
      if (f[i] === '!') {
        tokens.push({ type: 'sheet', value: idStr });
        i++; // consume '!'
        continue;
      }

      tokens.push({ type: 'identifier', value: idStr });
      continue;
    }

    throw new Error(`Unexpected character: ${char} at index ${i}`);
  }

  return tokens;
}

export function parse(tokens) {
  let current = 0;

  function peek() {
    return tokens[current];
  }

  function consume(type, value) {
    const token = tokens[current];
    if (token && token.type === type && (!value || token.value === value)) {
      current++;
      return token;
    }
    return null;
  }

  function parsePrimary() {
    let token = peek();
    if (!token) return null;

    if (token.type === 'number') {
      current++;
      return { type: 'Literal', value: token.value };
    }

    if (token.type === 'string') {
      current++;
      return { type: 'StringLiteral', value: token.value };
    }

    if (token.type === 'punctuation' && token.value === '(') {
      current++;
      const node = parseExpression();
      consume('punctuation', ')');
      return node;
    }

    // Sheet refs
    let sheetName = null;
    if (token.type === 'sheet') {
      sheetName = token.value;
      current++;
      token = peek();
    }

    if (token.type === 'identifier') {
      current++;
      
      // Function call
      if (peek() && peek().type === 'punctuation' && peek().value === '(') {
        current++; // consume '('
        const args = [];
        while (peek() && peek().value !== ')') {
          args.push(parseExpression());
          if (peek() && peek().value === ',') {
            current++; // consume ','
          }
        }
        consume('punctuation', ')');
        return { type: 'CallExpression', callee: token.value, arguments: args };
      }

      // Cell Ref or Range
      let cellRef = { type: 'CellReference', sheet: sheetName, cell: token.value };
      
      if (peek() && peek().type === 'punctuation' && peek().value === ':') {
        current++; // consume ':'
        let nextSheet = null;
        if (peek() && peek().type === 'sheet') {
          nextSheet = peek().value;
          current++;
        }
        const endCell = peek();
        if (endCell && endCell.type === 'identifier') {
          current++;
          return {
            type: 'CellRange',
            sheetStart: sheetName,
            cellStart: cellRef.cell,
            sheetEnd: nextSheet || sheetName,
            cellEnd: endCell.value
          };
        }
      }

      return cellRef;
    }

    throw new Error(`Unexpected token: ${JSON.stringify(token)}`);
  }

  function parseUnary() {
    const token = peek();
    if (token && token.type === 'operator' && (token.value === '+' || token.value === '-')) {
      current++;
      return {
        type: 'UnaryExpression',
        operator: token.value,
        argument: parseUnary()
      };
    }
    return parsePrimary();
  }

  function parseMultiplicative() {
    let node = parseUnary();
    while (peek() && peek().type === 'operator' && (peek().value === '*' || peek().value === '/')) {
      const token = peek();
      current++;
      node = {
        type: 'BinaryExpression',
        operator: token.value,
        left: node,
        right: parseUnary()
      };
    }
    return node;
  }

  function parseAdditive() {
    let node = parseMultiplicative();
    while (peek() && peek().type === 'operator' && (peek().value === '+' || peek().value === '-')) {
      const token = peek();
      current++;
      node = {
        type: 'BinaryExpression',
        operator: token.value,
        left: node,
        right: parseMultiplicative()
      };
    }
    return node;
  }

  function parseComparison() {
    let node = parseAdditive();
    while (peek() && peek().type === 'operator' && ['=', '<>', '<', '>', '<=', '>='].includes(peek().value)) {
      const token = peek();
      current++;
      node = {
        type: 'BinaryExpression',
        operator: token.value,
        left: node,
        right: parseAdditive()
      };
    }
    return node;
  }

  function parseExpression() {
    return parseComparison();
  }

  return parseExpression();
}

export function formatJS(ast, ctxName = 'ctx') {
  if (!ast) return '';
  switch (ast.type) {
    case 'Literal': return String(ast.value);
    case 'StringLiteral': return `"${ast.value}"`;
    case 'CellReference': 
      const sheet = ast.sheet ? `"${ast.sheet}"` : 'currentSheet';
      return `get(${sheet}, "${ast.cell}")`;
    case 'CellRange':
      const s1 = ast.sheetStart ? `"${ast.sheetStart}"` : 'currentSheet';
      return `getRange(${s1}, "${ast.cellStart}", "${ast.cellEnd}")`;
    case 'UnaryExpression':
      return `${ast.operator}${formatJS(ast.argument, ctxName)}`;
    case 'BinaryExpression':
      let op = ast.operator;
      if (op === '=') op = '===';
      if (op === '<>') op = '!==';
      if (op === 'AND') op = '&&';
      if (op === 'OR') op = '||';
      return `(${formatJS(ast.left, ctxName)} ${op} ${formatJS(ast.right, ctxName)})`;
    case 'CallExpression':
      return `${ast.callee}(${ast.arguments.map(a => formatJS(a, ctxName)).join(', ')})`;
    default: return '';
  }
}

export function extractDepsFromAST(ast, currentSheet) {
  const deps = new Set();
  
  function walk(node) {
    if (!node) return;
    switch (node.type) {
      case 'CellReference': {
        const s = node.sheet || currentSheet;
        deps.add(`${s}!${node.cell}`);
        break;
      }
      case 'CellRange': {
        const s1 = node.sheetStart || currentSheet;
        // Basic extraction just the start/end cells or we can't extract all without grid bounds
        // Usually range dependencies are handled by the interpreter via getRange.
        // For topological sort, if a cell depends on A1:A3, it depends on A1, A2, A3.
        // To build the graph, we must expand it here. 
        // We'll expand it using a helper in parser.js or engine.js.
        const refs = expandRangeTokens(node.cellStart, node.cellEnd);
        refs.forEach(id => deps.add(`${s1}!${id}`));
        break;
      }
      case 'UnaryExpression':
        walk(node.argument);
        break;
      case 'BinaryExpression':
        walk(node.left);
        walk(node.right);
        break;
      case 'CallExpression':
        node.arguments.forEach(walk);
        break;
    }
  }
  
  walk(ast);
  return Array.from(deps);
}

function expandRangeTokens(a, b) {
  const m1 = a.match(/^([A-Z]+)([0-9]+)$/);
  const m2 = b.match(/^([A-Z]+)([0-9]+)$/);
  if (!m1 || !m2) return [];
  const col1 = m1[1], row1 = parseInt(m1[2], 10);
  const col2 = m2[1], row2 = parseInt(m2[2], 10);
  if (col1 !== col2 && row1 !== row2) return []; 
  const refs = [];
  if (col1 === col2) {
    const [s, e] = row1 <= row2 ? [row1, row2] : [row2, row1];
    for (let r = s; r <= e; r++) refs.push(`${col1}${r}`);
  } else {
    // Column range (e.g. A1:C1) - simple ASCII char code loop
    const c1 = col1.charCodeAt(0), c2 = col2.charCodeAt(0);
    const [s, e] = c1 <= c2 ? [c1, c2] : [c2, c1];
    for (let c = s; c <= e; c++) refs.push(`${String.fromCharCode(c)}${row1}`);
  }
  return refs;
}
