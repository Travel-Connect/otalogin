-- Booking.com チャネル追加（リンク専用・海外OTA）
INSERT INTO channels (code, name, login_url, category)
VALUES ('booking', 'Booking.com', '', 'OTA')
ON CONFLICT (code) DO NOTHING;
