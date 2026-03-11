# タスク一覧

最終更新: 2026-03-11

---

## 完了済みタスク

### Phase 1: DB統合 ✅ 完了

- [x] 施設一覧の Supabase 実データ取得（FacilityList.tsx）
- [x] 施設詳細の Supabase 実データ取得（page.tsx）
- [x] channel_health_status の JOIN・集計
- [x] アカウント情報（password含む）の取得API
- [x] ダミーデータの削除

### Phase 2: UI統合 ✅ 完了

- [x] チャネルタイルに「ログイン実行」ボタン追加
- [x] `/api/extension/dispatch` 呼び出し + Chrome拡張メッセージ送信
- [x] 「マスタPWと同期」ボタン + ConfirmDialog統合（admin限定）
- [x] パスワード表示（目アイコン + 10秒自動マスク）
- [x] 追加フィールドUI統合
- [x] 施設情報の編集（admin限定）
- [x] StatusLamp の DB連携表示

### Phase 3: 拡張統合 ✅ 完了

- [x] externally_connectable 設定・DISPATCH_LOGIN メッセージ受信
- [x] pending job ポーリング（1分間隔）
- [x] device_token による認証
- [x] Content Script: 9チャネル対応
  - [x] 楽天トラベル（マルチステップSSO + 施設選択）
  - [x] じゃらん
  - [x] ねっぱん
  - [x] 一休
  - [x] スカイチケット
  - [x] ちゅらとく
  - [x] OTS
  - [x] リンカーン（2FA + 強制ログイン + ユーザー別クレデンシャル）
  - [x] るるぶ（OTP + 施設検索）

### Phase 4: E2Eテスト ✅ 基本完了

- [x] e2e:mock: ログイン画面テスト（6テスト）
- [x] `pnpm verify` パス（lint + test + e2e:mock）
- [x] 実OTAでの手動テスト実施

### セキュリティ強化 ✅ 完了

- [x] AES-256-GCM パスワード暗号化
- [x] レイジーマイグレーション（平文→暗号文自動変換）

### リンカーン対応 ✅ 完了

- [x] DBマイグレーション（チャネル追加 + user_email カラム）
- [x] 部分ユニークインデックス（shared/per-user分離）
- [x] ユーザー別クレデンシャル（master-sync L列対応）
- [x] ジョブ作成者メールでのクレデンシャル検索

### ディープリンク実行 (F8) ✅ 完了

- [x] CHANNEL_ALIASES / resolveChannelCode() 追加（shared package）
- [x] searchParams 解析（channelId > channel > OTA 優先順位）
- [x] FacilityDetail: initialChannel/autoRun props、ハイライト/スクロール
- [x] run=1 自動ログイン実行（dispatch→拡張→report）
- [x] ログインページ returnTo 対応（未ログイン時の復帰）
- [x] 詳細設計書作成（docs/02_design/03_deeplink.md）
- [x] 2FA対応（pending_timeout_ms: 300000）
- [x] 強制ログイン検出・自動クリック

### ショートカット (F9) ✅ 完了

- [x] DBマイグレーション（user_shortcuts テーブル + RLS + 部分ユニーク制約）
- [x] Supabase型定義更新（user_shortcuts + ShortcutWithDetails）
- [x] API: GET/POST /api/shortcuts, PATCH/DELETE /api/shortcuts/[id]
- [x] UI: /shortcuts ショートカット管理画面（検索/並び替え/Copy URL）
- [x] ディープリンク: open=public パラメータ対応
- [x] ホーム画面にショートカットリンク追加
- [x] 詳細設計書作成（docs/02_design/04_shortcuts.md）

### チャネルロゴ・背景色設定 (F10) ✅ 完了

- [x] Supabase Storage（channel-logosバケット）セットアップ
- [x] DBマイグレーション（logo_url, bg_color カラム追加）
- [x] ChannelLogoコンポーネント（favicon → テキストフォールバック）
- [x] ロゴアップロードAPI（POST /api/channel/logo）
- [x] 背景色変更API（PATCH /api/channel/settings）
- [x] 設定画面（/settings/channel-logos）
- [x] カラーピッカー + 保存 / リセット
- [x] テキスト色自動コントラスト（YIQ brightness formula）
- [x] アップロード済みロゴ: h=50px, w=auto表示

### リンク専用チャネル (F11) ✅ 完了

- [x] link_only フラグ追加（ChannelConfig）
- [x] Booking.com チャネル追加（DB + 型 + VISUALS/CONFIGS/ALIASES）
- [x] Trip.com チャネル追加
- [x] Agoda チャネル追加
- [x] Expedia チャネル追加
- [x] マスターシンク: link_onlyチャネルのJ列URLのみ同期
- [x] ChannelTile: link_onlyタイル表示（クリック無効、公開ボタン表示）
- [x] StatusLamp: 'link' ステータス追加（indigo色）

### ダッシュボードチャネルフィルタリング (F12) ✅ 完了

- [x] 施設ごとに未登録チャネルを非表示

### Vercelデプロイ ✅ 完了

- [x] Vercelプロジェクト作成（otalogin-web）
- [x] 環境変数設定
- [x] Cron: Hobbyプラン制約対応（日次のみ）
- [x] externally_connectable: デプロイURLに更新

### URLクエリ同期 ✅ 完了

- [x] サニタイズユーティリティ（denylist + ドメイン検証）
- [x] DBマイグレーション（public_url_query / admin_url_query JSONB カラム）
- [x] API: PATCH /api/facility/account/url-query
- [x] UI: UrlQuerySection（表示/編集/タブ同期）
- [x] Extension: SYNC_URL_QUERY ハンドラ
- [x] Unit テスト（17テスト）

---

## 未実装タスク

### 優先度: 低

| タスク | 説明 | 備考 |
|--------|------|------|
| shared/override切替UI | アカウントタイプの切替UI | 現状sharedで運用に問題なし |
| e2e:real 自動化 | 実OTAテストの自動化 | 現状は手動テストで対応 |
| e2e:pack 成果物 | ChatGPTレビュー用zip化 | 必要時に実施 |
| 施設の新規登録UI | 管理画面から施設を追加 | 現状はDB直接操作 |

---

## 完了チェックリスト

DB統合:
- [x] ダミーデータの削除
- [x] エラーハンドリングの確認
- [x] Loading状態の表示確認

UI統合:
- [x] 全ボタンの動作確認
- [x] ConfirmDialogの表示確認
- [x] エラーメッセージの表示確認

拡張統合:
- [x] 9 OTA での手動ログイン成功
- [x] Health Check の自動実行成功
- [x] ステータスランプの更新確認

E2Eテスト:
- [x] `pnpm verify` パス
- [ ] `pnpm e2e:pack` で成果物生成
- [ ] ChatGPTレビュー依頼可能な状態
