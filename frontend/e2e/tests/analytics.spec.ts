import { test, expect } from '../fixtures/auth.fixture';
import { AnalyticsPage } from '../pages';

test.describe('Analytics Page', () => {
  test('should display analytics page with charts', async ({ authenticatedPage }) => {
    const analyticsPage = new AnalyticsPage(authenticatedPage);
    await analyticsPage.goto();
    await analyticsPage.isLoaded();

    await expect(analyticsPage.heading).toBeVisible();
    await expect(analyticsPage.zoneBarChart).toBeVisible();
    await expect(analyticsPage.timeLineChart).toBeVisible();
  });

  test('should have time range selector', async ({ authenticatedPage }) => {
    const analyticsPage = new AnalyticsPage(authenticatedPage);
    await analyticsPage.goto();
    await analyticsPage.isLoaded();

    await expect(analyticsPage.timeRangeSelect).toBeVisible();

    // Check available options
    const options = await analyticsPage.timeRangeSelect.locator('option').allTextContents();
    expect(options).toContain('Last 24 hours');
    expect(options).toContain('Last 7 days');
    expect(options).toContain('Last 30 days');
  });

  test('should have grouping selector', async ({ authenticatedPage }) => {
    const analyticsPage = new AnalyticsPage(authenticatedPage);
    await analyticsPage.goto();
    await analyticsPage.isLoaded();

    await expect(analyticsPage.groupingSelect).toBeVisible();

    // Check available options
    const options = await analyticsPage.groupingSelect.locator('option').allTextContents();
    expect(options.some((o) => o.toLowerCase().includes('zone'))).toBe(true);
    expect(options.some((o) => o.toLowerCase().includes('day'))).toBe(true);
  });

  test('should change time range', async ({ authenticatedPage }) => {
    const analyticsPage = new AnalyticsPage(authenticatedPage);
    await analyticsPage.goto();
    await analyticsPage.isLoaded();

    // Change to last 30 days
    await analyticsPage.setTimeRange('30');

    // Charts should still be visible after refresh
    await expect(analyticsPage.zoneBarChart).toBeVisible();
    await expect(analyticsPage.timeLineChart).toBeVisible();
  });

  test('should display alert counts by zone chart', async ({ authenticatedPage }) => {
    const analyticsPage = new AnalyticsPage(authenticatedPage);
    await analyticsPage.goto();
    await analyticsPage.isLoaded();

    // Zone chart section should be visible
    await expect(analyticsPage.zoneBarChart).toBeVisible();

    // Legend should be visible
    const legend = authenticatedPage.locator('text=/Alerts|Detections/i');
    await expect(legend.first()).toBeVisible();
  });

  test('should display detections over time chart', async ({ authenticatedPage }) => {
    const analyticsPage = new AnalyticsPage(authenticatedPage);
    await analyticsPage.goto();
    await analyticsPage.isLoaded();

    // Time chart section should be visible
    await expect(analyticsPage.timeLineChart).toBeVisible();
  });

  test('should load charts within acceptable time', async ({ authenticatedPage }) => {
    const startTime = Date.now();

    const analyticsPage = new AnalyticsPage(authenticatedPage);
    await analyticsPage.goto();
    await analyticsPage.isLoaded();

    const loadTime = Date.now() - startTime;
    expect(loadTime).toBeLessThan(5000); // Should load within 5 seconds
  });
});
