/**
 * Safe formula expression engine for custom bill calculations.
 * No eval()/Function() — hand-written tokenizer, parser, and evaluator.
 *
 * Supported syntax:
 *   numbers, + - * / ( ), comparisons < > <= >= == !=, string literals 'x'/"x"
 *   variables (e.g. consumption, rate_per_unit — see FormulaContext.variables)
 *   AVG(field) / SUM(field) / MIN(field) / MAX(field)  — aggregate `field` across other flats
 *   IF(condition, thenExpr, elseExpr)
 *   ALLOCATE(amount, 'flatNumber')  — redirects `amount` to another flat instead of the caller's own flat
 */

export class FormulaError extends Error {}

// ─── Tokenizer ─────────────────────────────────────────────────────────────────

type TokenType = 'NUMBER' | 'STRING' | 'IDENT' | 'OP' | 'LPAREN' | 'RPAREN' | 'COMMA' | 'EOF';

interface Token {
  type:  TokenType;
  value: string;
}

const OPS = ['<=', '>=', '==', '!=', '+', '-', '*', '/', '<', '>'];

function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < input.length) {
    const c = input[i];
    if (/\s/.test(c)) { i++; continue; }

    if (c === '(') { tokens.push({ type: 'LPAREN', value: c }); i++; continue; }
    if (c === ')') { tokens.push({ type: 'RPAREN', value: c }); i++; continue; }
    if (c === ',') { tokens.push({ type: 'COMMA', value: c }); i++; continue; }

    if (c === "'" || c === '"') {
      const quote = c;
      let j = i + 1;
      let str = '';
      while (j < input.length && input[j] !== quote) { str += input[j]; j++; }
      if (j >= input.length) throw new FormulaError('Unterminated string literal');
      tokens.push({ type: 'STRING', value: str });
      i = j + 1;
      continue;
    }

    if (/[0-9.]/.test(c)) {
      let j = i;
      while (j < input.length && /[0-9.]/.test(input[j])) j++;
      tokens.push({ type: 'NUMBER', value: input.slice(i, j) });
      i = j;
      continue;
    }

    if (/[a-zA-Z_]/.test(c)) {
      let j = i;
      while (j < input.length && /[a-zA-Z0-9_]/.test(input[j])) j++;
      tokens.push({ type: 'IDENT', value: input.slice(i, j) });
      i = j;
      continue;
    }

    const two = input.slice(i, i + 2);
    if (OPS.includes(two)) { tokens.push({ type: 'OP', value: two }); i += 2; continue; }
    if (OPS.includes(c))   { tokens.push({ type: 'OP', value: c });   i += 1; continue; }

    throw new FormulaError(`Unexpected character '${c}' at position ${i}`);
  }
  tokens.push({ type: 'EOF', value: '' });
  return tokens;
}

// ─── AST ───────────────────────────────────────────────────────────────────────

type Node =
  | { kind: 'number'; value: number }
  | { kind: 'string'; value: string }
  | { kind: 'ident'; name: string }
  | { kind: 'binop'; op: string; left: Node; right: Node }
  | { kind: 'unary'; op: string; operand: Node }
  | { kind: 'call'; name: string; args: Node[] };

class Parser {
  private pos = 0;
  constructor(private tokens: Token[]) {}

  private peek(): Token { return this.tokens[this.pos]; }
  private next(): Token { return this.tokens[this.pos++]; }

  private expect(type: TokenType): Token {
    const t = this.next();
    if (t.type !== type) throw new FormulaError(`Expected ${type} but got '${t.value || t.type}'`);
    return t;
  }

  parse(): Node {
    const node = this.parseComparison();
    this.expect('EOF');
    return node;
  }

  private parseComparison(): Node {
    let left = this.parseAdditive();
    while (this.peek().type === 'OP' && ['<', '>', '<=', '>=', '==', '!='].includes(this.peek().value)) {
      const op = this.next().value;
      const right = this.parseAdditive();
      left = { kind: 'binop', op, left, right };
    }
    return left;
  }

  private parseAdditive(): Node {
    let left = this.parseMultiplicative();
    while (this.peek().type === 'OP' && ['+', '-'].includes(this.peek().value)) {
      const op = this.next().value;
      const right = this.parseMultiplicative();
      left = { kind: 'binop', op, left, right };
    }
    return left;
  }

  private parseMultiplicative(): Node {
    let left = this.parseUnary();
    while (this.peek().type === 'OP' && ['*', '/'].includes(this.peek().value)) {
      const op = this.next().value;
      const right = this.parseUnary();
      left = { kind: 'binop', op, left, right };
    }
    return left;
  }

  private parseUnary(): Node {
    if (this.peek().type === 'OP' && this.peek().value === '-') {
      this.next();
      return { kind: 'unary', op: '-', operand: this.parseUnary() };
    }
    return this.parsePrimary();
  }

