-- ちゅらとくチャネルを追加
INSERT INTO channels (code, name, login_url)
VALUES ('churatoku', 'ちゅらとく', 'https://www.churatoku.net/app_sys/kanri/kanri_login.aspx')
ON CONFLICT (code) DO NOTHING;

-- 長浜ビーチリゾート海音 施設を追加
INSERT INTO facilities (code, name)
VALUES ('kanon', '長浜ビーチリゾート海音')
ON CONFLICT (code) DO NOTHING;
