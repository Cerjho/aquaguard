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
    // Time range control may be a native <select> or a custom dropdown button.
    this.timeRangeSelect = page.locator(
      'select[aria-label*="time range"], select[name*="time"], button:has-text("time range"), button:has-text("Incidents by time range"), button:has-text("Detection frequency range")'
    );
    // Grouping control may also be a select or custom button
    this.groupingSelect = page.locator(
      'select[aria-label*="grouping"], select[name*="grouping"], button:has-text("grouping"), button:has-text("group by")'
    );
    // Headings can vary between builds; match common variants for robustness
    this.zoneBarChart = page.getByRole('heading', { name: /incidents by zone|alert counts by zone/i });
    this.timeLineChart = page.getByRole('heading', { name: /incidents by time of day|detections over time/i });
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
    // Try native select first
    try {
      await this.timeRangeSelect.selectOption(days as any);
      await this.page.waitForTimeout(1000);
      return;
    } catch {
      // Fallback to custom dropdown button
    }

    const btn = this.page.getByRole('button', { name: /time range|incidents by time range|detection frequency range/i }).first();
    await btn.click();

    const pattern = days === '1'
      ? /today|24|last 24 hours/i
      : days === '7'
        ? /week|7 days|this wk|this week/i
        : /month|30 days|this mo|this month/i;

    const item = this.page.getByText(pattern).first();
    await item.click();
    await this.page.waitForTimeout(1000);
  }

  async setGrouping(grouping: 'zone' | 'day') {
    try {
      await this.groupingSelect.selectOption(grouping as any);
      await this.page.waitForTimeout(1000);
      return;
    } catch {
      // Fallback to custom dropdown
    }

    const btn = this.page.getByRole('button', { name: /grouping|group by/i }).first();
    await btn.click();
    const pattern = grouping === 'zone' ? /zone/i : /day|date/i;
    const item = this.page.getByText(pattern).first();
    await item.click();
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
