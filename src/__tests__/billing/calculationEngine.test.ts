import { describe, it, expect } from 'vitest';
import {
  round,
  calcMeterConsumptions,
  calcFlatConsumptions,
  calcCostPerUnit,
  calcBaseBills,
  distributeDifference,
  runBillingCalculation,
  type ReadingInput,
  type MeterAssignment,
  type ActiveTenancy,
  type CalculationInput,
} from '../../services/billing/calculationEngine';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const FLAT_A = 'flat-a';
const FLAT_B = 'flat-b';
const FLAT_C = 'flat-c';
const METER_1 = 'meter-1';
const METER_2 = 'meter-2';
const METER_S = 'meter-shared';
const TENANCY_A = 'tenancy-a';
const TENANCY_B = 'tenancy-b';
const TENANCY_C = 'tenancy-c';

function makeInput(overrides: Partial<CalculationInput> = {}): CalculationInput {
  return {
    readings: [
      { meterId: METER_1, previousValue: 1000, currentValue: 1200 },
      { meterId: METER_2, previousValue: 2000, currentValue: 2300 },
    ],
    assignments: [
      { meterId: METER_1, flatId: FLAT_A, sharePercent: 100 },
      { meterId: METER_2, flatId: FLAT_B, sharePercent: 100 },
    ],
    activeTenancies: [
      { flatId: FLAT_A, tenancyId: TENANCY_A },
      { flatId: FLAT_B, tenancyId: TENANCY_B },
    ],
    totalBuildingCost:        500,   // SAR
    totalBuildingConsumption: 500,   // kWh (200 + 300)
    previousBalances:         {},
    diffMethod:               'proportional',
    dueDate:                  '2026-02-01',
    periodYear:               2026,
    periodMonth:              1,
    ...overrides,
  };
}

// ─── round ────────────────────────────────────────────────────────────────────

describe('round', () => {
  it('rounds to 2 decimal places by default', () => {
    expect(round(1.005)).toBe(1.01);
    expect(round(1.004)).toBe(1);
    expect(round(1.555)).toBe(1.56);
  });

  it('rounds to specified decimal places', () => {
    expect(round(1.2345, 3)).toBe(1.235);
    expect(round(1.2344, 3)).toBe(1.234);
  });

  it('handles negative values', () => {
    expect(round(-1.5)).toBe(-1.5);
    expect(round(-1.55)).toBe(-1.55);
    expect(round(-1.554)).toBe(-1.55);
  });
});

// ─── calcMeterConsumptions ────────────────────────────────────────────────────

describe('calcMeterConsumptions', () => {
  it('calculates consumption as current minus previous', () => {
    const result = calcMeterConsumptions([
      { meterId: METER_1, previousValue: 1000, currentValue: 1200 },
    ]);
    expect(result.get(METER_1)?.consumption).toBe(200);
  });

  it('returns 0 when no previous reading (null)', () => {
    const result = calcMeterConsumptions([
      { meterId: METER_1, previousValue: null, currentValue: 1200 },
    ]);
    expect(result.get(METER_1)?.consumption).toBe(0);
  });

  it('clamps negative consumption to 0 (meter reset without override)', () => {
    const result = calcMeterConsumptions([
      { meterId: METER_1, previousValue: 1200, currentValue: 100 },
    ]);
    expect(result.get(METER_1)?.consumption).toBe(0);
  });

  it('preserves opening and closing reading values', () => {
    const result = calcMeterConsumptions([
      { meterId: METER_1, previousValue: 500, currentValue: 750 },
    ]);
    const entry = result.get(METER_1)!;
    expect(entry.opening).toBe(500);
    expect(entry.closing).toBe(750);
    expect(entry.consumption).toBe(250);
  });

  it('handles multiple meters independently', () => {
    const result = calcMeterConsumptions([
      { meterId: METER_1, previousValue: 0,    currentValue: 200 },
      { meterId: METER_2, previousValue: 1000, currentValue: 1350 },
    ]);
    expect(result.get(METER_1)?.consumption).toBe(200);
    expect(result.get(METER_2)?.consumption).toBe(350);
  });
});

// ─── calcFlatConsumptions ─────────────────────────────────────────────────────

