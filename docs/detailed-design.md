# OTAログイン支援ツール — 詳細設計書

**文書バージョン**: 1.0
**最終更新**: 2026-03-25

---

## 1. システムアーキテクチャ

```
┌─────────────────────────┐    ┌──────────────────────┐
│  Chrome Extension (MV3) │◄──►│  Web Portal (Next.js)│
│  - background.js        │    │  - Vercel             │
│  - content.js           │    │  - App Router API     │
│  - popup.html           │    │  - React UI           │
└────────┬────────────────┘    └──────────┬───────────┘
         │ Device Token Auth              │ Supabase Auth
         │                                │
         └────────────┬───────────────────┘
                      ▼
              ┌───────────────┐    ┌──────────────────┐
              │   Supabase    │    │ Google Sheets API │
              │  - PostgreSQL │    │  - マスタシート    │
              │  - Auth       │    │  - 読み書き双方向  │
              │  - RLS        │    └──────────────────┘
              └───────────────┘
```

---

## 2. データベース設計

### 2.1 ER図（主要テーブル）

```
facilities ─┬── facility_accounts ──── channels
             │        │
             │        ├── account_field_values ── account_field_definitions
             │        │
             ├── automation_jobs ────── channels
             │
             ├── channel_health_status ── channels
             │
             ├── user_facility_order ── auth.users
             │
             └── neppan_password_alerts

auth.users ─┬── user_roles
             └── user_shortcuts
```

### 2.2 テーブル定義

#### facilities（施設）

| カラム | 型 | 制約 | 説明 |
|---|---|---|---|
| id | UUID | PK, default gen | |
| code | VARCHAR(50) | UNIQUE | 施設コード（マスタシートA列） |
| name | VARCHAR(200) | NOT NULL | 施設表示名 |
| tags | TEXT[] | | タグ配列（フィルタ用） |
| category | TEXT | | OTA / Systems |
| official_site_url | TEXT | | 公式サイトURL |
| credential_sheet_url | TEXT | | ID/PW表URL |
| created_at | TIMESTAMPTZ | default now | |
| updated_at | TIMESTAMPTZ | default now | |

#### channels（OTAチャネル定義）

| カラム | 型 | 制約 | 説明 |
|---|---|---|---|
| id | UUID | PK | |
| code | VARCHAR(50) | UNIQUE | チャネルコード |
| name | VARCHAR(100) | | 表示名 |
| login_url | TEXT | | デフォルトログインURL |
| category | TEXT | | OTA / Systems |

#### facility_accounts（施設アカウント）

| カラム | 型 | 制約 | 説明 |
|---|---|---|---|
| id | UUID | PK | |
| facility_id | UUID | FK → facilities | |
| channel_id | UUID | FK → channels | |
| account_type | VARCHAR(20) | | shared / override |
| login_id | VARCHAR(200) | | ログインID |
| password_encrypted | TEXT | | 暗号化パスワード |
| login_url | TEXT | nullable | 施設固有ログインURL |
| public_page_url | TEXT | nullable | 公開ページURL |
| user_email | TEXT | nullable | ユーザー別クレデンシャル用 |

**ユニーク制約（部分インデックス）:**
- `uq_facility_accounts_shared`: (facility_id, channel_id, account_type) WHERE user_email IS NULL
- `uq_facility_accounts_per_user`: (facility_id, channel_id, account_type, user_email) WHERE user_email IS NOT NULL

#### automation_jobs（自動化ジョブ）

| カラム | 型 | 制約 | 説明 |
|---|---|---|---|
| id | UUID | PK | |
| facility_id | UUID | FK → facilities | |
| channel_id | UUID | FK → channels | |
| job_type | VARCHAR(20) | | manual_login / health_check |
| status | VARCHAR(20) | | pending → in_progress → success / failed |
| error_code | VARCHAR(50) | nullable | エラーコード |
| error_message | TEXT | nullable | エラー詳細 |
| created_by | UUID | nullable | ジョブ作成ユーザー |
| started_at | TIMESTAMPTZ | nullable | |
| completed_at | TIMESTAMPTZ | nullable | |

#### user_facility_order（ユーザー施設表示順序）

| カラム | 型 | 制約 | 説明 |
|---|---|---|---|
| id | UUID | PK | |
| user_id | UUID | FK → auth.users | |
| facility_id | UUID | FK → facilities | |
| position | INTEGER | | 表示順（0始まり） |
| UNIQUE | | (user_id, facility_id) | |

#### account_field_definitions（追加フィールド定義）

| カラム | 型 | 説明 |
|---|---|---|
| id | UUID, PK | |
| channel_id | UUID, FK | |
| field_key | VARCHAR(50) | hotel_id, operator_id, facility_id, rurubu_facility_code |
| field_label | VARCHAR(100) | 表示ラベル |
| field_type | VARCHAR(20) | text / password / select |

#### device_tokens（デバイストークン）

| カラム | 型 | 説明 |
|---|---|---|
| id | UUID, PK | |
| token | TEXT, UNIQUE | 拡張認証トークン |
| device_name | VARCHAR(100) | デバイス名 |
| last_used_at | TIMESTAMPTZ | 最終利用日時 |

