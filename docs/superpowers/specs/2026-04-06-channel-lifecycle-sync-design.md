# チャネルライフサイクル同期 設計書

**作成日**: 2026-04-06
**ステータス**: ドラフト
**対象範囲**: マスタシート連動のチャネル追加／削除フロー

---

## 1. 背景と目的

### 1.1 現状の問題

現在、施設詳細画面（`/facility/[facilityId]`）は `channels` マスタテーブルに登録されている全チャネル（現時点で20チャネル）をタブとして常に表示する。施設がそのチャネルのアカウントを持っていなくても空タブが並ぶ。

また、マスタPWシートからチャネルを削除しても `facility_accounts` の行は残り続けるため、「契約解除されたOTAがいつまでも UI に出続ける」状態になる。逆方向（UI で不要な OTA を消す）も、施設全体の削除以外には用意されていない。

### 1.2 ユースケース

- **A. 契約解除**: ある施設が楽天トラベルの契約を解除した → マスタシートから行を削除 → 一括同期でDBとUIから消えてほしい
- **B. 再契約**: 同じ施設が再度楽天と契約した → マスタシートに行を追加 → 一括同期でDBとUIに復活してほしい
- **C. 手動削除**: UI で誤って登録した OTA を消したい → 削除ボタンでDBとマスタシートの両方から消えてほしい（同期で復活しないように）

### 1.3 目的

マスタシートと `facility_accounts` を「施設が使っているOTA」の single source of truth として双方向に同期する。UI は `facility_accounts` の有無でタブ表示をフィルタし、削除操作はどちら側から行っても整合性が保たれるようにする。

---

## 2. 用語定義

| 用語 | 意味 |
|---|---|
| マスタPWシート | Google Spreadsheet `施設×OTAアカウント` シート。列構成は A=施設ID, B=施設名, C=OTA, D=ID, E=PW, F=ログインURL, G=オペレータID(一休), H=契約コード(ねっぱん), I=施設ID(楽天), J=公開ページURL, K=るるぶ施設コード, L=ユーザーメール(リンカーン) |
| 一括同期 | 施設詳細画面の「全チャネル一括同期」ボタン。`POST /api/master-sync` を `channel_id` なしで呼ぶ |
| 単一同期 | 各チャネル詳細の「マスタPWと同期」ボタン。`POST /api/master-sync` を `channel_id` 付きで呼ぶ |
| missing_in_sheet | DB に存在するが同期時点でマスタシートに存在しない (facility, channel) の組 |

---

## 3. 要件

### FR-1: アカウントのあるチャネルだけタブに表示する

施設詳細画面のタブは、その施設に `facility_accounts` 行が存在するチャネルのみを表示する。ダッシュボードのチャネルアイコン列は既に同じフィルタを実装済みのため変更不要。

**受け入れ条件:**
- `facility_accounts` に行が無いチャネルはタブに現れない
- 1つもアカウントが無い施設では、空タブエリアの代わりにエンプティステート（「アカウントが登録されていません。マスタPWと一括同期してください。」）を表示
- `router.refresh()` 後、削除された直後のタブは即座に消える

### FR-2: 一括同期時に「マスタから消えた OTA」を検出してユーザーに提示する

一括同期（`channel_id` 未指定）のレスポンスに、DB に存在するがシートに存在しない組み合わせを `missing_in_sheet` リストとして返す。同期処理自体（upsert）では削除は行わない。

**受け入れ条件:**
- 一括同期レスポンスに `missing_in_sheet: Array<{ channel_id, channel_name, account_count }>` が含まれる
- 単一同期（`channel_id` 指定時）では `missing_in_sheet` は計算しない（undefined）
- `missing_in_sheet` の計算中にエラーが出ても、同期本体は成功として返す（`missing_in_sheet: []`、サーバログに warning）
- リンカーンのユーザー別クレデンシャル複数行がある場合、`account_count` に反映される

### FR-3: 一括同期後の第2ダイアログによる選択的削除

一括同期のレスポンスに `missing_in_sheet` が含まれ、かつ空でない場合、フロントエンドは第2ダイアログを表示する。ユーザーがチェックボックスで選択した項目だけを削除する。

