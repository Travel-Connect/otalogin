-- るるぶ（JTB）チャネルを追加
INSERT INTO channels (code, name, login_url)
VALUES ('rurubu', 'るるぶ', 'https://pics.jtb.co.jp/mldc/ja-jp/public/login')
ON CONFLICT (code) DO NOTHING;
