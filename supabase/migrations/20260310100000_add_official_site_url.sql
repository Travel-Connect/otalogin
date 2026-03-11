-- facilities テーブルに公式サイトURLカラムを追加
ALTER TABLE facilities ADD COLUMN IF NOT EXISTS official_site_url TEXT;
