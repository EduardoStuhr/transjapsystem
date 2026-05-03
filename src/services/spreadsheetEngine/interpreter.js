const FUNCTIONS = {
  SUM: (args, ctx) => {
    let total = 0;
    for (const arg of args) {
      if (Array.isArray(arg)) {
        for (const v of arg) {
          const n = Number(v);
          if (Number.isFinite(n)) total += n;
        }
      } else {
        const n = Number(arg);
        if (Number.isFinite(n)) total += n;
      }
    }
    return total;
  },
  NETWORKDAYS_INTL: (args, ctx) => {
    const [start, end, weekend = 1, holidays = null] = args;
    const sd = new Date(start);
    const ed = new Date(end);
    if (Number.isNaN(sd.getTime()) || Number.isNaN(ed.getTime())) return NaN;
    const dir = sd <= ed ? 1 : -1;
    const startDate = sd <= ed ? sd : ed;
    const endDate = sd <= ed ? ed : sd;

    const isWeekend = (d) => {
      const day = d.getDay();
      return weekend === 1 ? (day === 0 || day === 6) : (day === 0 || day === 6);
    };

    const holidaySet = new Set();
    if (Array.isArray(holidays)) {
      for (const h of holidays) {
        const hd = new Date(h);
        if (!Number.isNaN(hd.getTime())) holidaySet.add(hd.toDateString());
      }
    }

    let count = 0;
    for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
      if (!isWeekend(d) && !holidaySet.has(d.toDateString())) {
        count += 1;
      }
    }
    return dir === 1 ? count : -count;
  }
};

export function evaluateAST(ast, ctx) {
  if (!ast) return null;

  switch (ast.type) {
    case 'Literal':
      return ast.value;
      
    case 'StringLiteral':
      return ast.value;

    case 'CellReference':
      const sheet = ast.sheet || ctx.currentSheet;
      return ctx.get(sheet, ast.cell);

    case 'CellRange':
      const s1 = ast.sheetStart || ctx.currentSheet;
      return ctx.getRange(s1, ast.cellStart, ast.cellEnd);

    case 'UnaryExpression': {
      const arg = evaluateAST(ast.argument, ctx);
      if (arg && arg.error) return arg;
      if (ast.operator === '+') return Number(arg);
      if (ast.operator === '-') return -Number(arg);
      return arg;
    }

    case 'BinaryExpression': {
      const left = evaluateAST(ast.left, ctx);
      if (left && left.error) return left;
      const right = evaluateAST(ast.right, ctx);
      if (right && right.error) return right;

      switch (ast.operator) {
        case '+': return Number(left) + Number(right);
        case '-': return Number(left) - Number(right);
        case '*': return Number(left) * Number(right);
        case '/':
          const r = Number(right);
          if (r === 0 || Number.isNaN(r)) {
            return { error: true, type: "DIV_ZERO", message: "Divisão por zero" };
          }
          return Number(left) / r;
        case '=': return left === right;
        case '<>': return left !== right;
        case '<': return Number(left) < Number(right);
        case '>': return Number(left) > Number(right);
        case '<=': return Number(left) <= Number(right);
        case '>=': return Number(left) >= Number(right);
        case 'AND': return left && right;
        case 'OR': return left || right;
        default: throw new Error(`Unknown operator: ${ast.operator}`);
      }
    }

    case 'CallExpression': {
      const callee = ast.callee.toUpperCase();
      
      // Lazy evaluation for IF
      if (callee === 'IF') {
        const cond = evaluateAST(ast.arguments[0], ctx);
        if (cond && cond.error) return cond;
        
        if (cond) {
          return evaluateAST(ast.arguments[1], ctx);
        } else {
          return ast.arguments.length > 2 ? evaluateAST(ast.arguments[2], ctx) : false;
        }
      }

      if (!FUNCTIONS[callee]) {
        return { error: true, type: "UNKNOWN_FUNCTION", message: `Função desconhecida: ${callee}` };
      }

      const args = [];
      for (const argAst of ast.arguments) {
        const val = evaluateAST(argAst, ctx);
        if (val && val.error) return val;
        args.push(val);
      }

      return FUNCTIONS[callee](args, ctx);
    }

    default:
      throw new Error(`Unknown AST node type: ${ast.type}`);
  }
}
