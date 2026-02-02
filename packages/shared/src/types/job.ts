export interface AutomationJob {
  id: string;
  facility_id: string;
  channel_id: string;
  job_type: JobType;
  status: JobStatus;
  started_at: string | null;
  completed_at: string | null;
  error_message: string | null;
  created_at: string;
  created_by: string | null; // user_id or 'system' for health check
}

export type JobType = 'manual_login' | 'health_check';

export type JobStatus = 'pending' | 'in_progress' | 'success' | 'failed' | 'cancelled';

export interface JobResult {
  job_id: string;
  status: 'success' | 'failed';
  error_code?: string;
  error_message?: string;
  duration_ms?: number;
}
