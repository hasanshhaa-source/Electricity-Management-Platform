/**
 * Pure, dependency-aware "sheet engine" — a spreadsheet-like cell engine.
 *
 * This is a DELIBERATE OPPOSITE design choice from `formulaEngine.ts`: that engine only
 * lets a formula read OTHER cells' PRE-FORMULA DEFAULT values, specifically so it never
 * needs a dependency graph or cycle detection. This module instead lets formulas
 * reference other cells' fully COMPUTED (possibly formula-derived) values, via a full
 * dependency graph + topological evaluation + explicit cycle detection.
 *
 * No eval()/Function() — hand-written tokenizer, parser, and evaluator (same style as
 * formulaEngine.ts). No DB access, no Next.js/React imports — pure and unit-testable.
 *
 * ─── Cell naming scheme ──────────────────────────────────────────────────────────────
 * Cell names are colon-delimited strings with a domain prefix:
 *   flat:<flatNumber>:<field>     e.g. flat:23:consumption, flat:23:bill, flat:23:vacant,
 *                                      flat:23:meter_error
 *   bill:<billNumber>:<field>     e.g. bill:1:cost, bill:1:consumption
 *   pool:<field>                  e.g. pool:total_cost, pool:total_consumption
 *   owner:<field>                 e.g. owner:bill
 *
 * ─── Reference syntax ────────────────────────────────────────────────────────────────
 * Formulas reference other cells by writing the cell name AS A BARE TOKEN, e.g.:
 *   flat:23:bill + flat:24:bill
 * This requires extending the tokenizer's IDENT rule to accept `:` characters after the
 * first segment (a cell name still starts with [a-zA-Z_], same as a normal identifier).
 *
 * Why bare colon-identifiers over `REF('cell:name')` calls:
 *   - Cell names are first-class, well-known, and finite in this domain (flat numbers,
 *     bill numbers, and a small fixed set of pool/owner fields) — they read like normal
 *     variables, so a bare-token syntax keeps formulas short and readable
 *     (`flat:23:bill / 2` vs `REF('flat:23:bill') / 2`).
 *   - It avoids a parenthesized-string-literal indirection for what is conceptually just
 *     "another variable" — consistent with how formulaEngine.ts treats `consumption`,
 *     `rate_per_unit` etc. as bare IDENTs.
 *   - The colon character is not used anywhere else in the grammar, so there is no
 *     ambiguity to resolve (no clash with NUMBER, STRING, OP, or DOT-postfix member access).
 *   - The cost is that cell names can't be assembled dynamically from string fragments
 *     within a formula (e.g. no `FLAT(23+1)`-style indirection) — that's an intentional
 *     restriction: this domain's dependency graph must be statically extractable by
 *     scanning the formula text/AST, which a bare-token reference trivially supports
 *     (REF('x' + y) would NOT be statically analyzable without further restriction).
 */

export class SheetEngineError extends Error {}

// ─── Tokenizer ─────────────────────────────────────────────────────────────────

type TokenType = 'NUMBER' | 'STRING' | 'IDENT' | 'OP' | 'LPAREN' | 'RPAREN' | 'COMMA' | 'EOF';

interface Token {
  type: TokenType;
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
      if (j >= input.length) throw new SheetEngineError('Unterminated string literal');
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

    // IDENT — and crucially, cell-name tokens: an identifier followed by `:segment`
    // repeated any number of times, e.g. `flat:23:consumption`. The first character
    // must be a normal identifier-start character so this never collides with OPs.
    if (/[a-zA-Z_]/.test(c)) {
      let j = i;
      while (j < input.length && /[a-zA-Z0-9_]/.test(input[j])) j++;
      // Greedily consume `:segment` suffixes (segment = [a-zA-Z0-9_]+).
      while (input[j] === ':' && /[a-zA-Z0-9_]/.test(input[j + 1] ?? '')) {
        j++;
        while (j < input.length && /[a-zA-Z0-9_]/.test(input[j])) j++;
      }
      tokens.push({ type: 'IDENT', value: input.slice(i, j) });
      i = j;
      continue;
    }

    const two = input.slice(i, i + 2);
    if (OPS.includes(two)) { tokens.push({ type: 'OP', value: two }); i += 2; continue; }
    if (OPS.includes(c))   { tokens.push({ type: 'OP', value: c });   i += 1; continue; }

    throw new SheetEngineError(`Unexpected character '${c}' at position ${i}`);
  }
  tokens.push({ type: 'EOF', value: '' });
  return tokens;
}

// ─── AST ───────────────────────────────────────────────────────────────────────

