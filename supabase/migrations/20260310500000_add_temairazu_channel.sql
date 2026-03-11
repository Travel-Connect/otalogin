-- 手間いらず（temairazu/moana）チャネルを追加
-- ログインURLは施設ごとに異なるためF列から取得（デフォルトURLを設定）
INSERT INTO channels (code, name, login_url)
VALUES ('temairazu', '手間いらず', 'https://sv50.temairazu.net/login')
ON CONFLICT (code) DO NOTHING;
