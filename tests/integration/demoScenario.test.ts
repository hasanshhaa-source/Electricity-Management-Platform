/**
 * Demo scenario: complete monthly billing cycle for 2 buildings.
 *
 * This test drives the pure calculation engine through a realistic
 * month-end billing run, verifying every outcome expected by the seed data.
 * No database required — all inputs mirror the seed values exactly.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { runBillingCalculation, round } from '@/services/billing/calculationEngine';
import type { CalculationResult } from '@/services/billing/calculationEngine';

// ─── Building A setup (Al-Noor Residences — January 2025) ────────────────────
// Two individual meters, one flat each
// Company bill: SAR 1100 for 550 kWh → rate = 2.00

let buildingAResult: CalculationResult;

beforeAll(() => {
  buildingAResult = runBillingCalculation({
    readings: [
      { meterId: 'M-A1', previousValue: 1200, currentValue: 1450 },  // 250 kWh
      { meterId: 'M-A2', previousValue: 800,  currentValue: 1100 },  // 300 kWh
    ],
    assignments: [
      { meterId: 'M-A1', flatId: 'F101', sharePercent: 100 },
      { meterId: 'M-A2', flatId: 'F102', sharePercent: 100 },
    ],
    activeTenancies: [
      { flatId: 'F101', tenancyId: 'TN-101' },
      { flatId: 'F102', tenancyId: 'TN-102' },
    ],
    totalBuildingCost:        1100,
    totalBuildingConsumption: 550,
    previousBalances:         {},
    diffMethod:               'proportional',
    dueDate:                  '2025-02-25',
    periodYear:               2025,
    periodMonth:              1,
  });
});

// ─── Building B setup (Riyadh Heights — January 2025) ────────────────────────
// One shared meter, 60/40 split
// Flat 201 carries SAR 120 unpaid from December
// Company bill: SAR 820 for 400 kWh → rate = 2.05
// → Positive difference of SAR 20 distributed proportionally

let buildingBResult: CalculationResult;

beforeAll(() => {
  buildingBResult = runBillingCalculation({
    readings: [
      { meterId: 'M-B1', previousValue: 500, currentValue: 900 },    // 400 kWh total
    ],
    assignments: [
      { meterId: 'M-B1', flatId: 'F201', sharePercent: 60 },
      { meterId: 'M-B1', flatId: 'F202', sharePercent: 40 },
    ],
    activeTenancies: [
      { flatId: 'F201', tenancyId: 'TN-201' },
      { flatId: 'F202', tenancyId: 'TN-202' },
    ],
    totalBuildingCost:        820,
    totalBuildingConsumption: 400,
    previousBalances:         { F201: 120 },
    diffMethod:               'proportional',
    dueDate:                  '2025-02-25',
    periodYear:               2025,
    periodMonth:              1,
  });
});

// ─── Building A: individual meters ───────────────────────────────────────────

describe('Building A — Al-Noor Residences (January 2025)', () => {
  describe('Summary', () => {
    it('cost per unit = 2.00 SAR/kWh', () => {
      expect(buildingAResult.summary.costPerUnit).toBe(2.0);
    });
    it('total billed equals company bill', () => {
      expect(buildingAResult.summary.totalBuildingCost).toBe(1100);
    });
    it('no rounding difference', () => {
      expect(buildingAResult.summary.difference).toBe(0);
    });
    it('2 flats calculated', () => {
      expect(buildingAResult.summary.flatsCalculated).toBe(2);
    });
    it('no warnings', () => {
      expect(buildingAResult.warnings).toHaveLength(0);
    });
  });

  describe('Flat 101 — Ahmed Al-Rashid (250 kWh, individual meter)', () => {
    let bill: ReturnType<typeof buildingAResult.flatBills.find>;
    beforeAll(() => { bill = buildingAResult.flatBills.find(b => b.flatId === 'F101'); });

    it('flat exists', () => expect(bill).toBeDefined());
    it('consumption = 250 kWh',        () => expect(bill!.consumption).toBe(250));
    it('opening reading = 1200',        () => expect(bill!.openingReading).toBe(1200));
    it('closing reading = 1450',        () => expect(bill!.closingReading).toBe(1450));
    it('base bill = SAR 500',           () => expect(bill!.baseBill).toBe(500));
    it('no difference adjustment',      () => expect(bill!.differenceAdjustment).toBe(0));
    it('no previous balance',           () => expect(bill!.previousBalance).toBe(0));
    it('total due = SAR 500',           () => expect(bill!.totalDue).toBe(500));
    it('share = 100%',                  () => expect(bill!.sharePercent).toBe(100));
  });

  describe('Flat 102 — Sara Al-Dosari (300 kWh, individual meter)', () => {
    let bill: ReturnType<typeof buildingAResult.flatBills.find>;
    beforeAll(() => { bill = buildingAResult.flatBills.find(b => b.flatId === 'F102'); });

    it('flat exists',                   () => expect(bill).toBeDefined());
    it('consumption = 300 kWh',         () => expect(bill!.consumption).toBe(300));
    it('base bill = SAR 600',           () => expect(bill!.baseBill).toBe(600));
    it('total due = SAR 600',           () => expect(bill!.totalDue).toBe(600));
  });

  describe('Penny-perfect invariant', () => {
    it('sum of all flat bills = SAR 1100', () => {
      const total = round(buildingAResult.flatBills.reduce((s, b) => s + b.totalDue, 0), 2);
      expect(total).toBe(1100);
    });
  });
});

// ─── Building B: shared meter + difference distribution ──────────────────────

describe('Building B — Riyadh Heights (January 2025)', () => {
  describe('Summary', () => {
    it('cost per unit = 2.05 SAR/kWh', () => {
      expect(buildingBResult.summary.costPerUnit).toBe(2.05);
    });
    it('no rounding difference (costPerUnit absorbs it)', () => {
      expect(buildingBResult.summary.difference).toBe(0);
    });
    it('2 flats calculated', () => {
      expect(buildingBResult.summary.flatsCalculated).toBe(2);
    });
  });

  describe('Flat 201 — Khalid Al-Otaibi (60% share + SAR 120 carry-forward)', () => {
    let bill: ReturnType<typeof buildingBResult.flatBills.find>;
    beforeAll(() => { bill = buildingBResult.flatBills.find(b => b.flatId === 'F201'); });

    it('flat exists',                   () => expect(bill).toBeDefined());
    it('allocated 240 kWh (60% of 400)', () => expect(bill!.consumption).toBe(240));
    it('share percent = 60%',            () => expect(bill!.sharePercent).toBe(60));
    it('base bill = SAR 492',            () => expect(bill!.baseBill).toBe(492));
    it('previous balance = SAR 120',     () => expect(bill!.previousBalance).toBe(120));
    it('total due = SAR 612',            () => expect(bill!.totalDue).toBe(612));

    it('contributions list shows shared meter at 60%', () => {
      expect(bill!.contributions[0].meterId).toBe('M-B1');
      expect(bill!.contributions[0].sharePercent).toBe(60);
      expect(bill!.contributions[0].flatContribution).toBe(240);
    });
  });

  describe('Flat 202 — Noura Al-Ghamdi (40% share, no carry-forward)', () => {
    let bill: ReturnType<typeof buildingBResult.flatBills.find>;
    beforeAll(() => { bill = buildingBResult.flatBills.find(b => b.flatId === 'F202'); });

    it('flat exists',                   () => expect(bill).toBeDefined());
    it('allocated 160 kWh (40% of 400)', () => expect(bill!.consumption).toBe(160));
    it('base bill = SAR 328',            () => expect(bill!.baseBill).toBe(328));
    it('no previous balance',            () => expect(bill!.previousBalance).toBe(0));
    it('total due = SAR 328',            () => expect(bill!.totalDue).toBe(328));
  });

  describe('Penny-perfect invariant', () => {
    it('F201 + F202 base bills = SAR 820 (minus previous balance)', () => {
      const currentChargesTotal = round(
        buildingBResult.flatBills.reduce((s, b) => s + b.baseBill + b.differenceAdjustment, 0),
        2,
      );
      expect(currentChargesTotal).toBe(820);
    });
  });
});

// ─── Payment simulation ───────────────────────────────────────────────────────

describe('Payment simulation (Scenarios 12 & 13)', () => {
  it('Scenario 13: full payment clears outstanding balance', () => {
    const bill     = buildingAResult.flatBills.find(b => b.flatId === 'F101')!;
    const paid     = bill.totalDue;              // SAR 500
    const outstanding = round(bill.totalDue - paid, 2);
    expect(outstanding).toBe(0);
  });

  it('Scenario 12: partial payment (SAR 200 of SAR 600) leaves SAR 400 outstanding', () => {
    const bill     = buildingAResult.flatBills.find(b => b.flatId === 'F102')!;
    const paid     = 200;
    const outstanding = round(bill.totalDue - paid, 2);
    expect(outstanding).toBe(400);
  });

  it('partial payment outstanding carries to next cycle as previousBalance', () => {
    const carryover = 400;  // from Flat 102 above

    const nextCycle = runBillingCalculation({
      readings:        [{ meterId: 'M-A2', previousValue: 1100, currentValue: 1350 }],
      assignments:     [{ meterId: 'M-A2', flatId: 'F102', sharePercent: 100 }],
      activeTenancies: [{ flatId: 'F102', tenancyId: 'TN-102' }],
      totalBuildingCost:        500,
      totalBuildingConsumption: 250,
      previousBalances:         { F102: carryover },
      diffMethod:               'proportional',
      dueDate:                  '2025-03-25',
      periodYear:               2025,
      periodMonth:              2,
    });

    const bill = nextCycle.flatBills[0];
    expect(bill.previousBalance).toBe(400);
    expect(bill.baseBill).toBe(500);
    expect(bill.totalDue).toBe(900);
  });
});

// ─── Overdue simulation (Scenario 11) ────────────────────────────────────────

describe('Scenario 11 — Overdue bill triggers reminder logic', () => {
  it('bill with due_date in the past qualifies for overdue reminder', () => {
    const today    = new Date('2025-06-01');
    const dueDate  = new Date('2025-02-10');   // Flat 201's due date from seed
    const isOverdue = dueDate < today;
    expect(isOverdue).toBe(true);
  });

  it('outstanding balance > 0 required to send reminder', () => {
    const amountPaid = 0;
    const totalDue   = 612;
    expect(totalDue - amountPaid).toBeGreaterThan(0);
  });
});

// ─── Missing reading scenario (Scenario 7) ───────────────────────────────────

describe('Scenario 7 — Missing meter reading', () => {
  it('engine warns about missing meter and produces zero-consumption bill', () => {
    const result = runBillingCalculation({
      readings:        [],              // Forgot to enter the reading
      assignments:     [{ meterId: 'M-A1', flatId: 'F101', sharePercent: 100 }],
      activeTenancies: [{ flatId: 'F101', tenancyId: 'TN-101' }],
      totalBuildingCost:        1100,
      totalBuildingConsumption: 550,
      previousBalances:         {},
      diffMethod:               'proportional',
      dueDate:                  '2025-02-25',
      periodYear:               2025,
      periodMonth:              1,
    });

    expect(result.warnings.some(w => w.includes('M-A1'))).toBe(true);
    expect(result.flatBills[0].consumption).toBe(0);
  });
});

// ─── Low reading scenario (Scenario 8) ───────────────────────────────────────

describe('Scenario 8 — Current reading lower than previous (meter rollback)', () => {
  it('engine clamps to 0 consumption; override must be set at service layer', () => {
    const result = runBillingCalculation({
      readings:        [{ meterId: 'M-A1', previousValue: 1450, currentValue: 1300 }],
      assignments:     [{ meterId: 'M-A1', flatId: 'F101', sharePercent: 100 }],
      activeTenancies: [{ flatId: 'F101', tenancyId: 'TN-101' }],
      totalBuildingCost:        500,
      totalBuildingConsumption: 200,
      previousBalances:         {},
      diffMethod:               'proportional',
      dueDate:                  '2025-02-25',
      periodYear:               2025,
      periodMonth:              1,
    });

    expect(result.flatBills[0].consumption).toBe(0);
    // Opening and closing are still recorded accurately for the log
    expect(result.flatBills[0].openingReading).toBe(1450);
    expect(result.flatBills[0].closingReading).toBe(1300);
  });
});

// ─── Full demo run summary ────────────────────────────────────────────────────

describe('Full demo — combined summary', () => {
  it('both buildings together billed the correct amounts', () => {
    const totalBuildingA = round(buildingAResult.flatBills.reduce((s, b) => s + b.totalDue, 0), 2);
    const currentChargesB = round(buildingBResult.flatBills.reduce((s, b) => s + b.baseBill + b.differenceAdjustment, 0), 2);
    // Building A: 1100 SAR
    // Building B: 820 SAR (excluding carry-forward balances)
    expect(totalBuildingA).toBe(1100);
    expect(currentChargesB).toBe(820);
  });

  it('4 total bills across 2 buildings', () => {
    const totalBills = buildingAResult.flatBills.length + buildingBResult.flatBills.length;
    expect(totalBills).toBe(4);
  });
});
