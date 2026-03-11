-- channels テーブルに category カラムを追加
ALTER TABLE channels ADD COLUMN IF NOT EXISTS category TEXT DEFAULT 'OTA';

-- 既存チャネルのカテゴリを設定
UPDATE channels SET category = 'Systems' WHERE code IN ('neppan', 'lincoln');
UPDATE channels SET category = 'OTA' WHERE code NOT IN ('neppan', 'lincoln');

-- facilities テーブルに tags カラムを追加
ALTER TABLE facilities ADD COLUMN IF NOT EXISTS tags TEXT[] DEFAULT '{}';
