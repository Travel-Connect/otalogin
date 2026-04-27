# Windows タスクスケジューラ セットアップ手順

`neppan-password-rotator` の自動実行を Windows タスクスケジューラで設定する手順。
30 日経過した施設のみを 1 日 5 件まで処理する。

## 前提

- マイグレーション `20260427000000_add_neppan_password_rotations.sql` を Supabase に適用済み
- `.env.local` に Supabase 接続情報が設定済み
- `pnpm install` 済み、`npx playwright install chromium` 済み
- Stage A/B のテストが完了している

## 動作確認（手動実行）

タスク登録前に動作確認:

```powershell
cd C:\OTAlogin\scripts\neppan-password-rotator

# 対象施設の確認（DB の last_rotated_at に基づく）
pnpm list-due

# dry-run（変更しない）
pnpm rotate-due --dry-run

# 本番（対話確認あり）
pnpm rotate-due --live --limit 1

# .bat 経由で動作確認（実際の Task Scheduler と同等）
.\run-rotate-due.bat
```

`logs/task-scheduler/run-{timestamp}.log` に実行ログが残ります。

## タスクスケジューラへの登録

### 方法 A: GUI から登録

1. `Win + R` → `taskschd.msc` でタスクスケジューラを起動
2. 右ペインから「タスクの作成」
3. **[全般] タブ**
   - 名前: `neppan-password-rotator`
   - 説明: `ねっぱん パスワード 30日ごと自動更新`
   - 「ユーザーがログオンしているかどうかにかかわらず実行する」を選択
   - 「最上位の特権で実行する」にチェック
4. **[トリガー] タブ → 新規**
   - 設定: 毎日
   - 開始: `04:00:00`
   - 繰り返し間隔: なし
   - 有効
5. **[操作] タブ → 新規**
   - 操作: プログラムの開始
   - プログラム/スクリプト: `cmd.exe`
   - 引数の追加: `/c "C:\OTAlogin\scripts\neppan-password-rotator\run-rotate-due.bat"`
   - 開始: `C:\OTAlogin\scripts\neppan-password-rotator`
6. **[条件] タブ**
   - 「コンピューターをAC電源で使用している場合のみ...」のチェックは運用に応じて
7. **[設定] タブ**
   - 「タスクが要求時に実行されるようにする」にチェック
   - 「タスクが失敗した場合の再起動の間隔」: 30 分 / 3 回
8. OK → 管理者パスワード入力

### 方法 B: コマンドラインから登録（schtasks）

PowerShell を **管理者として実行** して以下:

```powershell
# 既存タスクを削除（再登録時のみ）
schtasks /Delete /TN "neppan-password-rotator" /F

# 毎日 04:00 に実行を登録
schtasks /Create `
  /TN "neppan-password-rotator" `
  /TR "cmd.exe /c \"C:\OTAlogin\scripts\neppan-password-rotator\run-rotate-due.bat\"" `
  /SC DAILY `
  /ST 04:00 `
  /RL HIGHEST `
  /F

# 登録確認
schtasks /Query /TN "neppan-password-rotator" /V /FO LIST
```

ユーザーがログオンしてなくても実行するには追加で:

```powershell
schtasks /Change /TN "neppan-password-rotator" /RU "<DOMAIN>\<USER>" /RP "<PASSWORD>"
```

## タスクの動作

毎日 04:00 起動 → 以下を順に実行:

1. `neppan_password_rotations` を照会して、`last_rotated_at < now() - 30days` または未登録の施設を抽出
2. 上限 5 件まで取得（`--limit 5`）
3. 各施設で 10 ラウンドのランダム変更 + 元 PW 復帰を実行
4. 成功時に `neppan_password_rotations.last_rotated_at = NOW()` を upsert
5. 30 日以上前のログファイルを自動削除

**例**: 22 施設すべてが 30 日 + α 経過した場合:
- Day 1: 5 施設処理 → DB 更新
- Day 2: 残 17 施設のうち 5 件処理
- Day 3: 残 12 件のうち 5 件
- Day 4: 残 7 件のうち 5 件
- Day 5: 残 2 件処理 → 全施設更新完了
- 以降、各施設の 30 日後に再対象化

施設を均等に分散させたい場合は、初回ブートストラップ時にあえて 5 件ずつ日を分けて実行すると以降のスケジュールが分散します。

## トラブルシュート

### タスクが実行されない
- タスクの「最後の実行結果」を確認（タスクスケジューラ GUI）
- `logs/task-scheduler/run-*.log` を確認

### pnpm が見つからない
タスクが対話セッションでない場合、PATH に pnpm が含まれていない可能性。
`run-rotate-due.bat` 内の `pnpm` を絶対パスに置き換える:
```bat
call "C:\Users\<USER>\AppData\Local\pnpm\pnpm.cmd" rotate-due --auto --live ...
```

### chromium 起動失敗
- 初回のみ `npx playwright install chromium` の実行が必要
- ヘッドレス起動なので画面表示は不要

### 一部施設で失敗
- `logs/bootstrap-{facility}-{ts}.jsonl` の最後の行で「現在 PW」を確認
- DB の `neppan_password_rotations.last_status = 'failed'` で失敗状態を確認可能
- 手動復旧後、`pnpm rotate --facility <code> --live` で個別再実行

## 監視

DB クエリで現状確認:
```sql
SELECT
  f.code,
  f.name,
  r.last_rotated_at,
  r.rotation_count,
  r.last_status,
  r.last_error
FROM facilities f
JOIN facility_accounts fa ON fa.facility_id = f.id
JOIN channels c ON c.id = fa.channel_id AND c.code = 'neppan'
LEFT JOIN neppan_password_rotations r ON r.facility_id = f.id
WHERE fa.account_type = 'shared' AND fa.user_email IS NULL
ORDER BY r.last_rotated_at NULLS FIRST;
```
