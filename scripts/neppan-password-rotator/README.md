# neppan-password-rotator

ねっぱんのパスワード変更強制モーダル (`passwordAlert.php`) が出たときに、パスワードを N 回変更して最後に元のパスワードに戻すサブツール。過去世代 PW 再利用ロック／強制変更ポリシーのリセット用。

プラン: [docs/superpowers/plans/2026-04-24-neppan-password-rotator.md](../../docs/superpowers/plans/2026-04-24-neppan-password-rotator.md)

## セットアップ

```bash
cd scripts/neppan-password-rotator
pnpm install
npx playwright install chromium
```

`.env.local` は親ディレクトリ (`scripts/neppan-password-rotator/` または `apps/web/.env.local`) から自動読み込み。必要な変数:

```
NEXT_PUBLIC_SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
CREDENTIAL_ENCRYPTION_KEY=
```

## コマンド

### 単一施設のローテーション

```bash
# dry-run（フォーム入力まで、登録ボタンは押さない）
pnpm rotate --facility kanon --dry-run

# 本番（10 ランダム変更 + 1 元 PW 復帰 = 計 11 変更）
pnpm rotate --facility kanon --live --count 10
```

### 複数施設を順次ローテーション（モーダル検知スキップ）

```bash
pnpm rotate-all --facilities kanon,starhouse,t-room --dry-run
pnpm rotate-all --facilities kanon,starhouse,t-room --live
```

### 30 日経過した施設のみ自動ローテーション

```bash
# DB の neppan_password_rotations を見て対象を確認
pnpm list-due

# 対象施設のうち先頭 5 件を実行（Task Scheduler 用）
pnpm rotate-due --auto --live --days 30 --limit 5
```

Task Scheduler 連携手順 → [TASK_SCHEDULER_SETUP.md](TASK_SCHEDULER_SETUP.md)

### 健全性チェック（READ-ONLY、変更しない）

```bash
# 全施設のログイン可否を確認
pnpm login-check

# 特定施設のみ
pnpm login-check --facilities kanon,starhouse
```

### その他ユーティリティ

```bash
# ねっぱんアカウントを持つ全施設コードを表示
pnpm list

# 30 日以上前の logs/*.jsonl を削除
pnpm cleanup-logs

# DOM 事前調査（passwordAlert モーダル → 変更画面のスナップショット）
pnpm inspect --facility kanon
```

## セキュリティ

- `logs/` と `snapshots/` は `.gitignore` 済み（機密情報を含む可能性あり）
- パスワードは stdout に出力しない（`***` マスクのみ）
- ログファイルにのみ平文で記録（リカバリ最優先）
- 30 日で自動削除（`pnpm cleanup-logs` — 将来追加）
