-- OTSチャネルを追加
INSERT INTO channels (code, name, login_url)
VALUES ('ots', 'OTS', 'https://www.otsinternational.jp/hotel/admin/')
ON CONFLICT (code) DO NOTHING;
