import { Page, Locator, expect } from '@playwright/test';

const URL_WAIT_TIMEOUT_MS = 45_000;

/**
 * Page Object Model: Dashboard Page
 */
export class DashboardPage {
  readonly page: Page;
  readonly heading: Locator;
  readonly cameraGrid: Locator;
  readonly detectionFeed: Locator;
  readonly systemHealth: Locator;
  readonly logoutButton: Locator;
  readonly navDashboard: Locator;
  readonly navIncidents: Locator;
  readonly navAnalytics: Locator;
  readonly navSystem: Locator;
  readonly statusBar: Locator;
  readonly alertBanner: Locator;

  constructor(page: Page) {
    this.page = page;
    this.heading = page.getByRole('heading', { name: /dashboard|mission control/i }).first();
    this.cameraGrid = page.getByText(/camera feeds|live streams/i);
    this.detectionFeed = page.getByText(/live detection feed|live feed/i);
    this.systemHealth = page.getByText(/system health|system diagnostics/i);
    this.logoutButton = page.getByRole('button', { name: /logout/i });
    this.navDashboard = page.getByRole('link', { name: /dashboard/i });
    this.navIncidents = page.getByRole('link', { name: /incidents/i });
    this.navAnalytics = page.getByRole('link', { name: /analytics/i });
    this.navSystem = page.getByRole('link', { name: /system/i });
    this.statusBar = page.locator('[class*="status"]').first();
    this.alertBanner = page.getByRole('status', { name: /active drowning alerts/i });
  }

  async goto() {
    await this.page.goto('/');
  }

  async isLoaded() {
    await this.heading.waitFor({ state: 'visible' });
    await this.cameraGrid.waitFor({ state: 'visible' });
  }

  private async navigateAndWait(
    link: Locator,
    urlPattern: RegExp,
    headingPattern: RegExp,
  ) {
    await link.click();
    await expect(this.page).toHaveURL(urlPattern, {
      timeout: URL_WAIT_TIMEOUT_MS,
    });
    await expect(this.page.getByRole('heading', { name: headingPattern }).first()).toBeVisible();
  }

  async navigateToIncidents() {
    await this.navigateAndWait(this.navIncidents, /\/incidents(?:\?.*)?$/, /incidents/i);
  }

  async navigateToAnalytics() {
    await this.navigateAndWait(this.navAnalytics, /\/analytics(?:\?.*)?$/, /analytics/i);
  }

  async navigateToSystem() {
    await this.navigateAndWait(this.navSystem, /\/system(?:\?.*)?$/, /system/i);
  }

  async logout() {
    await this.logoutButton.click();
    await expect(this.page).toHaveURL(/\/login(?:\?.*)?$/, {
      timeout: URL_WAIT_TIMEOUT_MS,
    });
  }

  async getApiStatus() {
    const statusText = await this.statusBar.textContent();
    return {
      apiOnline: statusText?.includes('API: Online'),
      socketConnected: statusText?.includes('Socket: Connected'),
    };
  }

  async getCameraCount() {
    // Instead of counting grid children (which might include the "Add Camera" card),
    // we should count elements with a specific test id or role if available.
    // For now, return the number of items that look like camera cards (with "ZONE" text).
    const cards = this.cameraGrid.locator('> div').filter({ hasText: /ZONE/i });
    await cards.first().waitFor({ state: 'visible', timeout: 10000 }).catch(() => {});
    return cards.count();
  }

  async clickCameraCard(zoneId: string) {
    const card = this.page.locator(`#camera-card-${zoneId}`);
    await card.click();
  }

  async hasActiveAlert() {
    return this.alertBanner.isVisible();
  }

  async acknowledgeOldestAlert() {
    const ackButton = this.page.getByRole('button', { name: /acknowledge oldest/i });
    if (await ackButton.isVisible()) {
      await ackButton.click();
    }
  }
}
