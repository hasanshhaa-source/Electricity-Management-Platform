import { z } from 'zod';

export const buildingSchema = z.object({
  name: z.string().min(2, 'Building name must be at least 2 characters').max(100),
  address: z.string().min(5, 'Address is required').max(255),
  city: z.string().min(2, 'City is required').max(100),
  country: z.string().min(2, 'Country is required').max(100),
  billing_day: z.coerce.number().int().min(1).max(28),
  currency: z.string().length(3, 'Currency must be 3 characters (e.g. SAR)'),
});

export const flatSchema = z.object({
  building_id: z.string().uuid('Invalid building'),
  flat_number: z.string().min(1, 'Flat number is required').max(20),
  floor: z.coerce.number().int().min(0).max(200).optional().nullable(),
  area_sqm: z.coerce.number().min(0).max(10000).optional().nullable(),
  description: z.string().max(500).optional().nullable(),
  notes: z.string().max(1000).optional().nullable(),
});

export const updateFlatStatusSchema = z.object({
  status: z.enum(['available', 'occupied', 'maintenance', 'inactive']),
});

export type BuildingInput = z.infer<typeof buildingSchema>;
export type BuildingInputRaw = z.input<typeof buildingSchema>;
export type FlatInput = z.infer<typeof flatSchema>;
export type FlatInputRaw = z.input<typeof flatSchema>;
export type UpdateFlatStatusInput = z.infer<typeof updateFlatStatusSchema>;
