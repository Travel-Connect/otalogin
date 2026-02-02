# ChatGPTレビュー用 E2E成果物手順

## 概要

E2Eテストの成果物をChatGPTにレビューしてもらうための手順。
**機密情報の漏洩を防ぐため、必ず `e2e:mock` の成果物のみを使用する。**

## 手順

### 1. Mock E2E テストを実行

```bash
pnpm e2e:mock
```

このコマンドは:
- Mock ログインページ（`/e2e/mock/*`）を使用
- 機密情報を含まない安全なテスト
- trace / screenshot を有効化

### 2. 成果物を ZIP 化

```bash
pnpm e2e:pack
```

このコマンドは:
- `playwright-report/` をコピー
- `test-results/` をコピー
- `e2e-summary.json` を生成
- `e2e-artifacts.zip` を作成

### 3. ZIP ファイルを確認

生成された `e2e-artifacts.zip` の内容:

```
e2e-artifacts.zip
├── playwright-report/
│   └── index.html
├── test-results/
│   └── (screenshots, traces, etc.)
└── e2e-summary.json
```

### 4. ChatGPT にアップロード

1. ChatGPT（GPT-4）を開く
2. `e2e-artifacts.zip` をアップロード
3. 以下のようなプロンプトで依頼:

```
添付したE2Eテストの成果物をレビューしてください。
以下の観点でフィードバックをお願いします：

1. テストカバレッジは十分か
2. テストケースの網羅性
3. エラーハンドリングのテスト
4. 改善提案
```

## 注意事項

### ⚠️ 絶対禁止

- `e2e:real` の成果物をChatGPTにアップロードしない
- 実OTAのURL、ID、パスワードを含む可能性がある
- trace ファイルにはスクリーンショットが含まれる

### ✅ 安全な使い方

- `e2e:mock` の成果物のみを使用
- Mock ページは `/e2e/mock/*` 以下
- 機密情報は一切含まれない

## 成果物の詳細

### e2e-summary.json

テスト結果のサマリー:

```json
{
  "timestamp": "2024-01-15T10:30:00Z",
  "totalTests": 10,
  "passed": 9,
  "failed": 1,
  "skipped": 0,
  "duration": 45000,
  "tests": [
    {
      "title": "should open tab in same window",
      "status": "passed",
      "duration": 3500
    },
    ...
  ]
}
```

### playwright-report/

HTMLレポート。ブラウザで `index.html` を開いて確認可能。

### test-results/

各テストのスクリーンショット、trace ファイル。
失敗時の状態を視覚的に確認できる。
