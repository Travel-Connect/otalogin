-- スカイチケットチャネルを追加
INSERT INTO channels (code, name, login_url)
VALUES ('skyticket', 'スカイチケット', 'https://hotel-hm.skyticket.jp/login')
ON CONFLICT (code) DO NOTHING;
