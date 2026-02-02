import { test, expect } from '@playwright/test';

/**
 * Mock E2E テスト
 *
 * モックログインページを使用した安定テスト
 * 機密情報を含まないため、trace/screenshot をONにしてChatGPTレビューに使用可能
 */

test.describe('Mock Login Tests', () => {
  test('should display mock login page', async ({ page }) => {
    await page.goto('/e2e/mock/login');

    // ページが表示されることを確認
    await expect(page.locator('h1')).toContainText('モックOTAログイン');

    // 入力フィールドが存在することを確認
    await expect(page.getByTestId('username-input')).toBeVisible();
    await expect(page.getByTestId('password-input')).toBeVisible();
    await expect(page.getByTestId('submit-button')).toBeVisible();
  });

  test('should show error on invalid credentials', async ({ page }) => {
    await page.goto('/e2e/mock/login');

    // 不正な認証情報を入力
    await page.getByTestId('username-input').fill('wrong_user');
    await page.getByTestId('password-input').fill('wrong_password');
    await page.getByTestId('submit-button').click();

    // エラーメッセージが表示されることを確認
    await expect(page.getByTestId('login-error')).toBeVisible();
  });

  test('should login successfully with valid credentials', async ({ page }) => {
    await page.goto('/e2e/mock/login');

    // 正しい認証情報を入力
    await page.getByTestId('username-input').fill('test_user');
    await page.getByTestId('password-input').fill('test_password');
    await page.getByTestId('submit-button').click();

    // ログイン成功画面が表示されることを確認
    await expect(page.getByTestId('login-success')).toBeVisible();
    await expect(page.locator('text=ログイン成功')).toBeVisible();
  });

  test('should fill form fields programmatically', async ({ page }) => {
    await page.goto('/e2e/mock/login');

    // プログラムでフィールドに入力（Content Script のシミュレーション）
    const usernameInput = page.getByTestId('username-input');
    const passwordInput = page.getByTestId('password-input');

    await usernameInput.focus();
    await usernameInput.fill('test_user');
    await usernameInput.dispatchEvent('input');
    await usernameInput.dispatchEvent('change');

    await passwordInput.focus();
    await passwordInput.fill('test_password');
    await passwordInput.dispatchEvent('input');
    await passwordInput.dispatchEvent('change');

    // 値が設定されていることを確認
    await expect(usernameInput).toHaveValue('test_user');
    await expect(passwordInput).toHaveValue('test_password');

    // ログイン実行
    await page.getByTestId('submit-button').click();
    await expect(page.getByTestId('login-success')).toBeVisible();
  });
});

test.describe('Portal Basic Tests', () => {
  test('should redirect to login when not authenticated', async ({ page }) => {
    await page.goto('/');

    // ログインページにリダイレクトされることを確認
    await expect(page).toHaveURL(/.*login/);
  });

  test('should display login form', async ({ page }) => {
    await page.goto('/login');

    // ログインフォームが表示されることを確認
    await expect(page.locator('h2')).toContainText('OTAログイン支援ツール');
    await expect(page.locator('input[type="email"]')).toBeVisible();
    await expect(page.locator('input[type="password"]')).toBeVisible();
  });
});
