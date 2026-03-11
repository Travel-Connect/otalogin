-- DYNA IBEチャネルを追加
INSERT INTO channels (code, name, login_url)
VALUES ('dynaibe', 'DYNA IBE', 'https://d-reserve.jp/hotel-facility-front/HMEM001F00100/HMEM001A01')
ON CONFLICT (code) DO NOTHING;
