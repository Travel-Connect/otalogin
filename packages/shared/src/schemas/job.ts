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

// エラー分類
export const ErrorCodeSchema = z.enum([
  'AUTH_FAILED',      // ログイン認証失敗
  'UI_CHANGED',       // ページ構造変更検出
  'TIMEOUT',          // タイムアウト
  'NETWORK_ERROR',    // ネットワークエラー
  'AGENT_OFFLINE',    // 拡張オフライン
  'UNKNOWN',          // 不明なエラー
]);

export const JobResultSchema = z.object({
  job_id: z.string().uuid(),
  status: z.enum(['success', 'failed']),
  error_code: ErrorCodeSchema.optional(),
  error_message: z.string().optional(),
  duration_ms: z.number().int().positive().optional(),
});

export type ErrorCode = z.infer<typeof ErrorCodeSchema>;

export type CreateJobInput = z.infer<typeof CreateJobSchema>;
export type JobResultInput = z.infer<typeof JobResultSchema>;
