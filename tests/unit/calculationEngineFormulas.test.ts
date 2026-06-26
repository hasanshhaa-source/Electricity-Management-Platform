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
    const formulas = new Map<string, FlatFormula[]>([
      [FLAT_C, [{ flatId: FLAT_C, formulaText: 'AVG(consumption) * rate_per_unit' }]],
    ]);
    const result = runBillingCalculation(makeInput({ formulas }));
    const flatC = result.flatBills.find((b) => b.flatId === FLAT_C)!;
    // avg consumption of A (100) and B (200) = 150, rate = 1 (300/300)
    expect(flatC.baseBill).toBe(150);
    expect(flatC.formulaApplied).toBe('AVG(consumption) * rate_per_unit');
  });

  it('redirects part of a bill to another flat via ALLOCATE()', () => {
    const formulas = new Map<string, FlatFormula[]>([
      [FLAT_A, [{ flatId: FLAT_A, formulaText: "base_bill / 2 + ALLOCATE(base_bill / 2, 'B')" }]],
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
    const formulas = new Map<string, FlatFormula[]>([
      [FLAT_A, [{ flatId: FLAT_A, formulaText: 'unknown_variable' }]],
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
    const formulas = new Map<string, FlatFormula[]>([
      [FLAT_C, [{ flatId: FLAT_C, formulaText: "FLAT('A').base_bill + 10" }]],
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
    const formulas = new Map<string, FlatFormula[]>([
      [FLAT_C, [{ flatId: FLAT_C, formulaText: "FLAT('A').base_bill + 10" }]],
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

  it('overrides previous_balance via formula and confirms it flows into the normal total_due math', () => {
    const formulas = new Map<string, FlatFormula[]>([
      [FLAT_A, [{ flatId: FLAT_A, formulaText: '75', target: 'previous_balance' }]],
    ]);
    const result = runBillingCalculation(makeInput({ formulas, previousBalances: { [FLAT_A]: 5 } }));
    const flatA = result.flatBills.find((b) => b.flatId === FLAT_A)!;
    // base bill 100 (consumption 100 * rate 1) + 0 adjustment (perfectly reconciled) + overridden previous balance 75
    expect(flatA.previousBalance).toBe(75);
    expect(flatA.totalDue).toBe(flatA.baseBill + flatA.differenceAdjustment + 75 + flatA.lumpSumCharges);
  });

  it('overrides lump_sum via formula and confirms it flows into the normal total_due math', () => {
    const formulas = new Map<string, FlatFormula[]>([
      [FLAT_B, [{ flatId: FLAT_B, formulaText: '40', target: 'lump_sum' }]],
    ]);
    const result = runBillingCalculation(makeInput({ formulas, lumpSumCharges: { [FLAT_B]: 10 } }));
    const flatB = result.flatBills.find((b) => b.flatId === FLAT_B)!;
    expect(flatB.lumpSumCharges).toBe(40);
    expect(flatB.totalDue).toBe(flatB.baseBill + flatB.differenceAdjustment + flatB.previousBalance + 40);
  });

  it('overrides adjustment directly via formula, bypassing the normal residual distribution for that flat', () => {
    const formulas = new Map<string, FlatFormula[]>([
      [FLAT_C, [{ flatId: FLAT_C, formulaText: '99', target: 'adjustment' }]],
    ]);
    const result = runBillingCalculation(makeInput({ formulas }));
    const flatC = result.flatBills.find((b) => b.flatId === FLAT_C)!;
    expect(flatC.differenceAdjustment).toBe(99);
    expect(flatC.totalDue).toBe(flatC.baseBill + 99 + flatC.previousBalance + flatC.lumpSumCharges);
  });

  it('overrides total_due fully via formula, like a full override similar to base_bill', () => {
    const formulas = new Map<string, FlatFormula[]>([
      [FLAT_A, [{ flatId: FLAT_A, formulaText: '500', target: 'total_due' }]],
    ]);
    const result = runBillingCalculation(makeInput({ formulas }));
    const flatA = result.flatBills.find((b) => b.flatId === FLAT_A)!;
    expect(flatA.totalDue).toBe(500);
  });

  it('allows a flat to have multiple simultaneously-active formulas on different targets', () => {
    const formulas = new Map<string, FlatFormula[]>([
      [FLAT_A, [
        { flatId: FLAT_A, formulaText: '50', target: 'previous_balance' },
        { flatId: FLAT_A, formulaText: '20', target: 'lump_sum' },
      ]],
    ]);
    const result = runBillingCalculation(makeInput({ formulas }));
    const flatA = result.flatBills.find((b) => b.flatId === FLAT_A)!;
    expect(flatA.previousBalance).toBe(50);
    expect(flatA.lumpSumCharges).toBe(20);
    expect(flatA.totalDue).toBe(flatA.baseBill + flatA.differenceAdjustment + 50 + 20);
  });
});
