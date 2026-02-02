# OTA自動ログイン支援ツール

Chrome拡張 + 社内Webポータルによる OTA（Online Travel Agency）自動ログイン支援ツール。

## 機能概要

- 複数の OTA サイトへのログイン自動化
- 施設ごとのアカウント管理
- 共通マスタパスワードシートとの同期
- 毎日の Health Check（自動ログインテスト）

## クイックスタート

```bash
# 依存関係インストール
pnpm install

# 開発サーバー起動
pnpm dev

# Chrome拡張ビルド
pnpm build:extension
```

## ドキュメント

詳細は [docs/README.md](docs/README.md) を参照してください。

- [セットアップチェックリスト](docs/00_overview/setup_checklist.md)
- [環境変数一覧](docs/00_overview/env_keys.md)
- [機能要件](docs/01_requirements/01_functional_requirements.md)
- [アーキテクチャ概要](docs/03_architecture/00_system_overview.md)

## 技術スタック

- **Frontend**: Next.js 14 (App Router)
- **Backend**: Next.js API Routes + Vercel
- **Database**: Supabase (PostgreSQL)
- **Extension**: Chrome Manifest V3
- **Testing**: Playwright

## 対象 OTA（MVP）

- 楽天トラベル
- じゃらん
- ねっぱん

## ライセンス

Private - Travel-Connect Internal Use Only
