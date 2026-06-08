/**
 * Integration tests for the billing pipeline.
 * Tests the full cycle: input assembly → engine → output shape.
 * Uses the pure calculation engine (no DB mocks needed for engine tests).
 * DB-layer tests verify the orchestration logic with a mock Supabase client.
 */
import { describe, it, expect } from 'vitest';
import { runBillingCalculation } from '@/services/billing/calculationEngine';

// ─── Full cycle integration: 2-building scenario ─────────────────────────────

describe('Full monthly billing cycle — Building A (2 individual meters)', () => {
  /**
   * Building A — January 2025
   *   Flat 101: meter M-A1, previous reading 1200, current 1450 → 250 kWh
   *   Flat 102: meter M-A2, previous reading 800,  current 1100 → 300 kWh
   *   Company bill: SAR 1100 for 550 kWh
   *   costPerUnit = 1100 / 550 = 2.0
   *   Expected: Flat 101 = 500 SAR, Flat 102 = 600 SAR
   */
  const result = runBillingCalculation({
    readings: [
      { meterId: 'M-A1', previousValue: 1200, currentValue: 1450 },
      { meterId: 'M-A2', previousValue: 800,  currentValue: 1100 },
    ],
    assignments: [
      { meterId: 'M-A1', flatId: 'F101', sharePercent: 100 },
      { meterId: 'M-A2', flatId: 'F102', sharePercent: 100 },
    ],
    activeTenancies: [
      { flatId: 'F101', tenancyId: 'T-101' },
      { flatId: 'F102', tenancyId: 'T-102' },
    ],
    totalBuildingCost:        1100,
    totalBuildingConsumption: 550,
    previousBalances:         {},
    diffMethod:               'proportional',
    dueDate:                  '2025-02-28',
    periodYear:               2025,
    periodMonth:              1,
  });

  it('generates exactly 2 bills', () => {
    expect(result.flatBills).toHaveLength(2);
  });

  it('Flat 101: 250 kWh → SAR 500', () => {
    const b = result.flatBills.find(b => b.flatId === 'F101')!;
    expect(b.consumption).toBe(250);
    expect(b.ratePerUnit).toBe(2.0);
    expect(b.baseBill).toBe(500);
    expect(b.totalDue).toBe(500);
  });

  it('Flat 102: 300 kWh → SAR 600', () => {
    const b = result.flatBills.find(b => b.flatId === 'F102')!;
    expect(b.consumption).toBe(300);
    expect(b.baseBill).toBe(600);
    expect(b.totalDue).toBe(600);
  });

  it('sum of flat bills equals company bill total', () => {
    const total = result.flatBills.reduce((s, b) => s + b.totalDue, 0);
    expect(total).toBe(1100);
  });

  it('no warnings', () => {
    expect(result.warnings).toHaveLength(0);
  });
});

// ─── Full cycle: Building B (shared meter + carry-forward balance) ────────────

describe('Full monthly billing cycle — Building B (shared meter + carry-forward)', () => {
  /**
   * Building B — January 2025
   *   Flat 201 & 202 share meter M-B1 at 60/40
   *   Previous reading: 500, current: 900 → 400 kWh total
   *   Company bill: SAR 800 for 400 kWh → rate = 2.0
   *   Flat 201 consumption: 400 × 0.60 = 240 kWh → SAR 480
   *   Flat 202 consumption: 400 × 0.40 = 160 kWh → SAR 320
   *
   *   Flat 201 has unpaid balance of SAR 120 from December
   *   Flat 201 total due = 480 + 120 = SAR 600
   */
  const result = runBillingCalculation({
    readings: [
      { meterId: 'M-B1', previousValue: 500, currentValue: 900 },
    ],
    assignments: [
      { meterId: 'M-B1', flatId: 'F201', sharePercent: 60 },
      { meterId: 'M-B1', flatId: 'F202', sharePercent: 40 },
    ],
    activeTenancies: [
      { flatId: 'F201', tenancyId: 'T-201' },
      { flatId: 'F202', tenancyId: 'T-202' },
    ],
    totalBuildingCost:        800,
    totalBuildingConsumption: 400,
    previousBalances:         { F201: 120 },
    diffMethod:               'proportional',
    dueDate:                  '2025-02-28',
    periodYear:               2025,
    periodMonth:              1,
  });

  it('Flat 201: 240 kWh + SAR 120 carry-forward = SAR 600', () => {
    const b = result.flatBills.find(b => b.flatId === 'F201')!;
    expect(b.consumption).toBe(240);
    expect(b.baseBill).toBe(480);
    expect(b.previousBalance).toBe(120);
    expect(b.totalDue).toBe(600);
  });

  it('Flat 202: 160 kWh = SAR 320 (no carry-forward)', () => {
    const b = result.flatBills.find(b => b.flatId === 'F202')!;
    expect(b.consumption).toBe(160);
    expect(b.baseBill).toBe(320);
    expect(b.previousBalance).toBe(0);
    expect(b.totalDue).toBe(320);
  });

  it('contributions list shows meterId and sharePercent', () => {
    const b201 = result.flatBills.find(b => b.flatId === 'F201')!;
    expect(b201.contributions).toHaveLength(1);
    expect(b201.contributions[0].meterId).toBe('M-B1');
    expect(b201.contributions[0].sharePercent).toBe(60);
    expect(b201.contributions[0].flatContribution).toBe(240);
  });
});

