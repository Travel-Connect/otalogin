---
name: update-extension
description: Chrome拡張機能をビルドして更新案内を表示する
---

Chrome拡張機能をビルドして更新してください。

1. プロジェクトルートで拡張機能をビルド:

```bash
pnpm build:extension
```

2. ビルド結果を確認し、成功・失敗を報告

3. 成功した場合、ユーザーに以下を案内:
   - chrome://extensions を開く
   - 「OTAログイン支援」拡張機能の更新ボタンをクリック
   - 開いている Web ポータルのページを再読み込み（F5）

4. 失敗した場合、エラー内容を表示して修正を提案