**ダイアログ仕様:**
- タイトル: 「マスタに無いOTAが見つかりました」
- 本文: 「以下のOTAはこの施設のDBにありますが、マスタPWシートには存在しません。マスタから意図的に削除した場合は『削除』を押してください。」
- チェックボックスリスト（デフォルト全ON）: `{channel_name}（{account_count}件）`
- ボタン: `[キャンセル]` `[選択したOTAを削除]`（赤）
- キャンセルクリックで何もしない。同期自体は完了しているので `results` のメッセージは先に表示される

**受け入れ条件:**
- チェックを外したチャネルは削除されない
- 「選択したOTAを削除」クリックで `POST /api/facility/[facilityId]/cleanup-missing` を呼び、DBのみ削除（シートは既に空のため触らない）
- 削除後 `router.refresh()` でタブが更新される

### FR-4: チャネル単位の削除ボタン（admin 限定）

各チャネル詳細エリアのヘッダーに、「マスタPWと同期」「マスタに転記」と並ぶ形で admin 限定の赤いゴミ箱アイコンを追加する。

**ダイアログ仕様:**
- タイトル: 「OTAを削除」
- 本文: 「この施設の『{channel_name}』のログイン情報をDBとマスタPWシートから削除します。この操作は取り消せません。マスタPWシートから再度追加して同期すれば復活できます。」
- ボタン: `[キャンセル]` `[削除する]`（赤）

**処理順序:**
1. admin 権限チェック
2. facility と channel の存在確認
3. マスタシート該当行を `batchUpdate` + `deleteDimension` で物理削除
4. `facility_accounts` 削除（`account_field_values` は `ON DELETE CASCADE`）
5. `channel_health_status` の該当 `(facility_id, channel_id)` 行を削除

**受け入れ条件:**
- 非 admin ユーザーにはボタンが表示されない／API 呼び出しは 403
- シート削除失敗時は DB を触らずエラーを返す（整合性保持）
- シート削除成功・DB削除失敗時は 500 エラーを返す。次回 export で復活するためデータロスなし
- 削除後 `activeChannel` が削除対象だった場合、`visibleChannels[0]` にフォールバック
- リンカーンの場合、その施設×チャネルの全行（複数ユーザー）を一括削除

### FR-5: マスタシート行の物理削除ヘルパー

Google Sheets API の `spreadsheets.batchUpdate` と `deleteDimension` リクエストで行を物理削除するヘルパー関数を新規作成する。

**関数シグネチャ:**
```ts
async function deleteMatchingRows(
  sheets: sheets_v4.Sheets,
  spreadsheetId: string,
  sheetName: string,
  matcher: (row: string[], index: number) => boolean,
  dataStartRow?: number,
): Promise<number>
```

**仕様:**
- `spreadsheets.get` でシート内部ID（sheetId/gid）をシート名から取得
- 全行取得 → `matcher` でヒットする行の 0-based インデックスを収集
- 降順ソート（末尾から削除することでインデックスシフトを防ぐ）
- `batchUpdate` で一括削除
- 削除した行数を返す
- ヒット 0 件の場合は API 呼び出しを省略して 0 を返す

---

## 4. 非機能要件

### 4.1 セキュリティ

- NFR-1: すべての削除系エンドポイントは admin 権限チェックを必須とする（`user_roles.role = 'admin'`）
- NFR-2: 削除処理中もパスワード等のクレデンシャルをログ出力しない
- NFR-3: Google Sheets サービスアカウントに書き込み権限が必要（既存）

### 4.2 データ整合性

- NFR-10: マスタシート → DB の順に削除することで、シート削除失敗時の DB 孤児化を防ぐ
- NFR-11: `facility_accounts` と `account_field_values` は `ON DELETE CASCADE` で整合性が保たれる
- NFR-12: `channel_health_status` は `facility_accounts` を参照していない独立テーブルのため、削除 API 内で明示的にクリーンアップする
- NFR-13: 冪等性: 同じチャネルを2回削除しても、2回目は DB も シートも既に空のため 200 成功で返す

### 4.3 マイグレーション

- NFR-20: DB スキーマ変更なし。既存の CASCADE 制約で対応可能

---

## 5. アーキテクチャ

### 5.1 コンポーネント変更サマリ

