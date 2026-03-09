-- facility_accounts に施設固有のログインURLを保存するカラムを追加
-- channels.login_url がデフォルトで、facility_accounts.login_url があればそちらを優先する
ALTER TABLE facility_accounts
ADD COLUMN IF NOT EXISTS login_url TEXT;

COMMENT ON COLUMN facility_accounts.login_url IS '施設固有のログインURL（NULLの場合はchannels.login_urlを使用）';
