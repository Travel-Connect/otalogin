import { test, expect } from '@playwright/test';

/**
 * Real OTA E2E テスト
 *
 * 実際のOTAサイトに対するスモークテスト
 *
 * ⚠️ 注意:
 * - このテストは機密情報を扱うため、trace/screenshot/video は OFF
 * - 成果物は社内保管のみ、ChatGPT へのアップロードは禁止
 * - 結果はサマリーのみ出力
 */

// 環境変数から認証情報を取得（テスト時に設定）
const TEST_CREDENTIALS = {
  rakuten: {
    username: process.env.TEST_RAKUTEN_USERNAME || '',
    password: process.env.TEST_RAKUTEN_PASSWORD || '',
  },
  jalan: {
    username: process.env.TEST_JALAN_USERNAME || '',
    password: process.env.TEST_JALAN_PASSWORD || '',
  },
  neppan: {
    username: process.env.TEST_NEPPAN_USERNAME || '',
    password: process.env.TEST_NEPPAN_PASSWORD || '',
    hotel_id: process.env.TEST_NEPPAN_HOTEL_ID || '',
  },
};

test.describe('Real OTA Smoke Tests', () => {
  // 認証情報が設定されていない場合はスキップ
  test.skip(
    !TEST_CREDENTIALS.rakuten.username,
    'Rakuten credentials not configured'
  );

  test('rakuten: login page is accessible', async ({ page }) => {
    await page.goto('https://hotel.travel.rakuten.co.jp/extranet/login');

    // ログインページが表示されることを確認（詳細は機密になるため最小限）
    await expect(page).toHaveURL(/rakuten/);

    // 結果をログに記録（機密情報は含めない）
    console.info(
      JSON.stringify({
        channel: 'rakuten',
        test: 'login_page_accessible',
        status: 'pass',
        timestamp: new Date().toISOString(),
      })
    );
  });

  test.skip(
    !TEST_CREDENTIALS.jalan.username,
    'Jalan credentials not configured'
  );

  test('jalan: login page is accessible', async ({ page }) => {
    await page.goto('https://www.jalan.net/jalan/doc/howto/innkanri/');

    await expect(page).toHaveURL(/jalan/);

    console.info(
      JSON.stringify({
        channel: 'jalan',
        test: 'login_page_accessible',
        status: 'pass',
        timestamp: new Date().toISOString(),
      })
    );
  });

  test.skip(
    !TEST_CREDENTIALS.neppan.username,
    'Neppan credentials not configured'
  );

  test('neppan: login page is accessible', async ({ page }) => {
    await page.goto('https://asp.hotel-story.ne.jp/ver3/ASPU0201.asp');

    await expect(page).toHaveURL(/hotel-story/);

    console.info(
      JSON.stringify({
        channel: 'neppan',
        test: 'login_page_accessible',
        status: 'pass',
        timestamp: new Date().toISOString(),
      })
    );
  });
});

/**
 * 注意: 実際のログイン処理テストは、認証情報を環境変数で設定した上で
 * 手動で実行する必要があります。
 *
 * 実行例:
 * TEST_RAKUTEN_USERNAME=xxx TEST_RAKUTEN_PASSWORD=xxx pnpm e2e:real
 */
