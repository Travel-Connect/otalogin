# 環境変数一覧

## Supabase

| 変数名 | 説明 | 例 |
|--------|------|-----|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase プロジェクト URL | `https://xxx.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase Anon Key（公開可） | `eyJ...` |
| `SUPABASE_SERVICE_ROLE_KEY` | Service Role Key（サーバーのみ） | `eyJ...` |

## Google Sheets（Service Account）

| 変数名 | 説明 | 例 |
|--------|------|-----|
| `GOOGLE_SERVICE_ACCOUNT_KEY` | Service Account の JSON キー（1行に圧縮） | `{"type":"service_account","project_id":"...","private_key":"..."}` |
| `GOOGLE_MASTER_SHEETS_ID` | 共通マスタPWシートのID | `1abc...xyz` |

### Service Account の設定方法

1. Google Cloud Console でプロジェクトを作成（または既存プロジェクトを使用）
2. 「APIとサービス」→「ライブラリ」→ Google Sheets API を有効化
3. 「認証情報」→「サービスアカウントを作成」
4. サービスアカウントのキー（JSON）をダウンロード
5. マスタPWスプレッドシートの共有設定で、サービスアカウントのメールアドレス（`xxx@xxx.iam.gserviceaccount.com`）に「編集者」権限を付与
6. JSON キーの内容を1行に圧縮して環境変数に設定

### ローカル開発での設定

`.env.local` に JSON キーを設定する際、改行を含めずに1行で記述する:

```
GOOGLE_SERVICE_ACCOUNT_KEY={"type":"service_account","project_id":"...","private_key":"-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n",...}
```

> **注意**: 以前は OAuth2（GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET / GOOGLE_REFRESH_TOKEN）を使用していましたが、テストモードの Refresh Token 有効期限（7日）の制約により Service Account に移行しました。旧 OAuth2 の環境変数は不要です。

## Chrome 拡張

| 変数名 | 説明 | 例 |
|--------|------|-----|
| `NEXT_PUBLIC_EXTENSION_ID` | 拡張機能の ID | `adnilddmcnhpiajhkbehbjpcioabceia` |

### 拡張機能 ID について

manifest.json に `key` フィールドを設定済みのため、全PCで同一のIDになります。

- 固定ID: `adnilddmcnhpiajhkbehbjpcioabceia`
- Vercel 環境変数にも同じ値を設定してください

### 拡張機能の配布

拡張機能は GitHub プライベートリポジトリ（`Travel-Connect/otalogin-extension`）で配布します。

- ビルド済み dist ファイル（.map ファイルを除く）をリポジトリに格納
- ユーザーは `update-extension.bat` を実行して最新版を取得
- Chrome で「パッケージ化されていない拡張機能を読み込む」→ `%USERPROFILE%\otalogin-extension` を指定

### 新規ユーザーの初期設定

1. GitHub の `Travel-Connect/otalogin-extension` リポジトリへの Read 権限を付与
2. `update-extension.bat` を実行（初回は git clone、以降は git pull）
3. Chrome で拡張機能を読み込み
4. 拡張アイコン → ペアリング設定 → コード: 任意6桁、URL: `https://otalogin-web.vercel.app`

## Vercel Cron

| 変数名 | 説明 | 例 |
|--------|------|-----|
| `CRON_SECRET` | Cron API の認証トークン | ランダムな文字列 |

### CRON_SECRET の生成

```bash
openssl rand -hex 32
```

## パスワード暗号化

| 変数名 | 説明 | 例 |
|--------|------|-----|
| `CREDENTIAL_ENCRYPTION_KEY` | AES-256-GCM 暗号化キー（32バイト） | base64 または hex 形式 |

### CREDENTIAL_ENCRYPTION_KEY の生成

```bash
# 方法1: hex形式（64文字 = 32バイト）
openssl rand -hex 32

# 方法2: base64形式（44文字 = 32バイト）
openssl rand -base64 32
```

**重要**: このキーを紛失すると、保存済みパスワードが復号できなくなります。安全に保管してください。

## TC Portal 連携

| 変数名 | 説明 | 例 |
|--------|------|-----|
| `TC_PORTAL_WEBHOOK_URL` | TC Portal お知らせ Webhook URL | `https://tc-portal.vercel.app/api/announcements/webhook` |
| `TC_PORTAL_WEBHOOK_KEY` | Webhook 認証キー（X-Webhook-Key ヘッダー） | ランダムな文字列 |

ねっぱん PW 変更アラートを TC Portal のお知らせに自動連携するために必要。
未設定の場合、通知はスキップされる（エラーにはならない）。

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
