-- チャネルロゴURL カラム追加
ALTER TABLE channels ADD COLUMN IF NOT EXISTS logo_url TEXT;

-- チャネルロゴ用 Storage バケット作成
INSERT INTO storage.buckets (id, name, public)
VALUES ('channel-logos', 'channel-logos', true)
ON CONFLICT (id) DO NOTHING;

-- 公開読み取り
CREATE POLICY "Public read channel logos" ON storage.objects
  FOR SELECT USING (bucket_id = 'channel-logos');

-- 認証済みユーザーのアップロード
CREATE POLICY "Auth upload channel logos" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'channel-logos');

-- 認証済みユーザーの上書き
CREATE POLICY "Auth update channel logos" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'channel-logos');

-- 認証済みユーザーの削除
CREATE POLICY "Auth delete channel logos" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'channel-logos');
