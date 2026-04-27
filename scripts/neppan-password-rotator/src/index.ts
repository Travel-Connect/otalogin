/**
 * neppan-password-rotator CLI
 *
 * コマンド:
 *   rotate --facility <code> [--count 10] [--dry-run] [--live]
 *     パスワードを count 回変更し最後に元 PW に戻す。
 *
 *   cleanup-logs [--days 30]
 *     logs/ 配下の古いログファイルを削除する（既定 30 日）。
 */

import * as path from 'path';
import * as readline from 'readline';
import { rotate } from './rotator';
import { rotateAll, resolveTargetFacilities } from './bulk-rotator';
import { loginCheck } from './login-check';
import { rotateDue } from './rotate-due';
import { listNeppanFacilityCodes } from './lib/credentials';
import { listDueFacilities } from './lib/rotation-state';
import { cleanupOldLogs } from './lib/log';

const LOGS_DIR = path.resolve(__dirname, '..', 'logs');

interface ParsedArgs {
  command:
    | 'rotate'
    | 'rotate-all'
    | 'rotate-due'
    | 'list-due'
    | 'login-check'
    | 'list'
    | 'cleanup-logs'
    | 'help';
  facility?: string;
  facilities?: string[];
  count?: number;
  live?: boolean;
  dryRun?: boolean;
  days?: number;
  limit?: number;
  auto?: boolean;
}

function parseArgs(argv: string[]): ParsedArgs {
  const args = argv.slice(2);
  const command = (args[0] ?? 'help') as ParsedArgs['command'];
  const parsed: ParsedArgs = { command };

  for (let i = 1; i < args.length; i++) {
    const a = args[i];
    const next = args[i + 1];
    switch (a) {
      case '--facility':
        parsed.facility = next;
        i++;
        break;
      case '--facilities':
        // PowerShell で "a,b,c" がカンマ演算子として扱われ空白区切りになるケースに備えて
        // カンマ・空白どちらもデリミタとして受け付ける
        parsed.facilities = next
          .split(/[,\s]+/)
          .map((s) => s.trim())
          .filter(Boolean);
        i++;
        break;
      case '--count':
        parsed.count = Number.parseInt(next, 10);
        i++;
        break;
      case '--live':
        parsed.live = true;
        break;
      case '--dry-run':
        parsed.dryRun = true;
        break;
      case '--auto':
        parsed.auto = true;
        break;
      case '--days':
        parsed.days = Number.parseInt(next, 10);
        i++;
        break;
      case '--limit':
        parsed.limit = Number.parseInt(next, 10);
        i++;
        break;
      case '--help':
      case '-h':
        parsed.command = 'help';
        break;
    }
  }
  return parsed;
}

function printHelp(): void {
  console.log(`neppan-password-rotator

Usage:
  pnpm rotate --facility <code> [--count 10] [--dry-run | --live]
  pnpm rotate-all --facilities <code,code,...> [--count 10] [--dry-run | --live]
  pnpm rotate-due [--days 30] [--limit 5] [--auto] [--dry-run | --live]
  pnpm list-due [--days 30]
  pnpm login-check [--facilities <code,code,...>]
  pnpm exec ts-node src/index.ts list
  pnpm exec ts-node src/index.ts cleanup-logs [--days 30]

Commands:
  rotate         Rotate Neppan password for a single facility.
  rotate-all     Rotate all (or selected) Neppan facilities sequentially.
                 Skips password-alert modal detection (direct navigation).
  rotate-due     Auto-rotate only facilities not rotated within the last --days
                 (default 30). Designed for daily Task Scheduler runs.
  list-due       Show facilities currently due for rotation.
  login-check    READ-ONLY: try to log in to all (or selected) Neppan facilities
                 and report success/failure. No password change.
  list           List all facilities that have Neppan credentials.
  cleanup-logs   Delete .jsonl logs older than --days (default 30).

Options:
  --facility <code>         Facility code (required for rotate)
  --facilities <a,b,c>      Comma-separated facility codes (for rotate-all;
                            required for live mode as a safety measure)
  --count <n>               Random rotations before restore (default 10 = total 11 changes)
  --dry-run                 Navigate + fill form but DO NOT click "登録する"
  --live                    Actually change the password
  --auto                    Skip interactive confirmation (for scheduled jobs)
  --days <n>                For rotate-due/list-due: rotation age cutoff (default 30)
                            For cleanup-logs: log retention (default 30)
  --limit <n>               For rotate-due: max facilities per run (default 5, 1..30)
  -h, --help                Show this help
`);
}

