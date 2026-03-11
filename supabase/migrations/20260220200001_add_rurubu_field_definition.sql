-- るるぶ施設コードフィールド定義を追加
INSERT INTO account_field_definitions (channel_id, field_key, field_label, field_type, is_required, display_order)
SELECT id, 'rurubu_facility_code', 'るるぶ施設コード', 'text', true, 1
FROM channels WHERE code = 'rurubu'
ON CONFLICT (channel_id, field_key) DO NOTHING;
