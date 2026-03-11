-- error_code カラムを追加するマイグレーション
-- 実行順序: 00003

-- ============================================
-- automation_jobs に error_code を追加
-- ============================================
ALTER TABLE automation_jobs
ADD COLUMN IF NOT EXISTS error_code VARCHAR(30);

-- error_code の値に制約を追加
ALTER TABLE automation_jobs
DROP CONSTRAINT IF EXISTS automation_jobs_error_code_check;

ALTER TABLE automation_jobs
ADD CONSTRAINT automation_jobs_error_code_check
CHECK (error_code IS NULL OR error_code IN (
  'AUTH_FAILED',
  'UI_CHANGED',
  'TIMEOUT',
  'NETWORK_ERROR',
  'AGENT_OFFLINE',
  'UNKNOWN'
));

-- ============================================
-- channel_health_status に last_error_code を追加
-- ============================================
ALTER TABLE channel_health_status
ADD COLUMN IF NOT EXISTS last_error_code VARCHAR(30);

-- last_error_code の値に制約を追加
ALTER TABLE channel_health_status
DROP CONSTRAINT IF EXISTS channel_health_status_error_code_check;

ALTER TABLE channel_health_status
ADD CONSTRAINT channel_health_status_error_code_check
CHECK (last_error_code IS NULL OR last_error_code IN (
  'AUTH_FAILED',
  'UI_CHANGED',
  'TIMEOUT',
  'NETWORK_ERROR',
  'AGENT_OFFLINE',
  'UNKNOWN'
));

-- インデックスを追加（error_code による検索を効率化）
CREATE INDEX IF NOT EXISTS idx_automation_jobs_error_code ON automation_jobs(error_code);
CREATE INDEX IF NOT EXISTS idx_channel_health_status_error_code ON channel_health_status(last_error_code);
