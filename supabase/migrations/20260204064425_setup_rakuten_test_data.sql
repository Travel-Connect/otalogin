-- テスト用: 既存の楽天アカウントに施設ID（176742）を設定
-- 注意: 本番環境では施設ごとに正しい施設IDを設定すること

-- 楽天チャネルのfield_definition IDを取得して、既存の楽天アカウントに facility_id を設定
INSERT INTO account_field_values (facility_account_id, field_definition_id, value)
SELECT
  fa.id AS facility_account_id,
  afd.id AS field_definition_id,
  '176742' AS value  -- テスト用施設ID
FROM facility_accounts fa
JOIN channels c ON fa.channel_id = c.id
JOIN account_field_definitions afd ON afd.channel_id = c.id AND afd.field_key = 'facility_id'
WHERE c.code = 'rakuten'
ON CONFLICT (facility_account_id, field_definition_id)
DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();
