import { describe, it, expect } from 'vitest';
import { runFormula, parseFormula, FormulaError, type FormulaContext } from '@/lib/billing/formulaEngine';

function ctx(overrides: Partial<FormulaContext> = {}): FormulaContext {
  return {
    variables: { consumption: 100, rate_per_unit: 0.5, base_bill: 50 },
    otherFlats: { consumption: [80, 120], base_bill: [40, 60] },
    resolveTarget: (n) => `id-${n}`,
    lookupFlat: (flatNumber, field) => {
      const data: Record<string, Record<string, number>> = {
        A101: { consumption: 100, base_bill: 50 },
      };
      if (!data[flatNumber]) throw new FormulaError(`Unknown flat '${flatNumber}'`);
      if (!(field in data[flatNumber])) throw new FormulaError(`Unknown field '${field}' for FLAT('${flatNumber}')`);
      return data[flatNumber][field];
    },
    lookupMeter: (meterNumber, field) => {
      const data: Record<string, Record<string, number>> = {
        M1: { consumption: 75 },
      };
      if (!data[meterNumber]) throw new FormulaError(`Unknown meter '${meterNumber}'`);
      if (!(field in data[meterNumber])) throw new FormulaError(`Unknown field '${field}' for METER('${meterNumber}')`);
      return data[meterNumber][field];
    },
    lookupBill: (billNumber, field) => {
      const data: Record<string, Record<string, number>> = {
        'B-001': { total_amount: 500, total_units: 250 },
      };
      if (!data[billNumber]) throw new FormulaError(`Unknown bill '${billNumber}'`);
      if (!(field in data[billNumber])) throw new FormulaError(`Unknown field '${field}' for BILL('${billNumber}')`);
      return data[billNumber][field];
    },
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

  describe('FLAT() / METER() / BILL() lookups', () => {
    it('resolves FLAT(x).field from the pre-formula defaults snapshot', () => {
      expect(runFormula("FLAT('A101').consumption", ctx()).value).toBe(100);
      expect(runFormula("FLAT('A101').base_bill", ctx()).value).toBe(50);
      expect(runFormula("FLAT('A101').base_bill + 10", ctx()).value).toBe(60);
    });

    it('resolves METER(x).field from the pre-formula defaults snapshot', () => {
      expect(runFormula("METER('M1').consumption", ctx()).value).toBe(75);
    });

    it('resolves BILL(x).field from the pre-formula defaults snapshot', () => {
      expect(runFormula("BILL('B-001').total_amount", ctx()).value).toBe(500);
      expect(runFormula("BILL('B-001').total_units", ctx()).value).toBe(250);
    });

    it('throws a clear error when BILL/METER/FLAT is used without a trailing field access', () => {
      expect(() => runFormula("FLAT('A101')", ctx())).toThrow(/must be followed by a field/);
      expect(() => runFormula("METER('M1')", ctx())).toThrow(/must be followed by a field/);
      expect(() => runFormula("BILL('B-001')", ctx())).toThrow(/must be followed by a field/);
    });

    it('throws on an unknown flat/meter/bill identifier', () => {
      expect(() => runFormula("FLAT('NOPE').consumption", ctx())).toThrow(FormulaError);
      expect(() => runFormula("METER('NOPE').consumption", ctx())).toThrow(FormulaError);
      expect(() => runFormula("BILL('NOPE').total_amount", ctx())).toThrow(FormulaError);
    });

    it('throws on an unknown field name for a known identifier', () => {
      expect(() => runFormula("FLAT('A101').nonexistent_field", ctx())).toThrow(FormulaError);
      expect(() => runFormula("METER('M1').nonexistent_field", ctx())).toThrow(FormulaError);
      expect(() => runFormula("BILL('B-001').nonexistent_field", ctx())).toThrow(FormulaError);
    });

    it('throws when the lookup is called with the wrong argument shape', () => {
      expect(() => runFormula("FLAT(1).consumption", ctx())).toThrow(FormulaError);
      expect(() => runFormula("FLAT('A101', 'B102').consumption", ctx())).toThrow(FormulaError);
    });
  });
});
