/**
 * 複数施設を順次ローテートする bulk rotator。
 *
 * - アカウントロック回避のため並列実行はしない（順次処理）
 * - 施設ごとに個別の JSONL ログ
 * - サマリレポート: logs/bootstrap-summary-{ts}.json
 * - 1 施設が失敗しても次の施設に進む（手動復旧前提）
 * - モーダル検知はスキップして直接 operatorPasswordUpdate.php へ遷移
 */

import * as fs from 'fs';
import * as path from 'path';
import { rotate } from './rotator';
import { listNeppanFacilityCodes } from './lib/credentials';

export interface BulkRotateOptions {
  include?: string[];
  count: number;
  live: boolean;
  dryRun: boolean;
  logsDir: string;
}

export interface BulkRotateResult {
  total: number;
  succeeded: string[];
  failed: { facility: string; error: string }[];
  skipped: { facility: string; reason: string }[];
  summaryPath: string;
}

export async function resolveTargetFacilities(
  include?: string[],
): Promise<string[]> {
  const all = await listNeppanFacilityCodes();
  if (!include || include.length === 0) {
    return all;
  }

  const set = new Set(all);
  const targets: string[] = [];
  const missing: string[] = [];
  for (const code of include) {
    if (set.has(code)) {
      targets.push(code);
    } else {
      missing.push(code);
    }
  }
  if (missing.length > 0) {
    throw new Error(
      `Requested facilities not found among neppan accounts: ${missing.join(', ')}. ` +
        `Available: ${all.join(', ')}`,
    );
  }
  return targets;
}

export async function rotateAll(opts: BulkRotateOptions): Promise<BulkRotateResult> {
  const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const targets = await resolveTargetFacilities(opts.include);

  console.log(`[bulk] targets (${targets.length}): ${targets.join(', ')}`);
  console.log(`[bulk] mode: ${opts.dryRun ? 'DRY-RUN' : opts.live ? 'LIVE' : 'unknown'}`);
  console.log(`[bulk] count per facility: ${opts.count} (= ${opts.count} rotations + 1 restore)`);
  console.log(`[bulk] modal detection: SKIPPED (direct navigation)`);

  const succeeded: string[] = [];
  const failed: { facility: string; error: string }[] = [];
  const skipped: { facility: string; reason: string }[] = [];

  const INTER_FACILITY_DELAY_MS = 2000;

  for (let i = 0; i < targets.length; i++) {
    const facility = targets[i];
    console.log(`\n[bulk] ========== [${i + 1}/${targets.length}] ${facility} ==========`);

    if (i > 0) {
      // 連続ログインによる ねっぱん側のセッション競合を避けるための小休止
      await new Promise((resolve) => setTimeout(resolve, INTER_FACILITY_DELAY_MS));
    }

    try {
      await rotate({
        facility,
        count: opts.count,
        live: opts.live,
        dryRun: opts.dryRun,
        logsDir: opts.logsDir,
        skipModalCheck: true,
        logPrefix: `bootstrap-${facility}`,
      });
      succeeded.push(facility);
      console.log(`[bulk] ✅ ${facility} succeeded`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      failed.push({ facility, error: message });
      console.error(`[bulk] ❌ ${facility} FAILED: ${message}`);
      console.error(`[bulk] continuing with remaining facilities...`);
    }
  }

  const summaryPath = path.join(opts.logsDir, `bootstrap-summary-${ts}.json`);
  const summary: Omit<BulkRotateResult, 'summaryPath'> & { ts: string; mode: string } = {
    ts,
    mode: opts.dryRun ? 'dry-run' : 'live',
    total: targets.length,
    succeeded,
    failed,
    skipped,
  };
  fs.mkdirSync(opts.logsDir, { recursive: true });
  fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2), 'utf-8');

  console.log(`\n[bulk] ========== SUMMARY ==========`);
  console.log(`[bulk] total:     ${targets.length}`);
  console.log(`[bulk] succeeded: ${succeeded.length}`);
  console.log(`[bulk] failed:    ${failed.length}`);
  console.log(`[bulk] skipped:   ${skipped.length}`);
  console.log(`[bulk] summary:   ${summaryPath}`);
  if (failed.length > 0) {
    console.log(`[bulk] FAILED facilities:`);
    for (const f of failed) {
      console.log(`  - ${f.facility}: ${f.error}`);
    }
  }

  return { total: targets.length, succeeded, failed, skipped, summaryPath };
}