export type Node =
  | { kind: 'number'; value: number }
  | { kind: 'string'; value: string }
  | { kind: 'ident'; name: string } // bare identifier OR a cell reference (contains ':')
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
    if (t.type !== type) throw new SheetEngineError(`Expected ${type} but got '${t.value || t.type}'`);
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

    throw new SheetEngineError(`Unexpected token '${t.value || t.type}'`);
  }
}

export function parseFormula(text: string): Node {
  const tokens = tokenize(text);
  return new Parser(tokens).parse();
}

// ─── Cell model ────────────────────────────────────────────────────────────────

/** A cell name, e.g. 'flat:23:consumption', 'bill:1:cost', 'pool:total_cost', 'owner:bill'. */
export type CellName = string;

export interface LiteralCell {
  kind: 'literal';
  value: number;
}

export interface FormulaCell {
  kind: 'formula';
  formulaText: string;
}

export type Cell = LiteralCell | FormulaCell;

export type Sheet = Record<CellName, Cell>;

/** Convenience constructors. */
export function lit(value: number): LiteralCell { return { kind: 'literal', value }; }
export function formula(text: string): FormulaCell { return { kind: 'formula', formulaText: text }; }

// ─── Cell-name helpers ─────────────────────────────────────────────────────────

function isCellRef(name: string): boolean {
  return name.includes(':');
}

function parseFlatCellName(name: string): { flatNumber: string; field: string } | null {
  const m = /^flat:([^:]+):(.+)$/.exec(name);
  return m ? { flatNumber: m[1], field: m[2] } : null;
}

// ─── Aggregate functions ───────────────────────────────────────────────────────
//
// Supported aggregate functions (all take a literal-string field name as their first
// argument, and resolve fully through the dependency graph — i.e. they read each
// matched flat's CELL VALUE for that field, which may itself be formula-derived):
//
//   AVG_OTHER_FLATS('field', excludeFlatNumber)
//     Average of `flat:<n>:<field>` across all known flat numbers n, EXCLUDING
//     excludeFlatNumber. excludeFlatNumber may be a number or numeric string.
//
//   SUM_OTHER_FLATS('field', excludeFlatNumber)
//     Same flat-set as AVG_OTHER_FLATS, but summed.
//
//   AVG_NONVACANT_FLATS('field', excludeFlatNumber)
//     Average of `flat:<n>:<field>` across all flats EXCLUDING excludeFlatNumber AND
//     excluding any flat whose `flat:<n>:vacant` cell value is truthy (non-zero).
//
//   SUM_NONVACANT_FLATS('field', excludeFlatNumber)
//     Same flat-set as AVG_NONVACANT_FLATS, but summed.
//
//   COUNT_NONVACANT_FLATS(excludeFlatNumber)
//     Count of flats in the AVG_NONVACANT_FLATS flat-set (no field argument — useful
//     for callers building a custom divisor, though AVG_NONVACANT_FLATS already does
//     this internally).
//
// All four field-based aggregates return 0 if their matched flat-set is empty (mirrors
// formulaEngine.ts's AVG/SUM-over-empty-set behavior).

const AGGREGATE_FNS = [
  'AVG_OTHER_FLATS', 'SUM_OTHER_FLATS',
  'AVG_NONVACANT_FLATS', 'SUM_NONVACANT_FLATS',
  'COUNT_NONVACANT_FLATS',
];

function getAllFlatNumbers(sheet: Sheet): string[] {
  const set = new Set<string>();
  for (const name of Object.keys(sheet)) {
    const parsed = parseFlatCellName(name);
    if (parsed) set.add(parsed.flatNumber);
  }
  return [...set];
}

// ─── Dependency extraction ──────────────────────────────────────────────────────

