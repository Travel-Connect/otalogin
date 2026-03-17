-- facility_accounts に health_check_enabled カラムを追加
-- デフォルト true（既存のアカウントはすべてヘルスチェック有効）
ALTER TABLE facility_accounts
ADD COLUMN IF NOT EXISTS health_check_enabled BOOLEAN NOT NULL DEFAULT true;
