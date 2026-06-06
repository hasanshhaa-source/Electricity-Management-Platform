import { z } from 'zod';

export const meterSchema = z.object({
  building_id: z.string().uuid('Invalid building'),
  meter_number: z.string().min(1, 'Meter number is required').max(50),
  meter_type: z.enum(['individual', 'shared']),
  description: z.string().max(500).optional().nullable(),
  unit: z.string().min(1).max(20).default('kWh'),
});

export const allocationSchema = z.object({
  flat_id: z.string().uuid('Invalid flat'),
  share_percent: z.coerce
    .number()
    .min(0.01, 'Percentage must be greater than 0')
    .max(100, 'Percentage cannot exceed 100'),
  effective_from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date (YYYY-MM-DD)'),
});

export const allocationsSetSchema = z.object({
  allocations: z
    .array(allocationSchema)
    .min(1, 'At least one allocation is required'),
}).superRefine((data, ctx) => {
  const total = data.allocations.reduce((sum, a) => sum + a.share_percent, 0);
  if (Math.abs(total - 100) > 0.01) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `Allocation percentages must sum to 100% (currently ${total.toFixed(2)}%)`,
      path: ['allocations'],
    });
  }
  const flatIds = data.allocations.map((a) => a.flat_id);
  if (new Set(flatIds).size !== flatIds.length) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Each flat can only appear once in the allocation list',
      path: ['allocations'],
    });
  }
});

export type MeterInput = z.infer<typeof meterSchema>;
export type MeterInputRaw = z.input<typeof meterSchema>;
export type AllocationInput = z.infer<typeof allocationSchema>;
export type AllocationsSetInput = z.infer<typeof allocationsSetSchema>;