| コンポーネント | 変更内容 |
|---|---|
| `apps/web/src/app/facility/[facilityId]/FacilityDetail.tsx` | タブを `account != null` でフィルタ、チャネル削除ボタン追加、第2ダイアログ追加、`activeChannel` フォールバック |
| `apps/web/src/app/facility/[facilityId]/page.tsx` | `resolvedInitialChannel` をフィルタ後のリストから選ぶ |
| `apps/web/src/app/api/master-sync/route.ts` | 一括同期時に `missing_in_sheet` を計算してレスポンスに含める |
| **新規** `apps/web/src/app/api/facility/[facilityId]/channel/[channelId]/route.ts` | `DELETE` 単一チャネル削除エンドポイント |
| **新規** `apps/web/src/app/api/facility/[facilityId]/cleanup-missing/route.ts` | `POST` バルク削除エンドポイント（DBのみ） |
| **新規** `apps/web/src/lib/google-sheets/delete-row.ts` | シート行物理削除ヘルパー |
| **新規** `apps/web/src/lib/master-sheet/match-row.ts` | `matchFacilityAndChannel` 関数の共通化（現在 master-sync と master-export で重複） |

### 5.2 データフロー

#### 要件1（マスタ削除→同期で表示から消す）

```
[一括同期ボタン]
  → 確認ダイアログ「全チャネル一括同期します」
  → POST /api/master-sync { facility_id }
     - upsert 処理（既存）
     - DB にあるが sheet に無い組を計算
  ← { success, results, missing_in_sheet: [{channel_id, channel_name, account_count}] }
  → 成功メッセージ表示
  → missing_in_sheet.length > 0 なら第2ダイアログ
     - チェックボックスで選択
  → POST /api/facility/[facilityId]/cleanup-missing { channel_ids }
     - facility_accounts 削除（CASCADE で field_values も）
     - channel_health_status 削除
  ← { success, deleted }
  → router.refresh() → タブから消える
```

#### 要件2（UI から削除→マスタからも消す）

```
[チャネル詳細ヘッダーの赤ゴミ箱アイコン]
  → 確認ダイアログ
  → DELETE /api/facility/[facilityId]/channel/[channelId]
     1. admin チェック
     2. facility, channel 取得
     3. deleteMatchingRows でマスタシート物理削除
     4. facility_accounts 削除
     5. channel_health_status 削除
  ← { success, channel_name, deleted_rows }
  → router.refresh()
  → useEffect で activeChannel を visibleChannels[0] にフォールバック
  → 成功メッセージ「〇〇を削除しました」
```

---

## 6. API 詳細

### 6.1 `POST /api/master-sync` の拡張

**リクエスト（既存と同じ）:**
```json
{ "facility_id": "uuid", "channel_id": "uuid?" }
```

**レスポンス（`missing_in_sheet` 追加）:**
```json
{
  "success": true,
  "message": "3チャネル（5件）を同期しました",
  "results": [
    { "channel": "楽天トラベル", "synced": 1, "skipped": false }
  ],
  "missing_in_sheet": [
    { "channel_id": "uuid", "channel_name": "じゃらん", "account_count": 1 }
  ]
}
```

**計算ロジック（`channel_id` 未指定時のみ）:**
1. 同期処理後、`facility_accounts` のうち対象施設の全行を `channel(name, code)` と一緒に取得
2. 各行について、`dataRows` の中に対応行があるか `matchFacilityAndChannel` でチェック
3. 無ければ `(channel_id, channel_name, account_count)` に集約
4. 失敗時は warning ログを出して `missing_in_sheet: []` を返す

### 6.2 `DELETE /api/facility/[facilityId]/channel/[channelId]`（新規）

**リクエスト:** body 不要

**レスポンス成功:**
```json
{ "success": true, "channel_name": "楽天トラベル", "deleted_rows": 1 }
```

**エラー:**
- `401` 未認証
- `403` 非 admin
- `404` facility または channel が存在しない
- `500` シート削除失敗 or DB 削除失敗（エラーメッセージに理由）

**処理順序:**
1. 認証・admin チェック
2. `facilities` から `(id, code, name)` を取得
3. `channels` から `(id, code, name)` を取得
4. `deleteMatchingRows` でマスタシートの該当行を削除
   - matcher は `matchFacilityAndChannel(row, facility, channel, { ignoreUserEmail: true })` で呼ぶ。リンカーンの場合も `user_email` を見ずに施設×チャネルで一致する全行をヒットさせる
   - `matchFacilityAndChannel` の共通化実装では `ignoreUserEmail?: boolean` オプションを追加し、デフォルトは既存挙動（`false` = user_email を比較）
