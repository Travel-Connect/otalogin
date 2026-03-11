INSERT INTO channels (code, name, login_url)
VALUES ('agoda', 'Agoda', '')
ON CONFLICT (code) DO NOTHING;
