import { describe, it, expect } from 'vitest';
import { runFormula, parseFormula, FormulaError, type FormulaContext } from '@/lib/billing/formulaEngine';

function ctx(overrides: Partial<FormulaContext> = {}): FormulaContext {
  return {
    variables: { consumption: 100, rate_per_unit: 0.5, base_bill: 50 },
    otherFlats: { consumption: [80, 120], base_bill: [40, 60] },
    resolveTarget: (n) => `id-${n}`,
    ...overrides,
  };
}

describe('formulaEngine', () => {
  it('evaluates basic arithmetic', () => {
    expect(runFormula('1 + 2 * 3', ctx()).value).toBe(7);
    expect(runFormula('(1 + 2) * 3', ctx()).value).toBe(9);
  });

  it('resolves variables', () => {
    expect(runFormula('consumption * rate_per_unit', ctx()).value).toBe(50);
  });

  it('throws on unknown variable', () => {
    expect(() => runFormula('unknown_var', ctx())).toThrow(FormulaError);
  });

  it('computes AVG/SUM/MIN/MAX over other flats', () => {
    expect(runFormula('AVG(consumption)', ctx()).value).toBe(100);
    expect(runFormula('SUM(consumption)', ctx()).value).toBe(200);
    expect(runFormula('MIN(consumption)', ctx()).value).toBe(80);
    expect(runFormula('MAX(consumption)', ctx()).value).toBe(120);
  });

  it('evaluates IF()', () => {
    expect(runFormula('IF(consumption > 50, 1, 0)', ctx()).value).toBe(1);
    expect(runFormula('IF(consumption < 50, 1, 0)', ctx()).value).toBe(0);
  });

  it('records ALLOCATE() side effects and returns 0 for them', () => {
    const result = runFormula("base_bill / 2 + ALLOCATE(base_bill / 2, 'B102')", ctx());
    expect(result.value).toBe(25);
    expect(result.allocations).toEqual([{ target: 'id-B102', amount: 25 }]);
  });

  it('rejects unknown functions and malformed syntax', () => {
    expect(() => runFormula('FOO(1)', ctx())).toThrow(FormulaError);
    expect(() => parseFormula('1 +')).toThrow(FormulaError);
    expect(() => parseFormula('(1 + 2')).toThrow(FormulaError);
  });

  it('rejects division by zero', () => {
    expect(() => runFormula('1 / 0', ctx())).toThrow(FormulaError);
  });
});
