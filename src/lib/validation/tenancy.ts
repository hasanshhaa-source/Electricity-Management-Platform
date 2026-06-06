import { z } from 'zod';

export const tenancyRequestSchema = z.object({
  flat_id: z.string().uuid('Please select a valid flat'),
});

export const tenancyApproveSchema = z.object({
  tenancy_id: z.string().uuid(),
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date format (YYYY-MM-DD)'),
  notes: z.string().max(500).optional(),
});

export const tenancyRejectSchema = z.object({
  tenancy_id: z.string().uuid(),
  notes: z.string().min(5, 'Please provide a reason for rejection').max(500),
});

export type TenancyRequestInput = z.infer<typeof tenancyRequestSchema>;
export type TenancyApproveInput = z.infer<typeof tenancyApproveSchema>;
export type TenancyRejectInput = z.infer<typeof tenancyRejectSchema>;
