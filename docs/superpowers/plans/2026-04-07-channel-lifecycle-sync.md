# チャネルライフサイクル同期 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** マスタPWシートと `facility_accounts` を双方向に同期し、施設詳細画面のタブをアカウントの有無でフィルタする。さらに UI からチャネル単位の削除（DB+シート両方）を可能にする。

**Architecture:** (1) `master-sync` のレスポンスに `missing_in_sheet` を追加してフロントで第2ダイアログを出す。(2) `DELETE /api/facility/:fid/channel/:cid` でシート→DBの順に物理削除。(3) `FacilityDetail.tsx` のタブを `account != null` でフィルタ。共通化のため `matchFacilityAndChannel` を `lib/master-sheet/match-row.ts` に外出しし、シート行物理削除の `deleteMatchingRows` ヘルパーを `lib/google-sheets/delete-row.ts` に新設する。

**Tech Stack:** Next.js 14 App Router, TypeScript, Supabase (`@supabase/ssr`), googleapis (`google.sheets`), Tailwind, React 18

**仕様書:** [docs/superpowers/specs/2026-04-06-channel-lifecycle-sync-design.md](../specs/2026-04-06-channel-lifecycle-sync-design.md)

---

## 前提・全体注意事項

- **このリポジトリには unit test framework が無い**（`pnpm test` は `echo "No tests yet"`）。各タスクの「テスト」ステップは TypeScript の型検査（`pnpm build`）と手動検証で代替する
- **CLAUDE.md の安全ルール厳守:**
  - パスワード等のクレデンシャルを `console.log` で出力しない
  - `.env.local` を絶対に触らない
- **コミット粒度:** 各タスクの最後に `git add <変更ファイル> && git commit` を実行する
- **ブランチ:** `main` で作業を行う（指示がない限り worktree は作らない）
- **検証コマンド:** `pnpm build`（型チェック）、`pnpm lint`、必要に応じて `pnpm dev` で実機確認

---

## ファイル構成

| パス | 種別 | 責務 |
|---|---|---|
| `apps/web/src/lib/master-sheet/match-row.ts` | 新規 | `matchFacilityAndChannel(row, facility, channel, opts)` を提供。`master-sync` と `master-export` の重複ロジックを集約 |
| `apps/web/src/lib/google-sheets/delete-row.ts` | 新規 | `deleteMatchingRows(sheets, spreadsheetId, sheetName, matcher, dataStartRow?)` ヘルパー |
| `apps/web/src/app/api/master-sync/route.ts` | 変更 | `matchFacilityAndChannel` を import、一括同期時に `missing_in_sheet` を計算してレスポンスに追加 |
| `apps/web/src/app/api/master-export/route.ts` | 変更 | `matchFacilityAndChannel` を import（重複削除のみ） |
| `apps/web/src/app/api/facility/[facilityId]/cleanup-missing/route.ts` | 新規 | `POST` バルク削除（DBのみ） |
| `apps/web/src/app/api/facility/[facilityId]/channel/[channelId]/route.ts` | 新規 | `DELETE` 単一チャネル削除（シート+DB） |
| `apps/web/src/components/MissingChannelsDialog.tsx` | 新規 | 一括同期後の第2ダイアログ（チェックボックスリスト） |
| `apps/web/src/app/facility/[facilityId]/FacilityDetail.tsx` | 変更 | タブを `visibleChannels` でフィルタ、削除ボタン追加、第2ダイアログ統合、`activeChannel` フォールバック |
| `apps/web/src/app/facility/[facilityId]/page.tsx` | 変更 | `resolvedInitialChannel` をフィルタ後リストから決定 |

---

## Task 1: `matchFacilityAndChannel` を共通モジュールに抽出する

**目的:** `master-sync` と `master-export` で重複している施設×チャネルのマッチングロジックを 1 ファイルに集約する。今後の削除フローでも同じロジックを使うため。

**Files:**
- Create: `apps/web/src/lib/master-sheet/match-row.ts`
- Modify: `apps/web/src/app/api/master-sync/route.ts`
- Modify: `apps/web/src/app/api/master-export/route.ts`

- [ ] **Step 1: 既存のマッチング実装を読んで挙動を把握する**

`apps/web/src/app/api/master-sync/route.ts:170-187` と `apps/web/src/app/api/master-export/route.ts:175-199` を読み、以下を確認：

- `facility.code` または `facility.id` または `facility.id.startsWith(sheetFacilityId)` で施設一致
- `sheetOTA` を `channel.name`、`channel.code`、`sheetOtaAliases[lower]` で照合
- リンカーンの場合（`master-export`）は `account.user_email` が指定されていれば `row[11]` も比較
- `dataStartRow = 2`（ヘッダー2行スキップ）

- [ ] **Step 2: `apps/web/src/lib/master-sheet/match-row.ts` を新規作成**

```ts
/**
 * マスタPWシートの行と (facility, channel) のマッチングロジック。
 *
 * master-sync / master-export / 削除APIから共通利用される。
 * 既存挙動 (master-sync/route.ts:170-187, master-export/route.ts:175-199) と
 * 同じ判定にすること。
 */

export interface FacilityForMatch {
  id: string;
  code: string | null;
}

export interface ChannelForMatch {
  code: string;
  name: string;
}

export interface MatchOptions {
  /**
   * リンカーン (lincoln) のユーザー別クレデンシャルで、特定ユーザーの行だけにマッチさせたい場合に指定する。
   * undefined または null の場合は user_email を比較しない（全ユーザーにマッチ）。
   */
  userEmail?: string | null;
  /**
   * true の場合、user_email を一切見ずに施設×チャネルだけで一致判定する。
   * 削除APIで利用（リンカーンの全ユーザー行を一括削除するため）。
   */
  ignoreUserEmail?: boolean;
}

/**
 * スプレッドシートのOTA名 → チャネルコードのエイリアス。
 * master-sync / master-export と同じテーブルを共有する。
 */
export const SHEET_OTA_ALIASES: Record<string, string> = {
  moana: 'temairazu',
  '予約プロ': 'yoyakupro',
  '489pro': 'yoyakupro',
  トリプラ: 'tripla',
  チルン: 'chillnn',
  ミンパクイン: 'minpakuin',
  'booking.com': 'booking',
  booking: 'booking',
  'trip.com': 'tripcom',
  tripcom: 'tripcom',
  agoda: 'agoda',
  'agoda.com': 'agoda',
  expedia: 'expedia',
  'expedia.com': 'expedia',
};

/**
 * 行が指定 (facility, channel) にマッチするか判定する。
 * 列: 0=施設ID, 2=OTA, 11=ユーザーメール
 */
export function matchFacilityAndChannel(
  row: string[],
  facility: FacilityForMatch,
  channel: ChannelForMatch,
  opts: MatchOptions = {}
): boolean {
  const sheetFacilityId = row[0]?.toString().trim();
  const sheetOTA = row[2]?.toString().trim();

  const facilityMatch =
    sheetFacilityId === facility.code ||
    sheetFacilityId === facility.id ||
    (sheetFacilityId ? facility.id.startsWith(sheetFacilityId) : false);

  if (!facilityMatch) return false;

  const sheetOTALower = sheetOTA?.toLowerCase() ?? '';
  const channelMatch =
    sheetOTA === channel.name ||
    sheetOTA === channel.code ||
    sheetOTALower === channel.code?.toLowerCase() ||
    SHEET_OTA_ALIASES[sheetOTALower] === channel.code;

  if (!channelMatch) return false;

  // user_email チェック
  if (opts.ignoreUserEmail) {
    return true;
  }
  if (opts.userEmail) {
    const sheetEmail = row[11]?.toString().trim();
    return sheetEmail === opts.userEmail;
  }
  return true;
}
```

