-- OTAログイン支援ツール RLSポリシー
-- 実行順序: 00002

-- ============================================
-- RLS有効化
-- ============================================
ALTER TABLE facilities ENABLE ROW LEVEL SECURITY;
ALTER TABLE channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE facility_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE account_field_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE account_field_values ENABLE ROW LEVEL SECURITY;
ALTER TABLE automation_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE channel_health_status ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE device_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE pairing_codes ENABLE ROW LEVEL SECURITY;

-- ============================================
-- ヘルパー関数
-- ============================================

-- 認証済みユーザーかどうか
CREATE OR REPLACE FUNCTION is_authenticated()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN auth.uid() IS NOT NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- adminロールかどうか
CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM user_roles
    WHERE user_id = auth.uid() AND role = 'admin'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- facilities ポリシー
-- MVP: 全ユーザーが全施設を閲覧可能
-- ============================================
DROP POLICY IF EXISTS "Authenticated users can view all facilities" ON facilities;
CREATE POLICY "Authenticated users can view all facilities"
  ON facilities FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Admins can insert facilities" ON facilities;
CREATE POLICY "Admins can insert facilities"
  ON facilities FOR INSERT
  TO authenticated
  WITH CHECK (is_admin());

DROP POLICY IF EXISTS "Admins can update facilities" ON facilities;
CREATE POLICY "Admins can update facilities"
  ON facilities FOR UPDATE
  TO authenticated
  USING (is_admin());

DROP POLICY IF EXISTS "Admins can delete facilities" ON facilities;
CREATE POLICY "Admins can delete facilities"
  ON facilities FOR DELETE
  TO authenticated
  USING (is_admin());

-- ============================================
-- channels ポリシー
-- 全ユーザーが閲覧可能
-- ============================================
DROP POLICY IF EXISTS "Anyone can view channels" ON channels;
CREATE POLICY "Anyone can view channels"
  ON channels FOR SELECT
  TO authenticated
  USING (true);

-- ============================================
-- facility_accounts ポリシー
-- 閲覧: 全ユーザー
-- 更新: adminのみ
-- ============================================
DROP POLICY IF EXISTS "Authenticated users can view facility_accounts" ON facility_accounts;
CREATE POLICY "Authenticated users can view facility_accounts"
  ON facility_accounts FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Admins can insert facility_accounts" ON facility_accounts;
CREATE POLICY "Admins can insert facility_accounts"
  ON facility_accounts FOR INSERT
  TO authenticated
  WITH CHECK (is_admin());

DROP POLICY IF EXISTS "Admins can update facility_accounts" ON facility_accounts;
CREATE POLICY "Admins can update facility_accounts"
  ON facility_accounts FOR UPDATE
  TO authenticated
  USING (is_admin());

DROP POLICY IF EXISTS "Admins can delete facility_accounts" ON facility_accounts;
CREATE POLICY "Admins can delete facility_accounts"
  ON facility_accounts FOR DELETE
  TO authenticated
  USING (is_admin());

-- ============================================
-- account_field_definitions ポリシー
-- ============================================
DROP POLICY IF EXISTS "Anyone can view account_field_definitions" ON account_field_definitions;
CREATE POLICY "Anyone can view account_field_definitions"
  ON account_field_definitions FOR SELECT
  TO authenticated
  USING (true);

-- ============================================
-- account_field_values ポリシー
-- ============================================
DROP POLICY IF EXISTS "Authenticated users can view account_field_values" ON account_field_values;
CREATE POLICY "Authenticated users can view account_field_values"
  ON account_field_values FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Admins can manage account_field_values" ON account_field_values;
CREATE POLICY "Admins can manage account_field_values"
  ON account_field_values FOR ALL
  TO authenticated
  USING (is_admin());

-- ============================================
-- automation_jobs ポリシー
-- ============================================
DROP POLICY IF EXISTS "Authenticated users can view automation_jobs" ON automation_jobs;
CREATE POLICY "Authenticated users can view automation_jobs"
  ON automation_jobs FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Authenticated users can create automation_jobs" ON automation_jobs;
CREATE POLICY "Authenticated users can create automation_jobs"
  ON automation_jobs FOR INSERT
  TO authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS "Service role can update automation_jobs" ON automation_jobs;
CREATE POLICY "Service role can update automation_jobs"
  ON automation_jobs FOR UPDATE
  TO authenticated
  USING (true);

-- ============================================
-- channel_health_status ポリシー
-- ============================================
DROP POLICY IF EXISTS "Authenticated users can view channel_health_status" ON channel_health_status;
CREATE POLICY "Authenticated users can view channel_health_status"
  ON channel_health_status FOR SELECT
  TO authenticated
  USING (true);

-- ============================================
-- user_roles ポリシー
-- ============================================
DROP POLICY IF EXISTS "Users can view their own role" ON user_roles;
CREATE POLICY "Users can view their own role"
  ON user_roles FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Admins can view all roles" ON user_roles;
CREATE POLICY "Admins can view all roles"
  ON user_roles FOR SELECT
  TO authenticated
  USING (is_admin());

-- ============================================
-- device_tokens ポリシー
-- サービスロールのみアクセス可能
-- ============================================
-- device_tokens はサービスロールからのみアクセス
-- RLSは有効だが、ポリシーを追加しないことで通常ユーザーからのアクセスを拒否

-- ============================================
-- pairing_codes ポリシー
-- サービスロールのみアクセス可能
-- ============================================
-- pairing_codes もサービスロールからのみアクセス
