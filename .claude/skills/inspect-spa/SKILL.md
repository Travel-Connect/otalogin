---
name: inspect-spa
description: React SPAのDOM要素・セレクタを調査する
---

React SPA（シングルページアプリケーション）のDOM構造を調査し、自動操作に必要なセレクタ情報を取得するスキル。

## 使い方

ユーザーがOTAサイト（楽天トラベル、じゃらん、ねっぱん等）のページ要素を調査したい場合に使用。

## 調査手順

1. **ユーザーからHTML断片を受け取る**: ユーザーがDevToolsからコピーしたHTML要素を受け取る

2. **セレクタの特定**: 以下の優先順位でセレクタを特定する
   - `data-testid` 属性（テスト用に安定）
   - `id` 属性（一意性が高い）
   - `name` 属性（フォーム要素）
   - `role` + `aria-*` 属性（アクセシビリティ）
   - CSSクラス（React SPAでは `css-xxxxx` のような動的クラスは避ける）
   - 要素の親子関係（`table > tbody > tr > td`など）

3. **React SPA特有の注意点を確認**:
   - `input.value` の直接設定はReactの状態を更新しない → `nativeInputValueSetter` を使う
   - React Selectなどのカスタムコンポーネントは通常のselectではない
   - `[class*="css-"]` のようなCSS-in-JSクラスは動的に変わる可能性がある
   - `data-testid` は最も安定したセレクタ

4. **channels.ts との照合**: 特定したセレクタを `packages/shared/src/constants/channels.ts` の設定と照合

5. **content/index.ts への反映**: 必要に応じて以下を更新:
   - `channels.ts` のセレクタ設定
   - `content/index.ts` のログイン処理ロジック

## React SPA要素の操作テクニック

### テキスト入力（React controlled input）
```typescript
// NG: React の状態が更新されない
input.value = 'value';

// OK: ネイティブsetterでReactの_valueTrackerをバイパス
const setter = Object.getOwnPropertyDescriptor(
  window.HTMLInputElement.prototype, 'value'
)?.set;
setter?.call(input, 'value');
input.dispatchEvent(new Event('input', { bubbles: true }));
```

### React Select（ドロップダウン）
```typescript
// 1. コントロール部分をクリックして開く
// 2. [class*="option"] でオプションを探す
// 3. テキストマッチでターゲットを見つけてクリック
```

### ボタンクリック
```typescript
// React synthetic eventはネイティブイベントのバブリングを利用
element.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
```

## DevToolsでの確認方法（ユーザー向け案内）

1. Chrome DevTools を開く（F12）
2. Elements タブで対象要素を右クリック
3. 「Copy」→「Copy outerHTML」でHTML断片をコピー
4. コンソールで `document.querySelector('セレクタ')` でセレクタを検証
5. React DevTools拡張がある場合、Componentsタブでpropsを確認可能
