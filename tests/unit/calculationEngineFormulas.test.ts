import { describe, it, expect } from 'vitest';
import { runBillingCalculation, type CalculationInput, type FlatFormula } from '@/services/billing/calculationEngine';

const FLAT_A = 'flat-a';
const FLAT_B = 'flat-b';
const FLAT_C = 'flat-c';

function makeInput(overrides: Partial<CalculationInput> = {}): CalculationInput {
  return {
    readings: [
      { meterId: 'm1', previousValue: 1000, currentValue: 1100 },
      { meterId: 'm2', previousValue: 2000, currentValue: 2200 },
      { meterId: 'm3', previousValue: 0, currentValue: 0 },
    ],
    assignments: [
      { meterId: 'm1', flatId: FLAT_A, sharePercent: 100 },
      { meterId: 'm2', flatId: FLAT_B, sharePercent: 100 },
      { meterId: 'm3', flatId: FLAT_C, sharePercent: 100 },
    ],
    activeTenancies: [
      { flatId: FLAT_A, tenancyId: 't-a' },
      { flatId: FLAT_B, tenancyId: 't-b' },
      { flatId: FLAT_C, tenancyId: 't-c' },
    ],
    totalBuildingCost: 300,
    totalBuildingConsumption: 300,
    previousBalances: {},
    diffMethod: 'proportional',
    dueDate: '2026-01-15',
    periodYear: 2026,
    periodMonth: 1,
    ...overrides,
  };
}

describe('runBillingCalculation — formulas & residual exclusion', () => {
  it('produces identical output with no formulas/exclusions (default behavior unaffected)', () => {
    const a = runBillingCalculation(makeInput());
    const b = runBillingCalculation(makeInput({ formulas: new Map(), excludedFromResidual: new Set() }));
    expect(a).toEqual(b);
  });

  it('overrides a flat base bill using a formula referencing AVG(consumption) of other flats', () => {
    const formulas = new Map<string, FlatFormula>([
      [FLAT_C, { flatId: FLAT_C, formulaText: 'AVG(consumption) * rate_per_unit' }],
    ]);
    const result = runBillingCalculation(makeInput({ formulas }));
    const flatC = result.flatBills.find((b) => b.flatId === FLAT_C)!;
    // avg consumption of A (100) and B (200) = 150, rate = 1 (300/300)
    expect(flatC.baseBill).toBe(150);
    expect(flatC.formulaApplied).toBe('AVG(consumption) * rate_per_unit');
  });

  it('redirects part of a bill to another flat via ALLOCATE()', () => {
    const formulas = new Map<string, FlatFormula>([
      [FLAT_A, { flatId: FLAT_A, formulaText: "base_bill / 2 + ALLOCATE(base_bill / 2, 'B')" }],
    ]);
    const result = runBillingCalculation(
      makeInput({ formulas, flatNumbers: { [FLAT_A]: 'A', [FLAT_B]: 'B', [FLAT_C]: 'C' } }),
    );
    const flatA = result.flatBills.find((b) => b.flatId === FLAT_A)!;
    const flatB = result.flatBills.find((b) => b.flatId === FLAT_B)!;
    // default base bill for A is 100 (consumption 100 * rate 1); half stays, half goes to B
    expect(flatA.baseBill).toBe(50);
    expect(flatB.baseBill).toBe(250); // 200 default + 50 allocated
  });

  it('falls back to the default calculation and records a warning when a formula errors', () => {
    const formulas = new Map<string, FlatFormula>([
      [FLAT_A, { flatId: FLAT_A, formulaText: 'unknown_variable' }],
    ]);
    const result = runBillingCalculation(makeInput({ formulas, flatNumbers: { [FLAT_A]: 'A' } }));
    const flatA = result.flatBills.find((b) => b.flatId === FLAT_A)!;
    expect(flatA.baseBill).toBe(100); // default, unaffected
    expect(flatA.formulaError).toMatch(/Unknown variable/);
    expect(result.warnings.some((w) => w.includes('Formula for flat A failed'))).toBe(true);
  });

  it('excludes a flat from the residual/difference distribution', () => {
    const result = runBillingCalculation(makeInput({ excludedFromResidual: new Set([FLAT_C]) }));
    const flatC = result.flatBills.find((b) => b.flatId === FLAT_C)!;
    expect(flatC.differenceAdjustment).toBe(0);
    expect(flatC.excludedFromResidual).toBe(true);
  });

  it('resolves FLAT(x).field lookups end-to-end in legacy (pooled) mode', () => {
    const formulas = new Map<string, FlatFormula>([
      [FLAT_C, { flatId: FLAT_C, formulaText: "FLAT('A').base_bill + 10" }],
    ]);
    const result = runBillingCalculation(
      makeInput({ formulas, flatNumbers: { [FLAT_A]: 'A', [FLAT_B]: 'B', [FLAT_C]: 'C' } }),
    );
    const flatC = result.flatBills.find((b) => b.flatId === FLAT_C)!;
    // default base bill for A is 100 (consumption 100 * rate 1) → 100 + 10 = 110
    expect(flatC.baseBill).toBe(110);
    expect(flatC.formulaApplied).toBe("FLAT('A').base_bill + 10");
  });

  it('resolves FLAT(x).field lookups end-to-end in grouped (billGroups) mode', () => {
    const formulas = new Map<string, FlatFormula>([
      [FLAT_C, { flatId: FLAT_C, formulaText: "FLAT('A').base_bill + 10" }],
    ]);
    const billGroups = [
      { groupKey: 'g1', totalCost: 200, totalConsumption: 200, meterIds: ['m1', 'm2'] },
      { groupKey: 'g2', totalCost: 100, totalConsumption: 100, meterIds: ['m3'] },
    ];
    const result = runBillingCalculation(
      makeInput({
        formulas,
        flatNumbers: { [FLAT_A]: 'A', [FLAT_B]: 'B', [FLAT_C]: 'C' },
        billGroups,
      }),
    );
    const flatA = result.flatBills.find((b) => b.flatId === FLAT_A)!;
    const flatC = result.flatBills.find((b) => b.flatId === FLAT_C)!;
    // group g1 rate = 200/200 = 1, flat A consumption 100 → default base bill 100
    expect(flatA.baseBill).toBe(100);
    expect(flatC.baseBill).toBe(110);
    expect(flatC.formulaApplied).toBe("FLAT('A').base_bill + 10");
  });
});
