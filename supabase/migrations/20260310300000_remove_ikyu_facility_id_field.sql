-- 一休の不要な facility_id フィールド定義を削除
-- operator_id にリネーム済みだが、facility_id が再作成されていた
-- まず関連する field_values を削除してから定義を削除
DELETE FROM account_field_values
WHERE field_definition_id IN (
  SELECT id FROM account_field_definitions
  WHERE channel_id = (SELECT id FROM channels WHERE code = 'ikyu')
    AND field_key = 'facility_id'
);

DELETE FROM account_field_definitions
WHERE channel_id = (SELECT id FROM channels WHERE code = 'ikyu')
  AND field_key = 'facility_id';
