-- ねっぱんの契約コード（hotel_id）フィールド定義を追加
INSERT INTO account_field_definitions (channel_id, field_key, field_label, field_type, is_required, display_order)
SELECT id, 'hotel_id', '契約コード', 'text', true, 1
FROM channels WHERE code = 'neppan'
ON CONFLICT (channel_id, field_key) DO NOTHING;