### 2.3 RLSポリシー

| テーブル | SELECT | INSERT | UPDATE | DELETE |
|---|---|---|---|---|
| facilities | 認証済み全員 | admin | admin | admin |
| channels | 認証済み全員 | - | - | - |
| facility_accounts | 認証済み全員 | admin | admin | admin |
| automation_jobs | 認証済み全員 | 認証済み全員 | 認証済み全員 | - |
| user_facility_order | 自分のみ | 自分のみ | 自分のみ | 自分のみ |
| device_tokens | service_role | service_role | service_role | - |

---

## 3. API設計

### 3.1 拡張連携API（CORS対応）

| メソッド | パス | 認証 | 概要 |
|---|---|---|---|
| POST | /api/extension/pair | なし | ペアリングコードでデバイストークン取得 |
| GET | /api/extension/jobs | Device Token | 拡張がpendingジョブをポーリング |
| GET | /api/extension/job/[jobId] | Device Token | ジョブ詳細+クレデンシャル取得（claim） |
| POST | /api/extension/report | Device Token | ジョブ結果報告 |
| POST | /api/extension/dispatch | Supabase Auth | ポータルからジョブ作成 |
| POST | /api/extension/neppan-alerts | Device Token | ねっぱんPWアラート送信 |

#### ジョブライフサイクル

```
[ポータル] POST /dispatch → pending
                              ↓
[拡張] GET /job/[id]    → in_progress (claim)
                              ↓
[拡張] POST /report     → success / failed
```

#### GET /api/extension/job/[jobId] レスポンス

```json
{
  "job_id": "uuid",
  "channel_code": "tripcom",
  "login_url": "https://ebooking.ctrip.com/login/index",
  "login_id": "Group Account 2383936",
  "password": "decrypted_password",
  "extra_fields": { "hotel_id": "12345" }
}
```

### 3.2 施設管理API

| メソッド | パス | 認証 | 概要 |
|---|---|---|---|
| PATCH | /api/facility/[facilityId] | Admin | 施設情報更新（tags含む） |
| POST | /api/facility/account | Admin | アカウント作成/更新 |
| POST | /api/master-sync | Admin | マスタシート→DB同期 |
| POST | /api/master-export | Admin | DB→マスタシート転記 |

### 3.3 ユーザー設定API

| メソッド | パス | 認証 | 概要 |
|---|---|---|---|
| GET | /api/user-facility-order | Auth | 並び順取得 |
| PUT | /api/user-facility-order | Auth | 並び順保存 |

---

## 4. Chrome拡張設計

### 4.1 構成

| ファイル | 役割 |
|---|---|
| manifest.json | MV3マニフェスト（32ドメイン対応） |
| background.js | Service Worker: ジョブポーリング、タブ管理、メッセージハブ |
| content.js | Content Script: DOM操作、フォーム入力、結果報告 |
| popup.html/js | ポップアップUI: ペアリング、ステータス表示 |

### 4.2 ログイン実行フロー

```
[ポータル]                  [Background]              [Content Script]
    │                            │                          │
    ├─ DISPATCH_LOGIN ──────────►│                          │
    │  {job_id, login_url,       │                          │
    │   channel_code}            │                          │
    │                            ├─ chrome.tabs.create() ──►│
    │                            │  (同一ウィンドウ)          │
    │                            │                          │
    │                            ├─ sendMessage ───────────►│
    │                            │  (EXECUTE_LOGIN)         │
    │                            │                          │
    │                            │  [Content Script起動]    │
    │                            │                          ├─ GET /job/[id]
    │                            │                          │  → credentials取得
    │                            │                          │
    │                            │                          ├─ waitForElement()
    │                            │                          ├─ typeIntoField()
    │                            │                          ├─ clickElement()
    │                            │                          │
    │                            │                          ├─ POST /report
    │                            │                          │  → success/failed
```

### 4.3 typeIntoField（フォーム入力）

React SPA対応のため、2段階のフォールバック方式:

1. **execCommand('insertText')**: ブラウザネイティブの入力シミュレーション。React/Vue/Angular全対応。最も確実。
2. **ネイティブsetter + _valueTracker リセット**: execCommandが使えない環境用。React内部の変更追跡をリセットしてイベント発火。

### 4.4 安全ネット（pending_job）

- Background Script がジョブ情報を `chrome.storage.local` に `pending_job` として保存
- Content Script がページ読み込み時に `pending_job` を確認して自動実行
- ASP.NET等のフルページリロードに対応
- 実行前に `pending_job` を必ず削除（無限ループ防止）

### 4.5 デプロイフロー

```
pnpm deploy:extension
    │
    ├── pnpm build:extension        → apps/extension/dist/
    ├── git rev-parse --short HEAD  → ソースコミットハッシュ取得
    ├── rsync dist → otalogin-extension/  (.git, README.md保持)
    ├── git add -A && git commit    → "build: Update extension to {hash}"
    └── git push origin main        → GitHub配布リポジトリ更新
```

