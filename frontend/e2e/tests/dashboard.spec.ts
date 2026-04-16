import { test, expect } from '../fixtures/auth.fixture';
import { DashboardPage } from '../pages';

const ROOT_DASHBOARD_URL = /^https?:\/\/[^/]+\/(?:\?.*)?$/;

test.describe('Dashboard', () => {
  test('should display all main sections', async ({ authenticatedPage }) => {
    const dashboard = new DashboardPage(authenticatedPage);
    await dashboard.isLoaded();

    // Check main sections are visible
    await expect(dashboard.heading).toBeVisible();
    await expect(dashboard.cameraGrid).toBeVisible();
    await expect(dashboard.detectionFeed).toBeVisible();
    await expect(dashboard.systemHealth).toBeVisible();
  });

  test('should show API and socket status in status bar', async ({ authenticatedPage }) => {
    const dashboard = new DashboardPage(authenticatedPage);
    await dashboard.isLoaded();

    // Status bar should show connectivity info - look for API/Socket text
    const apiStatus = authenticatedPage.getByText(/api:/i).first();
    await expect(apiStatus).toBeVisible();
  });

  test('should display camera count', async ({ authenticatedPage }) => {
    const dashboard = new DashboardPage(authenticatedPage);
    await dashboard.isLoaded();

    const cameraCount = await dashboard.getCameraCount();
    expect(cameraCount).toBeGreaterThanOrEqual(0);
  });

  test('should navigate to incidents page', async ({ authenticatedPage }) => {
    const dashboard = new DashboardPage(authenticatedPage);
    await dashboard.isLoaded();

    await dashboard.navigateToIncidents();
    await expect(authenticatedPage).toHaveURL(/\/incidents(?:\?.*)?$/);
  });

  test('should navigate to analytics page', async ({ authenticatedPage }) => {
    const dashboard = new DashboardPage(authenticatedPage);
    await dashboard.isLoaded();

    await dashboard.navigateToAnalytics();
    await expect(authenticatedPage).toHaveURL(/\/analytics(?:\?.*)?$/);
  });

  test('should navigate to system page', async ({ authenticatedPage }) => {
    const dashboard = new DashboardPage(authenticatedPage);
    await dashboard.isLoaded();

    await dashboard.navigateToSystem();
    await expect(authenticatedPage).toHaveURL(/\/system(?:\?.*)?$/);
  });

  test('should handle rapid navigation between pages', async ({ authenticatedPage }) => {
    const dashboard = new DashboardPage(authenticatedPage);
    await dashboard.isLoaded();

    // Navigate quickly between pages
    await dashboard.navigateToIncidents();
    await authenticatedPage.getByRole('link', { name: /analytics/i }).click();
    await expect(authenticatedPage).toHaveURL(/\/analytics(?:\?.*)?$/);
    await authenticatedPage.getByRole('link', { name: /system/i }).click();
    await expect(authenticatedPage).toHaveURL(/\/system(?:\?.*)?$/);
    await authenticatedPage.getByRole('link', { name: /dashboard/i }).click();
    await expect(authenticatedPage).toHaveURL(ROOT_DASHBOARD_URL);

    // Should end up back on dashboard
    await expect(dashboard.heading).toBeVisible();
  });

  test('should display detection feed events', async ({ authenticatedPage }) => {
    const dashboard = new DashboardPage(authenticatedPage);
    await dashboard.isLoaded();

    // Detection feed should be visible
    await expect(dashboard.detectionFeed).toBeVisible();

    // Should show socket connection status somewhere on page
    const socketText = authenticatedPage.locator('text=/socket|connecting|offline/i').first();
    await expect(socketText).toBeVisible({ timeout: 5000 });
  });

  test('should load within acceptable time', async ({ authenticatedPage }) => {
    const startTime = Date.now();

    const dashboard = new DashboardPage(authenticatedPage);
    await dashboard.isLoaded();

    const loadTime = Date.now() - startTime;
    expect(loadTime).toBeLessThan(10000); // Should load within 10 seconds (including auth fixture)
  });
});
