# /add-facility

施設を追加するスキル

## 使用方法

```
/add-facility [施設コード] [施設名]
```

例:
```
/add-facility HOTEL001 テストホテル
```

## 実行内容

<add-facility>

1. 引数から施設コードと施設名を取得
2. Supabase Management APIを使用してfacilitiesテーブルに挿入

```sql
INSERT INTO facilities (code, name) VALUES ('施設コード', '施設名');
```

成功したら、施設IDと共に報告してください。

</add-facility>
