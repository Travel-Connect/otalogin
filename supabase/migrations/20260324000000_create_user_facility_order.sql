-- ユーザーごとの施設表示順序
CREATE TABLE IF NOT EXISTS user_facility_order (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  facility_id uuid NOT NULL REFERENCES facilities(id) ON DELETE CASCADE,
  position integer NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (user_id, facility_id)
);

-- インデックス: ユーザーの並び順を高速取得
CREATE INDEX idx_user_facility_order_user ON user_facility_order (user_id, position);

-- RLS有効化
ALTER TABLE user_facility_order ENABLE ROW LEVEL SECURITY;

-- ユーザーは自分の行のみ操作可能
CREATE POLICY "Users can view own facility order"
  ON user_facility_order FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own facility order"
  ON user_facility_order FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own facility order"
  ON user_facility_order FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own facility order"
  ON user_facility_order FOR DELETE
  USING (auth.uid() = user_id);
