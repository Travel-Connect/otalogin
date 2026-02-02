import { z } from 'zod';

export const FacilitySchema = z.object({
  id: z.string().uuid(),
  code: z.string().min(1).max(50),
  name: z.string().min(1).max(200),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
});

export const CreateFacilitySchema = z.object({
  code: z.string().min(1).max(50),
  name: z.string().min(1).max(200),
});

export const UpdateFacilitySchema = z.object({
  code: z.string().min(1).max(50).optional(),
  name: z.string().min(1).max(200).optional(),
});

export type FacilityInput = z.infer<typeof CreateFacilitySchema>;
export type FacilityUpdate = z.infer<typeof UpdateFacilitySchema>;
