-- ねっぱんのパスワード変更経過日数を格納するテーブル
-- 日次ヘルスチェック時にContent Scriptが抽出してAPIに送信する

CREATE TABLE IF NOT EXISTS neppan_password_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  facility_id UUID NOT NULL REFERENCES facilities(id) ON DELETE CASCADE,
  site_name TEXT NOT NULL,          -- OTAサイト名（例: "楽天トラベル", "じゃらんnet"）
  elapsed_text TEXT NOT NULL,       -- 経過日数テキスト（例: "87日経過しました。"）
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (facility_id, site_name)   -- 施設×サイトで一意（upsert用）
);

-- インデックス
CREATE INDEX IF NOT EXISTS idx_neppan_password_alerts_facility
  ON neppan_password_alerts(facility_id);

-- RLS
ALTER TABLE neppan_password_alerts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can view neppan_password_alerts" ON neppan_password_alerts;
CREATE POLICY "Authenticated users can view neppan_password_alerts"
  ON neppan_password_alerts FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Service role can manage neppan_password_alerts" ON neppan_password_alerts;
CREATE POLICY "Service role can manage neppan_password_alerts"
  ON neppan_password_alerts FOR ALL
  TO service_role
  USING (true);
