# /create-user

テストユーザーを作成するスキル

## 使用方法

```
/create-user [email] [password]
```

引数を省略した場合はデフォルト値を使用:
- Email: test@example.com
- Password: Test1234!

## 実行内容

<create-user>

1. 引数からemailとpasswordを取得（省略時はデフォルト値）
2. `scripts/create-test-user.js` を参考にユーザーを作成
3. 必要に応じてadmin権限を付与

ユーザーが既に存在する場合は、その旨を報告してください。

</create-user>
