# システム全体像

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
         │ WebSocket/ │  ┌─────────┐  │
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
  - Background Service Worker: メッセージ受信、タブ管理
  - Content Scripts: OTAサイトでのDOM操作、ログイン処理
  - externally_connectable: ポータルからのメッセージ受信
- **重要**: 同一ウィンドウ内にタブを追加（`sender.tab.windowId` 使用）

### Web Portal (Next.js)

- **役割**: ユーザーインターフェース、API提供
- **デプロイ**: Vercel
- **技術**: Next.js 14+ App Router, TypeScript

### Supabase

- **役割**: データベース、認証
- **テーブル**:
  - facilities: 施設情報
  - channels: OTAチャネル定義
  - facility_accounts: アカウント情報
  - automation_jobs: ジョブ管理
  - channel_health_status: 状態管理
- **認証**: メール + パスワード
- **RLS**: 有効化必須

### Google Sheets

- **役割**: 共通マスタPWシートの参照元
- **認証**: OAuth 2.0 (Refresh Token)
- **同期**: チャネル単位で手動実行

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
3. Extension polls for pending jobs (or receives push)
   Extension ──GET /api/extension/pending──► API
                        │
4. Extension executes each job
   (Same as manual login flow)
                        │
5. Health status updated
   API ──UPDATE channel_health_status──► Supabase
```

## セキュリティ設計

### 認証情報の取り扱い

- **拡張への保存**: pairing token のみ（平文PWは保存しない）
- **API経由での取得**: jobId 方式
  - ポータル → 拡張に ID/PW を直送しない
  - 拡張が jobId で API から取得

### ログ・成果物

- PW / Token / RefreshToken をログに出力しない
- E2E成果物は e2e:mock のみ zip 化
- e2e:real の成果物は社内保管のみ

### RLS（Row Level Security）

- 全テーブルで RLS 有効化
- MVP: 全ユーザーが全施設を閲覧・実行可能
- credential 更新・同期は role=admin のみ
