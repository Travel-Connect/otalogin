# UI参考リポジトリ

## 参考元

- **リポジトリ**: Travel-Connect/Otaloginsample
- **ベース**: Figma/repo-template 由来の Vite サンプル

## 本プロジェクトとの違い

| 項目 | Otaloginsample | 本プロジェクト (otalogin) |
|------|----------------|-------------------------|
| フレームワーク | Vite + React | Next.js App Router |
| ルーティング | React Router | Next.js App Router |
| デプロイ | - | Vercel |
| DB | - | Supabase |

## 参考にする点

### デザイン

- カードレイアウト
- 施設一覧の表示形式
- チャネルタイルのデザイン
- 状態ランプの色（緑/赤）

### クラス設計

- Tailwind CSS のユーティリティクラス
- コンポーネントの分割粒度
- レスポンシブ対応

## 本プロジェクトで独自実装する点

- Supabase 認証との統合
- Chrome 拡張との連携
- パスワード表示（目アイコン + 10秒マスク）
- 確認ダイアログ（Enter実行対応）
- RLS によるアクセス制御

## 参照リンク

```
# 参考リポジトリのクローン（読み取り専用）
git clone https://github.com/Travel-Connect/Otaloginsample.git
```

※ 本リポジトリは参考用。コードの直接コピーではなく、設計思想とUIパターンを参考にする。
