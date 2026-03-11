# 実サイト（OTA）手動ログインテスト Runbook

## 概要

実際のOTAサイト（楽天トラベル、じゃらん、ねっぱん等）に対して手動ログインテストを行う手順書。

**重要**: 実サイトテストでは trace/screenshot/video を取らないこと。

## 前提条件

### 必要な環境変数

`.env.local` に以下を設定:

```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...

# パスワード暗号化（必須）
CREDENTIAL_ENCRYPTION_KEY=<hex 64文字 または base64>

# Google Sheets（master-sync を使う場合）
GOOGLE_CLIENT_ID=xxx.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-xxx
GOOGLE_REFRESH_TOKEN=1//xxx
GOOGLE_MASTER_SHEETS_ID=1abc...xyz

# Chrome 拡張
NEXT_PUBLIC_EXTENSION_ID=<拡張機能ID>

# アプリケーション
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

### 暗号化キーの生成

```bash
# hex形式で生成（推奨）
openssl rand -hex 32
# 出力例: a1b2c3d4e5f6...（64文字）
```

### DBマイグレーション

```bash
# Supabase CLI でマイグレーション適用
npx supabase db push
```

## テスト手順

### 1. 資格情報の同期/登録

#### 方法A: master-sync（Google Sheets から同期）

1. ポータルにログイン（admin 権限が必要）
2. 施設詳細ページで「マスタ同期」ボタンをクリック
3. 同期完了のメッセージを確認

**確認**:
```sql
-- Supabase SQL Editor で確認
SELECT facility_id, channel_id, login_id,
       password IS NULL AS old_pw_cleared,
       password_encrypted IS NOT NULL AS encrypted_saved
FROM facility_accounts
WHERE facility_id = '<対象施設ID>';
```

#### 方法B: アカウント管理API（手動登録）

```bash
# ポータルのアカウント編集フォームから登録
# または API を直接呼び出し
```

### 2. Chrome 拡張のセットアップ

```bash
# 拡張をビルド
pnpm build:extension

# Chrome で読み込み
# 1. chrome://extensions を開く
# 2. 「開発者モード」を ON
# 3. 「パッケージ化されていない拡張機能を読み込む」
# 4. apps/extension/dist を選択
```

#### 新しい OTA を追加する場合

新しい OTA サイトを追加する場合、以下のファイルを更新する必要があります。

**1. manifest.json（`apps/extension/public/manifest.json`）**

```json
{
  "host_permissions": [
    "https://新しいOTAドメイン/*"
  ],
  "content_scripts": [
    {
      "matches": [
        "https://新しいOTAドメイン/*"
      ]
    }
  ]
}
```

> **注意**: `www.example.com` と `wwws.example.com` など、サブドメインが異なる場合はそれぞれ追加が必要。リダイレクト後のドメインも確認すること。

**2. チャネル設定（`packages/shared/src/constants/channels.ts`）**

```typescript
export const CHANNEL_CONFIGS = {
  new_ota: {
    name: '新しいOTA',
    login_url: 'https://新しいOTAドメイン/login',
    selectors: {
      // ログインID入力欄（DevToolsで要素を検査して特定）
      username: 'input[name="userId"]',
      // パスワード入力欄
      password: 'input[name="password"]',
      // ログインボタン（<a>タグの場合はクラスやonclick属性で特定）
      submit: 'button[type="submit"]',
      // ログイン成功の判定要素（複数指定可、カンマ区切り）
      success_indicator: '.logout, a[href*="logout"], .user-info',
    },
  },
};
```

**セレクタの調べ方**:
1. OTA のログインページを開く
2. DevTools（F12）で Elements タブを開く
3. 各入力欄やボタンを右クリック → 「検証」
4. `name`, `id`, `class` 属性を確認してセレクタを作成

**3. DB のチャネルマスタ更新**

```sql
UPDATE channels
SET login_url = 'https://正しいURL/login'
WHERE code = 'new_ota';
```

### 3. ポータルで接続確認

1. `http://localhost:3000` でポータルを開く
2. ログイン後、施設詳細ページへ移動
3. 「拡張接続: 接続済み」と表示されることを確認
   - 黄色警告（未接続）の場合: 拡張が正しく読み込まれているか確認

### 4. 手動ログイン実行

1. 対象チャネル（例: 楽天トラベル）の「ログイン実行」ボタンをクリック
2. **同一ウィンドウに新しいタブが開く**ことを確認
3. ログインフォームに自動入力されることを確認
4. ログイン成功後、ヘルスステータスが「緑」になることを確認

### 5. 成功判定の確認

ログイン成功の判定基準（success_indicator）:
- URLに `dashboard` や `top` が含まれる
- 「ログアウト」リンクが存在する
- ログインフォームが消えている

## トラブルシューティング

### 401 Unauthorized

**原因**: device token が無効または未設定

**対処**:
1. 拡張の popup から「再ペアリング」を実行
2. または storage を確認:
```javascript
// DevTools Console（拡張のbackgroundページ）
chrome.storage.local.get('device_token', console.log);
```

### 409 Conflict

