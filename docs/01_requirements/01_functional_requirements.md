# 機能要件

## 概要

OTA（Online Travel Agency）自動ログイン支援ツール。
Chrome拡張 + 社内Webポータルで、複数のOTAサイトへのログインを自動化する。

## ユーザー

- 利用者: 5名（Windows 11、Chrome固定）
- 認証: メール + パスワード（Supabase Auth）
- 権限: admin ロール（マスタPW同期・施設編集）

## 対応OTAチャネル

| # | チャネル | コード | ログイン方式 | 備考 |
|---|---------|--------|-------------|------|
| 1 | 楽天トラベル | rakuten | マルチステップ（SSO） | 施設選択あり |
| 2 | じゃらん | jalan | シングルステップ | - |
| 3 | ねっぱん | neppan | シングルステップ | 契約コード追加フィールド |
| 4 | 一休 | ikyu | シングルステップ | オペレータID追加フィールド |
| 5 | スカイチケット | skyticket | シングルステップ | - |
| 6 | ちゅらとく | churatoku | シングルステップ | - |
| 7 | OTS | ots | シングルステップ | - |
| 8 | リンカーン | lincoln | シングルステップ | 2FA対応、強制ログイン、ユーザー別クレデンシャル |
| 9 | るるぶ | rurubu | マルチステップ（OTP） | OTP手動入力、施設検索 |
| 10 | DYNA IBE | dynaibe | シングルステップ | 自社OTA、J列=公式サイトURL |
| 11 | 手間いらず | temairazu | シングルステップ | ログインURLは施設ごとに異なる（F列参照） |
| 12 | 予約プロ | yoyakupro | シングルステップ | 自社OTA、J列=公式サイトURL |
| 13 | tripla | tripla | シングルステップ | 自社OTA、J列=公式サイトURL |
| 14 | CHILLNN | chillnn | シングルステップ | 自社OTA、J列=公式サイトURL。ログインボタンがtype="button" |
| 15 | ミンパクイン | minpakuin | シングルステップ | システム（民泊管理） |
| 16 | Booking.com | booking | リンク専用 | 海外OTA、公開URLのみ（ログイン自動化なし） |
| 17 | Trip.com | tripcom | リンク専用 | 海外OTA、公開URLのみ（ログイン自動化なし） |
| 18 | Agoda | agoda | リンク専用 | 海外OTA、公開URLのみ（ログイン自動化なし） |
| 19 | Expedia | expedia | リンク専用 | 海外OTA、公開URLのみ（ログイン自動化なし） |

## 機能一覧

### F1: ユーザー認証

- メール + パスワードでログイン
- ログアウト機能
- セッション管理（Supabase SSR）

### F2: 施設管理

- 施設一覧表示（カード形式）
- 施設カード右上に歯車アイコン（メニュー）
- 施設詳細画面
  - 施設情報の編集（admin限定）
  - チャネル（OTA）ごとの設定

### F3: チャネルアカウント管理

- 各施設 × 各チャネルごとにアカウント情報を管理
- shared（共通）と override（個別上書き）の2種類
- パスワード表示
  - デフォルトは `****` でマスク
  - 目アイコンクリックで表示
  - 10秒で自動的にマスク復帰
- 追加フィールド定義
  - チャネルごとに異なる追加項目（施設コード等）を定義可能
- ユーザー別クレデンシャル（リンカーン専用）
  - ポータルログインユーザーのメールアドレスに基づいてID/PWを切替
  - `facility_accounts.user_email` で管理
- パスワード暗号化
  - AES-256-GCM でDB保存時に暗号化
  - レイジーマイグレーション（平文→暗号文の自動変換対応）

### F4: マスタPW同期

- Google Sheets の共通マスタPWシートから Service Account 認証で同期
- 同期ボタンは施設詳細画面（admin限定）
- 同期モード:
  - **一括同期**: 施設ヘッダーの同期アイコンで全チャネルを一括同期
  - **個別同期**: 各チャネルタイルの「マスタPWと同期」ボタンで単一チャネルを同期
