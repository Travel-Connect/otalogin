-- チャネルのカスタム背景色カラム追加
ALTER TABLE channels ADD COLUMN IF NOT EXISTS bg_color TEXT;