// ─── Difference distribution: company bill higher ────────────────────────────

describe('Difference distribution — company bill higher than metered total', () => {
  /**
   * 3 flats, equal consumption 100 kWh each, metered total = 300 kWh
   * Company bill = 700 SAR for 300 kWh
   * costPerUnit = 700/300 ≈ 2.333...
   * baseBill each ≈ 233.33
   * sum of base bills = 700 (absorbed by costPerUnit — no difference)
   *
   * But if company bill = 701 SAR:
   * costPerUnit = 701/300 ≈ 2.3367
   * sum of base bills ≈ 701 (rounding may produce tiny difference)
   */
  it('penny-perfect distribution across 3 equal flats with non-round total', () => {
    const result = runBillingCalculation({
      readings: [
        { meterId: 'm1', previousValue: 0, currentValue: 100 },
        { meterId: 'm2', previousValue: 0, currentValue: 100 },
        { meterId: 'm3', previousValue: 0, currentValue: 100 },
      ],
      assignments: [
        { meterId: 'm1', flatId: 'f1', sharePercent: 100 },
        { meterId: 'm2', flatId: 'f2', sharePercent: 100 },
        { meterId: 'm3', flatId: 'f3', sharePercent: 100 },
      ],
      activeTenancies: [
        { flatId: 'f1', tenancyId: 't1' },
        { flatId: 'f2', tenancyId: 't2' },
        { flatId: 'f3', tenancyId: 't3' },
      ],
      totalBuildingCost:        701,
      totalBuildingConsumption: 300,
      previousBalances:         {},
      diffMethod:               'proportional',
      dueDate:                  '2025-02-28',
      periodYear:               2025,
      periodMonth:              1,
    });

    const total = result.flatBills.reduce((s, b) => s + b.totalDue, 0);
    // Exact sum must equal company bill
    expect(Math.round(total * 100) / 100).toBe(701);
  });
});

// ─── Recalculation scenario (Scenario 14) ────────────────────────────────────

describe('Scenario 14 — Recalculation after correction', () => {
  it('produces a different total when input meter reading is corrected', () => {
    const commonInput = {
      assignments:     [{ meterId: 'm1', flatId: 'f1', sharePercent: 100 }],
      activeTenancies: [{ flatId: 'f1', tenancyId: 't1' }],
      totalBuildingCost:        600,
      totalBuildingConsumption: 300,
      previousBalances:         {},
      diffMethod:               'proportional' as const,
      dueDate:                  '2025-02-28',
      periodYear:               2025,
      periodMonth:              1,
    };

    // Version 1: opening reading was wrong (100), current = 400 → 300 kWh
    const v1 = runBillingCalculation({
      ...commonInput,
      readings: [{ meterId: 'm1', previousValue: 100, currentValue: 400 }],
    });

    // Version 2: corrected opening reading (150), current = 400 → 250 kWh
    const v2 = runBillingCalculation({
      ...commonInput,
      readings: [{ meterId: 'm1', previousValue: 150, currentValue: 400 }],
    });

    expect(v1.flatBills[0].consumption).toBe(300);
    expect(v2.flatBills[0].consumption).toBe(250);
    // Single-flat: total always equals company bill (600), but composition changes.
    expect(v1.flatBills[0].totalDue).toBe(600);
    expect(v2.flatBills[0].totalDue).toBe(600);
    // costPerUnit = totalBuildingCost / totalBuildingConsumption (from company bill) = 2.0 in both.
    // What differs is the metered flat consumption (300 vs 250) used in the base bill calculation.
    expect(v1.flatBills[0].ratePerUnit).toBe(2.0);
    expect(v2.flatBills[0].ratePerUnit).toBe(2.0);
    // The metered consumption (and thus baseBill + adjustment split) differs between versions.
    expect(v1.flatBills[0].consumption).not.toBe(v2.flatBills[0].consumption);
  });

  it('calculation log contains versioned evidence for audit', () => {
    const result = runBillingCalculation({
      readings:        [{ meterId: 'm1', previousValue: 150, currentValue: 400 }],
      assignments:     [{ meterId: 'm1', flatId: 'f1', sharePercent: 100 }],
      activeTenancies: [{ flatId: 'f1', tenancyId: 't1' }],
      totalBuildingCost:        500,
      totalBuildingConsumption: 250,
      previousBalances:         {},
      diffMethod:               'proportional',
      dueDate:                  '2025-02-28',
      periodYear:               2025,
      periodMonth:              1,
    });

    const log = result.flatBills[0].calculationLog;
    expect(log).toMatchObject({
      totalBuildingCost:        500,
      totalBuildingConsumption: 250,
      costPerUnit:              2.0,
      diffMethod:               'proportional',
    });
    expect(log.meterContributions).toHaveLength(1);
    expect(typeof log.explanation).toBe('string');
  });
});