/** Walks an AST and collects every cell name (':'-containing ident) it references. */
function extractDependencies(node: Node, sheet: Sheet): Set<CellName> {
  const deps = new Set<CellName>();

  function walk(n: Node): void {
    switch (n.kind) {
      case 'number':
      case 'string':
        return;
      case 'ident':
        if (isCellRef(n.name)) deps.add(n.name);
        return;
      case 'unary':
        walk(n.operand);
        return;
      case 'binop':
        walk(n.left);
        walk(n.right);
        return;
      case 'call': {
        const fnName = n.name.toUpperCase();
        if (AGGREGATE_FNS.includes(fnName)) {
          // Aggregate functions implicitly depend on every candidate flat's relevant
          // cell(s) — add them explicitly so the dependency graph captures the real
          // data flow (otherwise cycle detection / eval ordering could be wrong).
          const fieldArg = n.args[0];
          const hasFieldArg = fnName !== 'COUNT_NONVACANT_FLATS';
          const field = hasFieldArg && fieldArg?.kind === 'string' ? fieldArg.value : null;
          const excludeArgNodes = hasFieldArg ? n.args.slice(1) : n.args;
          const excludeFlats = new Set(excludeArgNodes.map((a) => extractFlatId(a)));

          for (const flatNumber of getAllFlatNumbers(sheet)) {
            if (excludeFlats.has(flatNumber)) continue;
            if (field && `flat:${flatNumber}:${field}` in sheet) deps.add(`flat:${flatNumber}:${field}`);
            if (fnName.includes('NONVACANT') && `flat:${flatNumber}:vacant` in sheet) deps.add(`flat:${flatNumber}:vacant`);
          }
          return;
        }
        for (const a of n.args) walk(a);
        return;
      }
    }
  }

  walk(node);
  return deps;
}

/** Extracts a compile-time-known numeric literal from a node (number, or unary-minus number). */
function literalNumericValue(n: Node): number {
  if (n.kind === 'number') return n.value;
  if (n.kind === 'unary' && n.op === '-' && n.operand.kind === 'number') return -n.operand.value;
  throw new SheetEngineError('Expected a numeric literal argument');
}

/**
 * Extracts a flat-number identifier from an exclusion argument node.
 * Accepts numeric literals (16 → "16") or quoted strings ('4b' → "4b").
 * Use this for AVG_OTHER_FLATS/SUM_OTHER_FLATS exclusion args so that
 * alphanumeric flat numbers like 4b, 10A can be expressed as '4b', '10A'.
 */
function extractFlatId(n: Node): string {
  if (n.kind === 'number') return String(n.value);
  if (n.kind === 'unary' && n.op === '-' && n.operand.kind === 'number') return String(-n.operand.value);
  if (n.kind === 'string') return n.value;
  throw new SheetEngineError("Expected a flat number or quoted flat id (e.g. 16 or '4b')");
}

// ─── Evaluation ─────────────────────────────────────────────────────────────────

interface EvalState {
  sheet: Sheet;
  memo: Map<CellName, number>;
  /** Cells currently being evaluated (on the active call stack) — used for cycle detection. */
  inProgress: Set<CellName>;
  /** Order in which cells entered `inProgress`, for building a readable cycle message. */
  stack: CellName[];
}

function resolveCell(name: CellName, state: EvalState): number {
  const memoed = state.memo.get(name);
  if (memoed !== undefined) return memoed;

  if (state.inProgress.has(name)) {
    const cycleStart = state.stack.indexOf(name);
    const cyclePath = [...state.stack.slice(cycleStart), name];
    throw new SheetEngineError(`Circular reference: ${cyclePath.join(' -> ')}`);
  }

  const cell = state.sheet[name];
  if (!cell) {
    const referencedFrom = state.stack[state.stack.length - 1];
    throw new SheetEngineError(
      referencedFrom
        ? `Unknown cell reference '${name}' in formula for '${referencedFrom}'`
        : `Unknown cell reference '${name}'`,
    );
  }

  if (cell.kind === 'literal') {
    state.memo.set(name, cell.value);
    return cell.value;
  }

  state.inProgress.add(name);
  state.stack.push(name);
  try {
    const ast = parseFormula(cell.formulaText);
    const value = evalNode(ast, name, state);
    state.memo.set(name, value);
    return value;
  } finally {
    state.stack.pop();
    state.inProgress.delete(name);
  }
}

function evalNode(n: Node, currentCell: CellName, state: EvalState): number {
  switch (n.kind) {
    case 'number': return n.value;
    case 'string': throw new SheetEngineError('String literal used where a number was expected');
    case 'ident': {
      if (isCellRef(n.name)) return resolveCell(n.name, state);
      throw new SheetEngineError(`Unknown variable '${n.name}' (did you mean a cell reference like 'flat:1:consumption'?)`);
    }
    case 'unary':
      return n.op === '-' ? -evalNode(n.operand, currentCell, state) : evalNode(n.operand, currentCell, state);
    case 'binop': {
      const l = evalNode(n.left, currentCell, state);
      const r = evalNode(n.right, currentCell, state);
      switch (n.op) {
        case '+': return l + r;
        case '-': return l - r;
        case '*': return l * r;
        case '/': if (r === 0) throw new SheetEngineError('Division by zero'); return l / r;
        case '<':  return l < r  ? 1 : 0;
        case '>':  return l > r  ? 1 : 0;
        case '<=': return l <= r ? 1 : 0;
        case '>=': return l >= r ? 1 : 0;
        case '==': return l === r ? 1 : 0;
        case '!=': return l !== r ? 1 : 0;
        default: throw new SheetEngineError(`Unknown operator '${n.op}'`);
      }
    }
    case 'call': {
      const fnName = n.name.toUpperCase();

      if (fnName === 'IF') {
        if (n.args.length !== 3) throw new SheetEngineError('IF() takes exactly 3 arguments: IF(condition, thenValue, elseValue)');
        return evalNode(n.args[0], currentCell, state) !== 0
          ? evalNode(n.args[1], currentCell, state)
          : evalNode(n.args[2], currentCell, state);
      }

      if (AGGREGATE_FNS.includes(fnName)) {
        return evalAggregate(fnName, n.args, currentCell, state);
      }

      throw new SheetEngineError(`Unknown function '${n.name}'`);
    }
    default:
      throw new SheetEngineError('Invalid expression');
  }
}

