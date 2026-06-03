/* eslint-disable testing-library/prefer-screen-queries */
import { test, expect, TEST_CREDENTIALS, mockApiResponse } from '../fixtures/auth.fixture';
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
    let isLoggedIn = false;

    await page.route(/\/api\/v1\/auth\/me/, (route) => {
      if (isLoggedIn) {
        route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'success', data: { user: { username: TEST_CREDENTIALS.admin.username, role: 'admin' } } }) });
      } else {
        route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ status: 'error', message: 'Unauthorized' }) });
      }
    });

    await page.route(/\/api\/v1\/auth\/login/, (route) => {
      isLoggedIn = true;
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'success', data: { user: { username: TEST_CREDENTIALS.admin.username, role: 'admin' } } }) });
    });

    await page.route(/\/api\/v1\/reports\/summary/, (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'success', data: { by_zone: [], daily: [] } }) }));
    await page.route(/\/api\/v1\/events/, (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'success', data: { events: [] } }) }));
    await page.route(/\/api\/v1\/system\/status/, (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'success', data: { subsystems: {}, cameras: { total: 0, online: 0 } } }) }));
    await page.route(/\/api\/v1\/alerts/, (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'success', data: { alerts: [] } }) }));
    await page.route(/\/api\/v1\/cameras/, (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'success', data: { cameras: [] } }) }));

    const loginPage = new LoginPage(page);
    await loginPage.goto();
    await loginPage.isLoaded();

    await loginPage.login(TEST_CREDENTIALS.admin.username, TEST_CREDENTIALS.admin.password);

    // Should redirect to dashboard
    await expect(page).toHaveURL(ROOT_DASHBOARD_URL);
    await expect(page.getByRole('heading', { name: /dashboard|mission control/i }).first()).toBeVisible();
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

    // Hover over the sidebar to trigger the hover state
    const sidebar = authenticatedPage.locator('aside').first();
    await sidebar.hover();

    // Open the account popover in the sidebar first, then click logout
    await authenticatedPage.getByTestId('account-menu-trigger').click();
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
