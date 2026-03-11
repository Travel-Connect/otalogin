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

test.describe('Dashboard Tests', () => {
  test('should render dashboard with facility cards', async ({ page }) => {
    await page.goto('/e2e/mock/dashboard');

    // ダッシュボードが表示されることを確認
    await expect(page.getByTestId('mock-dashboard')).toBeVisible();

    // ヘッダーが表示される
    await expect(page.locator('text=OTAログインポータル')).toBeVisible();

    // 3施設のカードが表示される
    await expect(page.locator('text=テストホテル沖縄')).toBeVisible();
    await expect(page.locator('text=テストホテル那覇')).toBeVisible();
    await expect(page.locator('text=テストホテル東部')).toBeVisible();
  });

  test('should show Systems and OTA sections in facility card', async ({ page }) => {
    await page.goto('/e2e/mock/dashboard');

    // Systems / OTA セクションラベルが存在
    const systemsLabels = page.locator('text=Systems');
    await expect(systemsLabels.first()).toBeVisible();

    const otaLabels = page.locator('text=OTA');
    await expect(otaLabels.first()).toBeVisible();
  });

  test('should filter facilities by search', async ({ page }) => {
    await page.goto('/e2e/mock/dashboard');

    // 検索バーに入力
    const searchInput = page.locator('input[placeholder="施設名で検索…"]');
    await searchInput.fill('沖縄');

    // 沖縄のみ表示
    await expect(page.locator('text=テストホテル沖縄')).toBeVisible();
    await expect(page.locator('text=テストホテル那覇')).not.toBeVisible();
    await expect(page.locator('text=テストホテル東部')).not.toBeVisible();

    // 件数表示を確認
    await expect(page.locator('text=1 / 3 件')).toBeVisible();
  });

  test('should filter by status', async ({ page }) => {
    await page.goto('/e2e/mock/dashboard');

    // エラーのみフィルター
    await page.locator('button:has-text("エラーのみ")').click();

    // エラーを含む施設のみ表示（沖縄:一休エラー、東部:ねっぱんエラー）
    await expect(page.locator('text=テストホテル沖縄')).toBeVisible();
    await expect(page.locator('text=テストホテル東部')).toBeVisible();
    // 那覇はエラーなし
    await expect(page.locator('text=テストホテル那覇')).not.toBeVisible();

    // 件数表示
    await expect(page.locator('text=2 / 3 件')).toBeVisible();
  });

  test('should filter by tag', async ({ page }) => {
    await page.goto('/e2e/mock/dashboard');

    // タグドロップダウンを開く
    await page.locator('button:has-text("タグ")').click();

    // 「南部」を選択
    await page.locator('button:has-text("南部")').click();

    // 南部タグの施設のみ表示
    await expect(page.locator('text=テストホテル沖縄')).toBeVisible();
    await expect(page.locator('text=テストホテル那覇')).toBeVisible();
    await expect(page.locator('text=テストホテル東部')).not.toBeVisible();

    // 件数表示
    await expect(page.locator('text=2 / 3 件')).toBeVisible();
  });

  test('should clear filters', async ({ page }) => {
    await page.goto('/e2e/mock/dashboard');

    // フィルターをかける
    await page.locator('button:has-text("エラーのみ")').click();
    await expect(page.locator('text=2 / 3 件')).toBeVisible();

    // クリアボタンをクリック
    await page.locator('button:has-text("クリア")').click();

    // 全施設が表示される
    await expect(page.locator('text=3 / 3 件')).toBeVisible();
  });

  test('should show status legend in card footer', async ({ page }) => {
    await page.goto('/e2e/mock/dashboard');

    // ステータス凡例が表示される
    await expect(page.locator('text=正常').first()).toBeVisible();
    await expect(page.locator('text=エラー').first()).toBeVisible();
    await expect(page.locator('text=実行中').first()).toBeVisible();
    await expect(page.locator('text=未登録').first()).toBeVisible();
  });

  test('should show kebab menu with facility settings link', async ({ page }) => {
    await page.goto('/e2e/mock/dashboard');

    // ケバブメニューをクリック
    const menuButton = page.locator('[aria-label="施設メニュー"]').first();
    await menuButton.click();

    // 施設設定リンクが表示される
    await expect(page.locator('button:has-text("施設設定")')).toBeVisible();
  });

  test('should show tag chips on facility cards', async ({ page }) => {
    await page.goto('/e2e/mock/dashboard');

    // タグが表示される
    await expect(page.locator('text=リゾート').first()).toBeVisible();
    await expect(page.locator('text=都市').first()).toBeVisible();
    await expect(page.locator('text=東部').first()).toBeVisible();
  });

  test('should display correct facility count', async ({ page }) => {
    await page.goto('/e2e/mock/dashboard');

    // 全件表示
    await expect(page.locator('text=3 / 3 件')).toBeVisible();
  });

  test('should show official site link for facilities with URL', async ({ page }) => {
    await page.goto('/e2e/mock/dashboard');

    // 沖縄と那覇には公式サイトリンクがある
    const officialLinks = page.locator('a[title="公式サイト"]');
    await expect(officialLinks).toHaveCount(2);

    // リンク先が正しい
    await expect(officialLinks.first()).toHaveAttribute('href', 'https://example.com/okinawa');
    await expect(officialLinks.nth(1)).toHaveAttribute('href', 'https://example.com/naha');
  });

  test('should show public page links on OTA tiles', async ({ page }) => {
    await page.goto('/e2e/mock/dashboard');

    // 公開ページリンクが表示される
    const publicLinks = page.locator('a:has-text("公開")');
    await expect(publicLinks.first()).toBeVisible();

    // じゃらん（沖縄）の公開リンク先が正しい
    const jalanLink = page.locator('a[href="https://www.jalan.net/yad300000/"]');
    await expect(jalanLink).toBeVisible();
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
