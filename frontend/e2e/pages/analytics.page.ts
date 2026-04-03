import { Page, Locator } from '@playwright/test';

/**
 * Page Object Model: Analytics Page
 */
export class AnalyticsPage {
  readonly page: Page;
  readonly heading: Locator;
  readonly timeRangeSelect: Locator;
  readonly groupingSelect: Locator;
  readonly zoneBarChart: Locator;
  readonly timeLineChart: Locator;
  readonly alertCountHeading: Locator;
  readonly detectionsHeading: Locator;

  constructor(page: Page) {
    this.page = page;
    this.heading = page.getByRole('heading', { name: /analytics/i });
    this.timeRangeSelect = page.getByRole('combobox', { name: /time range/i });
    this.groupingSelect = page.getByRole('combobox', { name: /grouping/i });
    this.zoneBarChart = page.getByText(/alert counts by zone/i);
    this.timeLineChart = page.getByText(/detections over time/i);
    this.alertCountHeading = page.getByRole('heading', { name: /alert counts/i });
    this.detectionsHeading = page.getByRole('heading', { name: /detections/i });
  }

  async goto() {
    await this.page.goto('/analytics');
  }

  async isLoaded() {
    await this.heading.waitFor({ state: 'visible' });
    await this.zoneBarChart.waitFor({ state: 'visible' });
  }

  async setTimeRange(days: '1' | '7' | '30') {
    await this.timeRangeSelect.selectOption(days);
    await this.page.waitForTimeout(1000); // Wait for refetch
  }

  async setGrouping(grouping: 'zone' | 'day') {
    await this.groupingSelect.selectOption(grouping);
    await this.page.waitForTimeout(1000);
  }

  async hasChartData() {
    // Check if charts have rendered with data
    const barChart = this.page.locator('[data-testid="bar-chart"]');
    const lineChart = this.page.locator('[data-testid="line-chart"]');

    const barChartVisible = await barChart.isVisible().catch(() => false);
    const lineChartVisible = await lineChart.isVisible().catch(() => false);

    return barChartVisible || lineChartVisible;
  }

  async clickZoneInChart(zoneName: string) {
    const zoneLabel = this.page.locator(`text=${zoneName}`);
    if (await zoneLabel.isVisible()) {
      await zoneLabel.click();
    }
  }
}
