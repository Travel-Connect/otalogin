-- 一休チャネルを追加
INSERT INTO channels (code, name, login_url)
VALUES ('ikyu', '一休', 'https://www.ikyu.com/accommodation/ap/AsfW10101.aspx')
ON CONFLICT (code) DO NOTHING;

-- 一休の施設IDフィールド定義を追加
INSERT INTO account_field_definitions (channel_id, field_key, field_label, field_type, is_required, display_order)
SELECT id, 'facility_id', '施設ID', 'text', true, 1
FROM channels WHERE code = 'ikyu'
ON CONFLICT (channel_id, field_key) DO NOTHING;
