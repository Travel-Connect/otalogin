-- OTAログイン支援ツール 初期スキーマ
-- 実行順序: 00001

-- UUID拡張を有効化
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- facilities: 施設テーブル
-- ============================================
CREATE TABLE IF NOT EXISTS facilities (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  code VARCHAR(50) NOT NULL UNIQUE,
  name VARCHAR(200) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_facilities_code ON facilities(code);

-- ============================================
-- channels: OTAチャネル定義テーブル
-- ============================================
CREATE TABLE IF NOT EXISTS channels (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  code VARCHAR(50) NOT NULL UNIQUE,
  name VARCHAR(100) NOT NULL,
  login_url TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 初期データ挿入
INSERT INTO channels (code, name, login_url) VALUES
  ('rakuten', '楽天トラベル', 'https://hotel.travel.rakuten.co.jp/extranet/login'),
  ('jalan', 'じゃらん', 'https://www.jalan.net/jalan/doc/howto/innkanri/'),
  ('neppan', 'ねっぱん', 'https://asp.hotel-story.ne.jp/ver3/ASPU0201.asp')
ON CONFLICT (code) DO NOTHING;

-- ============================================
-- facility_accounts: 施設アカウント情報テーブル
-- ============================================
CREATE TABLE IF NOT EXISTS facility_accounts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  facility_id UUID NOT NULL REFERENCES facilities(id) ON DELETE CASCADE,
  channel_id UUID NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  account_type VARCHAR(20) NOT NULL CHECK (account_type IN ('shared', 'override')),
  login_id VARCHAR(200) NOT NULL,
  password TEXT NOT NULL, -- 暗号化された状態で保存
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (facility_id, channel_id, account_type)
);

CREATE INDEX idx_facility_accounts_facility ON facility_accounts(facility_id);
CREATE INDEX idx_facility_accounts_channel ON facility_accounts(channel_id);

-- ============================================
-- account_field_definitions: 追加フィールド定義テーブル
-- ============================================
CREATE TABLE IF NOT EXISTS account_field_definitions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  channel_id UUID NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  field_key VARCHAR(50) NOT NULL,
  field_label VARCHAR(100) NOT NULL,
  field_type VARCHAR(20) NOT NULL CHECK (field_type IN ('text', 'password', 'select')),
  is_required BOOLEAN NOT NULL DEFAULT FALSE,
  options JSONB, -- selectの場合の選択肢
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (channel_id, field_key)
);

-- ねっぱんの施設IDフィールド
INSERT INTO account_field_definitions (channel_id, field_key, field_label, field_type, is_required, display_order)
SELECT id, 'hotel_id', '施設ID', 'text', true, 1
FROM channels WHERE code = 'neppan'
ON CONFLICT (channel_id, field_key) DO NOTHING;

-- ============================================
-- account_field_values: 追加フィールド値テーブル
-- ============================================
CREATE TABLE IF NOT EXISTS account_field_values (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  facility_account_id UUID NOT NULL REFERENCES facility_accounts(id) ON DELETE CASCADE,
  field_definition_id UUID NOT NULL REFERENCES account_field_definitions(id) ON DELETE CASCADE,
  value TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (facility_account_id, field_definition_id)
);

-- ============================================
-- automation_jobs: 自動化ジョブテーブル
-- ============================================
CREATE TABLE IF NOT EXISTS automation_jobs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  facility_id UUID NOT NULL REFERENCES facilities(id) ON DELETE CASCADE,
  channel_id UUID NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  job_type VARCHAR(20) NOT NULL CHECK (job_type IN ('manual_login', 'health_check')),
  status VARCHAR(20) NOT NULL CHECK (status IN ('pending', 'in_progress', 'success', 'failed', 'cancelled')) DEFAULT 'pending',
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID -- ユーザーIDまたは'system'をNULLで表現
);

CREATE INDEX idx_automation_jobs_facility ON automation_jobs(facility_id);
CREATE INDEX idx_automation_jobs_status ON automation_jobs(status);
CREATE INDEX idx_automation_jobs_created ON automation_jobs(created_at DESC);

-- ============================================
-- channel_health_status: チャネルヘルスステータステーブル
-- ============================================
CREATE TABLE IF NOT EXISTS channel_health_status (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  facility_id UUID NOT NULL REFERENCES facilities(id) ON DELETE CASCADE,
  channel_id UUID NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  status VARCHAR(20) NOT NULL CHECK (status IN ('healthy', 'unhealthy')) DEFAULT 'unhealthy',
  last_success_at TIMESTAMPTZ,
  last_error_at TIMESTAMPTZ,
  last_error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (facility_id, channel_id)
);

CREATE INDEX idx_channel_health_status_facility ON channel_health_status(facility_id);

-- ============================================
-- user_roles: ユーザー権限テーブル
-- ============================================
CREATE TABLE IF NOT EXISTS user_roles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role VARCHAR(20) NOT NULL CHECK (role IN ('admin', 'user')) DEFAULT 'user',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id)
);

-- ============================================
-- device_tokens: デバイストークンテーブル
-- ============================================
CREATE TABLE IF NOT EXISTS device_tokens (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  token TEXT NOT NULL UNIQUE,
  device_name VARCHAR(100) NOT NULL,
  last_used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================
-- pairing_codes: ペアリングコードテーブル
-- ============================================
CREATE TABLE IF NOT EXISTS pairing_codes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  code VARCHAR(6) NOT NULL UNIQUE,
  used BOOLEAN NOT NULL DEFAULT FALSE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_pairing_codes_code ON pairing_codes(code) WHERE NOT used;

-- ============================================
-- 更新日時自動更新トリガー
-- ============================================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tr_facilities_updated_at
  BEFORE UPDATE ON facilities
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER tr_channels_updated_at
  BEFORE UPDATE ON channels
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER tr_facility_accounts_updated_at
  BEFORE UPDATE ON facility_accounts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER tr_account_field_definitions_updated_at
  BEFORE UPDATE ON account_field_definitions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER tr_account_field_values_updated_at
  BEFORE UPDATE ON account_field_values
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER tr_channel_health_status_updated_at
  BEFORE UPDATE ON channel_health_status
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER tr_user_roles_updated_at
  BEFORE UPDATE ON user_roles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
