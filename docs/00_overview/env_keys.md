# 環境変数一覧

## Supabase

| 変数名 | 説明 | 例 |
|--------|------|-----|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase プロジェクト URL | `https://xxx.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase Anon Key（公開可） | `eyJ...` |
| `SUPABASE_SERVICE_ROLE_KEY` | Service Role Key（サーバーのみ） | `eyJ...` |

## Google Sheets OAuth

| 変数名 | 説明 | 例 |
|--------|------|-----|
| `GOOGLE_CLIENT_ID` | OAuth クライアント ID | `xxx.apps.googleusercontent.com` |
| `GOOGLE_CLIENT_SECRET` | OAuth クライアントシークレット | `GOCSPX-xxx` |
| `GOOGLE_REFRESH_TOKEN` | Refresh Token | `1//xxx` |
| `GOOGLE_MASTER_SHEETS_ID` | 共通マスタPWシートのID | `1abc...xyz` |

### Refresh Token の取得方法

1. Google OAuth Playground（https://developers.google.com/oauthplayground）を使用
2. 左側の「Step 1」で `https://www.googleapis.com/auth/spreadsheets.readonly` を選択
3. 右上の歯車アイコンで「Use your own OAuth credentials」をチェック
4. クライアントIDとシークレットを入力
5. 「Authorize APIs」→ 社内共通Googleアカウントでログイン・同意
6. 「Step 2」で「Exchange authorization code for tokens」
7. 表示された Refresh Token をコピー

## Chrome 拡張

| 変数名 | 説明 | 例 |
|--------|------|-----|
| `NEXT_PUBLIC_EXTENSION_ID` | 拡張機能の ID | `abcdefghijklmnopqrstuvwxyz` |

### 拡張機能 ID の確認方法

1. Chrome で `chrome://extensions` を開く
2. 開発者モードを ON にして拡張を読み込む
3. 拡張機能の ID が表示される

## Vercel Cron

| 変数名 | 説明 | 例 |
|--------|------|-----|
| `CRON_SECRET` | Cron API の認証トークン | ランダムな文字列 |

### CRON_SECRET の生成

```bash
openssl rand -hex 32
```

## アプリケーション

| 変数名 | 説明 | 例 |
|--------|------|-----|
| `NEXT_PUBLIC_APP_URL` | アプリケーションのURL | `http://localhost:3000` / `https://otalogin.vercel.app` |

## 設定ファイルの配置

```
プロジェクトルート/
├── .env.example    # テンプレート（Git管理）
├── .env.local      # ローカル開発用（Git管理外）
└── .env            # ※使用しない
```

**注意**: `.env.local` は絶対に Git にコミットしないでください。
