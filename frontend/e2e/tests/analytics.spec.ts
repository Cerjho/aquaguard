/* eslint-disable testing-library/prefer-screen-queries */
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

    // Time range control may be a native select or custom dropdown.
    const timeRangeButton = authenticatedPage.getByRole('button', { name: /time range|incidents by time range|detection frequency range/i }).first();
    await expect(timeRangeButton).toBeVisible();
    await timeRangeButton.click();

    // Dropdown options vary by build; try a few known variants and assert at least one is present
    const variants = [/today/i, /this week/i, /this wk/i, /this month/i, /last 24 hours/i, /last 7 days/i, /last 30 days/i];
    let found = false;
    for (const v of variants) {
      try {
        await expect(authenticatedPage.getByRole('button', { name: v }).first()).toBeVisible({ timeout: 2000 });
        found = true;
        break;
      } catch (e) {
        // try next variant
      }
    }
    expect(found).toBe(true);
  });

  test('should have grouping selector', async ({ authenticatedPage }) => {
    const analyticsPage = new AnalyticsPage(authenticatedPage);
    await analyticsPage.goto();
    await analyticsPage.isLoaded();

    // The grouping control is rendered as simple toggle buttons (e.g. "All", "By Zone").
    await expect(authenticatedPage.getByRole('button', { name: /all/i }).first()).toBeVisible();
    await expect(authenticatedPage.getByRole('button', { name: /by zone/i }).first()).toBeVisible();
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