describe('calcFlatConsumptions', () => {
  it('assigns 100% to single flat individual meter', () => {
    const meterConsumptions = calcMeterConsumptions([
      { meterId: METER_1, previousValue: 0, currentValue: 300 },
    ]);
    const result = calcFlatConsumptions(meterConsumptions, [
      { meterId: METER_1, flatId: FLAT_A, sharePercent: 100 },
    ]);
    expect(result.get(FLAT_A)?.totalConsumption).toBe(300);
  });

  it('splits shared meter by percentage', () => {
    const meterConsumptions = calcMeterConsumptions([
      { meterId: METER_S, previousValue: 0, currentValue: 400 },
    ]);
    const result = calcFlatConsumptions(meterConsumptions, [
      { meterId: METER_S, flatId: FLAT_A, sharePercent: 60 },
      { meterId: METER_S, flatId: FLAT_B, sharePercent: 40 },
    ]);
    expect(result.get(FLAT_A)?.totalConsumption).toBe(240);
    expect(result.get(FLAT_B)?.totalConsumption).toBe(160);
  });

  it('sums multiple meter contributions for one flat', () => {
    const meterConsumptions = calcMeterConsumptions([
      { meterId: METER_1, previousValue: 0, currentValue: 100 },
      { meterId: METER_2, previousValue: 0, currentValue: 200 },
    ]);
    const result = calcFlatConsumptions(meterConsumptions, [
      { meterId: METER_1, flatId: FLAT_A, sharePercent: 100 },
      { meterId: METER_2, flatId: FLAT_A, sharePercent: 100 },
    ]);
    expect(result.get(FLAT_A)?.totalConsumption).toBe(300);
  });

  it('returns 0 consumption for flat with no reading', () => {
    const meterConsumptions = new Map(); // empty — meter has no reading
    const result = calcFlatConsumptions(meterConsumptions, [
      { meterId: METER_1, flatId: FLAT_A, sharePercent: 100 },
    ]);
    expect(result.get(FLAT_A)?.totalConsumption).toBe(0);
  });

  it('tracks meter contributions in detail', () => {
    const meterConsumptions = calcMeterConsumptions([
      { meterId: METER_S, previousValue: 100, currentValue: 600 },
    ]);
    const result = calcFlatConsumptions(meterConsumptions, [
      { meterId: METER_S, flatId: FLAT_A, sharePercent: 70 },
      { meterId: METER_S, flatId: FLAT_B, sharePercent: 30 },
    ]);
    const contribA = result.get(FLAT_A)?.contributions[0];
    expect(contribA?.meterConsumption).toBe(500);
    expect(contribA?.sharePercent).toBe(70);
    expect(contribA?.flatContribution).toBe(350);
  });
});

// ─── calcCostPerUnit ──────────────────────────────────────────────────────────

describe('calcCostPerUnit', () => {
  it('divides total cost by total consumption', () => {
    expect(calcCostPerUnit(1000, 500)).toBe(2);
    expect(calcCostPerUnit(500, 1000)).toBe(0.5);
  });

  it('rounds to 6 decimal places', () => {
    expect(calcCostPerUnit(100, 3)).toBe(33.333333);
  });

  it('returns 0 when total consumption is 0', () => {
    expect(calcCostPerUnit(1000, 0)).toBe(0);
  });

  it('returns 0 when both are 0', () => {
    expect(calcCostPerUnit(0, 0)).toBe(0);
  });
});

// ─── calcBaseBills ────────────────────────────────────────────────────────────

describe('calcBaseBills', () => {
  it('calculates base bill as consumption × costPerUnit', () => {
    const flatConsumptions = new Map([
      [FLAT_A, { totalConsumption: 200, contributions: [] }],
      [FLAT_B, { totalConsumption: 300, contributions: [] }],
    ]);
    const result = calcBaseBills(
      flatConsumptions,
      [{ flatId: FLAT_A, tenancyId: TENANCY_A }, { flatId: FLAT_B, tenancyId: TENANCY_B }],
      1.0, // SAR/kWh
    );
    expect(result.get(FLAT_A)).toBe(200);
    expect(result.get(FLAT_B)).toBe(300);
  });

  it('returns 0 for flat with no consumption', () => {
    const flatConsumptions = new Map([[FLAT_A, { totalConsumption: 0, contributions: [] }]]);
    const result = calcBaseBills(
      flatConsumptions,
      [{ flatId: FLAT_A, tenancyId: TENANCY_A }],
      2.5,
    );
    expect(result.get(FLAT_A)).toBe(0);
  });
});

// ─── distributeDifference ─────────────────────────────────────────────────────

