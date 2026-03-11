# システム全体像

最終更新: 2026-03-11

## アーキテクチャ概要

```
┌─────────────────────────────────────────────────────────────────┐
│                          User's Chrome                           │
│  ┌─────────────┐    ┌─────────────────────────────────────────┐ │
│  │   Chrome    │    │              Browser Tabs                │ │
│  │  Extension  │◄───┤  ┌─────────┐  ┌─────────┐  ┌─────────┐  │ │
│  │   (MV3)     │    │  │ Portal  │  │  OTA A  │  │  OTA B  │  │ │
│  │             │────┼──►  Tab    │  │   Tab   │  │   Tab   │  │ │
│  └─────────────┘    │  └─────────┘  └─────────┘  └─────────┘  │ │
└─────────────────────────────────────────────────────────────────┘
         │                    │
         │                    │ HTTPS
         │                    ▼
         │            ┌───────────────┐
         │            │    Vercel     │
         │            │  ┌─────────┐  │
         └────────────┼─►│ Next.js │  │
           polling    │  │   App   │  │
                      │  │ Router  │  │
                      │  └────┬────┘  │
                      │       │       │
                      │  ┌────┴────┐  │
                      │  │   API   │  │
                      │  │ Routes  │  │
                      │  └────┬────┘  │
                      └───────┼───────┘
                              │
              ┌───────────────┼───────────────┐
              │               │               │
              ▼               ▼               ▼
     ┌─────────────┐  ┌─────────────┐  ┌─────────────┐
     │  Supabase   │  │   Google    │  │   Vercel    │
     │  (DB/Auth)  │  │   Sheets    │  │    Cron     │
     └─────────────┘  └─────────────┘  └─────────────┘
```

## コンポーネント詳細

### Chrome Extension (MV3)

- **役割**: OTAサイトへの自動ログイン実行
- **構成**:
  - Background Service Worker: メッセージ受信、タブ管理、ポーリング（1分間隔）
  - Content Scripts: OTAサイトでのDOM操作、ログイン処理
  - externally_connectable: ポータルからのメッセージ受信
- **ビルドシステム**: `build.mjs` による個別エントリービルド
  - Background: ES module 形式（Service Worker が `"type": "module"` のため）
  - Content: IIFE 形式（Content Scripts は ES module 非対応、`import` 文が使えない）
  - Popup: IIFE 形式
  - Vite lib モードで各エントリーを個別ビルドし、コード分割（shared chunk）を防止
- **重要**: 同一ウィンドウ内にタブを追加（`sender.tab.windowId` 使用）
- **必須 Permissions**:
  - `tabs`: タブ操作
  - `storage`: 設定・トークン保存
  - `activeTab`: アクティブタブへのアクセス
  - `alarms`: ポーリング用タイマー
- **URL パターン**: `host_permissions` と `content_scripts.matches` の両方に OTA ドメインを設定
- **対応ドメイン**:
  - `*.travel.rakuten.com`, `*.account.rakuten.com` (楽天)
  - `*.jalan.net` (じゃらん)
  - `*.hotel-story.ne.jp` (ねっぱん)
  - `*.ikyu.com` (一休)
  - `*.skyticket.jp` (スカイチケット)
  - `*.churatoku.net` (ちゅらとく)
  - `*.otsinternational.jp` (OTS)
  - `*.tl-lincoln.net` (リンカーン)
  - `*.jtb.co.jp` (るるぶ)
- **ログインパターン**:
  - シングルステップ: セレクタでID/PW入力→submit
  - マルチステップ: login_stepsで段階的にフォーム入力
  - ポストログインアクション: 施設検索→行クリック
  - 強制ログイン: 二重ログイン検出→強制ログインボタン自動クリック

### Web Portal (Next.js)

- **役割**: ユーザーインターフェース、API提供
- **デプロイ**: Vercel
- **技術**: Next.js 14+ App Router, TypeScript
- **拡張用 API**:
  - `/api/extension/jobs`: pending ジョブ一覧取得
  - `/api/extension/job/[jobId]`: ジョブ詳細・クレデンシャル取得
  - `/api/extension/report`: ジョブ結果報告
  - `/api/extension/dispatch`: ログインジョブ作成
- **その他 API**:
  - `/api/master-sync`: マスタPWシート同期
  - `/api/cron/healthcheck`: Health Check Cron
  - `/api/facility/account`: アカウント情報CRUD
  - `/api/facility/[facilityId]`: 施設情報CRUD
  - `/api/channel/logo`: チャネルロゴアップロード（POST）
  - `/api/channel/settings`: チャネル背景色変更（PATCH）
- **CORS**: 拡張用 API は全て CORS ヘッダーを付与（`apps/web/src/lib/extension/cors.ts`）

### Supabase

- **役割**: データベース、認証
- **テーブル**:
  - facilities: 施設情報
  - channels: OTAチャネル定義
  - facility_accounts: アカウント情報（user_emailでユーザー別対応）
  - automation_jobs: ジョブ管理
  - channel_health_status: 状態管理
  - user_roles: ユーザー権限管理
- **認証**: メール + パスワード
- **RLS**: 有効化必須
- **暗号化**: AES-256-GCM（CREDENTIAL_ENCRYPTION_KEY）
- **Storage**: `channel-logos` バケット（チャネルロゴ画像）

### Google Sheets

- **役割**: 共通マスタPWシートの参照元
- **認証**: OAuth 2.0 (Refresh Token)
- **同期**: 施設単位で手動実行（admin限定）
- **シート構成**: A:L列（L列はリンカーン用ユーザーメール）

### Vercel Cron

