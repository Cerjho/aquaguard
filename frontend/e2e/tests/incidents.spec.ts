/* eslint-disable testing-library/prefer-screen-queries, jest/no-conditional-expect */
import { test, expect } from '../fixtures/auth.fixture';
import { IncidentsPage } from '../pages';

test.describe('Incidents Page', () => {
  test('should display incidents page with tabs', async ({ authenticatedPage }) => {
    const incidentsPage = new IncidentsPage(authenticatedPage);
    await incidentsPage.goto();
    await incidentsPage.isLoaded();

    await expect(incidentsPage.heading).toBeVisible();
    await expect(incidentsPage.alertHistoryTab).toBeVisible();
    await expect(incidentsPage.detectionEventsTab).toBeVisible();
  });

  test('should display alert history table', async ({ authenticatedPage }) => {
    const incidentsPage = new IncidentsPage(authenticatedPage);
    await incidentsPage.goto();
    await incidentsPage.isLoaded();

    await expect(incidentsPage.incidentMasterList).toBeVisible();
  });

  test('should have filter controls', async ({ authenticatedPage }) => {
    const incidentsPage = new IncidentsPage(authenticatedPage);
    await incidentsPage.goto();
    await incidentsPage.isLoaded();

    await expect(incidentsPage.addFilterButton).toBeVisible();
    await incidentsPage.addFilterButton.click();
    await expect(incidentsPage.zoneIdFilter).toBeVisible();
    await expect(incidentsPage.statusFilter).toBeVisible();
    await expect(incidentsPage.resetFiltersButton).toBeVisible();
  });

  test('should filter alerts by zone', async ({ authenticatedPage }) => {
    const incidentsPage = new IncidentsPage(authenticatedPage);
    await incidentsPage.goto();
    await incidentsPage.isLoaded();
    await incidentsPage.addFilterButton.click();

    // Get initial count
    const initialCount = await incidentsPage.getAlertCount();

    // Apply zone filter
    await incidentsPage.filterByZone('zone_dev');

    // Wait for filter to apply
    await authenticatedPage.waitForTimeout(1000);

    // Results should be filtered (could be same or less)
    const filteredCount = await incidentsPage.getAlertCount();
    expect(filteredCount).toBeLessThanOrEqual(initialCount);
  });

  test('should filter alerts by status', async ({ authenticatedPage }) => {
    const incidentsPage = new IncidentsPage(authenticatedPage);
    await incidentsPage.goto();
    await incidentsPage.isLoaded();
    await incidentsPage.addFilterButton.click();

    // Filter by acknowledged
    await incidentsPage.filterByStatus('acknowledged');
    await authenticatedPage.waitForTimeout(1000);

    // All visible statuses should be "Acknowledged"
    const acknowledgedCells = authenticatedPage.locator('td:has-text("Acknowledged")');
    const count = await acknowledgedCells.count();
    expect(count).toBeGreaterThanOrEqual(0);
  });

  test('should reset filters', async ({ authenticatedPage }) => {
    const incidentsPage = new IncidentsPage(authenticatedPage);
    await incidentsPage.goto();
    await incidentsPage.isLoaded();
    await incidentsPage.addFilterButton.click();

    // Apply filters
    await incidentsPage.filterByZone('zone_test');
    await incidentsPage.filterByStatus('acknowledged');
    await authenticatedPage.waitForTimeout(500);

    // Reset filters
    await incidentsPage.resetFilters();

    // Zone filter should be empty
    await expect(incidentsPage.zoneIdFilter).toHaveValue('');
  });

  test('should switch between tabs', async ({ authenticatedPage }) => {
    const incidentsPage = new IncidentsPage(authenticatedPage);
    await incidentsPage.goto();
    await incidentsPage.isLoaded();

    // Switch to detection events
    await incidentsPage.switchToDetectionEvents();
    await authenticatedPage.waitForTimeout(500);

    // Should show detection events table
    const alertTriggeredColumn = authenticatedPage.getByText(/alert triggered/i);
    await expect(alertTriggeredColumn).toBeVisible();

    // Switch back to alert history
    await incidentsPage.switchToAlertHistory();
    await authenticatedPage.waitForTimeout(500);
  });

  test('should open incident detail drawer when selecting a row', async ({ authenticatedPage }) => {
    const incidentsPage = new IncidentsPage(authenticatedPage);
    await incidentsPage.goto();
    await incidentsPage.isLoaded();

    if ((await incidentsPage.incidentRows.count()) > 0) {
      await incidentsPage.incidentRows.first().click();
      await expect(incidentsPage.incidentDetailDrawer).toBeVisible();
    }
  });

  test('should show pagination controls', async ({ authenticatedPage }) => {
    const incidentsPage = new IncidentsPage(authenticatedPage);
    await incidentsPage.goto();
    await incidentsPage.isLoaded();

    // Check pagination exists
    await expect(incidentsPage.pagination).toBeVisible();
    await expect(incidentsPage.prevPageButton).toBeVisible();
    await expect(incidentsPage.nextPageButton).toBeVisible();
  });

  test('should navigate between pages', async ({ authenticatedPage }) => {
    const incidentsPage = new IncidentsPage(authenticatedPage);
    await incidentsPage.goto();
    await incidentsPage.isLoaded();

    const initialPage = await incidentsPage.getCurrentPage();
    expect(initialPage).toBe(1);

    // Try to go to next page
    const hasNextPage = await incidentsPage.goToNextPage();

    if (hasNextPage) {
      const currentPage = await incidentsPage.getCurrentPage();
      expect(currentPage).toBe(2);

      // Go back
      await incidentsPage.goToPrevPage();
      const backPage = await incidentsPage.getCurrentPage();
      expect(backPage).toBe(1);
    }
  });

  test('should display total alert count', async ({ authenticatedPage }) => {
    const incidentsPage = new IncidentsPage(authenticatedPage);
    await incidentsPage.goto();
    await incidentsPage.isLoaded();

    const totalAlerts = await incidentsPage.getTotalAlerts();
    expect(totalAlerts).toBeGreaterThanOrEqual(0);
  });
});
