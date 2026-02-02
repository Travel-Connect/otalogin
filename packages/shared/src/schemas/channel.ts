import { z } from 'zod';

export const ChannelCodeSchema = z.enum(['rakuten', 'jalan', 'neppan']);

export const ChannelSchema = z.object({
  id: z.string().uuid(),
  code: ChannelCodeSchema,
  name: z.string().min(1).max(100),
  login_url: z.string().url(),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
});

export const ChannelHealthStatusSchema = z.object({
  id: z.string().uuid(),
  facility_id: z.string().uuid(),
  channel_id: z.string().uuid(),
  status: z.enum(['healthy', 'unhealthy']),
  last_success_at: z.string().datetime().nullable(),
  last_error_at: z.string().datetime().nullable(),
  last_error_message: z.string().nullable(),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
});
