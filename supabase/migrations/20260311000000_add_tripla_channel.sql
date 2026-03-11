-- tripla チャネルを追加
INSERT INTO channels (code, name, login_url, category)
VALUES ('tripla', 'tripla', 'https://cm.tripla.ai/user/sign-in', 'Systems')
ON CONFLICT (code) DO NOTHING;
