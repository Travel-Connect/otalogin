-- 予約プロ（489pro）チャネルを追加
INSERT INTO channels (code, name, login_url, category)
VALUES ('yoyakupro', '予約プロ', 'https://manage.489pro-x.com/login', 'Systems')
ON CONFLICT (code) DO NOTHING;