  private parsePrimary(): Node {
    const t = this.peek();

    if (t.type === 'NUMBER') { this.next(); return { kind: 'number', value: parseFloat(t.value) }; }
    if (t.type === 'STRING') { this.next(); return { kind: 'string', value: t.value }; }

    if (t.type === 'LPAREN') {
      this.next();
      const node = this.parseComparison();
      this.expect('RPAREN');
      return node;
    }

    if (t.type === 'IDENT') {
      this.next();
      if (this.peek().type === 'LPAREN') {
        this.next();
        const args: Node[] = [];
        if (this.peek().type !== 'RPAREN') {
          args.push(this.parseComparison());
          while (this.peek().type === 'COMMA') { this.next(); args.push(this.parseComparison()); }
        }
        this.expect('RPAREN');
        return { kind: 'call', name: t.value, args };
      }
      return { kind: 'ident', name: t.value };
    }

    throw new FormulaError(`Unexpected token '${t.value || t.type}'`);
  }
}

export function parseFormula(text: string): Node {
  const tokens = tokenize(text);
  return new Parser(tokens).parse();
}

// ─── Evaluation context ────────────────────────────────────────────────────────

export interface FormulaAllocation {
  target: string;  // flat_id (resolved)
  amount: number;
}

export interface FormulaContext {
  /** Scalar variables available by name, e.g. consumption, rate_per_unit, base_bill, previous_balance. */
  variables: Record<string, number>;
  /** Per-field values for all other flats in scope, used by AVG/SUM/MIN/MAX. */
  otherFlats: Record<string, number[]>;
  /** Resolves a flat-number string literal to its internal flat id, for ALLOCATE(). */
  resolveTarget: (flatNumber: string) => string;
}

export interface FormulaEvalResult {
  value:        number;
  allocations:  FormulaAllocation[];
}

const AGGREGATE_FNS = ['AVG', 'SUM', 'MIN', 'MAX'];

export function evaluateFormula(node: Node, ctx: FormulaContext): FormulaEvalResult {
  const allocations: FormulaAllocation[] = [];

  function evalNode(n: Node): number {
    switch (n.kind) {
      case 'number': return n.value;
      case 'string': throw new FormulaError('String literal used where a number was expected');
      case 'ident': {
        if (!(n.name in ctx.variables)) throw new FormulaError(`Unknown variable '${n.name}'`);
        return ctx.variables[n.name];
      }
      case 'unary': return n.op === '-' ? -evalNode(n.operand) : evalNode(n.operand);
      case 'binop': {
        const l = evalNode(n.left);
        const r = evalNode(n.right);
        switch (n.op) {
          case '+': return l + r;
          case '-': return l - r;
          case '*': return l * r;
          case '/': if (r === 0) throw new FormulaError('Division by zero'); return l / r;
          case '<':  return l < r  ? 1 : 0;
          case '>':  return l > r  ? 1 : 0;
          case '<=': return l <= r ? 1 : 0;
          case '>=': return l >= r ? 1 : 0;
          case '==': return l === r ? 1 : 0;
          case '!=': return l !== r ? 1 : 0;
          default: throw new FormulaError(`Unknown operator '${n.op}'`);
        }
      }
      case 'call': {
        const fnName = n.name.toUpperCase();

        if (AGGREGATE_FNS.includes(fnName)) {
          if (n.args.length !== 1 || n.args[0].kind !== 'ident') {
            throw new FormulaError(`${fnName}() takes exactly one field name, e.g. ${fnName}(consumption)`);
          }
          const field = (n.args[0] as { kind: 'ident'; name: string }).name;
          const values = ctx.otherFlats[field];
          if (!values) throw new FormulaError(`Unknown field '${field}' for ${fnName}()`);
          if (values.length === 0) return 0;
          if (fnName === 'AVG') return values.reduce((s, v) => s + v, 0) / values.length;
          if (fnName === 'SUM') return values.reduce((s, v) => s + v, 0);
          if (fnName === 'MIN') return Math.min(...values);
          return Math.max(...values);
        }

        if (fnName === 'IF') {
          if (n.args.length !== 3) throw new FormulaError('IF() takes exactly 3 arguments: IF(condition, thenValue, elseValue)');
          return evalNode(n.args[0]) !== 0 ? evalNode(n.args[1]) : evalNode(n.args[2]);
        }

        if (fnName === 'ALLOCATE') {
          if (n.args.length !== 2) throw new FormulaError("ALLOCATE() takes exactly 2 arguments: ALLOCATE(amount, 'flatNumber')");
          const amount = evalNode(n.args[0]);
          const targetArg = n.args[1];
          if (targetArg.kind !== 'string') throw new FormulaError("ALLOCATE()'s second argument must be a flat number string, e.g. 'A101'");
          const target = ctx.resolveTarget(targetArg.value);
          allocations.push({ target, amount });
          return 0;
        }

        throw new FormulaError(`Unknown function '${n.name}'`);
      }
      default:
        throw new FormulaError('Invalid expression');
    }
  }

  const value = evalNode(node);
  return { value, allocations };
}

/** Parses and evaluates in one call — convenient for dry-run validation. */
export function runFormula(text: string, ctx: FormulaContext): FormulaEvalResult {
  const ast = parseFormula(text);
  return evaluateFormula(ast, ctx);
}