- 実行前に確認ダイアログを表示
- スプレッドシート列マッピング（A:L）:
  - A: 施設ID | B: 施設名 | C: OTA名 | D: ログインID | E: パスワード | F: ログインURL
  - G: オペレータID（一休） | H: 契約コード（ねっぱん） | I: 施設ID（楽天）
  - J: 公開ページURL | K: るるぶ施設コード | L: ユーザーメール（リンカーン）
- 追加フィールド同期: チャネルごとのフィールド定義に基づき、該当列の値を `account_field_values` に保存
- リンカーンの場合: L列のメールアドレスでユーザー別クレデンシャルを管理
- DYNA IBEの場合: J列のURLを `facilities.official_site_url`（公式サイトURL）として保存
- 「公式」行（C列="公式"）: J列のURLを `facilities.official_site_url` として保存
- スプレッドシートOTA名エイリアス: `moana` → `temairazu` 等、C列の表記揺れに対応

### F5: 手動ログイン実行

- ポータルから「ログイン実行」ボタンを押す
- Chrome拡張が同じウィンドウ内に新しいタブを開く
  - **別ウィンドウや別インスタンスの起動は NG**
- 拡張がID/PWを入力してログイン
- 結果をポータルに報告
- 対応パターン:
  - シングルステップログイン（じゃらん、ねっぱん等）
  - マルチステップログイン（楽天SSO、るるぶOTP等）
  - ログイン後施設選択（楽天、るるぶ）
  - 強制ログイン（リンカーン: 二重ログイン検出→自動クリック）

### F6: Health Check（自動ログインテスト）

- 毎日 05:00 JST（= 20:00 UTC）に実行
- 対象: shared アカウントのみ（override は対象外）
- 対象制御:
  - `facility_accounts.health_check_enabled` で施設×チャネル単位にON/OFF切替可能
  - Web UI の施設詳細画面に「巡回」チェックボックスを表示
  - リンク専用チャネル（link_only）は自動的に除外
- 各チャネルのログイン成否を記録
- 状態ランプで可視化
  - 緑: 最後の Health Check 成功
  - 赤: 最後の Health Check 失敗
- スタックジョブのクリーンアップ
  - in_progress: 10分超で自動タイムアウト
  - pending: 30分超で自動キャンセル
- Content Script 通信の信頼性向上:
  - `sendMessageWithRetry`: 指数バックオフ（1.5s → 3s）で最大2回リトライ
  - `pending_job` フォールバック: sendMessage 失敗時、Content Script が storage から直接ジョブ情報を取得
  - `waitForTabLoadWithRedirects`: リダイレクトチェーンをデバウンス（500ms）で待機

### F7: 状態表示

- 施設カード / チャネルタイル右上に状態ランプ
- 緑 / 赤 / グレー でログイン状態を視覚化
- 最終チェック日時の表示
- エラー時はエラーコード・メッセージを表示
- ログイン成功判定:
  - success_indicator セレクタ（チャネルごとに定義）で一次判定
  - フォールバック: ログアウトリンク/テキスト検出（`detectLogoutPresence`）で二次判定
  - ログインフォーム消失で三次判定
  - 認証エラー検出（`detectAuthError`）はログアウト確認後に実行（誤検出防止）

### F8: ディープリンク実行

- URLパラメータで施設×チャネルを指定し、選択状態にできる
- StreamDeck等の外部ツールからワンクリックでログイン実行が可能
- URL仕様:
  - `/facility/<facility_uuid>?channel=<code>` → チャネル選択状態で表示
  - `/facility/<facility_uuid>?channel=<code>&run=1` → 自動ログイン実行
  - `channelId=<uuid>` / `channel=<code|alias>` / `OTA=<alias>` の3種類で指定可能
  - 解決優先順位: channelId > channel > OTA
- エイリアス対応: `jaran` → `jalan`、`rakutentravel` → `rakuten` 等
- run=1 の場合:
  - 既存の dispatch → 拡張実行 → 結果報告フローを自動実行
  - 成功/失敗がUI上で確認できる