- **役割**: 定期実行（Health Check）
- **スケジュール**: 20:00 UTC（= 05:00 JST）
- **注意**: タイムゾーンは UTC 固定

## データフロー

### 手動ログイン実行

```
1. User clicks "Login" on Portal
   Portal ──POST /api/extension/dispatch──► API
                                            │
2. API creates job                          ▼
   API ──INSERT job──► Supabase
                        │
3. Portal sends message to Extension        │
   Portal ──chrome.runtime.sendMessage──► Extension
                                            │
4. Extension fetches job details            │
   Extension ──GET /api/extension/job/[id]──► API
                                            │
5. Extension opens tab in same window       │
   Extension ──chrome.tabs.create({windowId})──► New Tab
                                            │
6. Content script performs login            │
   Content Script ──DOM操作──► OTA Site
                                            │
7. Extension reports result                 │
   Extension ──POST /api/extension/report──► API
                                            │
8. API updates job status                   │
   API ──UPDATE job──► Supabase
```

### Health Check（自動）

```
1. Vercel Cron triggers at 20:00 UTC
   Cron ──GET /api/cron/healthcheck──► API
                                       │
2. API creates jobs for all shared accounts
   API ──INSERT jobs──► Supabase
                        │
3. Extension polls for pending jobs (1min interval)
   Extension ──GET /api/extension/jobs──► API
                        │
4. Extension executes each job
   (Same as manual login flow)
                        │
5. Health status updated
   API ──UPDATE channel_health_status──► Supabase
```

### マスタPW同期

```
1. Admin clicks "マスタPWと同期" on Portal
   Portal ──POST /api/master-sync──► API
                                      │
2. API fetches data from Google Sheets
   API ──Google Sheets API──► Sheets
                                │
3. API upserts facility_accounts  │
   API ──INSERT/UPDATE──► Supabase
                                │
4. Lincoln: per-user credentials
   L列メール → facility_accounts.user_email
```

## セキュリティ設計

### CORS 設計

拡張用 API（`/api/extension/*`）は Chrome 拡張からの fetch 呼び出しを受け付けるため、
CORS ヘッダーが必要。共通関数 `apps/web/src/lib/extension/cors.ts` を使用:

```typescript
// OPTIONS プリフライト
export async function OPTIONS() {
  return corsPreflightResponse();
}

// レスポンスに CORS ヘッダー追加
return addCorsHeaders(NextResponse.json({ data }));
```

### 認証情報の取り扱い

- **拡張への保存**: pairing token のみ（平文PWは保存しない）
- **API経由での取得**: jobId 方式
  - ポータル → 拡張に ID/PW を直送しない
  - 拡張が jobId で API から取得
- **DB保存**: AES-256-GCM で暗号化
  - フォーマット: `enc_v1:<iv_base64>:<ciphertext_base64>:<tag_base64>`
  - レイジーマイグレーション: 平文で保存されたものは読み取り時にそのまま返却

### ログ・成果物

- PW / Token / RefreshToken をログに出力しない
- E2E成果物は e2e:mock のみ zip 化
- e2e:real の成果物は社内保管のみ

### RLS（Row Level Security）

- 全テーブルで RLS 有効化
- 全ユーザーが全施設を閲覧・ログイン実行可能
- credential 更新・同期は role=admin のみ

## パフォーマンス最適化

### Supabase クエリ並列化

リモート Supabase への往復遅延を最小化するため、独立したクエリを `Promise.all()` で並列実行:

| ページ / API | Before | After | 効果 |
|-------------|--------|-------|------|
| `/facility/[facilityId]` (SSR) | 8クエリ直列 | 6並列 + 1依存 | 約3-5倍高速化 |
| `/api/extension/job/[jobId]` | 4クエリ直列 | 2並列 + 1依存 | 約2倍高速化 |
| `/api/extension/dispatch` | 3処理直列 | createClient + json 並列 | レイテンシ削減 |
| `FacilityDetail handleLogin` | PING → dispatch 直列 | PING + dispatch 並列 | 1往復分短縮 |

### マスタデータキャッシュ

変更頻度の低いデータを `unstable_cache` でサーバーサイドキャッシュ:

```typescript
// channels + account_field_definitions を60秒キャッシュ
const getCachedMasterData = unstable_cache(
  async () => { /* channels, fieldDefinitions を取得 */ },
  ['master-channels-fields'],
  { revalidate: 60 }
);
```

- 2回目以降のアクセスではキャッシュヒット → DB往復0ms
- StreamDeck から連続で異なる施設を叩いても channels/fieldDefinitions は即座に返る

### ローディングスケルトン

`/facility/[facilityId]/loading.tsx` でサーバーレンダリング中に即座にスケルトンUIを表示。
白画面を排除し、体感速度を大幅に改善。

## ログイン成功判定

### 判定フロー

Content Script がログイン後のページで成功/失敗を判定する:

```
1. success_indicator セレクタをチェック（15秒待機）
   → 見つかった → 成功
2. フォールバック:
   a. detectLogoutPresence(): ページ上にログアウトリンク/テキストがあるか
      → 見つかった → 成功（ログイン済みページと確定）
   b. detectAuthError(): エラーセレクタ/キーワードでエラー検出
      → エラー検出 → AUTH_FAILED
   c. ログインフォームが消えているか
      → 消えている → 成功（フォールバック）
      → 残っている → 次のページロードで再チェック
```

### detectLogoutPresence()

CSS セレクタ（`a[href*="logout"]`, `.logout` 等）とテキストマッチ（「ログアウト」「Logout」）の
両方でログアウトリンクを検出。success_indicator が見つからない場合でも確実にログイン成功を判定。
