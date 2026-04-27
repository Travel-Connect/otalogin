/**
 * 連番パスワード生成
 *
 * フォーマット: Rotate-{YYYYMMDD}-{NN}{suffix}
 *   例: Rotate-20260424-01!A
 *
 * ポリシー充足:
 *   - 長さ 20 文字（>=8）
 *   - 小文字 (otate)、大文字 (R, A)、数字 (日付/NN)、特殊文字 (-, !)
 *   - 使用可能文字のみ（英数字 + 許可特殊文字）
 */

const SUFFIX_CANDIDATES = ['!A', '!B', '!C', '!D', '!E', '!F', '!G', '!H'];

export function formatDate(d: Date): string {
  // JST 基準で日付を決める（実行はローカル運用のため）
  const local = new Date(d.getTime() + 9 * 60 * 60 * 1000);
  return local.toISOString().slice(0, 10).replace(/-/g, '');
}

export function sequentialPassword(date: Date, round: number, suffix: string): string {
  if (round < 1 || round > 99) {
    throw new Error(`Round must be 1..99, got ${round}`);
  }
  const roundStr = String(round).padStart(2, '0');
  return `Rotate-${formatDate(date)}-${roundStr}${suffix}`;
}

/**
 * 実行開始時に固定する suffix を決定する。
 * 生成する全 PW (round 1..count) が initialPw および history と衝突しないものを選ぶ。
 *
 * @param initialPw 運用中の元 PW（復帰対象）
 * @param history 過去に使った PW の集合（オプション、リジュームや手動履歴用）
 * @param date 実行日（復帰ラウンド含め、全ラウンドで同じ date を使う）
 * @param count ランダム変更の回数（復帰ラウンドは含まない）
 */
export function resolveSuffix(
  initialPw: string,
  history: ReadonlySet<string>,
  date: Date,
  count: number,
): string {
  for (const suffix of SUFFIX_CANDIDATES) {
    const candidates = Array.from({ length: count }, (_, i) =>
      sequentialPassword(date, i + 1, suffix),
    );
    const collides = candidates.some(
      (pw) => pw === initialPw || history.has(pw),
    );
    if (!collides) {
      return suffix;
    }
  }
  throw new Error(
    `All suffix candidates collided with initial pw or history. Tried: ${SUFFIX_CANDIDATES.join(', ')}`,
  );
}

/**
 * ねっぱんのパスワードポリシーを満たすかどうかのローカル事前チェック。
 * サーバ側の最終判定ではないが、既知ポリシーとの齟齬を早期に検出できる。
 */
export function validatePolicy(pw: string): { ok: boolean; failed: string[] } {
  const failed: string[] = [];
  if (pw.length < 8) failed.push('length>=8');
  if (!/[a-z]/.test(pw)) failed.push('lowercase');
  if (!/[A-Z]/.test(pw)) failed.push('uppercase');
  if (!/[0-9]/.test(pw)) failed.push('digit');
  if (!/[~!@#$%^&*()_+}{\[\]?:;,.=\-/]/.test(pw)) failed.push('special');
  // 使用可能文字のみ（英数字 + 許可特殊文字）
  if (!/^[A-Za-z0-9~!@#$%^&*()_+}{\[\]?:;,.=\-/]+$/.test(pw)) failed.push('usable-char');
  return { ok: failed.length === 0, failed };
}