5. `facility_accounts` から該当 `(facility_id, channel_id)` を全削除
6. `channel_health_status` から該当 `(facility_id, channel_id)` を削除
7. レスポンス返却

### 6.3 `POST /api/facility/[facilityId]/cleanup-missing`（新規）

**リクエスト:**
```json
{ "channel_ids": ["uuid1", "uuid2"] }
```

**レスポンス:**
```json
{ "success": true, "deleted": 2, "message": "2チャネルを削除しました" }
```

**処理:**
1. 認証・admin チェック
2. `channel_ids` の各UUIDについて:
   - `facility_accounts` から該当 `(facility_id, channel_id)` を削除
   - `channel_health_status` から該当 `(facility_id, channel_id)` を削除
3. シートは触らない（既に無いため）

**検証方針:**
- クライアントから渡された `channel_ids` を信頼する（サーバ側で `missing_in_sheet` を再計算して突き合わせない）
- 理由: サーバの処理は結局 `(facility_id, channel_id)` で DELETE するだけであり、シート側の整合性は最終的に次回同期で担保される。再計算は Google Sheets API の追加呼び出しが発生しコスト増

**エラー:**
- `401/403` 認証系
- `400` `channel_ids` が空または不正（空配列、非UUID）

---

## 7. UI 詳細

### 7.1 タブのフィルタリング

**ファイル**: `FacilityDetail.tsx`

```tsx
const visibleChannels = useMemo(
  () => facility.channels.filter((ch) => ch.account !== null),
  [facility.channels]
);
```

タブの `map` を `facility.channels` から `visibleChannels` に変更。

### 7.2 activeChannel フォールバック

削除で `activeChannel` が消えた場合に備えて、`useEffect` でフォールバック:

```tsx
useEffect(() => {
  if (activeChannel && !visibleChannels.some((ch) => ch.code === activeChannel)) {
    setActiveChannel(visibleChannels[0]?.code || '');
  }
}, [visibleChannels, activeChannel]);
```

### 7.3 エンプティステート

`visibleChannels.length === 0` のとき、タブ領域の代わりに:

```tsx
<div className="card text-center py-12 text-gray-500">
  <p>アカウントが登録されていません。</p>
  {isAdmin && <p>マスタPWと一括同期してください。</p>}
</div>
```

### 7.4 チャネル削除ボタン

`!editMode && isAdmin` ブロックの中に追加（既存の「マスタPWと同期」「マスタに転記」ボタンの直後）:

```tsx
<button
  onClick={() => setDeleteChannelDialogOpen(true)}
  disabled={deletingChannel}
  className="text-red-500 hover:text-red-700 transition-colors disabled:opacity-50"
  title="このOTAを削除"
  aria-label="このOTAを削除"
>
  <TrashIcon className="w-5 h-5" />
</button>
```

### 7.5 削除ダイアログと一括同期の第2ダイアログ

既存の `ConfirmDialog` コンポーネントを使い回す（チャネル単体削除）。第2ダイアログ（`missing_in_sheet`）はチェックボックスリストが必要なため、新規コンポーネント `MissingChannelsDialog` を作成。

**MissingChannelsDialog の振る舞い:**
- デフォルトで全チェックボックス ON
- ユーザーが全てのチェックを外した場合、「選択したOTAを削除」ボタンを `disabled` にする（0件削除を防止）
- キャンセル時は何もしない（同期自体は完了しているため `results` のサマリメッセージは先に表示されている）

---

## 8. エラーハンドリング

| シナリオ | 挙動 |
|---|---|
| シート削除成功・DB削除失敗 | 500 返却。次回 export で復活 |
| シート削除失敗 | 500 返却、DB は触らない |
| 並行削除（2クライアント同時） | 冪等。2回目は `facility_accounts` が既に無いため 0 行削除で成功扱い |
| `missing_in_sheet` 計算失敗 | 同期本体は成功、warning ログ、`missing_in_sheet: []` |
| ディープリンクで削除済みチャネル | `useEffect` で `visibleChannels[0]` にフォールバック |
| 非 admin | UI: ボタン非表示、API: 403 |

---

## 9. テスト方針

### 9.1 手動テスト（`pnpm e2e:real` 相当の実機確認）