**原因**: ジョブが既に他のエージェントで claim 済み

**対処**:
1. 正常動作。別の拡張インスタンスが先に取得した
2. 新しいジョブを作成して再試行

### UI_CHANGED

**原因**: OTAサイトのログインページ構造が変更された

**対処**:
1. Content Script のセレクタを確認・更新
2. `apps/extension/src/content/strategies/` を確認

### TIMEOUT

**原因**: ログイン処理が30秒以上かかった

**対処**:
1. ネットワーク状態を確認
2. OTAサイトが正常に動作しているか確認
3. 手動でログインを試行してレスポンス速度を確認

### AUTH_FAILED

**原因**: ログインID/パスワードが間違っている

**対処**:
1. マスタシートの資格情報を確認
2. 直接OTAサイトで手動ログインを試行
3. パスワード変更があった場合は再同期

### NETWORK_ERROR

**原因**: API通信に失敗

**対処**:
1. ネットワーク接続を確認
2. Web サーバーが起動しているか確認: `pnpm dev`
3. CORS設定を確認（下記参照）

### CORS エラー（Access-Control-Allow-Origin）

**原因**: 拡張から API への通信で CORS ヘッダーが不足

**症状**:
```
Access to fetch blocked by CORS policy: No 'Access-Control-Allow-Origin' header
```

**対処**:
全ての拡張用 API ルート（`/api/extension/*`）に CORS ヘッダーを設定する必要があります。

1. `apps/web/src/lib/extension/cors.ts` の共通関数を使用:

```typescript
import { corsPreflightResponse, addCorsHeaders } from '@/lib/extension/cors';

// OPTIONS プリフライト対応
export async function OPTIONS() {
  return corsPreflightResponse();
}

// レスポンスに CORS ヘッダー追加
export async function GET(request: NextRequest) {
  // ...処理...
  return addCorsHeaders(NextResponse.json({ data }));
}
```

2. エラーレスポンスにも CORS ヘッダーを付与することを忘れない

### Service Worker 登録失敗（Status code: 15）

**原因**: manifest.json で必要な permission が不足

**症状**:
```
Service worker registration failed. Status code: 15
TypeError: Cannot read properties of undefined (reading 'onAlarm')
```

**対処**:
`apps/extension/public/manifest.json` に必要な権限を追加:

```json
{
  "permissions": [
    "tabs",
    "storage",
    "activeTab",
    "alarms"  // ← ポーリング用に必要
  ]
}
```

変更後は `pnpm build:extension` で再ビルドし、Chrome で拡張を再読み込み。

### Content Script が動作しない

**原因**: manifest.json の URL パターンが不足

**症状**:
- ログインページが開くが、自動入力されない
- DevTools の Console にエラーがない（Content Script が注入されていない）

**対処**:
1. 実際のログインページの URL を確認（リダイレクト後のドメインに注意）
2. `manifest.json` の `host_permissions` と `content_scripts.matches` に URL パターンを追加
3. `pnpm build:extension` で再ビルド
4. Chrome で拡張を再読み込み
5. ログインページをリロード

### AGENT_OFFLINE

**原因**: 拡張がジョブを取得しなかった（30分以上）

**対処**:
1. 拡張が正しく読み込まれているか確認
2. ポーリングが有効か確認（popup）
3. 拡張のコンソールログを確認

## 注意事項

### セキュリティ

- **trace/screenshot/video を取らない**（実サイトテスト時）
- ID/PW/トークンをログに出力しない
- `.env.local` を Git にコミットしない
- テスト用アカウントの資格情報は社内限定

### 実行環境

- 開発環境: `http://localhost:3000`
- 本番環境: `https://<your-domain>.vercel.app`

### Playwright での実サイトテスト

```bash
# 実サイトテスト（成果物なし）
pnpm e2e:real

# 注意: playwright.config.ts で trace: 'off' になっていること
```

## 確認チェックリスト

### 初期セットアップ

- [ ] 暗号化キー（CREDENTIAL_ENCRYPTION_KEY）が設定されている
- [ ] DBマイグレーションが適用されている
- [ ] 資格情報が暗号化されて保存されている
- [ ] 拡張が接続済みと表示される
- [ ] 手動ログインで同一ウィンドウにタブが開く
- [ ] ログイン成功後にヘルスステータスが緑になる

### 新規 OTA 追加時

- [ ] manifest.json の `host_permissions` に URL パターンを追加
- [ ] manifest.json の `content_scripts.matches` に URL パターンを追加
- [ ] リダイレクト先のドメインも含めて追加されている（例: `www.*` と `wwws.*`）
- [ ] `packages/shared/src/constants/channels.ts` にセレクタ設定を追加
- [ ] DB の channels テーブルに正しい `login_url` が設定されている
- [ ] `pnpm build:extension` で再ビルド済み
- [ ] Chrome で拡張を再読み込み済み
- [ ] OTA ログインページで Content Script が動作する

### 拡張エラー確認

- [ ] `chrome://extensions` でエラーがないことを確認
- [ ] Service Worker が正常に登録されている
- [ ] manifest.json に `alarms` permission がある