- 未ログイン時: `/login?returnTo=<元URL>` にリダイレクトし、ログイン後に復帰
- 不正パラメータは安全に無視（エラーにせず通常表示）
- セキュリティ: URLに機密情報（ID/PW等）は一切含めない

### F10: チャネルロゴ・背景色設定

- 各チャネルのロゴ画像と背景色をカスタマイズ可能
- 設定は全施設のダッシュボードに一括反映
- 設定画面: `/settings/channel-logos`（ヘッダーの「ロゴ設定」リンクからアクセス）
- ロゴアップロード:
  - 対応形式: PNG, JPEG, GIF, SVG, WebP
  - Supabase Storage（`channel-logos` バケット）に保存
  - 表示サイズ: 高さ50px、幅は自動（最大120px）
  - API: `POST /api/channel/logo`
- ロゴ表示優先順位:
  1. アップロード済みロゴ（`channels.logo_url`）
  2. Google Favicon API（`faviconDomain` 設定がある場合）
  3. テキストイニシャル（`shortName`）
- 背景色カスタマイズ:
  - カラーピッカーによる変更
  - DB保存: `channels.bg_color`（`#RRGGBB` 形式）
  - デフォルト色へのリセット機能
  - API: `PATCH /api/channel/settings`
- テキスト色の自動コントラスト:
  - YIQ brightness formula で背景色の明暗を判定
  - 明るい背景 → ダークテキスト（`#1f2937`）
  - 暗い背景 → ホワイトテキスト（`#ffffff`）

### F11: リンク専用チャネル（link_only）

- ログイン自動化なしで、公開ページURLのみを管理するチャネル
- 対象: 海外OTA（Booking.com, Trip.com, Agoda, Expedia）
- ダッシュボード表示:
  - タイルは常に色付きで表示（クリックしてもログイン実行しない）
  - 公開URLが設定されている場合は「公開」ボタンを表示
  - ステータスランプ: 公開URL設定済み → indigo（リンク）、未設定 → 非表示
- マスターシンク:
  - J列（公開ページURL）のみで同期（D列/E列のID/PWは不要）
  - `link_only: true` フラグで判定
- `CHANNEL_CONFIGS` に `link_only: true` を設定

### F12: ダッシュボードチャネルフィルタリング

- 施設ごとにアカウント設定（または公開URL）が存在するチャネルのみ表示
- 未登録チャネルは非表示（全施設共通で表示していた従来動作を変更）
- 施設カードにはその施設に関連するチャネルのみがタイルとして並ぶ

### F9: ショートカット

- ログインユーザーごとに任意個のショートカット定義を作成できる
- StreamDeck の「Open URL」アクションでの運用を最優先
- ショートカット定義:
  - name: ショートカット名（ユーザーが自由に命名）
  - facility_id: 対象施設
  - channel_id: 対象チャネル
  - action_type: `login`（ログイン実行）/ `public`（公開ページを開く）
  - slot_no: キーボードスロット番号（1-10、任意）
  - enabled: 有効/無効フラグ
- 実行URL（ディープリンク）を発行:
  - login: `/facility/<facilityId>?channel=<code>&run=1`
  - public: `/facility/<facilityId>?channel=<code>&open=public`
- キーボードショートカット（補助機能）:
  - chrome.commands の制約により最大10スロットのみ（Ctrl+Shift+1..0等）
  - slot_no を割り当てたショートカットのみキーボードで実行可能
  - 本命はURL（無制限）
- セキュリティ:
  - URLにID/PWを含めない
  - 未ログイン時はログイン画面へ誘導（returnTo付き）
  - RLSで自分のショートカットのみアクセス可能

## 画面構成

### /login

- メール + パスワード入力
- ログインボタン
- `returnTo` パラメータ対応（ログイン後にディープリンク先へ復帰）

### / （ホーム / 施設一覧）

- 施設カード一覧
- カード右上: 歯車アイコン（メニュー）
- カード: 状態ランプ表示
- ヘッダーに「ショートカット」リンク