async function confirm(message: string): Promise<boolean> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(`${message} (y/N): `, (answer) => {
      rl.close();
      // 全角 y/Y も受け入れる（Windows 日本語 IME 対策）
      const normalized = answer.trim().toLowerCase()
        .replace(/ｙ/g, 'y')
        .replace(/[ｙＹ]/g, 'y');
      resolve(normalized === 'y' || normalized === 'yes');
    });
  });
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv);

  if (args.command === 'help') {
    printHelp();
    return;
  }

  if (args.command === 'list') {
    const codes = await listNeppanFacilityCodes();
    console.log(`Neppan facilities (${codes.length}):`);
    for (const c of codes) console.log(`  ${c}`);
    return;
  }

  if (args.command === 'list-due') {
    const days = args.days ?? 30;
    const due = await listDueFacilities(days);
    console.log(`Facilities due for rotation (>${days}d since last rotation, or never): ${due.length}`);
    for (const f of due) {
      console.log(
        `  ${f.facility_code.padEnd(24)}  last=${f.last_rotated_at ?? 'never'}  count=${f.rotation_count}  status=${f.last_status ?? 'n/a'}`,
      );
    }
    return;
  }

  if (args.command === 'rotate-due') {
    if (!args.dryRun && !args.live) {
      console.error('Either --dry-run or --live is required (safety: no default)');
      process.exit(1);
    }
    if (args.dryRun && args.live) {
      console.error('--dry-run and --live are mutually exclusive');
      process.exit(1);
    }

    const count = args.count ?? 10;
    if (count < 1 || count > 20) {
      console.error(`--count must be 1..20, got ${count}`);
      process.exit(1);
    }

    const days = args.days ?? 30;
    const limit = args.limit ?? 5;
    if (limit < 1 || limit > 30) {
      console.error(`--limit must be 1..30, got ${limit}`);
      process.exit(1);
    }

    if (args.live && !args.auto) {
      // 対象を先に表示してから確認
      const due = await listDueFacilities(days);
      const slice = due.slice(0, limit).map((f) => f.facility_code);
      if (slice.length === 0) {
        console.log('[rotate-due] nothing to do.');
        return;
      }
      const ok = await confirm(
        `About to rotate ${slice.length} facility(ies): [${slice.join(', ')}]. Continue?`,
      );
      if (!ok) {
        console.log('[rotate-due] aborted by user.');
        return;
      }
    }

    const { result } = await rotateDue({
      days,
      limit,
      count,
      live: !!args.live,
      dryRun: !!args.dryRun,
      logsDir: LOGS_DIR,
    });

    const cleanup = cleanupOldLogs(LOGS_DIR, 30);
    if (cleanup.removed.length > 0) {
      console.log(`[rotate-due] cleaned up ${cleanup.removed.length} old log(s) (>30d).`);
    }

    if (result && result.failed.length > 0) {
      process.exit(1);
    }
    return;
  }

  if (args.command === 'login-check') {
    const result = await loginCheck({
      include: args.facilities,
      logsDir: LOGS_DIR,
    });
    if (result.failed.length > 0) {
      process.exit(1);
    }
    return;
  }

  if (args.command === 'rotate-all') {
    if (!args.dryRun && !args.live) {
      console.error('Either --dry-run or --live is required (safety: no default)');
      process.exit(1);
    }
    if (args.dryRun && args.live) {
      console.error('--dry-run and --live are mutually exclusive');
      process.exit(1);
    }

    const count = args.count ?? 10;
    if (count < 1 || count > 20) {
      console.error(`--count must be 1..20, got ${count}`);
      process.exit(1);
    }

    // 安全策: live 実行時は --facilities で明示的な施設リストを要求する
    // （テスト段階で全施設を誤って走らせないため）
    if (args.live && !args.auto && (!args.facilities || args.facilities.length === 0)) {
      console.error(
        '--facilities is required for --live (safety: no implicit all-facility run). ' +
          'To run all facilities, explicitly list them via --facilities or run with --auto.',
      );
      process.exit(1);
    }

    // 事前に対象リストを解決してユーザーに見せる
    const targets = await resolveTargetFacilities(args.facilities);
    if (targets.length === 0) {
      console.error('No target facilities resolved.');
      process.exit(1);
    }

    if (args.live && !args.auto) {
      const ok = await confirm(
        `About to rotate password ${count} times + restore for ${targets.length} facilities: [${targets.join(', ')}]. Continue?`,
      );
      if (!ok) {
        console.log('[rotate-all] aborted by user.');
        return;
      }
    }

    const result = await rotateAll({
      include: args.facilities,
      count,
      live: !!args.live,
      dryRun: !!args.dryRun,
      logsDir: LOGS_DIR,
    });

    const cleanup = cleanupOldLogs(LOGS_DIR, 30);
    if (cleanup.removed.length > 0) {
      console.log(`[rotate-all] cleaned up ${cleanup.removed.length} old log(s) (>30d).`);
    }

    // 失敗ありの場合は exit code 1
    if (result.failed.length > 0) {
      process.exit(1);
    }
    return;
  }

  if (args.command === 'cleanup-logs') {
    const days = args.days ?? 30;
    const result = cleanupOldLogs(LOGS_DIR, days);
    console.log(`[cleanup] removed ${result.removed.length} / kept ${result.kept.length} (retention=${days}d)`);
    for (const name of result.removed) console.log(`  removed: ${name}`);
    return;
  }

  if (args.command === 'rotate') {
    if (!args.facility) {
      console.error('--facility is required');
      process.exit(1);
    }
    if (!args.dryRun && !args.live) {
      console.error('Either --dry-run or --live is required (safety: no default)');
      process.exit(1);
    }
    if (args.dryRun && args.live) {
      console.error('--dry-run and --live are mutually exclusive');
      process.exit(1);
    }

    const count = args.count ?? 10;
    if (count < 1 || count > 20) {
      console.error(`--count must be 1..20, got ${count}`);
      process.exit(1);
    }

    if (args.live && !args.auto) {
      const ok = await confirm(
        `About to rotate password ${count} times + restore for facility "${args.facility}". Continue?`,
      );
      if (!ok) {
        console.log('[rotator] aborted by user.');
        return;
      }
    }

    await rotate({
      facility: args.facility,
      count,
      live: !!args.live,
      dryRun: !!args.dryRun,
      logsDir: LOGS_DIR,
    });

    // cleanup old logs on successful completion
    const cleanup = cleanupOldLogs(LOGS_DIR, 30);
    if (cleanup.removed.length > 0) {
      console.log(`[rotator] cleaned up ${cleanup.removed.length} old log(s) (>30d).`);
    }
    return;
  }

  printHelp();
  process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