1. **表示フィルタ**: アカウント無し施設 → タブが空、エンプティステート表示
2. **マスタ削除→同期→UI反映**:
   - シートから1行削除 → 一括同期 → 第2ダイアログに表示される → 削除実行 → タブから消える
   - 再度シートに追加 → 同期 → タブに復活
3. **UI削除**: チャネル削除ボタン → ダイアログ → 削除実行 → シートからも消えていることを確認
4. **リンカーン**: ユーザー別クレデンシャル複数行 → 削除で全行消える
5. **権限**: 非 admin ユーザーで削除ボタンが出ない／API が 403
6. **冪等性**: 同じチャネルを2回削除しても成功

### 9.2 Unit テスト

- `deleteMatchingRows`: モック `sheets` クライアントで降順削除・sheetId 解決・複数行・0件のケース
- `matchFacilityAndChannel`: `master-sync` と `master-export` から抽出した共通化関数。**既存挙動との一致を検証する characterization test** を優先（現在の `master-sync/route.ts:170-187` と `master-export/route.ts:175-199` のマッチングロジックと同じ入出力になることを確認）。加えて `ignoreUserEmail: true` のリンカーン全行ヒットケースもカバー

### 9.3 統合テスト（任意）

- `cleanup-missing` エンドポイント: 正常系、admin チェック、空配列エラー
- `DELETE channel` エンドポイント: 正常系、admin チェック、404、冪等性

---

## 10. マイグレーション・ロールアウト

### 10.1 DB スキーマ変更

なし。

### 10.2 デプロイ手順

1. バックエンド（API）先行デプロイ: `master-sync` の拡張、削除系エンドポイント追加
2. フロント（`FacilityDetail.tsx`）デプロイ: タブフィルタ、削除ボタン、ダイアログ
3. 古いクライアントが `missing_in_sheet` を無視しても影響なし（後方互換）

### 10.3 既存データへの影響

- 既存の `facility_accounts` はそのまま。タブフィルタで「使っていないチャネル」が見えなくなる効果あり
- 既存で空のアカウント（`login_id` が空文字等）がある場合は事前にクリーンアップを検討（ただし本設計の対象外）

---

## 11. 計画外／将来検討

- **シート編集→UI反映のリアルタイム性**: 現状は「同期ボタン」起点。Webhook 等での自動検知は将来課題
- **履歴管理**: 削除ログ（誰がいつ何を消したか）は保存しない。必要なら `deletion_audit` テーブルを検討
- **ソフトデリート**: `facility_accounts` に `deleted_at` を追加する案もあるが、本設計ではハードデリートを採用（シートとの双方向同期が目的のため）
- **`master-export` との関係**: `master-export` は変更なし。削除で消えた行を再度作りたければ追加→同期の順

---

## 12. 変更ファイル一覧

| ファイル | 変更種別 | 内容 |
|---|---|---|
| `apps/web/src/app/facility/[facilityId]/FacilityDetail.tsx` | 変更 | タブフィルタ、削除ボタン、ダイアログ、フォールバック |
| `apps/web/src/app/facility/[facilityId]/page.tsx` | 変更 | `resolvedInitialChannel` のフィルタ後ベース化 |
| `apps/web/src/app/api/master-sync/route.ts` | 変更 | `missing_in_sheet` 計算、`matchFacilityAndChannel` の外出し |
| `apps/web/src/app/api/master-export/route.ts` | 変更 | `matchFacilityAndChannel` の外出し（共通化） |
| `apps/web/src/app/api/facility/[facilityId]/channel/[channelId]/route.ts` | 新規 | `DELETE` 単一チャネル削除 |
| `apps/web/src/app/api/facility/[facilityId]/cleanup-missing/route.ts` | 新規 | `POST` バルク削除 |
| `apps/web/src/lib/google-sheets/delete-row.ts` | 新規 | `deleteMatchingRows` ヘルパー |
| `apps/web/src/lib/master-sheet/match-row.ts` | 新規 | `matchFacilityAndChannel` 共通化 |
| `apps/web/src/components/MissingChannelsDialog.tsx` | 新規 | 第2ダイアログ UI |

---

## 13. 未決事項

なし。ブレインストーミングで以下を確定済み:

- タブ表示は `facility_accounts` で判定（A案）
- UI 削除はマスタシートも物理削除（A案）
- 削除トリガーは一括同期+確認ダイアログ（C案）
- 削除ボタンは各チャネル詳細ヘッダー（A案）
- リンカーンはチャネル全体を一括削除
