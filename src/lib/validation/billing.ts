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

export type CycleInput       = z.infer<typeof cycleSchema>;
export type CycleStatusInput = z.infer<typeof cycleStatusSchema>;
export type MeterReadingInput = z.infer<typeof meterReadingSchema>;
export type BulkReadingsInput = z.infer<typeof bulkReadingsSchema>;
export type CycleInputRaw    = z.input<typeof cycleSchema>;