- [ ] **Step 3: `master-sync/route.ts` を新モジュール経由に書き換える**

`apps/web/src/app/api/master-sync/route.ts` の変更点：

1. 上部の import に追加:
   ```ts
   import { matchFacilityAndChannel, SHEET_OTA_ALIASES } from '@/lib/master-sheet/match-row';
   ```

2. 既存の `sheetOtaAliases` ローカル定義（line 137-152 付近）を削除し、`SHEET_OTA_ALIASES` を import で置き換える。**ただし `master-sync` 内部で他に参照していないか確認**してから削除する（`grep sheetOtaAliases` で確認）。
   - `route.ts:184` の `sheetOtaAliases[sheetOTALower]` も `matchFacilityAndChannel` 経由になるので不要になる

3. ループ内 `matchRow` クロージャ（line 170-187）を削除し、代わりに以下を使う:
   ```ts
   const matchRow = (row: string[]) =>
     matchFacilityAndChannel(row, facility, channel);
   ```
   `targetRows` の filter は変更不要（`matchRow` の中身が共通関数に変わるだけ）。

4. `officialRow` 取得部分（line 116-124）も同じく `matchFacilityAndChannel` ベースに置き換え可能だが、ここは「OTA = '公式'」という固有判定があるため**変更しない**。今回の共通化対象外。

- [ ] **Step 4: `master-export/route.ts` を新モジュール経由に書き換える**

`apps/web/src/app/api/master-export/route.ts` の変更点：

1. import 追加:
   ```ts
   import { matchFacilityAndChannel, SHEET_OTA_ALIASES } from '@/lib/master-sheet/match-row';
   ```

2. ローカルの `sheetOtaAliases` 定義（line 97-112）を削除

3. ループ内 `matchRowIndex` の `findIndex` クロージャ（line 175-199）を以下に置き換え:
   ```ts
   const matchRowIndex = rows.findIndex((row, idx) => {
     if (idx < dataStartRow) return false;
     const userEmail = isLincoln ? account.user_email : null;
     return matchFacilityAndChannel(
       row as string[],
       facility,
       channel,
       { userEmail }
     );
   });
   ```
   挙動: `isLincoln && account.user_email` ありなら user_email も比較、なければ施設+チャネルのみ。既存挙動と一致する。

- [ ] **Step 5: 型チェックとビルド**

```bash
cd c:/OTAlogin && pnpm build
```

期待: エラー無しで成功。`master-sync` と `master-export` の既存挙動が保たれていること（型エラーが出ないこと）を確認。

- [ ] **Step 6: 手動検証**

`pnpm dev` で起動 → 任意の施設詳細ページで「マスタPWと同期」（単一チャネル）を実行し、エラーが出ないこと、既存通り同期されることを確認。

- [ ] **Step 7: コミット**

```bash
cd c:/OTAlogin
git add apps/web/src/lib/master-sheet/match-row.ts \
        apps/web/src/app/api/master-sync/route.ts \
        apps/web/src/app/api/master-export/route.ts
git commit -m "$(cat <<'EOF'
refactor: Extract matchFacilityAndChannel to shared module

Consolidate sheet row matching logic from master-sync and master-export
into apps/web/src/lib/master-sheet/match-row.ts. This will be reused by
the upcoming channel delete API.

Behavior is preserved verbatim from the existing implementations.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: `deleteMatchingRows` ヘルパーを新設する

**目的:** Google Sheets API でマスタシートの行を物理削除するヘルパーを作る。`batchUpdate` + `deleteDimension` を使い、複数行ヒット時のインデックスシフト問題に対処する。

**Files:**
- Create: `apps/web/src/lib/google-sheets/delete-row.ts`

- [ ] **Step 1: `apps/web/src/lib/google-sheets/delete-row.ts` を新規作成**

```ts
import type { sheets_v4 } from 'googleapis';

/**
 * 指定シート内で matcher にマッチする行を物理削除する。
 *
 * 仕組み:
 * 1. spreadsheets.get でシート内部ID (sheetId) をシート名から取得
 * 2. spreadsheets.values.get で全行を取得
 * 3. matcher でヒットする行の 0-based インデックスを収集
 * 4. 降順ソート（末尾から削除することでインデックスシフトを防ぐ）
 * 5. spreadsheets.batchUpdate で deleteDimension を一括実行
 *
 * @returns 削除した行数
 */
