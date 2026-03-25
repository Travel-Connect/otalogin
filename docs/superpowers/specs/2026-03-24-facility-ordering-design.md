# 施設並べ替え機能 設計書

## 概要

ダッシュボードの施設カードをユーザーごとにドラッグ＆ドロップで並べ替える機能。
iPhoneホーム画面風の揺れアニメーション付き。

## UXフロー

1. ヘッダーに「並べ替え」ボタンを追加
2. ボタン押下 → 並べ替えモード（ボタンが「完了」に変化）
3. カードが揺れるアニメーション（iPhone風）で並べ替え可能状態を表示
4. カードをドラッグ＆ドロップで移動（スムーズなアニメーション付き）
5. 「完了」ボタンで終了 → APIに一括保存

## DB設計

### テーブル: `user_facility_order`

| カラム | 型 | 説明 |
|--------|---|------|
| id | uuid | PK, default gen_random_uuid() |
| user_id | uuid | FK → auth.users, NOT NULL |
| facility_id | uuid | FK → facilities ON DELETE CASCADE, NOT NULL |
| position | integer | 表示順, NOT NULL |
| created_at | timestamptz | default now() |
| updated_at | timestamptz | default now() |

- UNIQUE制約: (user_id, facility_id)
- RLS: ユーザーは自分の行のみ SELECT/INSERT/UPDATE/DELETE 可能

## API設計

### GET /api/user-facility-order

- 認証必須
- レスポンス: `{ orders: [{ facility_id, position }] }`

### PUT /api/user-facility-order

- 認証必須
- リクエスト: `{ orders: [{ facility_id, position }] }`
- 処理: 既存行を DELETE → INSERT（全置換）
- レスポンス: `{ success: true }`

## フロントエンド

- DnDライブラリ: `@dnd-kit/core` + `@dnd-kit/sortable`
- 揺れアニメーション: CSS `@keyframes wiggle`
- ドラッグ中: カード拡大 + 影
- ドロップ時: スムーズスライドアニメーション
- フォールバック: 未設定ユーザーは名前順

## 変更ファイル

| ファイル | 変更 |
|---------|------|
| `supabase/migrations/` | user_facility_order テーブル + RLS |
| `apps/web/src/app/page.tsx` | 並び順データ取得 |
| `apps/web/src/components/FacilityDashboard.tsx` | 並べ替えボタン + DnDモード |
| `apps/web/src/app/api/user-facility-order/route.ts` | 新規API |
| `package.json` | @dnd-kit 依存追加 |
