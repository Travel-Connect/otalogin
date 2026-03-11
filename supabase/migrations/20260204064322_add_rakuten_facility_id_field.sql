-- 楽天トラベルの施設ID（f_no）フィールド定義を追加
INSERT INTO account_field_definitions (channel_id, field_key, field_label, field_type, is_required, display_order)
SELECT id, 'facility_id', '施設ID（f_no）', 'text', true, 1
FROM channels WHERE code = 'rakuten'
ON CONFLICT (channel_id, field_key) DO NOTHING;
