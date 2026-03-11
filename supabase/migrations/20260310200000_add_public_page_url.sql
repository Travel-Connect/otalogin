-- facility_accounts に公開ページURL（フルURL）を追加
-- J列から直接取り込むための列
ALTER TABLE facility_accounts ADD COLUMN IF NOT EXISTS public_page_url TEXT;
