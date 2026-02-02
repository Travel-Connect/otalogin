# /build-extension

Chrome拡張機能をビルドするスキル

## 使用方法

```
/build-extension
```

## 実行内容

<build-extension>

1. `apps/extension` ディレクトリに移動
2. 依存関係をインストール
3. ビルドを実行

```bash
cd apps/extension && pnpm install && pnpm build
```

ビルドが完了したら、`dist` フォルダの場所を報告してください。
Chromeへのインストール手順も案内してください。

</build-extension>
