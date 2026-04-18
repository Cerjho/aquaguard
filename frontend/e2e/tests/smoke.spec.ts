import { test, expect } from '../fixtures/auth.fixture';
import { LoginPage, DashboardPage } from '../pages';

const ROOT_DASHBOARD_URL = /^https?:\/\/[^/]+\/(?:\?.*)?$/;

/**
 * Critical Smoke Tests - Run in CI
 * 
 * These are the most critical user flows that must always work.
 * Keep this suite small (8-10 tests max) for fast CI feedback.
 */
test.describe('Smoke Tests @smoke', () => {
  test('should load login page', async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();
    await loginPage.isLoaded();

    await expect(loginPage.usernameInput).toBeVisible();
    await expect(loginPage.passwordInput).toBeVisible();
    await expect(loginPage.signInButton).toBeVisible();
  });

  test('should reject invalid credentials', async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();

    await loginPage.login('invalid', 'wrongpassword');

    // Should stay on login page
    await expect(page).toHaveURL(/login/);
    await expect(loginPage.usernameInput).toBeVisible();
  });

  test('should login successfully', async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();

    await loginPage.login('admin', 'aquaguard2026');

    // Should redirect to dashboard
    await expect(page).toHaveURL(ROOT_DASHBOARD_URL);
    await expect(page.getByRole('heading', { name: /dashboard/i }).first()).toBeVisible();
  });

  test('should display dashboard sections', async ({ authenticatedPage }) => {
    const dashboard = new DashboardPage(authenticatedPage);
    await dashboard.isLoaded();

    // Check critical sections exist
    await expect(dashboard.heading).toBeVisible();
    await expect(dashboard.cameraGrid).toBeVisible();
    await expect(dashboard.detectionFeed).toBeVisible();
  });

  test('should navigate to incidents page', async ({ authenticatedPage }) => {
    const dashboard = new DashboardPage(authenticatedPage);
    await dashboard.isLoaded();

    await dashboard.navigateToIncidents();
    await expect(authenticatedPage).toHaveURL(/\/incidents(?:\?.*)?$/);
    await expect(authenticatedPage.getByRole('heading', { name: /incidents/i }).first()).toBeVisible();
  });

  test('should navigate to analytics page', async ({ authenticatedPage }) => {
    const dashboard = new DashboardPage(authenticatedPage);
    await dashboard.isLoaded();

    await dashboard.navigateToAnalytics();
    await expect(authenticatedPage).toHaveURL(/\/analytics(?:\?.*)?$/);
    await expect(authenticatedPage.getByRole('heading', { name: /analytics/i }).first()).toBeVisible();
  });

  test('should navigate to system page', async ({ authenticatedPage }) => {
    const dashboard = new DashboardPage(authenticatedPage);
    await dashboard.isLoaded();

    await dashboard.navigateToSystem();
    await expect(authenticatedPage).toHaveURL(/\/system(?:\?.*)?$/);
    await expect(authenticatedPage.getByRole('heading', { name: /system/i }).first()).toBeVisible();
  });

  test('should logout successfully', async ({ authenticatedPage }) => {
    await expect(authenticatedPage).toHaveURL(ROOT_DASHBOARD_URL);

    // Click logout
    await authenticatedPage.getByRole('button', { name: /logout/i }).click();

    // Verify logged-out state by URL and login form visibility.
    await expect(authenticatedPage).toHaveURL(/\/login(?:\?.*)?$/);
    await expect(
      authenticatedPage.getByRole('textbox', { name: /email|username/i })
    ).toBeVisible();
  });

  test('should protect routes from unauthenticated access', async ({ page }) => {
    // Try to access protected route directly
    await page.goto('/');
    
    // Should redirect to login
    await expect(page).toHaveURL(/login/);
  });
});
