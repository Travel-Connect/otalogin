-- ねっぱんのパスワードローテーション履歴を格納するテーブル
-- neppan-password-rotator が実行成功時に upsert する
-- rotate-due はこの last_rotated_at を見て 30 日経過施設を判定する

CREATE TABLE IF NOT EXISTS neppan_password_rotations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  facility_id UUID NOT NULL REFERENCES facilities(id) ON DELETE CASCADE,
  last_rotated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  rotation_count INTEGER NOT NULL DEFAULT 0,    -- これまでの累計実行回数
  last_status TEXT NOT NULL CHECK (last_status IN ('success', 'failed', 'in_progress')),
  last_error TEXT,                              -- 失敗時のエラー内容
  last_log_path TEXT,                           -- 詳細 JSONL ログのパス（運用時の手動復旧用）
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (facility_id)                          -- 施設ごとに1レコード（upsert用）
);

-- インデックス: rotate-due 判定用
CREATE INDEX IF NOT EXISTS idx_neppan_password_rotations_facility
  ON neppan_password_rotations(facility_id);

CREATE INDEX IF NOT EXISTS idx_neppan_password_rotations_last_rotated_at
  ON neppan_password_rotations(last_rotated_at);

-- updated_at 自動更新トリガ
CREATE OR REPLACE FUNCTION set_neppan_password_rotations_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_neppan_password_rotations_updated_at ON neppan_password_rotations;
CREATE TRIGGER trg_neppan_password_rotations_updated_at
  BEFORE UPDATE ON neppan_password_rotations
  FOR EACH ROW
  EXECUTE FUNCTION set_neppan_password_rotations_updated_at();

-- RLS
ALTER TABLE neppan_password_rotations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can view neppan_password_rotations" ON neppan_password_rotations;
CREATE POLICY "Authenticated users can view neppan_password_rotations"
  ON neppan_password_rotations FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Service role can manage neppan_password_rotations" ON neppan_password_rotations;
CREATE POLICY "Service role can manage neppan_password_rotations"
  ON neppan_password_rotations FOR ALL
  TO service_role
  USING (true);
