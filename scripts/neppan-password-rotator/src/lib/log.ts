/**
 * JSONL 実行ログ
 *
 * クラッシュ耐性最優先: 全イベントを都度 append + fsync。
 * 途中で異常終了しても「現在 ねっぱんに設定されている PW」を必ず特定可能にする。
 *
 * 平文で PW を記録する理由: リカバリ最優先。logs/ は .gitignore 済み。
 * 30 日で自動削除（cleanupOldLogs）。
 */

import * as fs from 'fs';
import * as path from 'path';

export type LogEvent =
  | { event: 'start'; facility: string; count: number; initial_pw: string; suffix: string }
  | { event: 'login'; result: 'success' | 'failed'; message?: string }
  | { event: 'modal_detected' }
  | { event: 'modal_not_detected' }
  | { event: 'rotate'; round: number; from_pw: string; to_pw: string; result: 'success' | 'failed'; message?: string }
  | { event: 'restore'; from_pw: string; to_pw: string; result: 'success' | 'failed'; message?: string; retry?: number }
  | { event: 'complete'; final_pw: string; matches_initial: boolean }
  | { event: 'abort'; reason: string; current_pw: string }
  | { event: 'manual_action_required'; current_pw: string; reason: string };

export interface LogLine extends Record<string, unknown> {
  ts: string;
}

export class RotationLogger {
  private readonly filePath: string;

  constructor(logsDir: string, facility: string) {
    fs.mkdirSync(logsDir, { recursive: true });
    const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    this.filePath = path.join(logsDir, `${facility}-${ts}.jsonl`);
  }

  get path(): string {
    return this.filePath;
  }

  append(event: LogEvent): void {
    const line: LogLine = { ts: new Date().toISOString(), ...event };
    const fd = fs.openSync(this.filePath, 'a');
    try {
      fs.writeSync(fd, JSON.stringify(line) + '\n');
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }
  }
}

/**
 * logs/ ディレクトリ内で {retentionDays} 日以上経過したファイルを削除する。
 * 破壊的操作だが .jsonl ファイルのみ対象、それ以外は触らない。
 */
export function cleanupOldLogs(logsDir: string, retentionDays = 30): { removed: string[]; kept: string[] } {
  const removed: string[] = [];
  const kept: string[] = [];

  if (!fs.existsSync(logsDir)) {
    return { removed, kept };
  }

  const now = Date.now();
  const cutoff = now - retentionDays * 24 * 60 * 60 * 1000;

  for (const name of fs.readdirSync(logsDir)) {
    if (!name.endsWith('.jsonl')) {
      continue;
    }
    const full = path.join(logsDir, name);
    try {
      const stat = fs.statSync(full);
      if (stat.mtimeMs < cutoff) {
        fs.unlinkSync(full);
        removed.push(name);
      } else {
        kept.push(name);
      }
    } catch {
      // ignore
    }
  }
  return { removed, kept };
}
