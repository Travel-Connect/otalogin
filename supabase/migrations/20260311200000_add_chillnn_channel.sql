-- チルン (CHILLNN) チャネルを追加
INSERT INTO channels (code, name, login_url, category)
VALUES ('chillnn', 'CHILLNN', 'https://admin.chillnn.com/auth/signin', 'OTA')
ON CONFLICT (code) DO NOTHING;
