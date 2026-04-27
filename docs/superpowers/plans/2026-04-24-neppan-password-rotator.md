# ねっぱん パスワード変更通知 自動対応ツール 実装プラン

**Goal:** ねっぱんから届くパスワード変更強制モーダル (`passwordAlert.php`) が出た時、パスワードを N 回（既定 10 回）連続で変更し、最後に元のパスワードに戻すサブツールを作る。過去パスワード再利用ロックや強制変更ポリシーをリセットする用途。

**Architecture:** OTAlogin リポジトリ内のローカル Playwright スクリプトとして `scripts/neppan-password-rotator/` に配置。既存の `master-input-helper` と同じ TypeScript + ts-node + Playwright 構成。Supabase の `facility_accounts` から kanon のねっぱんクレデンシャルを取得してログイン、以降は本ツールが DOM 操作する。

**Tech Stack:** TypeScript (ts-node), Playwright, `@supabase/supabase-js`, `dotenv`

**Safety Level:** 実パスワード書き換えを伴う破壊的操作。既定 `--dry-run`、`--live` フラグ必須。

---

## 背景

- ねっぱんは一定期間でパスワード変更が強制され、ログイン直後に以下のモーダルが出る
- 現状は運用者が手動で新パスワードを考えて打ち込んでいる
- 過去 N 世代同一 PW 禁止がある場合、手動で 10 回変更して元に戻すと「強制変更ポリシーだけリセット、運用者が覚えるパスワードは変えない」が成立する
- この 10 回ループを自動化する

---

## DOM 解析結果（ユーザー提供 + 既存コードから確定）

### 1. 検出トリガー（モーダル）

ログイン直後のトップページに以下が挿入される（ColorBox ライブラリ）。

```html
<div id="cboxContent" ...>
  <div id="cboxLoadedContent" ...>
    <iframe src="./passwordAlert.php?flg=1" class="cboxIframe"></iframe>
  </div>
  ...
</div>
```

**判定方針:**
- `#cboxContent iframe.cboxIframe` の `src` が `passwordAlert.php` を含むかで判定
- または親ページ内で `document.querySelector('iframe[src*="passwordAlert"]')` の存在確認

### 2. 「次へ」ボタン（iframe 内）

```html
<a class="updatebutton" name="btnUpdate"
   href="./operatorPasswordUpdate.php"
   value="update" target="_parent">次へ</a>
```

- **iframe 内**にあるため Playwright では `page.frameLocator('iframe[src*="passwordAlert"]').locator('a[name="btnUpdate"]')`
- `target="_parent"` なのでクリックで **親ページ** が `operatorPasswordUpdate.php` に遷移
- `Promise.all([page.waitForURL(/operatorPasswordUpdate\.php/), frame.click(...)])` で同期

### 3. パスワード変更画面 (`operatorPasswordUpdate.php`)

遷移後ドメイン: `https://www2.neppan.net/operatorPasswordUpdate.php`（`www2` はログインセッションのノード番号で動的）

| 項目 | セレクタ | name 属性 |
|---|---|---|
| 今までのパスワード | `#nowpassword` | `operatorPasswordUpdateForm:Nowpassword` |
| 新しいパスワード | `#newpassword1` | `operatorPasswordUpdateForm:Newpassword1` |
| 確認のため再入力 | `#newpassword2` | `operatorPasswordUpdateForm:Newpassword2` |
| 登録ボタン | `#doConfirm` | — (`<a href="#">`) |

`<a href="#" id="doConfirm">` なので JS ハンドラで form submit される。クリック後の遷移はナビゲーション監視で拾う。

### 4. 完了画面

`https://www2.neppan.net/operatorPasswordUpdateComplete.php`

- この URL 到達を成功判定に使う
- 到達しなかった場合＝バリデーションエラー（過去 PW 被り等）と扱う

### 5. 未確認 DOM（実走前に 1 回だけスナップショットを取って確定したい）

- [x] パスワード文字種ポリシー（Phase 0 で確定 — 下記参照）
- [x] 過去 N 世代ロックの世代数（**過去 10 回分**、page DOM に明記あり）
- [ ] バリデーションエラー表示の DOM 位置（`error`/`errorAlertDialog` 系の要素が見えるが、実地で発火させないと内容不明）
- [ ] `#doConfirm` クリック時に JS confirm ダイアログが挟まるか
- [ ] CSRF token 再発行のタイミング（完了画面 → 変更画面再表示時に token が更新されるか）

### 6. パスワードポリシー（Phase 0 で確定）

変更画面 (`operatorPasswordUpdate.php`) の DOM から抽出:

