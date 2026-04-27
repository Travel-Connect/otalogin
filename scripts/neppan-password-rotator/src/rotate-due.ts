/**
 * 30日以上前にローテートした施設（または未ローテート施設）のみを対象に
 * パスワードローテーションを実行する。
 *
 * Task Scheduler から日次起動される想定:
 *   pnpm rotate-due --auto --live [--days 30] [--limit 5]
 *
 * - 1 日あたり --limit 件を上限として処理（暴発防止）
 * - 対象が 0 件なら早期終了（exit 0）
 */

import { rotateAll, type BulkRotateResult } from './bulk-rotator';
import { listDueFacilities } from './lib/rotation-state';

export interface RotateDueOptions {
  days: number;
  limit: number;
  count: number;
  live: boolean;
  dryRun: boolean;
  logsDir: string;
}

export async function rotateDue(
  opts: RotateDueOptions,
): Promise<{ targets: string[] } & ({ result: BulkRotateResult } | { result: null })> {
  console.log(`[rotate-due] checking facilities not rotated within last ${opts.days} days...`);

  const due = await listDueFacilities(opts.days);
  console.log(`[rotate-due] due facilities: ${due.length}`);
  for (const f of due) {
    console.log(
      `  ${f.facility_code.padEnd(24)}  last=${f.last_rotated_at ?? 'never'}  count=${f.rotation_count}  status=${f.last_status ?? 'n/a'}`,
    );
  }

  if (due.length === 0) {
    console.log('[rotate-due] nothing to do (all facilities are up-to-date).');
    return { targets: [], result: null };
  }

  const slice = due.slice(0, opts.limit).map((f) => f.facility_code);
  if (slice.length < due.length) {
    console.log(
      `[rotate-due] processing first ${slice.length}/${due.length} facilities (limit=${opts.limit}). ` +
        `Remaining ${due.length - slice.length} will be picked up on next runs.`,
    );
  } else {
    console.log(`[rotate-due] processing all ${slice.length} due facilities.`);
  }

  const result = await rotateAll({
    include: slice,
    count: opts.count,
    live: opts.live,
    dryRun: opts.dryRun,
    logsDir: opts.logsDir,
  });

  return { targets: slice, result };
}
