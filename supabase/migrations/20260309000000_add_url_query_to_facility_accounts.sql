-- facility_accounts に公開ページ/管理画面のURLクエリパラメータを追加
-- JSON形式で保存（例: {"hotelId": "12345", "lang": "ja"}）
ALTER TABLE facility_accounts
  ADD COLUMN IF NOT EXISTS public_url_query JSONB DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS admin_url_query JSONB DEFAULT NULL;

COMMENT ON COLUMN facility_accounts.public_url_query IS '公開ページURLのクエリパラメータ（JSON）';
COMMENT ON COLUMN facility_accounts.admin_url_query IS '管理画面URLのクエリパラメータ（JSON）';