| 条件 | リアルタイム判定 span |
|---|---|
| 長さ 8 文字以上 | `#checkLengthNG` / `#checkLengthOK` |
| 小文字のアルファベット必須 | `#checkLowercaseNG` / `#checkLowercaseOK` |
| 大文字のアルファベット必須 | `#checkUppercaseNG` / `#checkUppercaseOK` |
| 数字必須 | `#checkNumberNG` / `#checkNumberOK` |
| 半角特殊文字必須 `~!@#$%^&*()_+}{[]?:;,.=-/` | `#checkSpecialCharacterNG` / `#checkSpecialCharacterOK` |
| 使用可能文字のみ | `#checkUsableCharacterNG` / `#checkUsableCharacterOK` |
| **過去 10 回分の再利用不可** | JS 判定なし（サーバ側バリデーション） |

**生成戦略（確定）**: 最低 12 文字、各カテゴリから最低 1 文字保証。ひらがなは使わない。

---

## ファイル構成

```
scripts/neppan-password-rotator/
├── package.json
├── tsconfig.json
├── .gitignore               # logs/, .env.local を除外
├── README.md
├── src/
│   ├── index.ts             # CLI エントリ (yargs or commander)
│   ├── rotator.ts           # N回ローテーションのメインループ
│   ├── credentials.ts       # Supabase から facility_accounts 取得 + 復号
│   ├── login.ts             # ログイン実行（既存 connectors の再実装）
│   ├── password-gen.ts      # ポリシー準拠のPW生成
│   ├── page-actions.ts      # モーダル検出 / 変更画面 / 完了判定
│   └── log.ts               # JSONL 実行ログ（リカバリ情報）
├── logs/                    # .gitignore 対象（機密）
└── snapshots/               # DOM 調査結果保存先（.gitignore）
```

---

## 実行フロー

### Phase 0: DOM 事前調査（実装前に 1 回のみ）

`src/_inspect.ts` を作り、変更画面まで遷移して DOM を保存するだけ（送信しない）。

```
1. kanon でねっぱんログイン
2. モーダル検出 → "次へ" クリック
3. operatorPasswordUpdate.php 到達
4. DOM スナップショット保存:
   - snapshots/inspect-{ts}/page.html
   - snapshots/inspect-{ts}/screenshot.png
   - snapshots/inspect-{ts}/form-fields.json （全 input の属性ダンプ）
5. わざと空フォームで #doConfirm クリック → エラー表示の DOM を保存
6. ブラウザを閉じずに終了（操作者が目視確認できるように）
```

### Phase 1: メインローテーション（`--live` 実行時）

```
1. CLI 引数パース: --facility kanon --count 10 [--live]
2. Supabase から kanon の neppan クレデンシャルを取得
   - login_id / password / extra.hotel_id を復号
   - 現在PW を P0 として保持
3. ログファイル作成: logs/kanon-{ISO timestamp}.jsonl
   - 初回 event: { type: "start", facility, initial_pw, count }
   - 以降すべてのステップを append（クラッシュしてもデータ残る）
4. Playwright 起動（headless: false、手動監視可能）
5. ログイン
6. モーダル検出 → "次へ"
7. ループ i=1..N-1:
   a. operatorPasswordUpdate.php の準備確認
   b. 新PW生成（ポリシー準拠、履歴とも非重複）
   c. #nowpassword に「現在のPW」、#newpassword1/2 に「新PW」
   d. #doConfirm クリック
   e. 完了ページ到達を確認（タイムアウト 30s）
      - 到達しなければエラー扱い → ログに記録して中断（自動リトライしない）
   f. ログ append: { type: "rotate", round: i, from_pw, to_pw, result }
   g. 「現在のPW」を更新
   h. 次ループ用に再度モーダル経由 or 再度変更画面にアクセス
      （※ 完了画面から変更画面にどう戻るか要調査）
8. 最終ラウンド (i=N): 新PW を P0 に設定して実行
9. ログ append: { type: "restore", final_pw: P0, result }
10. 整合性チェック: 最終 PW が P0 と一致していることを確認
11. ログ append: { type: "complete", success: true }
12. ブラウザは閉じず、操作者の目視確認を待つ
```

### Phase 2: 異常終了時のリカバリ

- `logs/*.jsonl` の最後のイベントから「実際に設定されている最新 PW」を特定
- `--resume logs/kanon-xxx.jsonl` で、その PW を現在値として再開
- 再開できない場合の最終手段として、平文でログに残っている PW を使って手動復旧

---

## ログ設計（最優先要件）

**目的:** 途中で異常終了しても、現在ねっぱんに設定されている PW が必ず特定できること。