export async function deleteMatchingRows(
  sheets: sheets_v4.Sheets,
  spreadsheetId: string,
  sheetName: string,
  matcher: (row: string[], index: number) => boolean,
  dataStartRow: number = 2
): Promise<number> {
  // 1) シート内部IDを取得
  const meta = await sheets.spreadsheets.get({ spreadsheetId });
  const sheet = meta.data.sheets?.find(
    (s) => s.properties?.title === sheetName
  );
  if (sheet?.properties?.sheetId === undefined || sheet.properties.sheetId === null) {
    throw new Error(`Sheet "${sheetName}" not found in spreadsheet`);
  }
  const sheetId = sheet.properties.sheetId;

  // 2) 全行取得
  const { data } = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${sheetName}!A:L`,
  });
  const rows = data.values || [];

  // 3) マッチする行インデックスを収集
  const matchedIndexes: number[] = [];
  for (let i = dataStartRow; i < rows.length; i++) {
    if (matcher(rows[i] as string[], i)) {
      matchedIndexes.push(i);
    }
  }

  if (matchedIndexes.length === 0) {
    return 0;
  }

  // 4) 降順ソート（末尾から削除）
  matchedIndexes.sort((a, b) => b - a);

  // 5) batchUpdate で一括削除
  const requests = matchedIndexes.map((rowIndex) => ({
    deleteDimension: {
      range: {
        sheetId,
        dimension: 'ROWS' as const,
        startIndex: rowIndex,       // 0-based, inclusive
        endIndex: rowIndex + 1,     // exclusive
      },
    },
  }));

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: { requests },
  });

  return matchedIndexes.length;
}
```

- [ ] **Step 2: 型チェック**

```bash
cd c:/OTAlogin && pnpm build
```

期待: エラー無し。googleapis の `sheets_v4.Sheets` 型が正しく解決されること。

- [ ] **Step 3: コミット**

```bash
cd c:/OTAlogin
git add apps/web/src/lib/google-sheets/delete-row.ts
git commit -m "$(cat <<'EOF'
feat: Add deleteMatchingRows helper for Google Sheets

Physical row deletion via batchUpdate + deleteDimension. Sorts matched
indexes in descending order to avoid index-shift issues when deleting
multiple rows.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: `master-sync` のレスポンスに `missing_in_sheet` を追加する

**目的:** 一括同期時、DB に存在するが同期ソース（シート）に無い `(facility, channel)` をフロントに知らせる。フロントは第2ダイアログで削除確認を取る。

**Files:**
- Modify: `apps/web/src/app/api/master-sync/route.ts`

- [ ] **Step 1: 既存実装を読む**

`apps/web/src/app/api/master-sync/route.ts:89-110` で `channels` の決定（単一 or 全件）を行っているのを再確認。`results` を返す前に `missing_in_sheet` を計算する。

- [ ] **Step 2: 一括同期時のみ `missing_in_sheet` を計算するブロックを追加**

`for (const channel of channels)` ループの**直後**、`return NextResponse.json({...})` の**直前**に以下を挿入：

```ts
// 一括同期時のみ: DB にあるが sheet に無い (facility, channel) を検出
let missing_in_sheet: { channel_id: string; channel_name: string; account_count: number }[] = [];
if (!channel_id) {
  try {
    // 対象施設の全アカウント + チャネル名を取得
    const { data: dbAccounts } = await serviceSupabase
      .from('facility_accounts')
      .select('id, channel_id, user_email, channels(id, code, name)')
      .eq('facility_id', facility_id)
      .eq('account_type', 'shared');

    type DbAccount = {
      id: string;
      channel_id: string;
      user_email: string | null;
      channels: { id: string; code: string; name: string } | null;
    };

    const grouped = new Map<string, { channel_name: string; count: number }>();

    for (const acc of (dbAccounts || []) as unknown as DbAccount[]) {
      if (!acc.channels) continue;
      // シートに該当行があるかチェック（リンカーンは ignoreUserEmail で全行ヒット）
      const isLincoln = acc.channels.code === 'lincoln';
      const hasRowInSheet = dataRows.some((row) =>
        matchFacilityAndChannel(
          row as string[],
          facility,
          { code: acc.channels!.code, name: acc.channels!.name },
          isLincoln ? { userEmail: acc.user_email } : {}
        )
      );
      if (!hasRowInSheet) {
        const entry = grouped.get(acc.channel_id) || {
          channel_name: acc.channels.name,
          count: 0,
        };
        entry.count += 1;
        grouped.set(acc.channel_id, entry);
      }
    }

    missing_in_sheet = Array.from(grouped.entries()).map(
      ([channel_id, { channel_name, count }]) => ({
        channel_id,
        channel_name,
        account_count: count,
      })
    );
  } catch (e) {
    // 同期本体は成功させ、missing_in_sheet 計算失敗は warning にとどめる
    console.warn('[master-sync] missing_in_sheet computation failed:', e instanceof Error ? e.message : e);
    missing_in_sheet = [];
  }
}
```

**重要**: `console.warn` ではクレデンシャルが含まれないか確認すること（`e.message` のみで `dbAccounts` 自体は出力しない）。

- [ ] **Step 3: レスポンスに `missing_in_sheet` を含める**

`return NextResponse.json({ ... })` を以下のように変更：

```ts
return NextResponse.json({
  success: true,
  message: channel_id
    ? (results[0]?.synced
        ? `${results[0].channel}のアカウント情報を同期しました`
        : `シートに該当データがありません`)
    : `${syncedChannels.length}チャネル（${totalSynced}件）を同期しました`,
  results,
  missing_in_sheet,
  // 注意: パスワードは絶対に返さない
});
```

- [ ] **Step 4: 型チェックとビルド**

```bash
cd c:/OTAlogin && pnpm build
```

期待: 型エラー無し。Supabase の join 結果（`channels(id, code, name)`）が `unknown as DbAccount[]` キャストで型整合していること。

- [ ] **Step 5: 手動検証**

`pnpm dev` で起動して以下を確認:

1. 任意の施設で「全チャネル一括同期」を実行
2. ブラウザの DevTools → Network タブで `/api/master-sync` のレスポンスを確認
3. `missing_in_sheet` フィールドが含まれていること（内容は環境依存。空配列でもOK）
4. 単一チャネル同期では `missing_in_sheet` が `[]` で返ること

- [ ] **Step 6: コミット**

```bash
cd c:/OTAlogin
git add apps/web/src/app/api/master-sync/route.ts
git commit -m "$(cat <<'EOF'
feat: Add missing_in_sheet to master-sync bulk response

When bulk sync is invoked (channel_id omitted), compute facility_accounts
that exist in DB but not in master sheet, grouped by channel. Returned as
missing_in_sheet[] for the frontend to surface a deletion confirmation
dialog. Single-channel sync returns an empty list.

Failures during the missing computation are logged as warnings and do not
fail the sync itself.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: `cleanup-missing` バルク削除エンドポイント

**目的:** フロントが第2ダイアログで選択した `channel_ids` を受け取り、対応する `facility_accounts` と `channel_health_status` を削除する（DBのみ。シートは既に空のため触らない）。

**Files:**
- Create: `apps/web/src/app/api/facility/[facilityId]/cleanup-missing/route.ts`

- [ ] **Step 1: ファイルを新規作成**

```ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';

/**
 * POST /api/facility/[facilityId]/cleanup-missing
 *
 * フロントが master-sync の missing_in_sheet で選択したチャネルを削除する。
 * シートには既に存在しないため DB のみ削除する。
 *
 * Body: { channel_ids: string[] }
 * Response: { success, deleted, message }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ facilityId: string }> }
) {
  try {
    const { facilityId } = await params;

    const supabase = await createClient();
    if (!supabase) {
      return NextResponse.json({ error: 'Database not configured' }, { status: 500 });
    }

    // 認証
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // admin 権限チェック
    const { data: userRole } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .single();
    if (userRole?.role !== 'admin') {
      return NextResponse.json({ error: '管理者権限が必要です' }, { status: 403 });
    }

    // body 検証
    const body = await request.json();
    const { channel_ids } = body as { channel_ids?: unknown };
    if (!Array.isArray(channel_ids) || channel_ids.length === 0) {
      return NextResponse.json(
        { error: 'channel_ids は1件以上必要です' },
        { status: 400 }
      );
    }
    if (!channel_ids.every((c) => typeof c === 'string' && c.length > 0)) {
      return NextResponse.json(
        { error: 'channel_ids は文字列の配列である必要があります' },
        { status: 400 }
      );
    }

    const serviceSupabase = await createServiceClient();
    if (!serviceSupabase) {
      return NextResponse.json({ error: 'Database not configured' }, { status: 500 });
    }

    // facility 存在確認
    const { data: facility } = await serviceSupabase
      .from('facilities')
      .select('id')
      .eq('id', facilityId)
      .single();
    if (!facility) {
      return NextResponse.json({ error: '施設が見つかりません' }, { status: 404 });
    }

    // 削除（facility_accounts → ON DELETE CASCADE で account_field_values も削除される）
    const { error: accountsError } = await serviceSupabase
      .from('facility_accounts')
      .delete()
      .eq('facility_id', facilityId)
      .in('channel_id', channel_ids as string[]);

    if (accountsError) {
      return NextResponse.json(
        { error: 'アカウントの削除に失敗しました', details: accountsError.message },
        { status: 500 }
      );
    }

    // channel_health_status も削除
    const { error: healthError } = await serviceSupabase
      .from('channel_health_status')
      .delete()
      .eq('facility_id', facilityId)
      .in('channel_id', channel_ids as string[]);

    if (healthError) {
      // ヘルス削除失敗は warning にとどめる（次回ヘルスチェックで自然に整合する）
      console.warn('[cleanup-missing] channel_health_status delete failed:', healthError.message);
    }

    return NextResponse.json({
      success: true,
      deleted: channel_ids.length,
      message: `${channel_ids.length}チャネルを削除しました`,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { error: 'Internal server error', details: message },
      { status: 500 }
    );
  }
}
```

- [ ] **Step 2: 型チェックとビルド**

```bash
cd c:/OTAlogin && pnpm build
```

期待: エラー無し。新しいルートが Next.js のルーティングに追加される。

- [ ] **Step 3: 手動検証**

`pnpm dev` で起動して、ブラウザの DevTools コンソールで以下を実行（admin ログイン状態で）:

```js
fetch('/api/facility/<実在する施設ID>/cleanup-missing', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ channel_ids: [] }),
}).then(r => r.json()).then(console.log);
```

期待: `{ error: 'channel_ids は1件以上必要です' }` (400)

非 admin ユーザーで同じことを実行: `{ error: '管理者権限が必要です' }` (403)

正常系のテストは Task 7 のフロント統合後に行う。

- [ ] **Step 4: コミット**

```bash
cd c:/OTAlogin
git add apps/web/src/app/api/facility/[facilityId]/cleanup-missing/route.ts
git commit -m "$(cat <<'EOF'
feat: Add cleanup-missing endpoint for bulk channel deletion

POST /api/facility/[facilityId]/cleanup-missing accepts channel_ids[] and
deletes the corresponding facility_accounts (and channel_health_status).
The master sheet is not touched because the rows are already absent — this
endpoint is invoked from the master-sync second-step dialog.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: 単一チャネル削除エンドポイント（DB+シート）

**目的:** UI のチャネル削除ボタンが叩く API。シート→DB の順に物理削除する。

**Files:**
- Create: `apps/web/src/app/api/facility/[facilityId]/channel/[channelId]/route.ts`

- [ ] **Step 1: ファイルを新規作成**

```ts
import { NextRequest, NextResponse } from 'next/server';
import { google } from 'googleapis';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { matchFacilityAndChannel } from '@/lib/master-sheet/match-row';
import { deleteMatchingRows } from '@/lib/google-sheets/delete-row';

/**
 * DELETE /api/facility/[facilityId]/channel/[channelId]
 *
 * 指定された (facility, channel) を DB と マスタPWシートの両方から削除する。
 * リンカーンの場合はユーザー別行も全て削除する。
 *
 * 順序: シート削除 → facility_accounts 削除 → channel_health_status 削除
 * シート削除失敗時は DB を触らずエラー返却。シート削除成功 + DB 失敗時は
 * 次回 export で復活するためデータロスなし。
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ facilityId: string; channelId: string }> }
) {
  try {
    const { facilityId, channelId } = await params;

    const supabase = await createClient();
    if (!supabase) {
      return NextResponse.json({ error: 'Database not configured' }, { status: 500 });
    }

    // 認証
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // admin チェック
    const { data: userRole } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .single();
    if (userRole?.role !== 'admin') {
      return NextResponse.json({ error: '管理者権限が必要です' }, { status: 403 });
    }

    const serviceSupabase = await createServiceClient();
    if (!serviceSupabase) {
      return NextResponse.json({ error: 'Database not configured' }, { status: 500 });
    }

    // facility / channel 取得
    const { data: facility } = await serviceSupabase
      .from('facilities')
      .select('id, code, name')
      .eq('id', facilityId)
      .single();
    if (!facility) {
      return NextResponse.json({ error: '施設が見つかりません' }, { status: 404 });
    }

    const { data: channel } = await serviceSupabase
      .from('channels')
      .select('id, code, name')
      .eq('id', channelId)
      .single();
    if (!channel) {
      return NextResponse.json({ error: 'チャネルが見つかりません' }, { status: 404 });
    }

    // ===== 1. マスタPWシートの該当行を物理削除 =====
    let deletedRows = 0;
    try {
      const serviceAccountKey = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
      const spreadsheetId = process.env.GOOGLE_MASTER_SHEETS_ID;
      if (!serviceAccountKey || !spreadsheetId) {
        return NextResponse.json(
          { error: 'Google Sheets が設定されていません' },
          { status: 500 }
        );
      }

      const credentials = JSON.parse(serviceAccountKey);
      const auth = new google.auth.GoogleAuth({
        credentials,
        scopes: ['https://www.googleapis.com/auth/spreadsheets'],
      });
      const sheets = google.sheets({ version: 'v4', auth });

      deletedRows = await deleteMatchingRows(
        sheets,
        spreadsheetId,
        '施設×OTAアカウント',
        (row) =>
          matchFacilityAndChannel(
            row,
            facility,
            { code: channel.code, name: channel.name },
            { ignoreUserEmail: true }
          )
      );
    } catch (sheetError) {
      const msg = sheetError instanceof Error ? sheetError.message : 'Unknown error';
      return NextResponse.json(
        { error: 'マスタシートの削除に失敗しました', details: msg },
        { status: 500 }
      );
    }

    // ===== 2. facility_accounts 削除 (CASCADE で account_field_values も削除) =====
    const { error: accountsError } = await serviceSupabase
      .from('facility_accounts')
      .delete()
      .eq('facility_id', facilityId)
      .eq('channel_id', channelId);

    if (accountsError) {
      return NextResponse.json(
        {
          error: 'DB の削除に失敗しました（マスタシートは削除済み。次回 export で復活します）',
          details: accountsError.message,
        },
        { status: 500 }
      );
    }

    // ===== 3. channel_health_status 削除 =====
    const { error: healthError } = await serviceSupabase
      .from('channel_health_status')
      .delete()
      .eq('facility_id', facilityId)
      .eq('channel_id', channelId);

    if (healthError) {
      console.warn('[delete channel] channel_health_status delete failed:', healthError.message);
    }

    return NextResponse.json({
      success: true,
      channel_name: channel.name,
      deleted_rows: deletedRows,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { error: 'Internal server error', details: message },
      { status: 500 }
    );
  }
}
```

- [ ] **Step 2: 型チェックとビルド**

```bash
cd c:/OTAlogin && pnpm build
```

期待: エラー無し。

- [ ] **Step 3: 手動検証 (最低限)**

`pnpm dev` で起動して以下を確認:
- 非 admin で `DELETE /api/facility/<id>/channel/<id>` を叩くと 403
- 存在しない facilityId で 404

正常系の検証は Task 7 (UI 統合) のあとで行う。

- [ ] **Step 4: コミット**

```bash
cd c:/OTAlogin
git add apps/web/src/app/api/facility/[facilityId]/channel/[channelId]/route.ts
git commit -m "$(cat <<'EOF'
feat: Add channel delete endpoint (DB + master sheet)

DELETE /api/facility/[facilityId]/channel/[channelId] removes the channel
from the master sheet (physical row delete) and then from the database
(facility_accounts + channel_health_status). For lincoln, all per-user
rows are removed in a single operation via ignoreUserEmail.

Sheet-first ordering: if sheet deletion fails, DB is left untouched. If
sheet succeeds but DB fails, the next master-export will restore the row.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: `MissingChannelsDialog` コンポーネント

**目的:** 一括同期後に表示する第2ダイアログ。チェックボックスで削除対象を選ばせる。

**Files:**
- Create: `apps/web/src/components/MissingChannelsDialog.tsx`

- [ ] **Step 1: 既存の `ConfirmDialog` パターンを確認**

`apps/web/src/components/ConfirmDialog.tsx` を読み、Tailwind クラスやキーボードハンドリング (`Enter`/`Esc`) のパターンを把握する。

- [ ] **Step 2: コンポーネントを新規作成**

```tsx
'use client';

import { useEffect, useState, useMemo } from 'react';

export interface MissingChannel {
  channel_id: string;
  channel_name: string;
  account_count: number;
}

interface Props {
  isOpen: boolean;
  channels: MissingChannel[];
  onConfirm: (selectedChannelIds: string[]) => void;
  onCancel: () => void;
  loading?: boolean;
}

export function MissingChannelsDialog({
  isOpen,
  channels,
  onConfirm,
  onCancel,
  loading = false,
}: Props) {
  // デフォルト全選択
  const [selectedIds, setSelectedIds] = useState<Set<string>>(
    () => new Set(channels.map((c) => c.channel_id))
  );

  // channels が変わったら選択状態を初期化
  useEffect(() => {
    setSelectedIds(new Set(channels.map((c) => c.channel_id)));
  }, [channels]);

  // Esc でキャンセル
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onCancel();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onCancel]);

  const allChecked = useMemo(
    () => channels.length > 0 && selectedIds.size === channels.length,
    [channels.length, selectedIds.size]
  );
  const noneChecked = selectedIds.size === 0;

  const toggle = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (allChecked) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(channels.map((c) => c.channel_id)));
    }
  };

  const handleConfirm = () => {
    if (noneChecked || loading) return;
    onConfirm(Array.from(selectedIds));
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div
        className="fixed inset-0 bg-black bg-opacity-30 transition-opacity"
        onClick={loading ? undefined : onCancel}
      />

      <div className="flex min-h-full items-center justify-center p-4">
        <div className="relative bg-white rounded-lg shadow-xl max-w-lg w-full p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-2">
            マスタに無いOTAが見つかりました
          </h3>
          <p className="text-sm text-gray-600 mb-4">
            以下のOTAはこの施設のDBにありますが、マスタPWシートには存在しません。
            マスタから意図的に削除した場合は「削除」を押してください。
          </p>

          {/* 全選択トグル */}
          <div className="border-b border-gray-200 pb-2 mb-2">
            <label className="flex items-center gap-2 text-sm font-medium text-gray-700 cursor-pointer">
              <input
                type="checkbox"
                checked={allChecked}
                onChange={toggleAll}
                disabled={loading}
                className="rounded border-gray-300 text-red-600 focus:ring-red-500"
              />
              全選択 / 全解除
            </label>
          </div>

          {/* チャネルリスト */}
          <div className="max-h-64 overflow-y-auto space-y-2 mb-6">
            {channels.map((ch) => (
              <label
                key={ch.channel_id}
                className="flex items-center gap-2 text-sm text-gray-800 cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={selectedIds.has(ch.channel_id)}
                  onChange={() => toggle(ch.channel_id)}
                  disabled={loading}
                  className="rounded border-gray-300 text-red-600 focus:ring-red-500"
                />
                <span>
                  {ch.channel_name}
                  <span className="text-gray-500 ml-1">（{ch.account_count}件）</span>
                </span>
              </label>
            ))}
          </div>

          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={onCancel}
              disabled={loading}
              className="btn btn-secondary disabled:opacity-50"
            >
              キャンセル
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              disabled={noneChecked || loading}
              className="btn btn-danger disabled:opacity-50"
            >
              {loading ? '削除中...' : `選択したOTAを削除（${selectedIds.size}件）`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: 型チェック**

```bash
cd c:/OTAlogin && pnpm build
```

期待: エラー無し。

- [ ] **Step 4: コミット**

```bash
cd c:/OTAlogin
git add apps/web/src/components/MissingChannelsDialog.tsx
git commit -m "$(cat <<'EOF'
feat: Add MissingChannelsDialog component

Second-step dialog shown after bulk master-sync when there are
facility_accounts that no longer exist in the master sheet. Defaults to
all-checked, disables confirm button when zero items are selected.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: `FacilityDetail.tsx` のタブフィルタとフォールバック

**目的:** タブを `account != null` のチャネルだけに絞り、`activeChannel` がフィルタアウトされた場合のフォールバックを追加する。

**Files:**
- Modify: `apps/web/src/app/facility/[facilityId]/FacilityDetail.tsx`
- Modify: `apps/web/src/app/facility/[facilityId]/page.tsx`

- [ ] **Step 1: import 追加**

`FacilityDetail.tsx` の上部 import に `useMemo` を追加（既に React から import されている `useState, useEffect, useCallback, useRef` の隣）。

```ts
import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
```

- [ ] **Step 2: `visibleChannels` を導出する**

`resolvedInitialChannel` の定義（line 41 付近）の**直前**に追加:

```ts
// アカウントが設定されているチャネルのみ表示
const visibleChannels = useMemo(
  () => facility.channels.filter((ch) => ch.account !== null),
  [facility.channels]
);
```

そして `resolvedInitialChannel` を以下のように変更:

```ts
const resolvedInitialChannel = initialChannel && visibleChannels.some(ch => ch.code === initialChannel)
  ? initialChannel
  : visibleChannels[0]?.code || '';
```

- [ ] **Step 3: タブの map を `visibleChannels` に変更**

[FacilityDetail.tsx:773](apps/web/src/app/facility/[facilityId]/FacilityDetail.tsx#L773) を:

```tsx
{visibleChannels.map((channel) => (
```

に変更（`facility.channels.map` → `visibleChannels.map`）。

- [ ] **Step 4: `activeChannel` のフォールバック useEffect を追加**

既存の useEffect（拡張接続チェック等）の近く、line 192 付近に追加:

```tsx
// activeChannel が visibleChannels から消えた場合、先頭にフォールバック
useEffect(() => {
  if (visibleChannels.length === 0) return;
  if (!visibleChannels.some((ch) => ch.code === activeChannel)) {
    setActiveChannel(visibleChannels[0].code);
  }
}, [visibleChannels, activeChannel]);
```

- [ ] **Step 5: エンプティステートを追加**

`{/* チャネルタブ */}` ブロック（line 770 付近）を以下のように変更:

```tsx
{/* チャネルタブ */}
{visibleChannels.length > 0 ? (
  <div className="border-b border-gray-200 mb-6">
    <nav className="flex gap-4">
      {visibleChannels.map((channel) => (
        // 既存のタブボタンをそのまま中に置く
        <button ...>
          ...
        </button>
      ))}
    </nav>
  </div>
) : (
  <div className="card text-center py-12 text-gray-500">
    <p className="mb-2">アカウントが登録されていません。</p>
    {isAdmin && (
      <p className="text-sm">右上の「全チャネル一括同期」ボタンからマスタPWシートと同期してください。</p>
    )}
  </div>
)}
```

**注意**: その下の `{currentChannel && (...)}` ブロックは `currentChannel` が `undefined` のとき自然に何も表示しないので、追加の条件付けは不要。

- [ ] **Step 6: page.tsx 側のフォールバックを確認**

`apps/web/src/app/facility/[facilityId]/page.tsx` の `resolvedInitialChannel` に相当するロジックは現状フロントの `FacilityDetail.tsx` にしかないため、page.tsx 側は変更不要。ただし `autoRun` ファストパス（line 134-162）で `channelList` から `deepLinkChannel` を引いている部分は、削除済みチャネルを指定された場合に問題がある可能性がある。この経路は「ジョブ作成→拡張ディスパッチ」なので、削除済みチャネルの場合は `dispatch` API が `account` を見つけられずエラーになるはず。**今回は触らない**。

- [ ] **Step 7: 型チェックとビルド**

```bash
cd c:/OTAlogin && pnpm build
```

期待: エラー無し。

- [ ] **Step 8: 手動検証**

`pnpm dev` で起動して以下を確認:

1. アカウントが1つ以上ある施設 → タブにそれだけ表示される（20個全部出ていた状態が変わる）
2. アカウントが1つも無い施設 → エンプティステート表示
3. 既存の同期/転記機能が壊れていないこと

- [ ] **Step 9: コミット**

```bash
cd c:/OTAlogin
git add apps/web/src/app/facility/[facilityId]/FacilityDetail.tsx
git commit -m "$(cat <<'EOF'
feat: Filter facility detail tabs by account presence

Show only channels that have a facility_accounts row. When no channels
have accounts, display an empty state guiding admins to bulk sync.
Add fallback when activeChannel is removed (e.g. after delete).

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: チャネル削除ボタンと削除フロー（UI）

**目的:** 各チャネル詳細ヘッダーに admin 限定の赤ゴミ箱アイコンを追加し、`DELETE` API を呼ぶ。確認ダイアログ + 削除後の `router.refresh()`。

**Files:**
- Modify: `apps/web/src/app/facility/[facilityId]/FacilityDetail.tsx`

- [ ] **Step 1: state を追加**

`FacilityDetail` 関数内の他の `useState` 群（line 60-75 付近）に追加:

```ts
// チャネル削除用の状態
const [deleteChannelDialogOpen, setDeleteChannelDialogOpen] = useState(false);
const [deletingChannel, setDeletingChannel] = useState(false);
```

- [ ] **Step 2: 削除ハンドラを追加**

`handleSync` の近く（line 417-455 付近）に追加:

```ts
// 単一チャネル削除（DB+マスタシート）
const handleDeleteChannel = async () => {
  if (!currentChannel) return;
  setDeletingChannel(true);
  setDeleteChannelDialogOpen(false);
  setError(null);
  setSuccessMessage(null);

  try {
    const response = await fetch(
      `/api/facility/${facility.id}/channel/${currentChannel.id}`,
      { method: 'DELETE' }
    );

    if (!response.ok) {
      const data = await response.json();
      let msg = data.error || '削除に失敗しました';
      if (data.details) msg += ` (${data.details})`;
      throw new Error(msg);
    }

    const data = await response.json();
    setSuccessMessage(data.channel_name ? `${data.channel_name}を削除しました` : '削除しました');
    router.refresh();
  } catch (err) {
    setError(err instanceof Error ? err.message : '削除に失敗しました');
  } finally {
    setDeletingChannel(false);
  }
};
```

- [ ] **Step 3: 削除ボタンを追加**

[FacilityDetail.tsx:854-873](apps/web/src/app/facility/[facilityId]/FacilityDetail.tsx#L854-L873) の `{!editMode && isAdmin && (<>...</>)}` ブロック内、「マスタに転記」ボタンの**直後**に追加:

```tsx
<button
  onClick={() => setDeleteChannelDialogOpen(true)}
  disabled={deletingChannel || syncingChannel === currentChannel.code || exportingChannel === currentChannel.code}
  className="text-red-500 hover:text-red-700 transition-colors disabled:opacity-50 ml-1"
  title="このOTAを削除"
  aria-label="このOTAを削除"
>
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
  </svg>
</button>
```

- [ ] **Step 4: 確認ダイアログを追加**

既存の `ConfirmDialog` コンポーネントを再利用する。`return` の中の他のダイアログ群（`syncDialogOpen`, `bulkSyncDialogOpen` 等）の近くに追加:

```tsx
<ConfirmDialog
  isOpen={deleteChannelDialogOpen}
  title="OTAを削除"
  message={
    currentChannel
      ? `この施設の「${currentChannel.name}」のログイン情報をDBとマスタPWシートから削除します。この操作は取り消せません。マスタPWシートから再度追加して同期すれば復活できます。`
      : ''
  }
  confirmLabel="削除する"
  onConfirm={handleDeleteChannel}
  onCancel={() => setDeleteChannelDialogOpen(false)}
  danger
/>
```

`ConfirmDialog` が既に import されていることを確認（[FacilityDetail.tsx:7](apps/web/src/app/facility/[facilityId]/FacilityDetail.tsx#L7)）。

- [ ] **Step 5: 型チェックとビルド**

```bash
cd c:/OTAlogin && pnpm build
```

期待: エラー無し。

- [ ] **Step 6: 手動検証**

`pnpm dev` で起動して以下を確認:

1. admin ログインで任意の施設詳細 → 各チャネル詳細ヘッダーに赤いゴミ箱アイコンが見える
2. 非 admin ログインではボタンが見えない
3. クリックで確認ダイアログ → キャンセル → ダイアログが閉じる
4. **テスト用の不要チャネルを実際に削除** → タブから消えること、マスタシート（実機）からも消えていることを確認
5. 削除後にもう一度同じ操作を試みても問題なく動く（冪等性）

- [ ] **Step 7: コミット**

```bash
cd c:/OTAlogin
git add apps/web/src/app/facility/[facilityId]/FacilityDetail.tsx
git commit -m "$(cat <<'EOF'
feat: Add per-channel delete button to facility detail

Admin-only red trash icon next to the sync/export buttons in each channel
detail header. Confirmation dialog before invoking DELETE
/api/facility/[facilityId]/channel/[channelId]. After deletion the tab
disappears via router.refresh() and the activeChannel fallback effect.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: 一括同期後の `MissingChannelsDialog` 統合

**目的:** `handleBulkSync` で `missing_in_sheet` が返ってきたら第2ダイアログを開き、ユーザーが選んだチャネルを `cleanup-missing` に渡す。

**Files:**
- Modify: `apps/web/src/app/facility/[facilityId]/FacilityDetail.tsx`

- [ ] **Step 1: import 追加**

`FacilityDetail.tsx` の上部 import に追加:

```ts
import { MissingChannelsDialog, type MissingChannel } from '@/components/MissingChannelsDialog';
```

- [ ] **Step 2: state を追加**

`useState` 群に追加:

```ts
// 一括同期後の「マスタに無いOTA」ダイアログ用
const [missingChannels, setMissingChannels] = useState<MissingChannel[]>([]);
const [missingDialogOpen, setMissingDialogOpen] = useState(false);
const [cleaningUp, setCleaningUp] = useState(false);
```

- [ ] **Step 3: `handleBulkSync` を拡張する**

[FacilityDetail.tsx:289-318](apps/web/src/app/facility/[facilityId]/FacilityDetail.tsx#L289-L318) の `handleBulkSync` を以下のように修正:

```ts
// 全チャネル一括同期
const handleBulkSync = async () => {
  setBulkSyncing(true);
  setBulkSyncDialogOpen(false);
  setError(null);
  setSuccessMessage(null);

  try {
    const response = await fetch('/api/master-sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ facility_id: facility.id }),
    });

    if (!response.ok) {
      const data = await response.json();
      let errorMsg = data.error || '同期に失敗しました';
      if (data.details) errorMsg += ` (${data.details})`;
      throw new Error(errorMsg);
    }

    const data = await response.json();
    router.refresh();
    setSuccessMessage(data.message || '一括同期が完了しました');

    // missing_in_sheet が返ってきたら第2ダイアログを開く
    const missing: MissingChannel[] = Array.isArray(data.missing_in_sheet)
      ? data.missing_in_sheet
      : [];
    if (missing.length > 0) {
      setMissingChannels(missing);
      setMissingDialogOpen(true);
    }
  } catch (err) {
    setError(err instanceof Error ? err.message : '同期に失敗しました');
  } finally {
    setBulkSyncing(false);
  }
};
```

- [ ] **Step 4: cleanup ハンドラを追加**

`handleBulkSync` の近くに追加:

```ts
// missing チャネルの一括削除
const handleCleanupMissing = async (selectedChannelIds: string[]) => {
  if (selectedChannelIds.length === 0) return;
  setCleaningUp(true);
  setError(null);

  try {
    const response = await fetch(
      `/api/facility/${facility.id}/cleanup-missing`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channel_ids: selectedChannelIds }),
      }
    );

    if (!response.ok) {
      const data = await response.json();
      let msg = data.error || '削除に失敗しました';
      if (data.details) msg += ` (${data.details})`;
      throw new Error(msg);
    }

    const data = await response.json();
    setSuccessMessage(data.message || `${selectedChannelIds.length}チャネルを削除しました`);
    setMissingDialogOpen(false);
    setMissingChannels([]);
    router.refresh();
  } catch (err) {
    setError(err instanceof Error ? err.message : '削除に失敗しました');
  } finally {
    setCleaningUp(false);
  }
};
```

- [ ] **Step 5: ダイアログを return 内に追加**

他のダイアログの近くに追加:

```tsx
<MissingChannelsDialog
  isOpen={missingDialogOpen}
  channels={missingChannels}
  onConfirm={handleCleanupMissing}
  onCancel={() => {
    setMissingDialogOpen(false);
    setMissingChannels([]);
  }}
  loading={cleaningUp}
/>
```

- [ ] **Step 6: 型チェックとビルド**

```bash
cd c:/OTAlogin && pnpm build
```

期待: エラー無し。

- [ ] **Step 7: 手動検証**

`pnpm dev` で起動して以下を確認（実機での動作確認）:

1. **準備**: マスタPWシートから任意の施設の1〜2行を削除（実機）
2. 該当施設の詳細ページで「全チャネル一括同期」を実行
3. 第2ダイアログが開き、削除した行のチャネルが表示されることを確認
4. 一部のチャネルだけチェックを残して「選択したOTAを削除」を押す
5. 削除されたチャネルのタブが消え、チェックを外したチャネルは残ることを確認
6. **復旧テスト**: シートに行を追加 → 一括同期 → タブに復活することを確認

- [ ] **Step 8: コミット**

```bash
cd c:/OTAlogin
git add apps/web/src/app/facility/[facilityId]/FacilityDetail.tsx
git commit -m "$(cat <<'EOF'
feat: Wire MissingChannelsDialog into bulk sync flow

After a successful bulk sync, if the response contains a non-empty
missing_in_sheet array, open the second-step dialog. Selected channels
are sent to /api/facility/[facilityId]/cleanup-missing for DB-only
deletion (the master sheet is already empty).

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 10: 全体検証とドキュメント更新

**目的:** 全体の動作確認と要件定義書の更新。

**Files:**
- Modify: `docs/requirements-specification.md`

- [ ] **Step 1: 全シナリオの手動検証**

`pnpm dev` で起動して以下を順に確認:

1. **タブフィルタ**
   - アカウント0個の施設 → エンプティステート
   - アカウント数個の施設 → そのチャネルだけタブ表示

2. **マスタ削除→同期→UI反映**
   - シートから1行削除
   - 一括同期 → 第2ダイアログに表示
   - 削除実行 → タブから消える
   - シートに再追加 → 一括同期 → タブに復活

3. **UI削除**
   - チャネル削除ボタン → 確認 → 削除実行
   - シートから消えていること（実機確認）
   - DB から消えていること（Supabase Studio で確認）

4. **権限**
   - 非 admin で削除ボタンが見えない
   - API 直叩きで 403

5. **冪等性**
   - 同じチャネルを2回削除（ブラウザの戻る等で）→ 2回目もエラーにならず成功扱いか、わかりやすいエラー

6. **既存機能の回帰確認**
   - ログイン実行が動く
   - 単一チャネル同期が動く
   - 単一チャネル転記が動く
   - 一括転記が動く

- [ ] **Step 2: lint と build**

```bash
cd c:/OTAlogin && pnpm lint && pnpm build
```

期待: 両方ともエラー無しで完了。

- [ ] **Step 3: 要件定義書を更新**

`docs/requirements-specification.md` の「2.2 施設管理」セクションに以下を追記。FR-013 の後（line 95 付近）に挿入:

```markdown
#### FR-014: チャネル表示フィルタ

- 施設詳細画面のチャネルタブは、`facility_accounts` 行があるチャネルのみ表示する
- マスタPWシートからチャネルを削除して同期すると、そのチャネルはUIから消える
- マスタに再追加して同期すれば復活する

#### FR-015: チャネル単位の削除（admin限定）

- 施設詳細画面の各チャネルヘッダーに削除ボタンを配置
- クリックで確認ダイアログ → DBとマスタPWシートの両方から削除
- リンカーンの場合はその施設×チャネルの全ユーザー行を一括削除
```

そして「2.3 マスタシート連携」セクションの FR-020 のすぐ後ろに追記:

```markdown
#### FR-022: 一括同期での欠損検出

- 「全チャネル一括同期」実行時、DB に存在するがシートに無い `(facility, channel)` を検出
- 検出された場合、第2ダイアログでチェックボックスによる選択削除を促す
- ユーザーが「削除」を押した場合のみ DB から削除（シートは既に空のため触らない）
```

- [ ] **Step 4: コミット**

```bash
cd c:/OTAlogin
git add docs/requirements-specification.md
git commit -m "$(cat <<'EOF'
docs: Update requirements with channel lifecycle sync features

Add FR-014 (tab filter), FR-015 (per-channel delete), and FR-022
(missing-in-sheet detection during bulk sync) to reflect the implemented
behavior.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## 完了基準

- [ ] 全 10 タスクが完了
- [ ] `pnpm build` がエラー無し
- [ ] `pnpm lint` がエラー無し
- [ ] 手動検証の全シナリオが pass
- [ ] 既存機能（ログイン実行、単一同期、単一転記、一括転記）に回帰なし
