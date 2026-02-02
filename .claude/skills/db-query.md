# /db-query

Supabaseデータベースに直接SQLクエリを実行するスキル

## 使用方法

```
/db-query SELECT * FROM facilities LIMIT 10
```

## 実行内容

<db-query>

1. 引数からSQLクエリを取得
2. Supabase Management APIを使用してクエリを実行
3. 結果を整形して表示

**注意**:
- SELECTクエリのみ推奨
- INSERT/UPDATE/DELETEは確認してから実行

クエリ実行には `scripts/run-migration.js` の `executeSql` 関数を参考にしてください。

</db-query>
