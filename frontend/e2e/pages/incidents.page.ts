import { Page, Locator } from '@playwright/test';

/**
 * Page Object Model: Incidents Page
 */
export class IncidentsPage {
  readonly page: Page;
  readonly heading: Locator;
  readonly alertHistoryTab: Locator;
  readonly detectionEventsTab: Locator;
  readonly addFilterButton: Locator;

  // Filter controls
  readonly zoneIdFilter: Locator;
  readonly confidenceFilter: Locator;
  readonly fromDateFilter: Locator;
  readonly toDateFilter: Locator;
  readonly resetFiltersButton: Locator;

  // Table
  readonly alertTable: Locator;
  readonly statusFilter: Locator;
  readonly zoneFilter: Locator;
  readonly incidentMasterList: Locator;
  readonly incidentRows: Locator;
  readonly incidentDetailDrawer: Locator;
  readonly pagination: Locator;
  readonly prevPageButton: Locator;
  readonly nextPageButton: Locator;

  constructor(page: Page) {
    this.page = page;
    this.heading = page.getByRole('heading', { name: /incidents/i });
    this.alertHistoryTab = page.getByRole('tab', { name: /alert history/i }).first();
    this.detectionEventsTab = page.getByRole('tab', { name: /detection events/i }).first();
    this.addFilterButton = page.getByRole('button', { name: /filters/i });

    // Filters
    this.zoneIdFilter = page.getByPlaceholder(/zone id/i);
    this.confidenceFilter = page.getByPlaceholder(/min confidence/i);
    this.fromDateFilter = page.getByRole('button', { name: /from/i });
    this.toDateFilter = page.getByRole('button', { name: /to/i });
    this.resetFiltersButton = page.getByRole('button', { name: /reset/i });

    // Table
    this.alertTable = page.getByRole('table', { name: /alert history/i }); // Kept for backwards compatibility but not used
    this.statusFilter = page.getByRole('button', { name: /filter by status/i }); // Kept for backwards compatibility but not used
    this.zoneFilter = page.getByRole('combobox', { name: /zone filter/i }); // Currently implemented as standard select
    this.incidentMasterList = page.getByTestId('incident-master-list');
    this.incidentRows = page.getByTestId('incident-row');
    this.incidentDetailDrawer = page.getByRole('dialog');
    this.pagination = page.getByText(/Page \d+ of \d+/i);
    this.nextPageButton = page.getByRole('button', { name: /next/i });
    this.prevPageButton = page.getByRole('button', { name: /prev/i });
  }

  async goto() {
    await this.page.goto('/incidents');
  }

  async isLoaded() {
    await this.heading.waitFor({ state: 'visible' });
    await this.incidentMasterList.waitFor({ state: 'visible' });
  }

  async switchToAlertHistory() {
    await this.alertHistoryTab.click();
  }

  async switchToDetectionEvents() {
    await this.detectionEventsTab.click();
  }

  async filterByZone(zoneId: string) {
    await this.zoneIdFilter.fill(zoneId);
    await this.page.waitForTimeout(500); // Debounce
  }

  async filterByMinConfidence(confidence: number) {
    await this.confidenceFilter.fill(String(confidence));
    await this.page.waitForTimeout(500);
  }

  async setDateRange(from: string, to: string) {
    await this.fromDateFilter.fill(from);
    await this.toDateFilter.fill(to);
    await this.page.waitForTimeout(500);
  }

  async resetFilters() {
    await this.resetFiltersButton.click();
    await this.page.waitForTimeout(500);
  }

  async getAlertCount() {
    return this.incidentRows.count();
  }

  async getTotalAlerts() {
    const paginationText = await this.pagination.textContent();
    const match = paginationText?.match(/(\d+)\s*total/i);
    return match ? parseInt(match[1], 10) : 0;
  }

  async goToNextPage() {
    if (await this.nextPageButton.isEnabled()) {
      await this.nextPageButton.click();
      await this.page.waitForTimeout(500);
      return true;
    }
    return false;
  }

  async goToPrevPage() {
    if (await this.prevPageButton.isEnabled()) {
      await this.prevPageButton.click();
      await this.page.waitForTimeout(500);
      return true;
    }
    return false;
  }

  async getCurrentPage() {
    const paginationText = await this.pagination.textContent();
    const match = paginationText?.match(/Page\s*(\d+)/i);
    return match ? parseInt(match[1], 10) : 1;
  }
}