describe('distributeDifference', () => {
  const flatConsumptions = new Map([
    [FLAT_A, { totalConsumption: 200, contributions: [] }],
    [FLAT_B, { totalConsumption: 300, contributions: [] }],
  ]);

  describe('proportional method', () => {
    it('distributes proportionally by consumption', () => {
      const result = distributeDifference(50, flatConsumptions, [FLAT_A, FLAT_B], 'proportional');
      expect(result.get(FLAT_A)).toBeCloseTo(20, 1); // 50 × 200/500
      expect(result.get(FLAT_B)).toBeCloseTo(30, 1); // 50 × 300/500
    });

    it('sum of adjustments equals the input difference exactly', () => {
      const diff = 10.01; // awkward number
      const result = distributeDifference(diff, flatConsumptions, [FLAT_A, FLAT_B], 'proportional');
      const total = round([...result.values()].reduce((s, v) => s + v, 0), 2);
      expect(total).toBe(round(diff, 2));
    });

    it('handles negative difference (over-collected)', () => {
      const result = distributeDifference(-30, flatConsumptions, [FLAT_A, FLAT_B], 'proportional');
      expect(result.get(FLAT_A)!).toBeLessThan(0);
      expect(result.get(FLAT_B)!).toBeLessThan(0);
    });

    it('falls back to equal when all consumptions are 0', () => {
      const zeroConsumptions = new Map([
        [FLAT_A, { totalConsumption: 0, contributions: [] }],
        [FLAT_B, { totalConsumption: 0, contributions: [] }],
      ]);
      const result = distributeDifference(20, zeroConsumptions, [FLAT_A, FLAT_B], 'proportional');
      expect(result.get(FLAT_A)).toBe(10);
      expect(result.get(FLAT_B)).toBe(10);
    });
  });

  describe('equal method', () => {
    it('distributes equally across all flats', () => {
      const result = distributeDifference(60, flatConsumptions, [FLAT_A, FLAT_B, FLAT_C], 'equal');
      expect(result.get(FLAT_A)).toBe(20);
      expect(result.get(FLAT_B)).toBe(20);
      expect(result.get(FLAT_C)).toBe(20);
    });

    it('sum of adjustments equals the input difference exactly', () => {
      const diff = 10.01;
      const result = distributeDifference(diff, flatConsumptions, [FLAT_A, FLAT_B, FLAT_C], 'equal');
      const total = round([...result.values()].reduce((s, v) => s + v, 0), 2);
      expect(total).toBe(round(diff, 2));
    });
  });

  it('returns empty map for empty flat list', () => {
    const result = distributeDifference(50, flatConsumptions, [], 'proportional');
    expect(result.size).toBe(0);
  });
});

// ─── runBillingCalculation — integration scenarios ────────────────────────────

