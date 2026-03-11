INSERT INTO channels (code, name, login_url)
VALUES ('expedia', 'Expedia', '')
ON CONFLICT (code) DO NOTHING;
