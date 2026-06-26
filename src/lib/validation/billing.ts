import { z } from 'zod';

export const cycleSchema = z.object({
  building_id: z.string().uuid('Invalid building'),
  period_year:  z.coerce.number().int().min(2020).max(2100),
  period_month: z.coerce.number().int().min(1).max(12),
  notes: z.string().max(1000).optional().nullable(),
});

export const cycleStatusSchema = z.object({
  status: z.enum(['draft', 'readings_collected', 'bills_imported', 'calculated', 'issued', 'closed']),
  notes: z.string().max(1000).optional().nullable(),
});

export const meterReadingSchema = z.object({
  meter_id:             z.string().uuid('Invalid meter'),
  cycle_id:             z.string().uuid('Invalid cycle').optional().nullable(),
  reading_value:        z.coerce.number().min(0, 'Reading must be 0 or greater'),
  reading_date:         z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date (YYYY-MM-DD)'),
  billing_period_year:  z.coerce.number().int().min(2020).max(2100),
  billing_period_month: z.coerce.number().int().min(1).max(12),
  reading_type:         z.enum(['actual', 'estimated', 'opening']).default('actual'),
  override_reason:      z.string().max(500).optional().nullable(),
  notes:                z.string().max(1000).optional().nullable(),
});

export const bulkReadingsSchema = z.object({
  cycle_id:    z.string().uuid(),
  building_id: z.string().uuid(),
  readings:    z.array(meterReadingSchema),
});

export const companyBillSchema = z.object({
  building_id:                z.string().uuid('Invalid building'),
  cycle_id:                   z.string().uuid('Invalid cycle').optional().nullable(),
  bill_number:                z.string().min(1, 'Bill reference is required').max(100),
  electricity_account_number: z.string().max(100).optional().nullable(),
  total_amount:               z.coerce.number().gt(0, 'Bill amount must be greater than zero'),
  // Lump-sum bills (billed_to_flat_id set) bypass consumption math, so total_units is not
  // meaningful for them — only consumption-priced bills require it to be greater than zero.
  total_units:                z.coerce.number().gte(0, 'Bill consumption must be 0 or greater'),
  bill_issue_date:            z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date').optional().nullable(),
  due_date:                   z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date'),
  period_year:                z.coerce.number().int().min(2020).max(2100),
  period_month:               z.coerce.number().int().min(1).max(12),
  image_url:                  z.string().url().optional().nullable(),
  notes:                      z.string().max(1000).optional().nullable(),
  billed_to_flat_id:          z.string().uuid('Invalid flat').optional().nullable(),
}).refine(
  (data) => data.billed_to_flat_id != null || data.total_units > 0,
  { message: 'Bill consumption must be greater than zero unless billed directly to a flat', path: ['total_units'] },
);

export const paymentSchema = z.object({
  bill_id:        z.string().uuid('Invalid bill'),
  amount:         z.coerce.number().gt(0, 'Amount must be greater than zero'),
  payment_date:   z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD'),
  payment_method: z.enum(['cash', 'bank_transfer', 'stc_pay', 'online', 'other']),
  reference_no:   z.string().max(200).optional().nullable(),
  notes:          z.string().max(1000).optional().nullable(),
  image_url:      z.string().url().optional().nullable(),
});

export type PaymentInput    = z.infer<typeof paymentSchema>;
export type PaymentInputRaw = z.input<typeof paymentSchema>;

export type CompanyBillInput    = z.infer<typeof companyBillSchema>;
export type CompanyBillInputRaw = z.input<typeof companyBillSchema>;

export const flatBillFormulaSchema = z.object({
  flat_id:      z.string().uuid('Invalid flat'),
  meter_id:     z.string().uuid('Invalid meter').optional().nullable(),
  cycle_id:     z.string().uuid('Invalid cycle').optional().nullable(),  // null = persistent, applies to every future cycle
  formula_text: z.string().min(1, 'Formula is required').max(2000),
  formula_target: z.enum([
    'base_bill', 'consumption', 'rate_per_unit', 'adjustment',
    'previous_balance', 'lump_sum', 'total_due',
  ]).default('base_bill'),
});

export type FlatBillFormulaInput = z.infer<typeof flatBillFormulaSchema>;

export type CycleInput       = z.infer<typeof cycleSchema>;
export type CycleStatusInput = z.infer<typeof cycleStatusSchema>;
export type MeterReadingInput = z.infer<typeof meterReadingSchema>;
export type BulkReadingsInput = z.infer<typeof bulkReadingsSchema>;
export type CycleInputRaw    = z.input<typeof cycleSchema>;