### /facility/[facilityId]

- 施設情報表示・編集（admin限定）
- チャネルタブ / タイル
  - 各チャネルのアカウント設定
  - 状態ランプ
  - ログイン実行ボタン
  - マスタPW同期ボタン（admin限定）
  - パスワード表示（目アイコン + 10秒マスク）
- ディープリンク対応
  - `?channel=<code>` でチャネルタブ自動選択＋ハイライト＋スクロール
  - `?run=1` で自動ログイン実行
  - `?open=public` で公開ページURLを新規タブで開く
- StreamDeck URL 一覧（折りたたみ）
  - アカウント設定済みチャネルのディープリンクURLを自動生成
  - 各URLの個別コピー、全URLの一括TSVコピー
- ローディングスケルトン: サーバーレンダリング中に即座にUI表示

### /shortcuts

- ショートカット管理画面
- 一覧表示（検索/並び替え）
- 追加/編集/無効化/削除
- 「Copy URL」ボタン（StreamDeck連携用）
- StreamDeck設定案内（Open URL推奨）

### /settings/channel-logos

- チャネルロゴ・背景色の設定画面
- Systems / OTA のセクション分け
- 各チャネル行:
  - プレビュー（ロゴ+背景色）
  - カラーピッカー（背景色変更 + 保存 / リセット）
  - ロゴステータス（設定済み / 未設定）
  - アップロードボタン

### F13: TC Portal お知らせ連携（Webhook通知）

- ねっぱんの PW 変更経過日数アラートを TC Portal のお知らせに自動連携
- 日次ヘルスチェック時に `neppan_password_alerts` を保存した後、TC Portal の Webhook API を呼び出す
- 施設ごとに1つのお知らせとしてまとめ、`external_ref` で日次 upsert（重複防止）
- データフロー:
  ```
  [日次ヘルスチェック] → [拡張: ねっぱんログイン] → [Content Script: PW経過日数パース]
    → [POST /api/extension/neppan-alerts] → [neppan_password_alerts upsert]
    → [POST TC_PORTAL_WEBHOOK_URL] → [TC Portal: お知らせ作成/更新]
  ```
- Webhook リクエスト仕様:
  - URL: `TC_PORTAL_WEBHOOK_URL` 環境変数で指定
  - 認証: `X-Webhook-Key` ヘッダーに `TC_PORTAL_WEBHOOK_KEY` 環境変数の値を設定
  - Body:
    - `title`: `"⚠ ねっぱん PW変更アラート: {施設名}"`
    - `body`: `"・{サイト名}: {経過テキスト}"` を改行区切りで結合
    - `external_ref`: `"neppan-pw:{facilityId}:{YYYY-MM-DD}"` （日次で一意）
- Webhook 未設定時（環境変数なし）はスキップ（ログ出力のみ）
- TC Portal 側の動作:
  - `external_ref` が新規 → お知らせを `published` で新規作成
  - `external_ref` が既存 → `title` / `body` を更新（日次で内容が変わる場合に対応）

### F14: タグ管理UI

- 施設詳細画面（FacilityDetail）でタグを追加・削除できる
- タグはチップ（バッジ）で表示、各チップに × ボタンで削除
- テキスト入力欄で新しいタグを入力し Enter で追加
- 入力欄をクリックすると全施設の既存タグをドロップダウンでサジェスト表示
- 入力中は部分一致でサジェストをフィルタリング
- 「タグを保存」ボタンで明示的に保存（即時保存ではない）
- 権限: 全ユーザーが編集可能（admin 制限なし）
- DB: `facilities.tags` カラム（TEXT[] 型）
- API: `PATCH /api/facility/[facilityId]` に `{ tags: [...] }` を送信

### F15: 施設並べ替え（ドラッグ＆ドロップ）

- ダッシュボードの施設カードをユーザーごとにドラッグ＆ドロップで並べ替え可能
- ヘッダーの「並べ替え」ボタンで並べ替えモードに入る
- 並べ替えモード中:
  - ボタンが「完了」に変化
  - カードが iPhone ホーム画面風に揺れるアニメーション（wiggle）
  - 各カード左上にドラッグハンドル（6点アイコン）が表示
  - カードをドラッグ＆ドロップで移動可能
