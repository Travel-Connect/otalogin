# F9: ショートカット（URL / Slot）詳細設計

## 概要

ユーザーごとに「施設×チャネル×アクション」のショートカットを無制限に定義し、
StreamDeck等の外部ツールから1ボタンでログイン実行や公開ページ表示を行える機能。

## StreamDeck連携（推奨）

StreamDeckでの設定方法:

1. ポータルの `/shortcuts` 画面でショートカットを作成
2. 「Copy URL」ボタンでURLをコピー
3. StreamDeckアプリで「Website」アクションを追加
4. コピーしたURLを貼り付け

URLにはID/PWは一切含まれない。未ログイン時は自動的にログイン画面へ誘導される。

## ディープリンクURL仕様

| アクション | URL形式 | 動作 |
|-----------|---------|------|
| login | `/facility/<facilityId>?channel=<code>&run=1` | 拡張経由でログイン実行 |
| public | `/facility/<facilityId>?channel=<code>&open=public` | 公開ページURLを新規タブで開く |

### open=public の動作

1. `?open=public` パラメータを検出
2. 対象チャネルの `login_url` + `public_url_query` からフルURLを構築
3. `window.open(fullUrl, '_blank')` で新規タブを開く
4. `public_url_query` が未設定の場合は `login_url` のみを開く

## DBスキーマ

### user_shortcuts テーブル

```sql
CREATE TABLE user_shortcuts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  facility_id UUID NOT NULL REFERENCES facilities(id) ON DELETE CASCADE,
  channel_id UUID NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  action_type TEXT NOT NULL CHECK (action_type IN ('login', 'public')),
  slot_no INTEGER CHECK (slot_no IS NULL OR (slot_no >= 1 AND slot_no <= 10)),
  enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### RLS

- SELECT/INSERT/UPDATE/DELETE: `user_id = auth.uid()` のみ
- 他ユーザーのショートカットは一切見えない

### インデックス

- `uq_user_shortcuts_slot`: (user_id, slot_no) WHERE slot_no IS NOT NULL
  - ユーザーごとにスロット番号は一意

## API

| メソッド | パス | 説明 |
|---------|------|------|
| GET | `/api/shortcuts` | 自分のショートカット一覧取得（施設・チャネル名をJOIN） |
| POST | `/api/shortcuts` | 新規作成 |
| PATCH | `/api/shortcuts/[shortcutId]` | 更新（名前、アクション、スロット、有効/無効） |
| DELETE | `/api/shortcuts/[shortcutId]` | 削除 |

## キーボードショートカット（Slot）

### chrome.commands の制約

- Chrome拡張の `commands` は最大10個まで
- 使用可能なキー: Ctrl/Alt + Shift + 文字/数字/F1-F12
- F13以降、メディアキー等は使用不可

### Slot 方式

- slot_no: 1-10 の整数（ユーザーごとに一意）
- ショートカットの一部にのみ slot_no を割り当て可能
- Chrome拡張がslot番号に対応するコマンドを定義し、実行時にAPIからURLを解決
- **MVPではURL方式を優先**。Slot方式は将来的な補助機能として設計に含める

## セキュリティ

1. URLにID/PW/トークンを含めない
2. 未ログイン時は `/login?returnTo=<元URL>` にリダイレクト
3. RLSで自分のショートカットのみアクセス可能
4. ショートカットの実行はポータルの認証セッションに依存
