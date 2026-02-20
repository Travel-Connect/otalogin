-- パスワード暗号化カラム追加
-- 実行順序: 00004
--
-- 移行戦略:
-- 1. password_encrypted カラムを追加（nullable）
-- 2. 書き込みは常に password_encrypted を更新
-- 3. 読み取りは password_encrypted 優先、なければ password を使用
-- 4. 移行完了後に password カラムを削除（別マイグレーション）

-- ============================================
-- facility_accounts: password_encrypted カラム追加
-- ============================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'facility_accounts'
    AND column_name = 'password_encrypted'
  ) THEN
    ALTER TABLE facility_accounts
    ADD COLUMN password_encrypted TEXT;

    COMMENT ON COLUMN facility_accounts.password_encrypted IS
      'AES-256-GCM暗号化パスワード。フォーマット: enc_v1:<iv>:<ciphertext>:<tag>';
  END IF;
END
$$;

-- ============================================
-- password カラムをnullableに変更（移行期間用）
-- ============================================
DO $$
BEGIN
  -- 既存の NOT NULL 制約を外す（まだ暗号化移行が完了していないため）
  ALTER TABLE facility_accounts
  ALTER COLUMN password DROP NOT NULL;
EXCEPTION
  WHEN others THEN
    -- 既に nullable の場合は何もしない
    NULL;
END
$$;

-- ============================================
-- account_field_values: value_encrypted カラム追加
-- パスワードタイプのフィールド値も暗号化対象
-- ============================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'account_field_values'
    AND column_name = 'value_encrypted'
  ) THEN
    ALTER TABLE account_field_values
    ADD COLUMN value_encrypted TEXT;

    COMMENT ON COLUMN account_field_values.value_encrypted IS
      'AES-256-GCM暗号化値（パスワードタイプのフィールド用）';
  END IF;
END
$$;