**形式:** JSONL（1イベント1行 append）。クラッシュ耐性重視。

```jsonl
{"ts":"2026-04-24T10:00:00Z","event":"start","facility":"kanon","count":10,"initial_pw":"OldPass123!"}
{"ts":"2026-04-24T10:00:05Z","event":"login","result":"success"}
{"ts":"2026-04-24T10:00:08Z","event":"modal_detected"}
{"ts":"2026-04-24T10:00:12Z","event":"rotate","round":1,"from_pw":"OldPass123!","to_pw":"Rnd_a1b2c3!","result":"success"}
{"ts":"2026-04-24T10:00:20Z","event":"rotate","round":2,"from_pw":"Rnd_a1b2c3!","to_pw":"Rnd_d4e5f6!","result":"success"}
...
{"ts":"2026-04-24T10:02:00Z","event":"restore","from_pw":"Rnd_x9y8z7!","to_pw":"OldPass123!","result":"success"}
{"ts":"2026-04-24T10:02:05Z","event":"complete","final_pw":"OldPass123!","matches_initial":true}
```

**セキュリティ:**
- `scripts/neppan-password-rotator/logs/` は `.gitignore` 対象
- Windows ACL で本人のみアクセス推奨（自動設定はしない）
- 平文で残す理由 = リカバリ最優先（途中で落ちた時に PW が読めないと復旧不能）
- 完了後 30 日経過で自動削除のクリーンアップコマンドを別途用意
- **絶対に stdout に PW を出さない**（コンソールには `***` マスク表示、ログファイルにのみ平文）

---

## PW 生成仕様（確定）

**方針**: ランダム PW ではなく **連番 PW** を採用。予測可能だが各 PW の寿命は数秒なので実質リスクなく、ログ消失時の復旧可能性が大幅に向上する。

**フォーマット**: `Rotate-{YYYYMMDD}-{NN}{suffix}`
- 例: `Rotate-20260424-01!A`, `Rotate-20260424-02!A`, ..., `Rotate-20260424-10!A`
- `NN` は 2 桁ゼロ埋めのラウンド番号
- `suffix` は既定 `!A`、P0 や履歴と衝突した場合は `!B`, `!C`... を試行

**ポリシー充足**: 20 文字、大小数字記号すべて含む（`-` と `!` は許可特殊文字）

**衝突チェック**: 実行開始時に `suffix` を固定するため、生成する 10 個すべてを初期 PW および運用者が与える過去履歴（あれば）と照合。衝突するなら次の suffix へ。

```typescript
export function sequentialPassword(date: Date, round: number, suffix = '!A'): string {
  const yyyymmdd = date.toISOString().slice(0, 10).replace(/-/g, '');
  const roundStr = String(round).padStart(2, '0');
  return `Rotate-${yyyymmdd}-${roundStr}${suffix}`;
}

export function resolveSuffix(initialPw: string, history: Set<string>, date: Date, count: number): string {
  const suffixes = ['!A', '!B', '!C', '!D', '!E'];
  for (const suffix of suffixes) {
    const candidates = Array.from({ length: count }, (_, i) => sequentialPassword(date, i + 1, suffix));
    const collides = candidates.some((pw) => pw === initialPw || history.has(pw));
    if (!collides) return suffix;
  }
  throw new Error('All suffix candidates collide');
}
```

**リカバリのしやすさ**: ログ消失時でも「実行日 + 現在ラウンド」から PW を完全再構成可能。

## 過去 10 回ロックへの対応（重要な設計判断）

**制約**: ねっぱんは「過去 10 回分のパスワード」の再利用を禁止。P0 を履歴から押し出すには 10 回ランダム変更が必要。

**CLI 引数の意味**: `--count N` = **ランダム変更回数**（最終復帰は別枠で+1）

```
例: --count 10 の場合 (計 11 回変更)
ラウンド    現在PW → 新PW       直近10履歴（ねっぱん側）
1          P0 → P1              { P0 }
2          P1 → P2              { P0, P1 }
...
10         P9 → P10             { P0..P9 }
最終復帰   P10 → P0             { P1..P10 }   ← P0 を再利用可能
```

**既定値**: `--count 10` （= 10 ランダム + 1 復帰 = 計 11 変更）

**フォールバック**: 最終復帰で「過去 N 回と同一」エラーが検出されたら、追加で 1 ラウンドのランダム変更を挿入してから再復帰を試行（最大 +3 回追加まで）。それでも無理なら直近のランダム PW のまま停止してログ出力、運用者が手動対応。
この場合 Supabase 側の PW 更新も必要なので、ログの最終行に **"MANUAL ACTION REQUIRED: current pw = XXXX"** を目立つ形で出す。

