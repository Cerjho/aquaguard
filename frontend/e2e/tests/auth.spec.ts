import { test, expect } from '../fixtures/auth.fixture';
import { LoginPage } from '../pages';

test.describe('Authentication Flow', () => {
  test('should display login page with all elements', async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();
    await loginPage.isLoaded();

    await expect(loginPage.logo).toBeVisible();
    await expect(loginPage.usernameInput).toBeVisible();
    await expect(loginPage.passwordInput).toBeVisible();
    await expect(loginPage.rememberMeCheckbox).toBeVisible();
    await expect(loginPage.signInButton).toBeVisible();
  });

  test('should reject invalid credentials', async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();

    await loginPage.login('invalid', 'wrongpassword');

    // Should stay on login page with error
    await expect(page).toHaveURL(/login/);
    await page.waitForTimeout(2000);

    // Check for error indication (error message or still on login)
    await expect(loginPage.usernameInput).toBeVisible();
  });

  test('should login successfully with valid credentials', async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();

    await loginPage.login('admin', 'aquaguard2026');

    // Should redirect to dashboard
    await expect(page).toHaveURL('/');
    await expect(page.getByRole('heading', { name: /dashboard/i }).first()).toBeVisible();
  });

  test('should remember user session with remember me checkbox', async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();

    await loginPage.login('admin', 'aquaguard2026', true);

    // Should redirect to dashboard
    await expect(page).toHaveURL('/');

    // Cookies should be set for longer duration (we can't directly test duration)
    const cookies = await page.context().cookies();
    expect(cookies.length).toBeGreaterThan(0);
  });

  test('should logout successfully', async ({ authenticatedPage }) => {
    // Start authenticated
    await expect(authenticatedPage).toHaveURL('/');

    // Click logout
    await authenticatedPage.getByRole('button', { name: /logout/i }).click();

    // Should redirect to login
    await expect(authenticatedPage).toHaveURL(/login/);
  });

  test('should redirect unauthenticated users to login', async ({ page }) => {
    // Try to access protected routes
    await page.goto('/');
    await expect(page).toHaveURL(/login/);

    await page.goto('/incidents');
    await expect(page).toHaveURL(/login/);

    await page.goto('/analytics');
    await expect(page).toHaveURL(/login/);

    await page.goto('/system');
    await expect(page).toHaveURL(/login/);
  });
});
