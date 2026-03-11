-- ミンパクイン (minpakuin) チャネルを追加
INSERT INTO channels (code, name, login_url, category)
VALUES ('minpakuin', 'ミンパクイン', 'https://connect.minpakuin.jp/host/login', 'Systems')
ON CONFLICT (code) DO NOTHING;