## テスト戦略（過去10回ロックで小さい count が不可のため）

1. **フォーム入力 dry-run（変更しない）** — `--dry-run`
   - 変更画面まで遷移 → 3 フィールド入力
   - 入力後、JS バリデーション span 6 個（`#checkLengthOK`〜`#checkUsableCharacterOK`）全てが表示されていることを確認
   - **登録ボタンは押さない**
   - PW 生成 + フォーム入力 + ポリシー充足 を検証
   - ねっぱん側の状態は変わらない

2. **本番実行** — `--live --count 10`
   - 最初のリアル実行から全ラウンド走らせる（小さい count での試走は不可）
   - 全ラウンドの PW を JSONL に append、失敗時はそこから手動復旧

---

## 安全策

1. **デフォルト `--dry-run`**: ログインと変更画面遷移のみ、`#doConfirm` は押さない
2. **`--live` 必須**: 実変更は明示フラグが無いと動かない
3. **確認プロンプト**: `--live` でも起動時に "Rotate kanon's password 10 times? (y/N)" を出す
4. **セッション維持**: 10 回中に再ログイン不要（アカウントロック対策）
5. **中断時の処理**: SIGINT で必ずログに `{event:"abort"}` を書いて終了
6. **headless: false**: 操作者が目視監視可能（PW 入力欄は画面に映るので注意）
7. **`--count` 制限**: 1〜20 の範囲外はエラー（暴発防止）
8. **Supabase 書き戻しはしない**: 実行中は Supabase の PW は古いまま。最終的に元 PW に戻るので整合性維持。途中失敗時は手動で Supabase を直して再開（ログから最終 PW が分かる）

---

## CLI 仕様

```bash
# DOM 事前調査（変更しない）
pnpm --filter neppan-password-rotator inspect --facility kanon

# ドライラン（ログイン + 変更画面到達のみ）
pnpm --filter neppan-password-rotator rotate --facility kanon

# 本番実行（実際に PW 変更）
pnpm --filter neppan-password-rotator rotate --facility kanon --live --count 10

# 異常終了時のリカバリ
pnpm --filter neppan-password-rotator rotate --facility kanon --live --resume logs/kanon-2026-04-24.jsonl
```

---

## 実装ステップ（チェックリスト）

**Stage A: kanon 単独動作確認**
- [ ] 1. `scripts/neppan-password-rotator/` スキャフォールド（package.json, tsconfig, .gitignore）
- [ ] 2. `credentials.ts`: master-input-helper の Supabase 接続パターンを流用して kanon の neppan creds を取得
- [ ] 3. `login.ts`: `asp.hotel-story.ne.jp/ver3/ASPU0201.asp` へログイン（selectors は `packages/shared/constants/channels.ts` から import）
- [ ] 4. `_inspect.ts`: Phase 0 の DOM スナップショットスクリプト（**ユーザーと一緒に実走して結果確認**）
- [ ] 5. `page-actions.ts`: モーダル検出 / iframe 内「次へ」/ 変更画面フォーム入力 / 完了判定
- [ ] 6. `password-gen.ts`: ポリシー準拠 PW 生成
- [ ] 7. `log.ts`: JSONL append writer + ログ 30 日クリーンアップコマンド
- [ ] 8. `rotator.ts`: メインループ
- [ ] 9. `index.ts`: CLI（`rotate` / `inspect` / `cleanup-logs`）
- [ ] 10. `--dry-run`（変更画面まで入力するが登録ボタンを押さない）で動作確認
- [ ] 11. 本番 `--live --count 10` 実走（= 10 ランダム + 1 復帰）→ Supabase の PW が変わっていないことを確認

**Stage B: 全施設ブートストラップ**
- [ ] 12. `rotate-all` サブコマンド追加（`facility_accounts` から neppan 保有施設を列挙）
- [ ] 13. サマリレポート出力（成功/失敗施設リスト）
- [ ] 14. 夜間に `rotate-all --live` を手動トリガーで実行

**Stage C: 30日ごと自動更新**
- [ ] 15. `neppan_password_rotations` テーブルマイグレーション追加
- [ ] 16. `rotator.ts` が成功時に `neppan_password_rotations` を upsert
- [ ] 17. `rotate-due` サブコマンド追加（`last_rotated_at < now() - 30 days` の施設のみ処理）
- [ ] 18. `TcPortalRunner` 側に日次ジョブとして `rotate-due --auto --live` を登録（or GitHub Actions/タスクスケジューラ）

---

## 確定事項（ユーザー回答済）

