# ねっぱん パスワード経過日数 API 仕様書

## 概要

ねっぱん（neppan）のトップページに表示される「パスワード変更経過日数」を日次ヘルスチェック時に自動取得し、Supabaseに格納する。外部ツールはAPIまたはSupabase直接アクセスでデータを取得できる。

## データフロー

```
[日次ヘルスチェック 毎朝5:00 JST]
  ↓
[拡張機能] ねっぱんにログイン → top.php にリダイレクト
  ↓
[Content Script] #salesSiteItems テーブルをパース
  → PW変更経過日数列にテキストがあるサイトのみ抽出
  ↓
[Background Script] → POST /api/extension/neppan-alerts
  ↓
[API] neppan_password_alerts テーブルに upsert（施設×サイト名で一意）
```

## データ取得方法

### 方法1: REST API（推奨）

#### 全施設のアラート取得

```
GET https://otalogin-web.vercel.app/api/extension/neppan-alerts
```

#### 特定施設のアラート取得

```
GET https://otalogin-web.vercel.app/api/extension/neppan-alerts?facility_id={UUID}
```

#### レスポンス例

```json
{
  "alerts": [
    {
      "facility_id": "d354af6e-265f-42b6-b6cd-eb9ec2da3fc3",
      "site_name": "るるぶトラベル",
      "elapsed_text": "87日経過しました。",
      "fetched_at": "2026-03-12T20:00:15.123Z",
      "facilities": {
        "code": "HOTEL_A",
        "name": "ホテルA"
      }
    }
  ]
}
```

#### 認証

GET エンドポイントは現在認証不要（内部ネットワーク利用想定）。
必要に応じてAPI Key認証を追加可能。

### 方法2: Supabase REST API 直接アクセス

```
GET https://wupufaekvxchpltyvzim.supabase.co/rest/v1/neppan_password_alerts?select=*,facilities(code,name)&order=fetched_at.desc

Headers:
  apikey: {SUPABASE_ANON_KEY}
  Authorization: Bearer {SUPABASE_ANON_KEY}
```

#### フィルタ例

```
# 特定施設のみ
?facility_id=eq.{UUID}

# 特定サイト名のみ
?site_name=eq.るるぶトラベル

# 本日取得分のみ
?fetched_at=gte.2026-03-12T00:00:00Z
```

### 方法3: Supabase JavaScript クライアント

```typescript
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const { data, error } = await supabase
  .from('neppan_password_alerts')
  .select('*, facilities(code, name)')
  .order('fetched_at', { ascending: false });
```

## テーブル定義

### neppan_password_alerts

| カラム | 型 | 説明 |
|--------|-----|------|
| id | UUID | 主キー（自動生成） |
| facility_id | UUID | 施設ID（facilities.id への外部キー） |
| site_name | TEXT | OTAサイト名（例: "楽天トラベル", "じゃらんnet"） |
| elapsed_text | TEXT | 経過日数テキスト（例: "87日経過しました。"） |
| fetched_at | TIMESTAMPTZ | データ取得日時 |
| created_at | TIMESTAMPTZ | レコード作成日時 |

**ユニーク制約**: `(facility_id, site_name)` — 同一施設×同一サイトは1レコード（upsert で更新）

## 抽出対象

ねっぱん top.php の「連動予約サイト」テーブル（`#salesSiteItems`）の各行について、
**パスワード変更経過日数列（4列目）にテキストが含まれる場合のみ**抽出・保存する。

テキストが空の場合（パスワード変更不要）はスキップされる。

## 更新タイミング

- 日次ヘルスチェック（毎朝5:00 JST）でねっぱんにログイン成功時
- 手動ログイン実行時にもねっぱん top.php を通過すれば取得
- `fetched_at` で最終取得日時を確認可能

## TC Portal お知らせ連携

### 概要

PW経過日数アラートを保存した後、TC Portal の Webhook API にお知らせとして自動通知する。
施設ごとに1つのお知らせにまとめ、`external_ref` による日次 upsert で重複を防止する。

### データフロー（追加分）

```
[neppan_password_alerts upsert 完了]
  ↓
[notifyTcPortal()] → POST TC_PORTAL_WEBHOOK_URL
  Headers: { Content-Type: application/json, X-Webhook-Key: TC_PORTAL_WEBHOOK_KEY }
  Body: { title, body, external_ref }
  ↓
[TC Portal] → announcements テーブルに INSERT or UPDATE
```

### Webhook リクエスト例

```json
{
  "title": "⚠ ねっぱん PW変更アラート: スターハウス今帰仁",
  "body": "・るるぶトラベル: 87日経過しました。",
  "external_ref": "neppan-pw:d354af6e-265f-42b6-b6cd-eb9ec2da3fc3:2026-03-12"
}
```

### TC Portal 側の動作

| external_ref | 動作 | レスポンス |
|---|---|---|
| 新規 | お知らせを `published` で新規作成 | `{ action: "created", id: "..." }` |
| 既存 | `title` / `body` を更新 | `{ action: "updated", id: "..." }` |

### 環境変数

| 変数名 | 説明 |
|--------|------|
| `TC_PORTAL_WEBHOOK_URL` | TC Portal の Webhook エンドポイント URL |
| `TC_PORTAL_WEBHOOK_KEY` | Webhook 認証キー（`X-Webhook-Key` ヘッダーに設定） |

未設定の場合、通知はスキップされる（エラーにはならない）。

### 実装ファイル

- `apps/web/src/app/api/extension/neppan-alerts/route.ts` 内の `notifyTcPortal()` 関数

## 注意事項

- データは upsert のため、同一施設×同一サイトの古いデータは上書きされる
- ねっぱんのログインが失敗した場合、データは更新されない（古いデータが残る）
- `elapsed_text` は生テキストで保存（数値への変換は取得側で行う）
- 例: "87日経過しました。" → 正規表現 `/(\d+)日/` で数値抽出
