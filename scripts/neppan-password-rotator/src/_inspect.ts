/**
 * Phase 0: DOM 事前調査スクリプト
 *
 * ねっぱんにログインし、パスワード変更モーダル → 変更画面まで遷移して
 * DOM / スクリーンショット / フォームフィールド情報を snapshots/ に保存する。
 *
 * ⚠️ パスワードは一切送信しない（登録ボタンは押さない）。
 */

import * as fs from 'fs';
import * as path from 'path';
import { chromium, type Page } from 'playwright';
import { loadNeppanCredentials, maskPassword } from './lib/credentials';
import { loginToNeppan, isPasswordAlertModalOpen } from './lib/login';

function parseArgs(): { facility: string } {
  const args = process.argv.slice(2);
  let facility = '';
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--facility' && args[i + 1]) {
      facility = args[i + 1];
      i++;
    }
  }
  if (!facility) {
    console.error('Usage: pnpm inspect --facility <code>');
    console.error('Example: pnpm inspect --facility kanon');
    process.exit(1);
  }
  return { facility };
}

function timestamp(): string {
  return new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
}

async function dumpFormFields(page: Page): Promise<unknown> {
  return await page.evaluate(() => {
    const inputs = Array.from(document.querySelectorAll('input, textarea, select'));
    return inputs.map((el) => {
      const e = el as HTMLInputElement;
      return {
        tag: e.tagName.toLowerCase(),
        type: e.type || null,
        id: e.id || null,
        name: e.name || null,
        title: e.title || null,
        classList: Array.from(e.classList),
        required: e.required,
        maxLength: e.maxLength > 0 ? e.maxLength : null,
        pattern: e.pattern || null,
        placeholder: e.placeholder || null,
      };
    });
  });
}

async function dumpButtons(page: Page): Promise<unknown> {
  return await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('a, button, input[type="submit"], input[type="button"]'));
    return buttons.slice(0, 100).map((el) => {
      const e = el as HTMLAnchorElement & HTMLButtonElement;
      return {
        tag: e.tagName.toLowerCase(),
        id: e.id || null,
        name: e.getAttribute('name') || null,
        href: e.getAttribute('href') || null,
        classList: Array.from(e.classList),
        text: (e.textContent || '').trim().slice(0, 80),
      };
    });
  });
}

async function savePageSnapshot(page: Page, outDir: string, label: string): Promise<void> {
  fs.mkdirSync(outDir, { recursive: true });

  const html = await page.content();
  fs.writeFileSync(path.join(outDir, `${label}.html`), html, 'utf-8');

  await page.screenshot({
    path: path.join(outDir, `${label}.png`),
    fullPage: true,
  });

  const fields = await dumpFormFields(page);
  const buttons = await dumpButtons(page);
  fs.writeFileSync(
    path.join(outDir, `${label}.fields.json`),
    JSON.stringify({ url: page.url(), title: await page.title(), fields, buttons }, null, 2),
    'utf-8',
  );

  console.log(`[snapshot] saved: ${outDir}/${label}.{html,png,fields.json}`);
}

