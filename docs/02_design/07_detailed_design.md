# 詳細設計書

## 1. システム構成

```
┌─────────────────────────────────────────────────────────┐
│ ユーザー PC (Windows 11 + Chrome)                       │
│  ┌──────────────────┐  ┌─────────────────────────────┐  │
│  │ Chrome Extension │←→│ Web Portal (Vercel)         │  │
│  │ Manifest V3      │  │ Next.js 14 App Router       │  │
│  │ - popup          │  │ - Dashboard                 │  │
│  │ - background     │  │ - Facility Detail           │  │
│  │ - content script │  │ - Shortcuts                 │  │
│  └────────┬─────────┘  └──────────┬──────────────────┘  │
│           │                       │                      │
└───────────┼───────────────────────┼──────────────────────┘
            │                       │
            ▼                       ▼
     ┌──────────────┐    ┌──────────────────┐
     │ OTA Sites    │    │ Supabase         │
     │ (楽天, じゃ  │    │ - PostgreSQL     │
     │  らん, etc.) │    │ - Auth           │
     └──────────────┘    │ - Storage        │
                         │ - RLS            │
                         └────────┬─────────┘
                                  │
                         ┌────────▼─────────┐
                         │ Google Sheets    │
                         │ (マスタPWシート) │
                         └──────────────────┘
```

## 2. データベース設計

### 2.1 ER図（主要テーブル）

```
auth.users
  ├── 1:N → user_roles (role: admin|user)
  ├── 1:N → user_shortcuts (facility_id, channel_id, action_type, slot_no)
  ├── 1:N → user_facility_order (facility_id, position)
  └── 1:N → device_tokens (token, device_name)

facilities (tags TEXT[], credential_sheet_url, official_site_url)
  ├── 1:N → facility_accounts (channel_id, login_id, password_encrypted)
  │           ├── 1:N → account_field_values (field_definition_id, value)
  │           └── FK → channels
  ├── 1:N → channel_health_status (status, last_success_at, last_error_at)
  └── 1:N → automation_jobs (job_type, status, error_code)

channels (code, name, login_url, category, logo_url, bg_color)
  └── 1:N → account_field_definitions (field_key, field_label, field_type)
```

### 2.2 テーブル定義

#### facilities
| カラム | 型 | NULL | デフォルト | 説明 |
|--------|---|------|----------|------|
| id | uuid | NO | gen_random_uuid() | PK |
| code | text | NO | - | 施設コード |
| name | text | NO | - | 施設名 |
| tags | text[] | YES | '{}' | タグ配列 |
| official_site_url | text | YES | NULL | 公式サイトURL |
| credential_sheet_url | text | YES | NULL | PW表URL |
| created_at | timestamptz | NO | now() | 作成日時 |

