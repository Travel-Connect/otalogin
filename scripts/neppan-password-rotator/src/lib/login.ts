import type { Page } from 'playwright';
import type { NeppanCredentials } from './credentials';

/**
 * ねっぱんにログインする。
 * セレクタは packages/shared/src/constants/channels.ts の neppan 定義に合わせている。
 *
 * 注意:
 *   asp.hotel-story.ne.jp/ASPU0201.asp は www{N}.neppan.net/login.php に
 *   自動リダイレクトするため、ログイン前の URL は既に変わっている。
 *   成功判定は「ログイン後の特定 URL (top.php, AnalyzeTop.php) への到達」で行う。
 */
const LOGIN_SUCCESS_URL_RE = /\/(AnalyzeTop|top)\.php/i;
const LOGIN_RETRY_ERROR_TEXT = '再度処理を、実施しなおして下さい';
const LOGIN_MAX_ATTEMPTS = 3;
const LOGIN_RETRY_DELAY_MS = 3000;

async function attemptLogin(page: Page, creds: NeppanCredentials): Promise<
  { ok: true } | { ok: false; reason: string; url: string }
> {
  await page.goto(creds.login_url, { waitUntil: 'domcontentloaded', timeout: 60000 });

  // リダイレクト完了 + ログインフォーム表示
  await page.waitForSelector('#LoginBtn', { timeout: 60000, state: 'visible' });
  await page.waitForSelector('#clientCode', { timeout: 10000, state: 'visible' });

  // cookie / CSRF token などが確定するまで待つ
  await page
    .waitForLoadState('networkidle', { timeout: 20000 })
    .catch(() => {
      // networkidle に届かないサイトでもフォールスルー
    });

  await page.fill('#clientCode', creds.hotel_id);
  await page.fill('#loginId', creds.login_id);
  await page.fill('#password', creds.password);

  // クリック → ログイン成功 URL への到達を待つ
  try {
    await Promise.all([
      page.waitForURL(LOGIN_SUCCESS_URL_RE, { timeout: 30000 }),
      page.click('#LoginBtn'),
    ]);
    await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});
    return { ok: true };
  } catch {
    const url = page.url();
    const bodyText = await page
      .locator('body')
      .innerText()
      .catch(() => '');
    const snippet = bodyText.slice(0, 500).replace(/\s+/g, ' ').trim();

    // ねっぱんの既知エラーメッセージを検出
    if (bodyText.includes(LOGIN_RETRY_ERROR_TEXT)) {
      return {
        ok: false,
        reason: `neppan "${LOGIN_RETRY_ERROR_TEXT}" — likely session/token mismatch, retryable`,
        url,
      };
    }
    if (LOGIN_SUCCESS_URL_RE.test(url)) {
      // 遷移はしたが networkidle 待ちで落ちたケース
      return { ok: true };
    }
    return {
      ok: false,
      reason: `did not reach AnalyzeTop/top.php. body-snippet="${snippet}"`,
      url,
    };
  }
}

export async function loginToNeppan(page: Page, creds: NeppanCredentials): Promise<void> {
  let lastFailure: { reason: string; url: string } | null = null;

  for (let attempt = 1; attempt <= LOGIN_MAX_ATTEMPTS; attempt++) {
    if (attempt > 1) {
      console.log(
        `[login] retry ${attempt}/${LOGIN_MAX_ATTEMPTS} after ${LOGIN_RETRY_DELAY_MS}ms ` +
          `(previous: ${lastFailure?.reason ?? 'unknown'})`,
      );
      await page.waitForTimeout(LOGIN_RETRY_DELAY_MS);
    }

    const result = await attemptLogin(page, creds);
    if (result.ok) {
      if (attempt > 1) {
        console.log(`[login] ✅ succeeded on attempt ${attempt}`);
      }
      return;
    }
    lastFailure = { reason: result.reason, url: result.url };
  }

  throw new Error(
    `loginToNeppan failed after ${LOGIN_MAX_ATTEMPTS} attempts. ` +
      `last: ${lastFailure?.reason} (url=${lastFailure?.url})`,
  );
}

/**
 * パスワード変更強制モーダル (passwordAlert.php) が開いているか判定。
 */
export async function isPasswordAlertModalOpen(page: Page): Promise<boolean> {
  const iframe = await page.$('iframe[src*="passwordAlert.php"]');
  return iframe !== null;
}
