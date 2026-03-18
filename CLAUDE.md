# CLAUDE.md - OTAログイン支援ツール

## プロジェクト概要

Chrome拡張 + 社内Webポータル（Next.js）による OTA 自動ログイン支援ツール。
ユーザーが操作している Chrome ウィンドウ内に「タブを追加」してログイン処理を行う。

## 技術スタック

- **Monorepo**: pnpm workspace
- **Web**: Next.js 14+ App Router, TypeScript
- **DB/Auth**: Supabase (@supabase/ssr)
- **Extension**: Chrome Manifest V3
- **E2E**: Playwright (persistent context for extension testing)
- **Validation**: Zod

## ディレクトリ構成

```
/
├── apps/
│   ├── web/          # Next.js App Router (Vercel)
│   └── extension/    # Chrome Extension MV3
├── packages/
│   └── shared/       # 型/スキーマ/共通ロジック
├── supabase/
│   └── migrations/   # SQL migrations
├── docs/             # 仕様/運用/E2E/セットアップ
├── scripts/          # e2e-pack 等
└── .github/          # GitHub Actions
```

## 重要なルール

### セキュリティ（絶対厳守）

1. **PW/Token/RefreshToken をログや成果物に出さない**
2. **console.log でクレデンシャルを出力しない**
3. **E2E成果物（ChatGPTレビュー用）に機密を含めない**
   - `e2e:mock` のみを zip 化する
   - `e2e:real` の trace/screenshot は OFF

### Vercel Cron

- **タイムゾーンは UTC 固定**
- 05:00 JST = 20:00 UTC で設定する

### Supabase

- `@supabase/ssr` を使用（auth-helpers は使わない）
- RLS は必ず有効化

### Chrome Extension

- Manifest V3
- `externally_connectable` でポータル origin を許可
- `sender.tab.windowId` で同一ウィンドウにタブ追加

### ログイン処理の安全性（絶対厳守）

1. **ログインの無限ループを絶対に起こさない**
   - OTAサイトはログイン試行回数に制限があり、連続実行するとアカウントがロックされる
   - ログイン実行前に `pending_job` を storage から必ず削除すること
   - ASP.NET WebForms 等のフルページリロードが発生するサイトでは、リロード後に再実行されないよう注意
2. **Vite/esbuild は TypeScript の型チェックをしない**
   - 関数呼び出し時の引数の数・順序の誤りがビルドで検出されない
   - 特に `executeSingleStepLogin` 等のログイン実行関数は、引数ズレがサイレントに失敗し無限ループの原因になり得る
   - 関数呼び出しを変更したら、必ず関数定義のシグネチャと引数の順序・数を目視で照合すること
3. **ログイン実行は1ジョブにつき必ず1回だけ**
   - `pending_job` / `pending_login_check` の状態管理で重複実行を防止する
   - ログイン送信ボタンのクリック前後で適切にフラグを管理すること

### E2E テスト

- `e2e:mock`: mock ページで安定動作テスト（成果物 OK）
- `e2e:real`: 実 OTA テスト（成果物は社内保管のみ）
- Playwright は Chromium persistent context で拡張をテスト

## コマンド一覧

```bash
pnpm dev           # Web 開発サーバー起動
pnpm build         # Web ビルド
pnpm build:extension  # 拡張ビルド
pnpm lint          # Lint 実行
pnpm test          # Unit テスト
pnpm e2e:mock      # E2E テスト（mock）
pnpm e2e:real      # E2E テスト（実 OTA）
pnpm e2e:pack      # E2E 成果物 zip 化
pnpm verify        # lint + test + e2e:mock
```

## MVP 対象 OTA

1. 楽天トラベル
2. じゃらん
3. ねっぱん
4. 一休
5. スカイチケット

## 開発フロー

1. 変更前に `pnpm verify` でベースラインを確認
2. 小さな差分で実装
3. 変更後に `pnpm verify` を通す
4. **完了報告前に必ず E2E テスト（`pnpm e2e:mock` または実機確認）を実施すること**
   - ビルドが通っても実際の動作が壊れている場合がある
   - 特にログインフロー・拡張連携の変更は実機確認を推奨
5. PR 作成前に `pnpm e2e:pack` で成果物を生成