他PCでの更新: `git pull` → Chrome拡張リロード

---

## 5. マスタシート連携設計

### 5.1 シートカラムマッピング

| 列 | インデックス | 内容 | 対応先 |
|---|---|---|---|
| A | 0 | 施設コード | facilities.code |
| B | 1 | 施設名 | facilities.name |
| C | 2 | OTA名 | channels (エイリアス解決) |
| D | 3 | ログインID | facility_accounts.login_id |
| E | 4 | パスワード | facility_accounts.password_encrypted (暗号化) |
| F | 5 | ログインURL | facility_accounts.login_url |
| G | 6 | オペレータID | account_field_values (一休) |
| H | 7 | 契約コード | account_field_values (ねっぱん) |
| I | 8 | 楽天施設ID | account_field_values (楽天) |
| J | 9 | 公開ページURL | facility_accounts.public_page_url |
| K | 10 | るるぶ施設コード | account_field_values (るるぶ) |
| L | 11 | ユーザーメール | facility_accounts.user_email (リンカーン) |

### 5.2 同期ロジック

```
マスタ同期（POST /api/master-sync）:
1. シートから全行取得
2. 施設コード + OTA名でマッチング
3. OTAエイリアス解決（moana→temairazu, trip.com→tripcom等）
4. "公式"行 → facilities.official_site_url 更新
5. link_onlyチャネル → public_page_url のみ保存
6. 通常チャネル → login_id + 暗号化PW + login_url + extra_fields
7. リンカーン → 全マッチ行処理（user_email別）

マスタ転記（POST /api/master-export）:
1. DBからアカウント情報取得
2. パスワード復号
3. シートのD列(ID), E列(PW)に書き込み
```

---

## 6. フロントエンド設計

### 6.1 ページ構成

| パス | コンポーネント | 概要 |
|---|---|---|
| / | FacilityDashboard | 施設一覧（カード表示） |
| /facility/[id] | FacilityDetail | 施設詳細（チャネル別情報） |
| /login | LoginForm | ログインページ |

### 6.2 ダッシュボード機能

- **検索**: 施設名で即時フィルタ
- **タグフィルタ**: 複数タグ選択（URLパラメータ `?tag=` で永続化）
- **ステータスフィルタ**: エラー/実行中/未登録で絞り込み
- **並べ替えモード**: dnd-kit によるドラッグ＆ドロップ
  - 揺れアニメーション（CSS keyframes wiggle、0.5s ease-in-out）
  - ドラッグ中: opacity低下
  - ユーザーごとの順序をDB保存

### 6.3 施設詳細画面

- **ヘッダー**: 施設名、ID/PW表リンク、編集/削除ボタン
- **タグ管理**: チップ表示 + 入力フィールド + サジェスト + 保存ボタン
- **チャネルタブ**: OTA/Systems別にチャネル一覧
- **チャネル詳細**: ログインID/PW、ステータス、各種ボタン
  - ログイン実行、マスタPWと同期、マスタに転記
  - 公開ページ/管理画面のURL管理（タブから同期/手動編集）

---

## 7. セキュリティ設計

### 7.1 認証フロー

```
[Webポータル]
  Supabase Auth (email/password)
  → JWT トークン（Cookie）
  → RLS で行レベルアクセス制御

[Chrome拡張]
  ペアリングコード → デバイストークン取得
  → 全API呼び出しに Bearer トークン付与
  → device_tokens テーブルで検証
```

### 7.2 パスワード保護

- マスタシート: 平文（Google Workspace管理）
- DB: `password_encrypted` カラムに暗号化保存
- API: ジョブ取得時に復号して拡張に渡す
- ログ: パスワードは `***set***` でマスク
- UI: デフォルトマスク表示、目アイコンで切り替え

### 7.3 CORS設定

拡張APIのみCORSヘッダーを付与:
- `Access-Control-Allow-Origin: *`
- `Access-Control-Allow-Methods: GET, POST, OPTIONS`
- `Access-Control-Allow-Headers: Content-Type, Authorization`

---

## 8. 運用設計

### 8.1 拡張配布

| 手順 | コマンド/操作 |
|---|---|
| ビルド＋デプロイ | `pnpm deploy:extension` |
| 他PC初回 | `git clone` → Chrome「パッケージ化されていない拡張機能を読み込む」 |
| 他PC更新 | `git pull` → Chrome拡張リロード |

### 8.2 コマンド一覧

| コマンド | 説明 |
|---|---|
| `pnpm dev` | Web開発サーバー |
| `pnpm build` | Webビルド |
| `pnpm build:extension` | 拡張ビルド |
| `pnpm deploy:extension` | 拡張ビルド→デプロイ |
| `pnpm lint` | Lint実行 |
| `pnpm e2e:mock` | E2Eテスト（mock） |
| `pnpm verify` | lint + test + e2e:mock |

### 8.3 マイグレーション

- `supabase/migrations/` に SQL ファイルで管理（39ファイル）
- `supabase db push` でリモートDBに適用
- 競合時: `supabase migration repair --status reverted <version>` → `supabase db push --include-all`
