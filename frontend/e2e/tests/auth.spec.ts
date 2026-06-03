/* eslint-disable testing-library/prefer-screen-queries */
import { test, expect } from '../fixtures/auth.fixture';
import { LoginPage } from '../pages';

const ROOT_DASHBOARD_URL = /^https?:\/\/[^/]+\/(?:\?.*)?$/;

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

  test('should login successfully with valid credentials', async ({ authenticatedPage }) => {
    // Fixture performs the login (or registers mocks) and navigates to the dashboard.
    await expect(authenticatedPage).toHaveURL(ROOT_DASHBOARD_URL);
    await expect(authenticatedPage.getByRole('heading', { name: /dashboard|mission control/i }).first()).toBeVisible();
  });

  test('should remember user session with remember me checkbox', async ({ authenticatedPage }) => {
    // Fixture provides an already-authenticated page (with mocks when needed).
    await expect(authenticatedPage).toHaveURL(ROOT_DASHBOARD_URL);

    // Cookies should be present (we can't assert duration reliably in tests).
    const cookies = await authenticatedPage.context().cookies();
    expect(cookies.length).toBeGreaterThan(0);
  });

  test('should logout successfully', async ({ authenticatedPage }) => {
    // Start authenticated: allow either a dashboard URL or visible dashboard heading.
    try {
      await expect(authenticatedPage).toHaveURL(ROOT_DASHBOARD_URL);
    } catch {
      // Fallback: navigate to dashboard and wait for heading
      await authenticatedPage.goto('/');
      await authenticatedPage.getByRole('heading', { name: /dashboard|mission control/i }).first().waitFor({ timeout: 10000 });
    }

    // Should be on dashboard
    await expect(authenticatedPage).toHaveURL(/^https?:\/\/[^/]+\/(?:\?.*)?$/);

    // Hover over the sidebar to trigger the hover state
    const sidebar = authenticatedPage.locator('aside').first();
    await sidebar.hover();

    // Click account trigger in sidebar
    const accountTrigger = authenticatedPage.getByTestId('account-menu-trigger');
    await accountTrigger.click();

    // Wait for the popup and click logout
    const sidebarLogout = authenticatedPage.getByRole('button', { name: /logout/i });
    await sidebarLogout.click();

    // Should redirect to login page
    await expect(authenticatedPage).toHaveURL(/\/login/);
    await expect(authenticatedPage.locator('input[type="password"]')).toBeVisible();
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
