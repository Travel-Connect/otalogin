import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright 設定
 *
 * e2e:mock - モックページでのテスト（機密なし、成果物OK）
 * e2e:real - 実OTAテスト（機密あり、成果物OFF）
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [['html', { outputFolder: 'playwright-report' }], ['json', { outputFile: 'test-results/results.json' }]],

  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },

  projects: [
    // Mock テスト（デフォルト）- 機密なし、成果物OK
    {
      name: 'mock',
      testMatch: /mock\.spec\.ts$/,
      use: {
        ...devices['Desktop Chrome'],
        trace: 'on',
        screenshot: 'on',
        video: 'on-first-retry',
      },
    },

    // 実OTAテスト - 機密あり、成果物OFF
    {
      name: 'real-ota',
      testMatch: /real\.spec\.ts$/,
      use: {
        ...devices['Desktop Chrome'],
        // 機密混入防止のため全て OFF
        trace: 'off',
        screenshot: 'off',
        video: 'off',
      },
    },
  ],

  webServer: {
    command: 'pnpm dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
  },
});
