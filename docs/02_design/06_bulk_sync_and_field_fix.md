# マスタPW一括同期 / 追加フィールド同期修正 / 公式サイトURL - 詳細設計

## 1. マスタPW一括同期

### 1.1 概要

従来はチャネルごとに個別同期のみだったが、施設単位で全チャネルを一括同期できるようにする。

### 1.2 API変更

**エンドポイント**: `POST /api/master-sync`

| パラメータ | 必須 | 変更 | 説明 |
|-----------|------|------|------|
| facility_id | Yes | - | 対象施設UUID |
| channel_id | No | **任意に変更** | 指定時: 単一チャネル同期。省略時: 全チャネル一括同期 |

**レスポンス**:
```json
{
  "success": true,
  "message": "3チャネル（5件）を同期しました",
  "results": [
    { "channel": "楽天トラベル", "synced": 1, "skipped": false },
    { "channel": "じゃらん", "synced": 1, "skipped": false },
    { "channel": "ねっぱん", "synced": 0, "skipped": true }
  ]
}
```

### 1.3 UI

施設詳細ページのヘッダー（施設名の右側）に一括同期アイコンボタンを追加。

- 表示条件: admin権限のみ
- クリック時: 確認ダイアログ「全チャネルのアカウント情報をマスタPWシートから一括同期します。既存の設定は上書きされます。」
- 実行中: スピナー表示、ボタンdisabled
- 完了時: 成功メッセージ表示

既存の個別同期ボタン（各チャネルタイル内）も引き続き利用可能。

## 2. 追加フィールド同期修正

### 2.1 問題

従来の実装では、チャネルの最初のフィールド定義 (`firstFieldDef`) に対してのみ値を書き込んでいた。
これにより以下の問題が発生していた:

- **楽天施設ID**: スプレッドシートI列（index 8）ではなくG列（index 6）を参照していた
- **一休オペレータID**: 複数フィールド定義がある場合に誤ったフィールドに書き込まれていた
- **不要なフォールバック** (`?? 6`): マッピング未定義のチャネルがG列の値を誤って書き込んでいた

### 2.2 修正内容

`extraFieldMap` を導入し、チャネルごとに `field_key` と `column`（スプレッドシート列インデックス）を明示的にマッピングする。

```typescript
const extraFieldMap: Record<string, { field_key: string; column: number }[]> = {
  neppan:  [{ field_key: 'hotel_id',              column: 7 }],   // H列
  ikyu:    [{ field_key: 'operator_id',           column: 6 }],   // G列
  rakuten: [{ field_key: 'facility_id',           column: 8 }],   // I列
  rurubu:  [{ field_key: 'rurubu_facility_code',  column: 10 }],  // K列
};
```

同期ロジック:
1. `extraFieldMap[channel.code]` でマッピングを取得
2. マッピングが存在するチャネルのみ追加フィールドを同期
3. 各マッピングの `field_key` でフィールド定義を検索し、対応する列の値を書き込み

### 2.3 一休フィールド定義クリーンアップ

一休チャネルに不要な `facility_id` フィールド定義が残っていたため、マイグレーションで削除。

```sql
-- 20260310300000_remove_ikyu_facility_id_field.sql
DELETE FROM account_field_values WHERE field_definition_id IN (
  SELECT id FROM account_field_definitions
  WHERE channel_id = (SELECT id FROM channels WHERE code = 'ikyu')
    AND field_key = 'facility_id'
);
DELETE FROM account_field_definitions
WHERE channel_id = (SELECT id FROM channels WHERE code = 'ikyu')
  AND field_key = 'facility_id';
```

## 3. 公式サイトURL（official_site_url）

### 3.1 概要

施設の公式サイトURLを管理し、ダッシュボードと施設詳細ページにリンクとして表示する。

### 3.2 データソース

| ソース | 条件 | 説明 |
|--------|------|------|
| スプレッドシートC列 = "公式" の行 | J列の値 | 一般的な施設の公式サイトURL |
| 自社OTAチャネルの行 | J列の値 | 自社管理ツールのため公式サイト扱い |

対象チャネル（`officialSiteChannels`）:
- `dynaibe`（DYNA IBE）
- `tripla`（tripla）
- `chillnn`（CHILLNN）
- `yoyakupro`（予約プロ）

これらのチャネル行のJ列URLは、`facility_accounts.public_page_url` と `facilities.official_site_url` の両方に書き込まれる。

### 3.3 DB

```sql
-- 20260310100000_add_official_site_url.sql
ALTER TABLE facilities ADD COLUMN IF NOT EXISTS official_site_url TEXT;
```

### 3.4 型定義

`FacilityDetailData` に `official_site_url: string | null` を追加。
ダッシュボード用の `DashboardFacility` には既に存在。

### 3.5 表示

**ダッシュボード施設カード** (既存):
- 施設名の右側に外部リンクアイコン（SVG）
- `official_site_url` がある場合のみ表示
- `target="_blank"` で新規タブに開く

**施設詳細ページ** (新規追加):
- 施設名（h1）の右側に外部リンクアイコン
- インディゴ色（`text-indigo-500`）、ホバーで濃くなる
- `official_site_url` がある場合のみ表示

## 4. 変更ファイル一覧

| ファイル | 変更種別 | 内容 |
|---------|---------|------|
| `supabase/migrations/20260310300000_remove_ikyu_facility_id_field.sql` | 新規 | 一休の不要なfacility_idフィールド削除 |
| `apps/web/src/app/api/master-sync/route.ts` | 変更 | channel_id任意化、extraFieldMap導入、dynaibe公式URL |
| `apps/web/src/app/facility/[facilityId]/FacilityDetail.tsx` | 変更 | 一括同期ボタン、公式サイトURLリンク追加 |
| `apps/web/src/app/facility/[facilityId]/page.tsx` | 変更 | official_site_urlをコンポーネントに渡す |
| `apps/web/src/lib/supabase/types.ts` | 変更 | FacilityDetailDataにofficial_site_url追加 |
