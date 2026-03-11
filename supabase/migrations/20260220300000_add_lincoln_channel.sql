-- TL-Lincoln チャネルを追加
INSERT INTO channels (code, name, login_url)
VALUES ('lincoln', 'リンカーン', 'https://www.tl-lincoln.net/accomodation/Ascsc1000InitAction.do')
ON CONFLICT (code) DO NOTHING;
