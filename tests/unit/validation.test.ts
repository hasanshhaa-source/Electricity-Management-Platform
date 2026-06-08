/**
 * Unit tests for Zod validation schemas used across the billing pipeline.
 */
import { describe, it, expect } from 'vitest';
import { meterReadingSchema, companyBillSchema, paymentSchema } from '@/lib/validation/billing';
import { allocationsSetSchema } from '@/lib/validation/meter';

// ─── meterReadingSchema ───────────────────────────────────────────────────────

describe('meterReadingSchema', () => {
  const valid = {
    meter_id:             '550e8400-e29b-41d4-a716-446655440001',
    reading_value:        150,
    reading_date:         '2025-01-31',
    billing_period_year:  2025,
    billing_period_month: 1,
    reading_type:         'actual' as const,
  };

  it('accepts a valid reading', () => {
    expect(meterReadingSchema.safeParse(valid).success).toBe(true);
  });

  it('rejects negative reading_value', () => {
    const r = meterReadingSchema.safeParse({ ...valid, reading_value: -1 });
    expect(r.success).toBe(false);
  });

  it('rejects invalid reading_date format', () => {
    const r = meterReadingSchema.safeParse({ ...valid, reading_date: '31/01/2025' });
    expect(r.success).toBe(false);
  });

  it('rejects month < 1 or > 12', () => {
    expect(meterReadingSchema.safeParse({ ...valid, billing_period_month: 0 }).success).toBe(false);
    expect(meterReadingSchema.safeParse({ ...valid, billing_period_month: 13 }).success).toBe(false);
  });

  it('rejects year below 2020', () => {
    expect(meterReadingSchema.safeParse({ ...valid, billing_period_year: 2019 }).success).toBe(false);
  });
});

// ─── allocationsSetSchema ─────────────────────────────────────────────────────

describe('allocationsSetSchema', () => {
  const flat1 = '550e8400-e29b-41d4-a716-446655440011';
  const flat2 = '550e8400-e29b-41d4-a716-446655440012';

  const valid = {
    allocations: [
      { flat_id: flat1, share_percent: 60, effective_from: '2025-01-01' },
      { flat_id: flat2, share_percent: 40, effective_from: '2025-01-01' },
    ],
  };

  it('accepts 60/40 split summing to 100', () => {
    expect(allocationsSetSchema.safeParse(valid).success).toBe(true);
  });

  it('rejects allocations that do not sum to 100', () => {
    const r = allocationsSetSchema.safeParse({
      allocations: [
        { flat_id: flat1, share_percent: 50, effective_from: '2025-01-01' },
        { flat_id: flat2, share_percent: 30, effective_from: '2025-01-01' },
      ],
    });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues[0].message).toMatch(/100%/);
    }
  });

  it('rejects duplicate flat_ids', () => {
    const r = allocationsSetSchema.safeParse({
      allocations: [
        { flat_id: flat1, share_percent: 50, effective_from: '2025-01-01' },
        { flat_id: flat1, share_percent: 50, effective_from: '2025-01-01' },
      ],
    });
    expect(r.success).toBe(false);
  });

  it('rejects share_percent of 0', () => {
    const r = allocationsSetSchema.safeParse({
      allocations: [
        { flat_id: flat1, share_percent: 0, effective_from: '2025-01-01' },
        { flat_id: flat2, share_percent: 100, effective_from: '2025-01-01' },
      ],
    });
    expect(r.success).toBe(false);
  });

  it('accepts 50/50 split with tolerance check', () => {
    // 0.01 tolerance: 50.005 + 49.995 = 100.000
    const r = allocationsSetSchema.safeParse({
      allocations: [
        { flat_id: flat1, share_percent: 50.005, effective_from: '2025-01-01' },
        { flat_id: flat2, share_percent: 49.995, effective_from: '2025-01-01' },
      ],
    });
    expect(r.success).toBe(true);
  });
});

// ─── companyBillSchema ────────────────────────────────────────────────────────

describe('companyBillSchema', () => {
  const valid = {
    building_id:   '550e8400-e29b-41d4-a716-446655440021',
    bill_number:   'BILL-2025-001',
    total_amount:  1500,
    total_units:   750,
    due_date:      '2025-02-15',
    period_year:   2025,
    period_month:  1,
  };

  it('accepts a valid company bill', () => {
    expect(companyBillSchema.safeParse(valid).success).toBe(true);
  });

  it('rejects zero total_amount', () => {
    expect(companyBillSchema.safeParse({ ...valid, total_amount: 0 }).success).toBe(false);
  });

  it('rejects negative total_units', () => {
    expect(companyBillSchema.safeParse({ ...valid, total_units: -1 }).success).toBe(false);
  });

  it('rejects empty bill_number', () => {
    expect(companyBillSchema.safeParse({ ...valid, bill_number: '' }).success).toBe(false);
  });
});

// ─── paymentSchema ────────────────────────────────────────────────────────────

describe('paymentSchema', () => {
  const valid = {
    bill_id:        '550e8400-e29b-41d4-a716-446655440031',
    amount:         300,
    payment_date:   '2025-02-01',
    payment_method: 'bank_transfer' as const,
  };

  it('accepts a valid payment', () => {
    expect(paymentSchema.safeParse(valid).success).toBe(true);
  });

  it('rejects zero amount', () => {
    expect(paymentSchema.safeParse({ ...valid, amount: 0 }).success).toBe(false);
  });

  it('rejects negative amount', () => {
    expect(paymentSchema.safeParse({ ...valid, amount: -50 }).success).toBe(false);
  });

  it('rejects invalid payment_method', () => {
    expect(paymentSchema.safeParse({ ...valid, payment_method: 'crypto' }).success).toBe(false);
  });

  it('rejects invalid date format', () => {
    expect(paymentSchema.safeParse({ ...valid, payment_date: '2025/02/01' }).success).toBe(false);
  });
});
