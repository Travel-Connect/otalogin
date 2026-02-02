import { z } from 'zod';

export const ExtensionMessageTypeSchema = z.enum([
  'DISPATCH_LOGIN',
  'PING',
  'GET_STATUS',
]);

export const DispatchLoginPayloadSchema = z.object({
  job_id: z.string().uuid(),
  channel_code: z.string(),
  facility_id: z.string().uuid(),
});

export const ExtensionMessageSchema = z.object({
  type: ExtensionMessageTypeSchema,
  payload: z.unknown(),
});

export const ExtensionResponseSchema = z.object({
  success: z.boolean(),
  error: z.string().optional(),
  data: z.unknown().optional(),
});

export const PairingRequestSchema = z.object({
  pairing_code: z.string().length(6),
  device_name: z.string().min(1).max(100),
});

export const PairingResponseSchema = z.object({
  success: z.boolean(),
  device_token: z.string().optional(),
  error: z.string().optional(),
});

export const JobCredentialsSchema = z.object({
  job_id: z.string().uuid(),
  channel_code: z.string(),
  login_url: z.string().url(),
  login_id: z.string(),
  password: z.string(),
  extra_fields: z.record(z.string(), z.string()),
});

export type DispatchLoginPayloadInput = z.infer<typeof DispatchLoginPayloadSchema>;
export type PairingRequestInput = z.infer<typeof PairingRequestSchema>;
