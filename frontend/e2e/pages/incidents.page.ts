import { Page, Locator } from '@playwright/test';

/**
 * Page Object Model: Incidents Page
 */
export class IncidentsPage {
  readonly page: Page;
  readonly heading: Locator;
  readonly alertHistoryTab: Locator;
  readonly detectionEventsTab: Locator;

  // Filter controls
  readonly zoneIdFilter: Locator;
  readonly statusFilter: Locator;
  readonly confidenceFilter: Locator;
  readonly fromDateFilter: Locator;
  readonly toDateFilter: Locator;
  readonly resetFiltersButton: Locator;

  // Table
  readonly alertTable: Locator;
  readonly pagination: Locator;
  readonly prevPageButton: Locator;
  readonly nextPageButton: Locator;

  constructor(page: Page) {
    this.page = page;
    this.heading = page.getByRole('heading', { name: /incidents/i });
    this.alertHistoryTab = page.getByRole('button', { name: /alert history/i });
    this.detectionEventsTab = page.getByRole('button', { name: /detection events/i });

    // Filters
    this.zoneIdFilter = page.getByPlaceholder(/zone id/i);
    this.statusFilter = page.getByRole('combobox', { name: /status/i });
    this.confidenceFilter = page.getByRole('spinbutton', { name: /confidence/i });
    this.fromDateFilter = page.getByRole('textbox', { name: /from/i });
    this.toDateFilter = page.getByRole('textbox', { name: /to/i });
    this.resetFiltersButton = page.getByRole('button', { name: /reset/i });

    // Table
    this.alertTable = page.getByRole('table').first();
    this.pagination = page.locator('text=/Page \\d+ of \\d+/i');
    this.prevPageButton = page.getByRole('button', { name: /prev/i });
    this.nextPageButton = page.getByRole('button', { name: /next/i });
  }

  async goto() {
    await this.page.goto('/incidents');
  }

  async isLoaded() {
    await this.heading.waitFor({ state: 'visible' });
    await this.alertTable.waitFor({ state: 'visible' });
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

  async filterByStatus(status: 'all' | 'acknowledged' | 'unacknowledged') {
    await this.statusFilter.selectOption(status === 'all' ? '' : status);
    await this.page.waitForTimeout(500);
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
    const rows = this.alertTable.locator('tbody tr');
    return rows.count();
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