- **対象施設**: kanon で運用確認 → 問題なければ全施設展開
- **ログ保管期間**: 30 日自動削除
- **実行戦略**: 初回は全施設一括で実施（ブートストラップ）→ 以降は 30 日ごとに自動更新

## Open Questions（Phase 0 で実地確認）

1. **パスワード文字種ポリシー**: ねっぱんは記号を許容するか？最小長は？
2. **過去世代ロックの世代数**: 10 回で本当にリセットされるか？（Phase 0 の挙動から逆算）
3. **完了画面から次ラウンドへの戻り方**: `operatorPasswordUpdateComplete.php` → `operatorPasswordUpdate.php` の遷移経路

---

## 自動化戦略（3 フェーズ）

### Stage A: kanon 単独で動作確認（手動実行）

```bash
pnpm --filter neppan-password-rotator rotate --facility kanon --live --count 10
```

成功基準:
- 10 ラウンド全て成功
- 最終 PW が元の PW と一致
- 再ログインできる（Supabase の PW が有効）
- 次回ログイン時にパスワード変更モーダルが出ない（= ポリシーリセット成功）

### Stage B: 全施設ブートストラップ（手動トリガー、1 回のみ）

新 CLI: `rotate-all --live`

```bash
pnpm --filter neppan-password-rotator rotate-all --live [--count 10]
```

動作:
1. `facility_accounts` からねっぱんのクレデンシャルを持つ全施設を取得
2. 各施設に対して順次ローテーション実行（並列はしない＝アカウントロック回避）
3. 施設ごとに個別ログファイル: `logs/bootstrap-{facility_code}-{ts}.jsonl`
4. サマリレポート: `logs/bootstrap-summary-{ts}.json`（成功/失敗の施設リスト）
5. 失敗があっても次の施設に進む（失敗はサマリに記録、手動復旧前提）

実行時間目安: 1施設あたり数分 × N施設。夜間実行推奨。

### Stage C: 30日ごとの自動更新

**データモデル:**

新規テーブル `neppan_password_rotations` を追加（責務分離のため `neppan_password_alerts` とは別）。

```sql
CREATE TABLE neppan_password_rotations (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  facility_id     UUID NOT NULL REFERENCES facilities(id),
  last_rotated_at TIMESTAMPTZ NOT NULL,
  rotation_count  INTEGER NOT NULL DEFAULT 0,
  last_status     TEXT NOT NULL CHECK (last_status IN ('success','failed','in_progress')),
  last_error      TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (facility_id)
);
```

**トリガー方式（推奨仮定）:**

- **候補 1（推奨）: `TcPortalRunner` 側に常駐ジョブとして組み込み**
  - 既に Windows 常駐プロセスがある前提（作業ディレクトリ `C:\TcPortalRunner`）
  - 1 日 1 回起動時に `neppan_password_rotations` を照会し `last_rotated_at < now() - 30 days` の施設を処理
  - 社内ネットワーク内で実行できるので、IP 制限のある OTA にも強い
- **候補 2: GitHub Actions scheduled workflow**
  - `cron: '0 20 * * *'`（UTC 20:00 = JST 05:00、既存ヘルスチェックと同時刻）
  - Secrets に Supabase creds、ログは Actions artifact に upload
  - Playwright chromium は GH Actions で普通に動く
- **候補 3: Windows タスクスケジューラで日次起動**
  - もっともシンプル、運用者 PC で実行

**既定推奨**: 候補 1（TcPortalRunner 組込）。ただし本ツールは「どこからでも呼べる CLI」として実装し、ランナー部分は疎結合にする。

**自動実行時の安全策:**
- `--auto` フラグで「確認プロンプトなし」実行（対話なし環境用）
- ただし `--live` は依然必須（ポリシー外実行を防ぐ）
- 1 日あたりの最大施設数制限（例 5 施設/日）で暴発時の被害を限定
- 実行前に `neppan_password_alerts` で最新アラート状況を確認し、PW 変更アラートが出ていない施設はスキップ（無駄打ち防止）

---

## 参考（既存コード）

- ねっぱんログイン URL/セレクタ: [channels.ts:176-192](../../packages/shared/src/constants/channels.ts#L176-L192)
- ねっぱん top.php アラート抽出: [content/index.ts:1448-1509](../../apps/extension/src/content/index.ts#L1448-L1509)
- Supabase クレデンシャル取得パターン: [master-input-helper/src/lib/load-facilities.ts](../../scripts/master-input-helper/src/lib/load-facilities.ts)
- パスワード変更アラート API: [docs/neppan-password-alerts-api.md](../neppan-password-alerts-api.md)