#### channels
| カラム | 型 | NULL | デフォルト | 説明 |
|--------|---|------|----------|------|
| id | uuid | NO | gen_random_uuid() | PK |
| code | text | NO | - | チャネルコード (UNIQUE) |
| name | text | NO | - | チャネル表示名 |
| login_url | text | YES | NULL | ログインURL |
| category | text | NO | 'OTA' | 'OTA' or 'Systems' |
| logo_url | text | YES | NULL | カスタムロゴURL |
| bg_color | text | YES | NULL | 背景色 (#RRGGBB) |

#### facility_accounts
| カラム | 型 | NULL | デフォルト | 説明 |
|--------|---|------|----------|------|
| id | uuid | NO | gen_random_uuid() | PK |
| facility_id | uuid | NO | - | FK → facilities |
| channel_id | uuid | NO | - | FK → channels |
| account_type | text | NO | 'shared' | 'shared' or 'override' |
| login_id | text | YES | NULL | ログインID |
| password | text | YES | NULL | パスワード（平文、レガシー） |
| password_encrypted | text | YES | NULL | 暗号化パスワード (AES-256-GCM) |
| login_url | text | YES | NULL | 施設固有ログインURL |
| user_email | text | YES | NULL | ユーザー別（リンカーン用） |
| health_check_enabled | boolean | NO | true | 巡回チェック有効化 |
| public_url_query | jsonb | YES | NULL | 公開ページURLクエリ |
| public_page_url | text | YES | NULL | 公開ページURL |
| admin_url_query | jsonb | YES | NULL | 管理画面URLクエリ |

#### user_facility_order
| カラム | 型 | NULL | デフォルト | 説明 |
|--------|---|------|----------|------|
| id | uuid | NO | gen_random_uuid() | PK |
| user_id | uuid | NO | - | FK → auth.users |
| facility_id | uuid | NO | - | FK → facilities (CASCADE) |
| position | integer | NO | - | 表示順 |
| created_at | timestamptz | NO | now() | 作成日時 |
| updated_at | timestamptz | NO | now() | 更新日時 |
| UNIQUE | | | | (user_id, facility_id) |

#### automation_jobs
| カラム | 型 | NULL | デフォルト | 説明 |
|--------|---|------|----------|------|
| id | uuid | NO | gen_random_uuid() | PK |
| facility_id | uuid | NO | - | FK → facilities |
| channel_id | uuid | NO | - | FK → channels |
| job_type | text | NO | - | 'manual_login' or 'health_check' |
| status | text | NO | 'pending' | pending/in_progress/success/failed/cancelled |
| error_code | text | YES | NULL | エラーコード |
| error_message | text | YES | NULL | エラーメッセージ |
| started_at | timestamptz | YES | NULL | 開始日時 |
| completed_at | timestamptz | YES | NULL | 完了日時 |
| created_by | uuid | YES | NULL | 作成者 |
| created_at | timestamptz | NO | now() | 作成日時 |

#### channel_health_status
| カラム | 型 | NULL | デフォルト | 説明 |
|--------|---|------|----------|------|
| id | uuid | NO | gen_random_uuid() | PK |
| facility_id | uuid | NO | - | FK → facilities |
| channel_id | uuid | NO | - | FK → channels |
| status | text | NO | 'unknown' | healthy/unhealthy/unknown |
| last_success_at | timestamptz | YES | NULL | 最終成功日時 |
| last_error_at | timestamptz | YES | NULL | 最終エラー日時 |
| last_error_code | text | YES | NULL | 最終エラーコード |
| last_error_message | text | YES | NULL | 最終エラーメッセージ |
| UNIQUE | | | | (facility_id, channel_id) |

### 2.3 RLS ポリシー

| テーブル | SELECT | INSERT | UPDATE | DELETE |
|---------|--------|--------|--------|--------|
| facilities | authenticated | admin | admin | admin |
| channels | public | - | admin | - |
| facility_accounts | authenticated | admin | admin | admin |
| account_field_definitions | public | - | - | - |
| account_field_values | authenticated | admin | admin | admin |
| automation_jobs | authenticated | authenticated | authenticated | - |
| channel_health_status | authenticated | service | service | - |
| user_roles | own user | - | - | - |
| user_shortcuts | own user | own user | own user | own user |
| user_facility_order | own user | own user | own user | own user |
| device_tokens | service | service | service | - |

## 3. API設計

### 3.1 認証系

| メソッド | パス | 認証 | 説明 |
|---------|------|------|------|
| POST | /api/auth/signout | required | ログアウト |

### 3.2 拡張連携系（CORS有効）

| メソッド | パス | 認証 | 説明 |
|---------|------|------|------|
| OPTIONS | /api/extension/pair | - | CORSプリフライト |
| POST | /api/extension/pair | - | ペアリング（デバイストークン生成） |
| GET | /api/extension/jobs | device_token | pending ジョブ取得 |
| GET | /api/extension/job/[jobId] | device_token | ジョブ詳細 |
| POST | /api/extension/report | device_token | ジョブ結果報告 |
| POST | /api/extension/dispatch | required | ログインジョブ作成 |
| POST | /api/extension/neppan-alerts | device_token | ねっぱんアラート |

### 3.3 施設管理系

| メソッド | パス | 認証 | 説明 |
|---------|------|------|------|
| GET | /api/facility | required | 施設一覧 |
| PATCH | /api/facility/[facilityId] | admin | 施設情報更新（name, code, tags, credential_sheet_url） |
| DELETE | /api/facility/[facilityId] | admin | 施設削除（CASCADE） |
| POST | /api/facility/account | admin | アカウント作成・更新 |
| PATCH | /api/facility/account/health-check-toggle | admin | ヘルスチェック切替 |
| PATCH | /api/facility/account/url-query | admin | URLクエリ更新 |

### 3.4 マスタ同期系

| メソッド | パス | 認証 | 説明 |
|---------|------|------|------|
| POST | /api/master-sync | admin | Google Sheets → DB 同期 |
| POST | /api/master-export | admin | DB → Google Sheets 転記 |

### 3.5 ユーザー設定系

| メソッド | パス | 認証 | 説明 |
|---------|------|------|------|
| GET | /api/user-facility-order | required | 施設表示順取得 |
| PUT | /api/user-facility-order | required | 施設表示順一括保存 |
| GET | /api/shortcuts | required | ショートカット一覧 |
| POST | /api/shortcuts | required | ショートカット作成 |
| PUT | /api/shortcuts/[shortcutId] | required | ショートカット更新 |
| DELETE | /api/shortcuts/[shortcutId] | required | ショートカット削除 |

### 3.6 Cron ジョブ

| メソッド | パス | 認証 | スケジュール | 説明 |
|---------|------|------|------------|------|
| GET | /api/cron/healthcheck | CRON_SECRET | 毎日 20:00 UTC | 日次ヘルスチェック |
| GET | /api/cron/cleanup-stuck-jobs | CRON_SECRET | 5分ごと | スタックジョブ回収 |

## 4. フロントエンド設計

### 4.1 ページ構成

| パス | コンポーネント | 説明 |
|-----|-------------|------|
| / | FacilityDashboard | 施設一覧（フィルター、DnD並べ替え） |
| /login | LoginForm | ログイン画面 |
| /facility/[facilityId] | FacilityDetail | 施設詳細（タグ編集、チャネル管理） |
| /shortcuts | ShortcutsList | ショートカット管理 |
| /settings/channel-logos | ChannelLogoSettings | ロゴ・背景色設定 |

### 4.2 コンポーネント階層

```
FacilityDashboard
├── DashboardHeader (ログアウト、並べ替えボタン)
├── Filters (検索、タグドロップダウン、ステータスドロップダウン)
│   └── URL同期 (useSearchParams → ?tag=xxx&status=yyy)
├── DndContext (@dnd-kit)
│   └── SortableContext
│       └── SortableFacilityCard[] (wiggle animation)
│           └── FacilityCard
│               ├── タグチップ表示
│               ├── ChannelTile[] (ロゴ + ステータスランプ)
│               └── FacilityMenu (ケバブメニュー)
└── 施設数カウント (x / y 件)

FacilityDetail
├── 施設ヘッダー (名前、PW表URL、タグ編集UI)
│   ├── TagEditor (チップ + 入力 + サジェスト + 保存ボタン)
│   └── 一括同期/転記ボタン
├── Chrome拡張接続ステータスバナー
└── ChannelSection[] (アコーディオン)
    ├── アカウント情報 (ID/PW、追加フィールド)
    ├── URLクエリ設定 (公開/管理画面)
    ├── ログイン実行ボタン
    └── 同期/転記ボタン
```

### 4.3 状態管理

- **サーバー状態**: Next.js Server Components でサーバーサイド取得
- **クライアント状態**: React useState/useCallback でローカル管理
- **URL状態**: useSearchParams + useRouter でフィルター状態をURL同期
- **DnD状態**: @dnd-kit の DndContext で管理

### 4.4 アニメーション

#### Wiggle（並べ替えモード）
```css
@keyframes wiggle {
  0% { transform: rotate(0deg); }
  20% { transform: rotate(-0.5deg); }
  50% { transform: rotate(0.5deg); }
  80% { transform: rotate(-0.3deg); }
  100% { transform: rotate(0deg); }
}
.animate-wiggle {
  animation: wiggle 0.5s ease-in-out infinite;
  animation-timing-function: cubic-bezier(0.25, 0.1, 0.25, 1);
}
```

## 5. Chrome拡張設計

### 5.1 構成

| モジュール | ファイル | 役割 |
|----------|---------|------|
| Popup | popup/index.ts | UI制御（ペアリング、ポーリング切替） |
| Background | background/index.ts | Service Worker（メッセージハブ、ポーリング） |
| Content Script | content/index.ts | ログイン自動化実行 |

### 5.2 メッセージフロー

```
[Web Portal]
    │ chrome.runtime.sendMessage(extensionId, DISPATCH_LOGIN)
    ▼
[Background Service Worker]
    │ 1. ジョブ作成 (POST /api/extension/dispatch)
    │ 2. タブ作成 (chrome.tabs.create)
    │ 3. pending_job を storage に保存
    │ 4. content script にメッセージ送信
    ▼
[Content Script]
    │ 1. pending_job 取得
    │ 2. ログインフォーム検出
    │ 3. ID/PW入力 → 送信
    │ 4. 結果判定 (success_indicator / logout検出 / エラー検出)
    │ 5. 結果報告 (POST /api/extension/report)
    ▼
[Background]
    └── 中間タブクローズ (chrome.tabs.remove)
```

### 5.3 ログインパターン

| パターン | 対象チャネル | 処理 |
|---------|------------|------|
| シングルステップ | じゃらん、ねっぱん、一休、etc. | selector で要素取得 → 値入力 → submit |
| マルチステップ | 楽天（SSO）、るるぶ（OTP） | login_steps[] を順番に実行、ステップ間で待機 |
| 施設選択 | 楽天、るるぶ | ログイン後に post_login_action で施設検索・選択 |
| 強制ログイン | リンカーン | 二重ログイン検出 → force_login.selector をクリック |
| 2FA対応 | リンカーン、るるぶ | pending_timeout_ms: 300000 (5分待機) |

### 5.4 安全機構

- **無限ループ防止**: ログイン実行前に `pending_job` を storage から削除
- **重複実行防止**: `pending_login_check` フラグで同一ジョブの二重実行を防止
- **スタックジョブ回収**: Cron で 10分超の in_progress を TIMEOUT、30分超の pending を AGENT_OFFLINE
- **リトライ制御**: `sendMessageWithRetry` で指数バックオフ（1.5s → 3s、最大2回）

## 6. セキュリティ設計

### 6.1 認証・認可

| レイヤー | 方式 | 詳細 |
|---------|------|------|
| Web Portal | Supabase Auth | email/password、セッションCookie |
| Chrome拡張 | Device Token | ペアリング時に生成、Bearer ヘッダー |
| API | RLS + middleware | user_id ベースの行レベルセキュリティ |
| Cron | CRON_SECRET | Bearer トークン |
| Google Sheets | Service Account | JSON キー |

### 6.2 暗号化

- パスワード: AES-256-GCM（環境変数 `ENCRYPTION_KEY`）
- IV: 12バイトランダム生成、暗号文に先頭付加
- Auth Tag: 16バイト、暗号文に末尾付加
- フォーマット: `base64(IV + ciphertext + authTag)`

### 6.3 禁止事項

- PW/Token/RefreshToken をログや成果物に出力しない
- console.log でクレデンシャルを出力しない
- E2E 成果物（外部レビュー用）に機密を含めない
- Git コミットにシークレットを含めない

## 7. デプロイ・運用設計

### 7.1 デプロイフロー

```
[開発PC]
  pnpm verify (lint + test + e2e:mock)
  git push origin main
       │
       ├──→ [Vercel] 自動デプロイ (Web Portal)
       │
       └──→ pnpm deploy:extension
              ├── pnpm build:extension
              ├── dist/ → otalogin-extension リポジトリにコピー
              ├── git commit -m "build: Update extension to <hash>"
              └── git push origin main
                    │
                    ▼
              [他PC] update-extension.bat → git pull → Chrome拡張リロード
```

### 7.2 環境変数

| 変数 | 用途 | 設定先 |
|------|------|-------|
| NEXT_PUBLIC_SUPABASE_URL | Supabase URL | Vercel + .env.local |
| NEXT_PUBLIC_SUPABASE_ANON_KEY | Supabase Anon Key | Vercel + .env.local |
| SUPABASE_SERVICE_ROLE_KEY | Supabase Service Role | Vercel + .env.local |
| NEXT_PUBLIC_EXTENSION_ID | 拡張機能ID | Vercel + .env.local |
| ENCRYPTION_KEY | パスワード暗号化キー | Vercel + .env.local |
| GOOGLE_SERVICE_ACCOUNT_KEY | Google SA JSON | Vercel |
| GOOGLE_MASTER_SHEETS_ID | マスタシートID | Vercel |
| CRON_SECRET | Cron認証 | Vercel |
| TC_PORTAL_WEBHOOK_URL | TC Portal Webhook URL | Vercel |
| TC_PORTAL_WEBHOOK_KEY | TC Portal Webhook Key | Vercel |

### 7.3 Cron スケジュール

| ジョブ | スケジュール | UTC | JST |
|--------|-----------|-----|-----|
| healthcheck | 毎日 | 20:00 | 05:00 |
| cleanup-stuck-jobs | 5分ごと | */5 | */5 |

**注意**: 自動巡回は 2026-03-25 時点でマスタシート完成まで一時停止中。
