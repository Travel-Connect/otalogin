-- ============================================
-- user_shortcuts テーブル
-- ユーザーごとのショートカット定義（URL発行用）
-- ============================================

CREATE TABLE IF NOT EXISTS user_shortcuts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  facility_id UUID NOT NULL REFERENCES facilities(id) ON DELETE CASCADE,
  channel_id UUID NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  action_type TEXT NOT NULL CHECK (action_type IN ('login', 'public')),
  slot_no INTEGER CHECK (slot_no IS NULL OR (slot_no >= 1 AND slot_no <= 10)),
  enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ユーザーごとにslot_noは一意（NULLは除く）
CREATE UNIQUE INDEX IF NOT EXISTS uq_user_shortcuts_slot
  ON user_shortcuts (user_id, slot_no)
  WHERE slot_no IS NOT NULL;

-- RLS有効化
ALTER TABLE user_shortcuts ENABLE ROW LEVEL SECURITY;

-- ユーザーは自分のショートカットのみ閲覧可能
CREATE POLICY "Users can view own shortcuts"
  ON user_shortcuts FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- ユーザーは自分のショートカットを作成可能
CREATE POLICY "Users can insert own shortcuts"
  ON user_shortcuts FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

-- ユーザーは自分のショートカットを更新可能
CREATE POLICY "Users can update own shortcuts"
  ON user_shortcuts FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid());

-- ユーザーは自分のショートカットを削除可能
CREATE POLICY "Users can delete own shortcuts"
  ON user_shortcuts FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());