describe('runBillingCalculation', () => {
  it('produces correct totals for two-flat scenario', () => {
    // Flat A: 200 kWh, Flat B: 300 kWh
    // Building total: 500 SAR / 500 kWh = 1 SAR/kWh
    // Flat A: 200 × 1 = 200, Flat B: 300 × 1 = 300
    // Difference: 500 - 500 = 0
    const result = runBillingCalculation(makeInput());

    expect(result.summary.costPerUnit).toBe(1);
    expect(result.summary.sumOfBaseBills).toBe(500);
    expect(result.summary.difference).toBe(0);
    expect(result.flatBills).toHaveLength(2);

    const flatA = result.flatBills.find((b) => b.flatId === FLAT_A)!;
    expect(flatA.consumption).toBe(200);
    expect(flatA.baseBill).toBe(200);
    expect(flatA.differenceAdjustment).toBe(0);
    expect(flatA.totalDue).toBe(200);
  });

  it('rolls over previous unpaid balance into total due', () => {
    const result = runBillingCalculation(
      makeInput({ previousBalances: { [FLAT_A]: 50 } }),
    );
    const flatA = result.flatBills.find((b) => b.flatId === FLAT_A)!;
    expect(flatA.previousBalance).toBe(50);
    expect(flatA.totalDue).toBe(250); // 200 bill + 50 prev
  });

  it('distributes rounding difference so sum of bills equals building cost', () => {
    // 100 SAR / 3 flats with equal consumption = rounding arises
    const input = makeInput({
      readings: [
        { meterId: METER_1, previousValue: 0, currentValue: 100 },
        { meterId: METER_2, previousValue: 0, currentValue: 100 },
        { meterId: 'meter-3', previousValue: 0, currentValue: 100 },
      ],
      assignments: [
        { meterId: METER_1,    flatId: FLAT_A, sharePercent: 100 },
        { meterId: METER_2,    flatId: FLAT_B, sharePercent: 100 },
        { meterId: 'meter-3',  flatId: FLAT_C, sharePercent: 100 },
      ],
      activeTenancies: [
        { flatId: FLAT_A, tenancyId: TENANCY_A },
        { flatId: FLAT_B, tenancyId: TENANCY_B },
        { flatId: FLAT_C, tenancyId: TENANCY_C },
      ],
      totalBuildingCost:        100,
      totalBuildingConsumption: 300,
    });

    const result = runBillingCalculation(input);
    const totalBills = round(result.flatBills.reduce((s, b) => s + b.totalDue, 0), 2);
    expect(totalBills).toBe(100);
  });

  it('handles shared meter split between two flats', () => {
    const input = makeInput({
      readings: [{ meterId: METER_S, previousValue: 0, currentValue: 600 }],
      assignments: [
        { meterId: METER_S, flatId: FLAT_A, sharePercent: 40 },
        { meterId: METER_S, flatId: FLAT_B, sharePercent: 60 },
      ],
      totalBuildingCost:        600,
      totalBuildingConsumption: 600,
    });
    const result = runBillingCalculation(input);
    const flatA = result.flatBills.find((b) => b.flatId === FLAT_A)!;
    const flatB = result.flatBills.find((b) => b.flatId === FLAT_B)!;
    expect(flatA.consumption).toBe(240);  // 600 × 40%
    expect(flatB.consumption).toBe(360);  // 600 × 60%
    expect(flatA.baseBill).toBe(240);
    expect(flatB.baseBill).toBe(360);
  });

  it('warns when meter has no reading', () => {
    const input = makeInput({
      readings: [], // no readings at all
    });
    const result = runBillingCalculation(input);
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.warnings.some((w) => w.includes('No reading'))).toBe(true);
  });

  it('warns and returns zero bills when no active tenancies', () => {
    const result = runBillingCalculation(makeInput({ activeTenancies: [] }));
    expect(result.flatBills).toHaveLength(0);
    expect(result.warnings.some((w) => w.includes('No active tenancies'))).toBe(true);
  });

  it('warns when totalBuildingConsumption is 0', () => {
    const result = runBillingCalculation(makeInput({ totalBuildingConsumption: 0 }));
    expect(result.warnings.some((w) => w.includes('consumption is zero'))).toBe(true);
  });

  it('applies proportional difference distribution', () => {
    // Meters read 200 + 300 = 500 kWh total.
    // Company bills show 550 kWh at 1100 SAR → rate = 2 SAR/kWh.
    // Base bills: Flat A = 400, Flat B = 600 → sum = 1000.
    // Difference = 1100 − 1000 = 100.
    // Proportional: Flat A = 100 × 200/500 = 40, Flat B = 100 × 300/500 = 60.
    const input = makeInput({
      totalBuildingCost:        1100,
      totalBuildingConsumption: 550,
      diffMethod:               'proportional',
    });
    const result = runBillingCalculation(input);
    const flatA = result.flatBills.find((b) => b.flatId === FLAT_A)!;
    const flatB = result.flatBills.find((b) => b.flatId === FLAT_B)!;
    expect(result.summary.difference).toBe(100);
    expect(flatA.differenceAdjustment).toBe(40);
    expect(flatB.differenceAdjustment).toBe(60);
    expect(flatA.totalDue).toBe(440);
    expect(flatB.totalDue).toBe(660);
  });

  it('applies equal difference distribution', () => {
    // Same scenario but equal split: each flat gets 100 / 2 = 50
    const input = makeInput({
      totalBuildingCost:        1100,
      totalBuildingConsumption: 550,
      diffMethod:               'equal',
    });
    const result = runBillingCalculation(input);
    const flatA = result.flatBills.find((b) => b.flatId === FLAT_A)!;
    const flatB = result.flatBills.find((b) => b.flatId === FLAT_B)!;
    expect(flatA.differenceAdjustment).toBe(50);
    expect(flatB.differenceAdjustment).toBe(50);
  });

  it('sum of all totalDue equals building cost when no previous balances', () => {
    // This must always hold (excluding previous balances)
    const input = makeInput({ totalBuildingCost: 733.33, totalBuildingConsumption: 500 });
    const result = runBillingCalculation(input);
    const totalBills = round(
      result.flatBills.reduce((s, b) => s + b.baseBill + b.differenceAdjustment, 0),
      2,
    );
    expect(totalBills).toBe(733.33);
  });
});