- 「完了」ボタンで並べ替えモードを終了、APIに一括保存
- 並べ替え未設定のユーザーは施設名の昇順（デフォルト）
- DnDライブラリ: `@dnd-kit/core` + `@dnd-kit/sortable`
- DB: `user_facility_order` テーブル（user_id, facility_id, position）
- RLS: ユーザーは自分の行のみ CRUD 可能
- API:
  - `GET /api/user-facility-order` — ユーザーの並び順を取得
  - `PUT /api/user-facility-order` — 一括保存（DELETE → INSERT）

### F16: フィルターのURL同期（ブックマーク対応）

- ダッシュボードのタグフィルター・ステータスフィルターをURLクエリパラメータに同期
- URL仕様:
  - `?tag=リゾート,南部` — 選択中のタグ（カンマ区切り）
  - `?status=error,running` — 選択中のステータス（カンマ区切り）
  - 複数パラメータ併用可: `?tag=リゾート&status=error`
- URLをブックマークすれば、開いた時にフィルター状態が復元される
- フィルターを解除するとクエリパラメータも消える
- ブラウザの戻る/進むボタンでフィルター状態が遷移する

### F17: マスタ転記（DB → Google Sheets）

- DB のクレデンシャル情報を Google Sheets のマスタPWシートに転記
- API: `POST /api/master-export`
- 施設ID + OTA名 + ユーザーメール（リンカーン）で既存行をマッチング
- マッチした行は `values.update`、無い行は `values.append`
- パスワードは AES-256-GCM で復号し、平文でシートに書き込む
- A〜L列の全フィールド対応
- UI: チャネル単位「マスタに転記」ボタン + 一括転記ボタン（上矢印アイコン）
- 確認ダイアログ付き（破壊的操作のため）
- export/sync で独立したローディング状態を管理

### F18: 拡張デプロイ自動化

- `pnpm deploy:extension` で以下を一括実行:
  1. `pnpm build:extension` でビルド
  2. `apps/extension/dist/` の中身を `otalogin-extension` リポジトリに同期
  3. OTAlogin 側の最新コミットハッシュ付きメッセージで自動コミット
  4. `git push origin main`
- 変更なし時は「No changes to deploy」で正常終了
- スクリプト: `scripts/deploy-extension.sh`

### （計画中）F19: ねっぱんパスワード循環

- ねっぱんのパスワード変更が一定日数で発生するため、10回パスワードを変更して元に戻す
- 例: 元パスワード ABC → ABC1 → ABC2 → ... → ABC10 → ABC
- 要件のみ（未実装）

## 非機能要件

### パフォーマンス

- リモート Supabase への独立クエリは `Promise.all()` で並列実行
- channels / field_definitions 等の変更頻度の低いマスタデータは60秒サーバーキャッシュ
- ログイン実行時は拡張接続チェック（PING）とジョブ作成（dispatch API）を並列実行
- ページ遷移時はスケルトンUIを即座に表示（白画面の排除）

### セキュリティ

- パスワードはAES-256-GCMで暗号化してDB保存
- パスワードは平文で拡張に保存しない
- ログ / 成果物に機密情報を出力しない
- RLS でデータアクセスを制御

### 運用

- 5名での同時利用に対応
- Windows 11 + Chrome 環境
- 拡張機能の配布: GitHub プライベートリポジトリ（`Travel-Connect/otalogin-extension`）経由
  - manifest.json の `key` フィールドで全PCの拡張機能IDを統一
  - `update-extension.bat` でユーザーが最新版を取得
  - 初回はペアリング設定が必要（デバイストークンを生成してDBに保存）
  - デバイストークンはデバイス単位（ユーザー単位ではない）

## 制約

- Chrome 拡張は Manifest V3
- Vercel Cron はタイムゾーン UTC 固定
- Supabase は @supabase/ssr を使用
