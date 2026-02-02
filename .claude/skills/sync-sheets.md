# /sync-sheets

Google Sheetsからマスタパスワードを同期するスキル

## 使用方法

```
/sync-sheets
```

## 実行内容

<sync-sheets>

**注意**: このスキルを実行するには、以下の環境変数が設定されている必要があります:
- GOOGLE_CLIENT_ID
- GOOGLE_CLIENT_SECRET
- GOOGLE_REFRESH_TOKEN
- GOOGLE_MASTER_SHEETS_ID

1. 環境変数の設定を確認
2. Google Sheets APIに接続
3. マスタパスワードシートからデータを取得
4. facility_accountsテーブルを更新

未設定の環境変数がある場合は、設定方法を案内してください。

</sync-sheets>
