import { Page, Locator } from '@playwright/test';

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
    this.heading = page.getByRole('heading', { name: /dashboard/i }).first();
    this.cameraGrid = page.getByText(/camera feeds/i);
    this.detectionFeed = page.getByText(/live detection feed/i);
    this.systemHealth = page.getByText(/system health/i);
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

  async navigateToIncidents() {
    await this.navIncidents.click();
    await this.page.waitForURL('/incidents');
  }

  async navigateToAnalytics() {
    await this.navAnalytics.click();
    await this.page.waitForURL('/analytics');
  }

  async navigateToSystem() {
    await this.navSystem.click();
    await this.page.waitForURL('/system');
  }

  async logout() {
    await this.logoutButton.click();
    await this.page.waitForURL('/login');
  }

  async getApiStatus() {
    const statusText = await this.statusBar.textContent();
    return {
      apiOnline: statusText?.includes('API: Online'),
      socketConnected: statusText?.includes('Socket: Connected'),
    };
  }

  async getCameraCount() {
    const cameraSection = this.page.locator('text=/\\d+ camera/i');
    const text = await cameraSection.textContent();
    const match = text?.match(/(\d+)\s*camera/i);
    return match ? parseInt(match[1], 10) : 0;
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
