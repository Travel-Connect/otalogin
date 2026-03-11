-- 一休のフィールド定義を施設ID→オペレータIDに修正
-- D列=施設ID(login_id)、G列=オペレータID(extra_field)
UPDATE account_field_definitions
SET field_key = 'operator_id', field_label = 'オペレータID'
WHERE channel_id = (SELECT id FROM channels WHERE code = 'ikyu')
  AND field_key = 'facility_id';

-- facility_idが存在しない場合のフォールバック（初回挿入用）
INSERT INTO account_field_definitions (channel_id, field_key, field_label, field_type, is_required, display_order)
SELECT id, 'operator_id', 'オペレータID', 'text', true, 1
FROM channels WHERE code = 'ikyu'
ON CONFLICT (channel_id, field_key) DO NOTHING;
