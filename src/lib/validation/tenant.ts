import { z } from 'zod';

export const tenantProfileSchema = z.object({
  full_name: z.string().min(2, 'Full name is required').max(100),
  email: z.string().email('Invalid email'),
  phone: z.string().max(30).optional().nullable(),
  national_id: z.string().max(50).optional().nullable(),
  is_active: z.boolean().default(true),
});

export const createTenantSchema = tenantProfileSchema.extend({
  password: z.string().min(8, 'Password must be at least 8 characters'),
});

export const assignFlatSchema = z.object({
  user_id: z.string().uuid(),
  flat_id: z.string().uuid('Please select a valid flat'),
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date (YYYY-MM-DD)'),
  notes: z.string().max(500).optional(),
});

export const endTenancySchema = z.object({
  end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date (YYYY-MM-DD)'),
  notes: z.string().max(500).optional(),
});

export type TenantProfileInput = z.infer<typeof tenantProfileSchema>;
export type CreateTenantInput = z.infer<typeof createTenantSchema>;
export type AssignFlatInput = z.infer<typeof assignFlatSchema>;
export type EndTenancyInput = z.infer<typeof endTenancySchema>;
