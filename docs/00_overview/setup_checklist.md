# セットアップチェックリスト

OTAログイン支援ツールを稼働させるために必要な情報・作業の一覧。

## 1. 事前準備

### Supabase

- [ ] Supabase プロジェクト作成
- [ ] プロジェクト URL 取得
- [ ] Anon Key 取得
- [ ] Service Role Key 取得
- [ ] RLS ポリシー設定

### Google Cloud Console

- [ ] プロジェクト作成
- [ ] Google Sheets API 有効化
- [ ] OAuth 2.0 クライアント ID 作成（Webアプリケーション）
- [ ] リダイレクトURI設定
- [ ] Refresh Token 取得（社内共通Googleアカウントで同意）

### Google Sheets

- [ ] 共通マスタPWシート作成
- [ ] シートID（GOOGLE_MASTER_SHEETS_ID）を控える
- [ ] シートのフォーマット確認
  - ヘッダー行: `facility_code`, `channel`, `login_id`, `password`, ...

### Vercel

- [ ] プロジェクト作成
- [ ] 環境変数設定（本番）
- [ ] Cron Job 設定確認（vercel.json）

## 2. ローカル環境

### 必須ツール

- [ ] Node.js 20 LTS インストール
- [ ] pnpm インストール (`npm install -g pnpm`)
- [ ] Git インストール
- [ ] Chrome ブラウザ

### 開発環境構築

```bash
# リポジトリクローン
git clone https://github.com/Travel-Connect/otalogin.git
cd otalogin

# 依存関係インストール
pnpm install

# 環境変数設定
cp .env.example .env.local
# .env.local を編集して値を設定

# 開発サーバー起動
pnpm dev
```

### Chrome拡張のインストール

1. `pnpm build:extension` でビルド
2. Chrome で `chrome://extensions` を開く
3. 「デベロッパーモード」を ON
4. 「パッケージ化されていない拡張機能を読み込む」
5. `apps/extension/dist` フォルダを選択
6. 拡張機能 ID をメモして `.env.local` に設定

## 3. 確認項目

- [ ] `pnpm dev` でポータルが起動する
- [ ] ログイン画面が表示される
- [ ] Chrome拡張がインストールできる
- [ ] `pnpm e2e:mock` が通る
- [ ] `pnpm verify` が通る

## 4. 本番デプロイ前

- [ ] 環境変数が全て Vercel に設定されている
- [ ] Supabase の RLS が有効
- [ ] Chrome拡張の `externally_connectable` に本番URLが設定されている
- [ ] Cron Job のスケジュール確認（05:00 JST = 20:00 UTC）
