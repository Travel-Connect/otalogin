-- ユーザー別クレデンシャル対応（リンカーン用）
-- facility_accounts に user_email カラムを追加

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'facility_accounts'
    AND column_name = 'user_email'
  ) THEN
    ALTER TABLE facility_accounts
    ADD COLUMN user_email TEXT;

    COMMENT ON COLUMN facility_accounts.user_email IS
      'ユーザー別クレデンシャル用メールアドレス。NULLの場合は共有クレデンシャル。';
  END IF;
END
$$;

-- 既存のユニーク制約を削除し、部分ユニークインデックスで置換
-- （user_email IS NULL の場合とIS NOT NULL の場合を別々に管理）

-- 既存制約の削除（存在する場合のみ）
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'facility_accounts_facility_id_channel_id_account_type_key'
    AND table_name = 'facility_accounts'
  ) THEN
    ALTER TABLE facility_accounts
    DROP CONSTRAINT facility_accounts_facility_id_channel_id_account_type_key;
  END IF;
END
$$;

-- 共有クレデンシャル用ユニークインデックス（user_email IS NULL）
CREATE UNIQUE INDEX IF NOT EXISTS uq_facility_accounts_shared
ON facility_accounts (facility_id, channel_id, account_type)
WHERE user_email IS NULL;

-- ユーザー別クレデンシャル用ユニークインデックス（user_email IS NOT NULL）
CREATE UNIQUE INDEX IF NOT EXISTS uq_facility_accounts_per_user
ON facility_accounts (facility_id, channel_id, account_type, user_email)
WHERE user_email IS NOT NULL;
