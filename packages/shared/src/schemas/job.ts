import { z } from 'zod';

export const JobTypeSchema = z.enum(['manual_login', 'health_check']);

export const JobStatusSchema = z.enum([
  'pending',
  'in_progress',
  'success',
  'failed',
  'cancelled',
]);

export const AutomationJobSchema = z.object({
  id: z.string().uuid(),
  facility_id: z.string().uuid(),
  channel_id: z.string().uuid(),
  job_type: JobTypeSchema,
  status: JobStatusSchema,
  started_at: z.string().datetime().nullable(),
  completed_at: z.string().datetime().nullable(),
  error_message: z.string().nullable(),
  created_at: z.string().datetime(),
  created_by: z.string().nullable(),
});

export const CreateJobSchema = z.object({
  facility_id: z.string().uuid(),
  channel_id: z.string().uuid(),
  job_type: JobTypeSchema,
});

export const JobResultSchema = z.object({
  job_id: z.string().uuid(),
  status: z.enum(['success', 'failed']),
  error_code: z.string().optional(),
  error_message: z.string().optional(),
  duration_ms: z.number().int().positive().optional(),
});

export type CreateJobInput = z.infer<typeof CreateJobSchema>;
export type JobResultInput = z.infer<typeof JobResultSchema>;
