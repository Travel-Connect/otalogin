/**
 * ねっぱん パスワード変更画面のページ操作
 *
 * 1. passwordAlert モーダル検出
 * 2. iframe 内「次へ」クリック → operatorPasswordUpdate.php 遷移
 * 3. 3 フィールド入力 → #doConfirm クリック
 * 4. operatorPasswordUpdateComplete.php 到達を成功とする
 * 5. エラー時はページ内テキストからエラー内容を抽出
 */

import type { Page } from 'playwright';

const UPDATE_URL_RE = /operatorPasswordUpdate\.php/;
const COMPLETE_URL_RE = /operatorPasswordUpdateComplete\.php/;

export async function isPasswordAlertModalOpen(page: Page): Promise<boolean> {
  const iframe = await page.$('iframe[src*="passwordAlert.php"]');
  return iframe !== null;
}

/**
 * モーダル内の「次へ」ボタンをクリックし operatorPasswordUpdate.php へ遷移する。
 */
export async function clickNextInModal(page: Page): Promise<void> {
  const iframeHandle = await page.$('iframe[src*="passwordAlert"]');
  const frame = await iframeHandle?.contentFrame();
  if (!frame) {
    throw new Error('password alert modal iframe not found');
  }
  await Promise.all([
    page.waitForURL(UPDATE_URL_RE, { timeout: 30000 }),
    frame.click('a[name="btnUpdate"]'),
  ]);
  await page.waitForLoadState('domcontentloaded', { timeout: 30000 });
}

/**
 * サイドメニュー等から直接 operatorPasswordUpdate.php にアクセスする。
 * 2 ラウンド目以降（完了画面から戻る）に使う。
 */
export async function navigateToUpdatePage(page: Page): Promise<void> {
  // 完了画面や任意のページから、同一ドメインの operatorPasswordUpdate.php に遷移
  const currentUrl = new URL(page.url());
  const target = `${currentUrl.protocol}//${currentUrl.host}/operatorPasswordUpdate.php`;
  await page.goto(target, { waitUntil: 'domcontentloaded', timeout: 30000 });
}

/**
 * 3 フィールドに入力する。JS バリデーションをトリガーするため fill + blur を使う。
 */
export async function fillPasswordUpdateForm(
  page: Page,
  nowPw: string,
  newPw: string,
): Promise<void> {
  await page.waitForSelector('#nowpassword', { timeout: 30000 });

  await page.fill('#nowpassword', nowPw);
  await page.fill('#newpassword1', newPw);
  await page.fill('#newpassword2', newPw);

  // JS バリデーションを確実に発火させる。
  // fill() は input イベントを発火するが、keyup 専用のハンドラがある場合に備えて
  // 明示的に keyup も発火し、最後に blur する。
  for (const id of ['nowpassword', 'newpassword1', 'newpassword2']) {
    await page.locator(`#${id}`).dispatchEvent('keyup');
    await page.locator(`#${id}`).dispatchEvent('change');
  }
  await page.locator('#newpassword2').blur();

  // JS 判定 span 更新待ち
  await page.waitForTimeout(500);
}

/**
 * JS バリデーション span の状態を読み取る。
 * OK/NG 6 項目がすべて OK になっていれば true。
 */
export async function checkPolicyIndicators(page: Page): Promise<{
  ok: boolean;
  details: Record<string, 'OK' | 'NG' | 'unknown'>;
}> {
  const ids = [
    'Length',
    'Lowercase',
    'Uppercase',
    'Number',
    'SpecialCharacter',
    'UsableCharacter',
  ];
  const details: Record<string, 'OK' | 'NG' | 'unknown'> = {};
  let allOk = true;

  for (const id of ids) {
    const okVisible = await isSpanVisible(page, `#check${id}OK`);
    const ngVisible = await isSpanVisible(page, `#check${id}NG`);
    if (okVisible && !ngVisible) {
      details[id] = 'OK';
    } else if (ngVisible && !okVisible) {
      details[id] = 'NG';
      allOk = false;
    } else {
      details[id] = 'unknown';
      allOk = false;
    }
  }

  return { ok: allOk, details };
}

async function isSpanVisible(page: Page, selector: string): Promise<boolean> {
  const el = await page.$(selector);
  if (!el) return false;
  return await el.isVisible();
}

/**
 * 「登録する」を押して完了画面への遷移を待つ。
 * 失敗時（完了画面に到達しなかった）はページ本文からエラーテキストを抽出する。
 */
export async function submitAndWaitForCompletion(
  page: Page,
): Promise<{ ok: true } | { ok: false; error: string; url: string }> {
  // JS confirm ダイアログが出る可能性に備える
  const dialogHandler = (d: import('playwright').Dialog) => {
    void d.accept();
  };
  page.on('dialog', dialogHandler);

  try {
    await Promise.all([
      // いずれかに遷移するまで待つ
      Promise.race([
        page.waitForURL(COMPLETE_URL_RE, { timeout: 30000 }),
        page.waitForLoadState('networkidle', { timeout: 30000 }),
      ]),
      page.click('#doConfirm'),
    ]);
  } finally {
    page.off('dialog', dialogHandler);
  }

  const url = page.url();
  if (COMPLETE_URL_RE.test(url)) {
    return { ok: true };
  }

  // エラーメッセージを抽出
  const errorText = await extractErrorText(page);
  return { ok: false, error: errorText || '(no error text captured)', url };
}

async function extractErrorText(page: Page): Promise<string> {
  // よくあるエラー表示箇所を順に確認
  const selectors = [
    '.errorAlertDialog',
    '#errorAlertDialog',
    '#errorAlertDialogWrapper',
    '.error',
    '.errorMessage',
    '#message',
  ];
  const seen = new Set<string>();
  const collected: string[] = [];
  for (const sel of selectors) {
    const els = await page.$$(sel);
    for (const el of els) {
      const visible = await el.isVisible().catch(() => false);
      if (!visible) continue;
      const text = (await el.innerText().catch(() => '')).trim();
      if (text && !seen.has(text)) {
        seen.add(text);
        collected.push(`[${sel}] ${text}`);
      }
    }
  }
  return collected.join(' | ');
}
