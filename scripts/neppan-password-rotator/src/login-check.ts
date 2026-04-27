/**
 * 全施設（または指定施設）のねっぱんログインだけを試行し、
 * クレデンシャルが有効かを健全性チェックする。
 *
 * - パスワード変更は一切しない
 * - 各施設で新しいブラウザコンテキストを起動 → ログイン → URL 検証 → クローズ
 * - 失敗してもサマリに記録して次の施設へ
 */

import * as fs from 'fs';
import * as path from 'path';
import { chromium } from 'playwright';
import { listNeppanFacilityCodes, loadNeppanCredentials, maskPassword } from './lib/credentials';
import { loginToNeppan } from './lib/login';
import { resolveTargetFacilities } from './bulk-rotator';

export interface LoginCheckOptions {
  include?: string[];
  logsDir: string;
}

export interface LoginCheckResultRow {
  facility: string;
  ok: boolean;
  url?: string;
  error?: string;
  duration_ms: number;
}

export interface LoginCheckSummary {
  ts: string;
  total: number;
  succeeded: string[];
  failed: { facility: string; error: string }[];
  results: LoginCheckResultRow[];
  summaryPath: string;
}

const INTER_FACILITY_DELAY_MS = 1500;

export async function loginCheck(opts: LoginCheckOptions): Promise<LoginCheckSummary> {
  const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const targets = await resolveTargetFacilities(opts.include);

  console.log(`[login-check] targets (${targets.length}): ${targets.join(', ')}`);
  console.log(`[login-check] mode: READ-ONLY (no password change)`);

  const results: LoginCheckResultRow[] = [];
  const succeeded: string[] = [];
  const failed: { facility: string; error: string }[] = [];

  for (let i = 0; i < targets.length; i++) {
    const facility = targets[i];
    console.log(`\n[login-check] ========== [${i + 1}/${targets.length}] ${facility} ==========`);

    if (i > 0) {
      await new Promise((resolve) => setTimeout(resolve, INTER_FACILITY_DELAY_MS));
    }

    const start = Date.now();
    const row = await checkOne(facility);
    row.duration_ms = Date.now() - start;
    results.push(row);

    if (row.ok) {
      succeeded.push(facility);
      console.log(`[login-check] ✅ ${facility} (${row.duration_ms}ms) -> ${row.url}`);
    } else {
      failed.push({ facility, error: row.error ?? 'unknown' });
      console.error(`[login-check] ❌ ${facility} (${row.duration_ms}ms): ${row.error}`);
    }
  }

  const summaryPath = path.join(opts.logsDir, `login-check-${ts}.json`);
  const summary: LoginCheckSummary = {
    ts,
    total: targets.length,
    succeeded,
    failed,
    results,
    summaryPath,
  };
  fs.mkdirSync(opts.logsDir, { recursive: true });
  fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2), 'utf-8');

  console.log(`\n[login-check] ========== SUMMARY ==========`);
  console.log(`[login-check] total:     ${targets.length}`);
  console.log(`[login-check] succeeded: ${succeeded.length}`);
  console.log(`[login-check] failed:    ${failed.length}`);
  console.log(`[login-check] summary:   ${summaryPath}`);
  if (failed.length > 0) {
    console.log(`[login-check] FAILED facilities:`);
    for (const f of failed) {
      console.log(`  - ${f.facility}: ${f.error}`);
    }
  }

  return summary;
}

async function checkOne(facility: string): Promise<LoginCheckResultRow> {
  let creds;
  try {
    creds = await loadNeppanCredentials(facility);
  } catch (err) {
    return {
      facility,
      ok: false,
      error: `credentials load failed: ${err instanceof Error ? err.message : String(err)}`,
      duration_ms: 0,
    };
  }

  console.log(`[login-check] facility: ${creds.facility_name} (${creds.facility_code})`);
  console.log(`[login-check] login_id: ${creds.login_id} / pw: ${maskPassword(creds.password)} / hotel_id: ${creds.hotel_id}`);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();

  try {
    await loginToNeppan(page, creds);
    return {
      facility,
      ok: true,
      url: page.url(),
      duration_ms: 0,
    };
  } catch (err) {
    return {
      facility,
      ok: false,
      error: err instanceof Error ? err.message : String(err),
      url: page.url(),
      duration_ms: 0,
    };
  } finally {
    await browser.close().catch(() => {});
  }
}