function evalAggregate(fnName: string, args: Node[], currentCell: CellName, state: EvalState): number {
  const hasFieldArg = fnName !== 'COUNT_NONVACANT_FLATS';
  let field = '';

  let excludeArgNodes: Node[];
  if (hasFieldArg) {
    if (args.length < 1 || args[0].kind !== 'string') {
      throw new SheetEngineError(`${fnName}() requires a field name as first argument: ${fnName}('field', ...excludeFlats)`);
    }
    field = (args[0] as { kind: 'string'; value: string }).value;
    excludeArgNodes = args.slice(1);
  } else {
    excludeArgNodes = args;
  }
  const excludeFlats = new Set(excludeArgNodes.map((a) => extractFlatId(a)));

  const wantsNonVacant = fnName.includes('NONVACANT');
  const flatNumbers = getAllFlatNumbers(state.sheet).filter((fn) => !excludeFlats.has(fn));

  const matched: string[] = [];
  for (const flatNumber of flatNumbers) {
    if (wantsNonVacant) {
      const vacantCellName = `flat:${flatNumber}:vacant`;
      const isVacant = state.sheet[vacantCellName] ? resolveCell(vacantCellName, state) !== 0 : false;
      if (isVacant) continue;
    }
    matched.push(flatNumber);
  }

  if (fnName === 'COUNT_NONVACANT_FLATS') return matched.length;

  // Only flats that actually have a `flat:<n>:<field>` cell participate — a flat number
  // discovered via some OTHER field (e.g. `flat:23:vacant`) but lacking this particular
  // field (e.g. flat 23 deliberately has no `flat:23:consumption`, see test scenario) is
  // silently excluded rather than treated as an error, since "all flats with this field"
  // is the intended candidate set for these aggregates.
  const values = matched
    .filter((flatNumber) => `flat:${flatNumber}:${field}` in state.sheet)
    .map((flatNumber) => resolveCell(`flat:${flatNumber}:${field}`, state));
  if (values.length === 0) return 0;
  const sum = values.reduce((s, v) => s + v, 0);

  if (fnName.startsWith('AVG')) return sum / values.length;
  return sum; // SUM_*
}

// ─── Public API ──────────────────────────────────────────────────────────────────

export interface SheetEvaluationResult {
  /** Final resolved numeric value for every cell in the sheet. */
  values: Record<CellName, number>;
}

/**
 * Evaluates every cell in the sheet, resolving formula dependencies in topological
 * order and memoizing each cell's computed value. Throws SheetEngineError with a
 * specific message for circular references or unknown cell references.
 */
export function evaluateSheet(sheet: Sheet): SheetEvaluationResult {
  const state: EvalState = {
    sheet,
    memo: new Map(),
    inProgress: new Set(),
    stack: [],
  };

  for (const name of Object.keys(sheet)) {
    resolveCell(name, state);
  }

  const values: Record<CellName, number> = {};
  for (const [name, value] of state.memo) values[name] = value;
  return { values };
}

/** Resolves a single cell's value (and any of its transitive dependencies) on demand. */
export function evaluateCell(sheet: Sheet, cellName: CellName): number {
  const state: EvalState = {
    sheet,
    memo: new Map(),
    inProgress: new Set(),
    stack: [],
  };
  return resolveCell(cellName, state);
}

/** Returns the set of cell names a single formula text directly references (for graph/debug tooling). */
export function getFormulaDependencies(formulaText: string, sheet: Sheet): Set<CellName> {
  const ast = parseFormula(formulaText);
  return extractDependencies(ast, sheet);
}