async function main() {
  const { facility } = parseArgs();
  const outDir = path.resolve(__dirname, '..', 'snapshots', `${facility}-${timestamp()}`);

  console.log(`[inspect] facility=${facility}`);
  console.log(`[inspect] output=${outDir}`);

  console.log('[inspect] loading credentials...');
  const creds = await loadNeppanCredentials(facility);
  console.log(`[inspect] facility: ${creds.facility_name} (${creds.facility_code})`);
  console.log(`[inspect] login_id: ${creds.login_id}`);
  console.log(`[inspect] password: ${maskPassword(creds.password)}`);
  console.log(`[inspect] hotel_id: ${creds.hotel_id}`);
  console.log(`[inspect] login_url: ${creds.login_url}`);

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();

  // コンソール / ネットワークログ収集
  const consoleLogs: string[] = [];
  const networkLogs: string[] = [];
  page.on('console', (msg) => {
    consoleLogs.push(`[${msg.type()}] ${msg.text()}`);
  });
  page.on('request', (req) => {
    networkLogs.push(`>> ${req.method()} ${req.url()}`);
  });
  page.on('response', (res) => {
    networkLogs.push(`<< ${res.status()} ${res.url()}`);
  });
  page.on('dialog', async (d) => {
    console.log(`[dialog] type=${d.type()} message=${d.message()}`);
    await d.dismiss();
  });

  try {
    console.log('[inspect] 1/4 — logging in to neppan...');
    await loginToNeppan(page, creds);
    console.log(`[inspect] post-login url: ${page.url()}`);
    await savePageSnapshot(page, outDir, '1-after-login');

    console.log('[inspect] 2/4 — checking password alert modal...');
    // モーダルが描画されるのを少し待つ
    await page.waitForTimeout(3000);
    const modalOpen = await isPasswordAlertModalOpen(page);
    console.log(`[inspect] modal open: ${modalOpen}`);

    if (!modalOpen) {
      console.log('[inspect] ⚠ password alert modal not detected. Saving current page and exiting.');
      await savePageSnapshot(page, outDir, '2-no-modal');
      console.log('[inspect] Browser stays open for manual inspection. Press Ctrl+C to close.');
      await new Promise(() => {});
      return;
    }

    await savePageSnapshot(page, outDir, '2-modal-open');

    // iframe 内の DOM も別途保存
    const iframeHandle = await page.$('iframe[src*="passwordAlert"]');
    const iframe = await iframeHandle?.contentFrame();
    if (iframe) {
      const iframeHtml = await iframe.content();
      fs.writeFileSync(path.join(outDir, '2-modal-iframe.html'), iframeHtml, 'utf-8');
      console.log('[snapshot] saved: 2-modal-iframe.html');
    }

    console.log('[inspect] 3/4 — clicking 次へ button in iframe...');
    if (!iframe) {
      throw new Error('modal iframe not found');
    }
    await Promise.all([
      page.waitForURL(/operatorPasswordUpdate\.php/, { timeout: 30000 }),
      iframe.click('a[name="btnUpdate"]'),
    ]);
    await page.waitForLoadState('domcontentloaded', { timeout: 30000 });
    console.log(`[inspect] arrived at: ${page.url()}`);
    await savePageSnapshot(page, outDir, '3-password-update-page');

    console.log('[inspect] 4/4 — inspecting password update form (no submission)...');
    // フォーム要素の存在確認
    const formCheck = await page.evaluate(() => {
      return {
        nowpassword: !!document.querySelector('#nowpassword'),
        newpassword1: !!document.querySelector('#newpassword1'),
        newpassword2: !!document.querySelector('#newpassword2'),
        doConfirm: !!document.querySelector('#doConfirm'),
        doConfirm_href: document.querySelector('#doConfirm')?.getAttribute('href') ?? null,
        doConfirm_onclick: document.querySelector('#doConfirm')?.getAttribute('onclick') ?? null,
      };
    });
    fs.writeFileSync(
      path.join(outDir, '4-form-check.json'),
      JSON.stringify(formCheck, null, 2),
      'utf-8',
    );
    console.log('[inspect] form check:', formCheck);

    // ログ保存
    fs.writeFileSync(path.join(outDir, 'console.log'), consoleLogs.join('\n'), 'utf-8');
    fs.writeFileSync(path.join(outDir, 'network.log'), networkLogs.join('\n'), 'utf-8');

    console.log('');
    console.log('✅ Phase 0 inspection complete. No passwords were submitted.');
    console.log(`   Snapshots: ${outDir}`);
    console.log('');
    console.log('Browser stays open for manual inspection. Press Ctrl+C to close.');
    await new Promise(() => {});
  } catch (err) {
    console.error('[inspect] error:', err);
    try {
      fs.mkdirSync(outDir, { recursive: true });
      await savePageSnapshot(page, outDir, 'error');
      fs.writeFileSync(path.join(outDir, 'console.log'), consoleLogs.join('\n'), 'utf-8');
      fs.writeFileSync(path.join(outDir, 'network.log'), networkLogs.join('\n'), 'utf-8');
      fs.writeFileSync(
        path.join(outDir, 'error.txt'),
        err instanceof Error ? `${err.message}\n\n${err.stack}` : String(err),
        'utf-8',
      );
    } catch (saveErr) {
      console.error('[inspect] failed to save error snapshot:', saveErr);
    }
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
