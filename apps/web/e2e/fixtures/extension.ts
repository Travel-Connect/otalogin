import { test as base, chromium, BrowserContext } from '@playwright/test';
import path from 'path';

/**
 * Chrome拡張を読み込んだ persistent context でテストを実行するフィクスチャ
 */
export const test = base.extend<{
  context: BrowserContext;
  extensionId: string;
}>({
  // eslint-disable-next-line no-empty-pattern
  context: async ({}, use) => {
    const extensionPath = path.join(__dirname, '../../../extension/dist');
    const userDataDir = path.join(__dirname, '../../../.playwright-user-data');

    const context = await chromium.launchPersistentContext(userDataDir, {
      headless: false, // 拡張はheadlessで動かない
      args: [
        `--disable-extensions-except=${extensionPath}`,
        `--load-extension=${extensionPath}`,
        '--no-first-run',
        '--disable-default-apps',
      ],
    });

    await use(context);
    await context.close();
  },
  extensionId: async ({ context }, use) => {
    // Service Worker が登録されるのを待つ
    let extensionId = '';

    // 拡張のService Workerを取得
    const serviceWorkers = context.serviceWorkers();
    if (serviceWorkers.length > 0) {
      const url = serviceWorkers[0].url();
      const match = url.match(/chrome-extension:\/\/([^/]+)/);
      if (match) {
        extensionId = match[1];
      }
    }

    // Service Worker がまだなければ待機
    if (!extensionId) {
      const sw = await context.waitForEvent('serviceworker');
      const url = sw.url();
      const match = url.match(/chrome-extension:\/\/([^/]+)/);
      if (match) {
        extensionId = match[1];
      }
    }

    await use(extensionId);
  },
});

export { expect } from '@playwright/test';
