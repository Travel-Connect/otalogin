INSERT INTO channels (code, name, login_url)
VALUES ('tripcom', 'Trip.com', '')
ON CONFLICT (code) DO NOTHING;
