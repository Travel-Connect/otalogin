import { z } from 'zod';

export const AccountTypeSchema = z.enum(['shared', 'override']);

export const FacilityAccountSchema = z.object({
  id: z.string().uuid(),
  facility_id: z.string().uuid(),
  channel_id: z.string().uuid(),
  account_type: AccountTypeSchema,
  login_id: z.string().min(1).max(200),
  password: z.string().min(1).max(500), // 暗号化された状態
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
});

export const CreateAccountSchema = z.object({
  facility_id: z.string().uuid(),
  channel_id: z.string().uuid(),
  account_type: AccountTypeSchema,
  login_id: z.string().min(1).max(200),
  password: z.string().min(1).max(200), // 平文（APIで暗号化）
  extra_fields: z.record(z.string(), z.string()).optional(),
});

export const UpdateAccountSchema = z.object({
  login_id: z.string().min(1).max(200).optional(),
  password: z.string().min(1).max(200).optional(),
  extra_fields: z.record(z.string(), z.string()).optional(),
});

export type CreateAccountInput = z.infer<typeof CreateAccountSchema>;
export type UpdateAccountInput = z.infer<typeof UpdateAccountSchema>;
