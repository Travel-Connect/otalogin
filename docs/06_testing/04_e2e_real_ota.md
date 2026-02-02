# 実OTAテストの注意事項

## 概要

実際のOTAサイト（楽天、じゃらん、ねっぱん）に対するE2Eテスト。
**機密情報が混入するリスクがあるため、特別な取り扱いが必要。**

## 実行方法

```bash
pnpm e2e:real
```

## 設定

### 成果物の抑制

`playwright.config.ts` で `e2e:real` 用の設定:

```typescript
// e2e:real 用プロジェクト
{
  name: 'real-ota',
  use: {
    // 機密混入防止のため全て OFF
    trace: 'off',
    screenshot: 'off',
    video: 'off',
  },
}
```

### 出力

- **許可**: テスト結果のサマリーのみ
  - 成功 / 失敗
  - URL（ドメインのみ）
  - 実行時刻
  - エラーコード（あれば）
- **禁止**:
  - スクリーンショット
  - trace ファイル
  - ビデオ録画
  - ログイン ID / パスワード

## 機密情報の混入リスク

### リスクのある成果物

| 成果物 | リスク | 対策 |
|--------|--------|------|
| Screenshot | ログイン画面にID/PWが表示される | OFF |
| Trace | DOM にクレデンシャルが含まれる | OFF |
| Video | 入力中のパスワードが映る | OFF |
| Console Log | デバッグ出力に機密が混じる | フィルタリング |

### 安全なサマリー出力例

```json
{
  "timestamp": "2024-01-15T05:00:00+09:00",
  "type": "health_check",
  "results": [
    {
      "channel": "rakuten",
      "facility": "hotel_xxx",
      "status": "success",
      "duration": 5200
    },
    {
      "channel": "jalan",
      "facility": "hotel_xxx",
      "status": "failed",
      "error_code": "LOGIN_TIMEOUT",
      "duration": 30000
    }
  ]
}
```

## 運用ルール

### ✅ 許可される操作

- 社内ネットワーク内での実行
- 結果サマリーの社内共有
- 失敗時の調査（ただし手動で、画面を見ながら）

### ⚠️ 禁止される操作

- `e2e:real` の成果物を ChatGPT にアップロード
- 成果物を社外に送信
- trace/screenshot を ON にして実行
- ログにパスワードを出力

## トラブルシューティング

### ログイン失敗時

1. まず手動でログインを試す
2. OTA側の仕様変更がないか確認
3. セレクタの変更が必要か調査
4. connector を更新

### タイムアウト

1. ネットワーク状況を確認
2. OTA側の応答時間を確認
3. タイムアウト値の調整を検討

## 定期実行（Health Check）

- 毎日 05:00 JST（= 20:00 UTC）
- Vercel Cron から `/api/cron/healthcheck` を呼び出し
- 結果は `channel_health_status` テーブルに保存
- ポータルの状態ランプに反映
