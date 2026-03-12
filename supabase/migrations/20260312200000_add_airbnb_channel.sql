-- Airbnb チャネル追加（リンク専用）
INSERT INTO channels (code, name, login_url)
VALUES ('airbnb', 'Airbnb', '')
ON CONFLICT (code) DO NOTHING;
