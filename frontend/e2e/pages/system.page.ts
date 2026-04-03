import { Page, Locator } from '@playwright/test';

/**
 * Page Object Model: System Page (Camera Management)
 */
export class SystemPage {
  readonly page: Page;
  readonly heading: Locator;
  readonly systemHealthSection: Locator;
  readonly cameraManagementSection: Locator;
  readonly addCameraButton: Locator;
  readonly cameraTable: Locator;
  readonly feedPreview: Locator;

  // Camera Form Elements
  readonly cameraForm: Locator;
  readonly zoneIdInput: Locator;
  readonly zoneNameInput: Locator;
  readonly rtspUrlInput: Locator;
  readonly locationInput: Locator;
  readonly frameRateInput: Locator;
  readonly resolutionInput: Locator;
  readonly activeCheckbox: Locator;
  readonly cancelButton: Locator;
  readonly submitButton: Locator;

  constructor(page: Page) {
    this.page = page;
    this.heading = page.getByRole('heading', { name: /system status/i });
    this.systemHealthSection = page.getByRole('region', { name: /system health/i });
    this.cameraManagementSection = page.getByRole('region', { name: /camera operations/i });
    this.addCameraButton = page.getByRole('button', { name: /add camera/i });
    this.cameraTable = page.getByRole('table', { name: /registered cameras/i });
    this.feedPreview = page.getByText(/feed refresh preview/i);

    // Form elements (visible when dialog is open)
    this.cameraForm = page.getByRole('dialog', { name: /add camera|edit camera/i });
    this.zoneIdInput = page.getByRole('textbox', { name: /zone id/i });
    this.zoneNameInput = page.getByRole('textbox', { name: /zone name/i });
    this.rtspUrlInput = page.getByRole('textbox', { name: /rtsp url/i });
    this.locationInput = page.getByRole('textbox', { name: /location/i });
    this.frameRateInput = page.getByRole('spinbutton', { name: /frame rate/i });
    this.resolutionInput = page.getByRole('textbox', { name: /resolution/i });
    this.activeCheckbox = page.getByRole('checkbox', { name: /active/i });
    this.cancelButton = page.getByRole('button', { name: /cancel/i });
    this.submitButton = page.getByRole('button', { name: /create camera|save/i });
  }

  async goto() {
    await this.page.goto('/system');
  }

  async isLoaded() {
    await this.heading.waitFor({ state: 'visible' });
    await this.systemHealthSection.waitFor({ state: 'visible' });
  }

  async openAddCameraForm() {
    await this.addCameraButton.click();
    await this.cameraForm.waitFor({ state: 'visible' });
  }

  async fillCameraForm(camera: {
    zoneId: string;
    zoneName: string;
    rtspUrl: string;
    location?: string;
    frameRate?: number;
    resolution?: string;
    active?: boolean;
  }) {
    await this.zoneIdInput.fill(camera.zoneId);
    await this.zoneNameInput.fill(camera.zoneName);
    await this.rtspUrlInput.fill(camera.rtspUrl);

    if (camera.location) {
      await this.locationInput.fill(camera.location);
    }
    if (camera.frameRate !== undefined) {
      await this.frameRateInput.fill(String(camera.frameRate));
    }
    if (camera.resolution) {
      await this.resolutionInput.fill(camera.resolution);
    }
    if (camera.active !== undefined) {
      if (camera.active) {
        await this.activeCheckbox.check();
      } else {
        await this.activeCheckbox.uncheck();
      }
    }
  }

  async submitCameraForm() {
    await this.submitButton.click();
    await this.cameraForm.waitFor({ state: 'hidden' });
  }

  async cancelCameraForm() {
    await this.cancelButton.click();
    await this.cameraForm.waitFor({ state: 'hidden' });
  }

  async getCameraCount() {
    const rows = this.cameraTable.locator('tbody tr');
    return rows.count();
  }

  async toggleCameraStatus(zoneId: string) {
    const row = this.cameraTable.locator(`tr:has-text("${zoneId}")`);
    const toggleButton = row.getByRole('button', { name: /activate|deactivate/i });
    await toggleButton.click();
  }

  async editCamera(zoneId: string) {
    const row = this.cameraTable.locator(`tr:has-text("${zoneId}")`);
    const editButton = row.getByRole('button', { name: /edit/i });
    await editButton.click();
    await this.cameraForm.waitFor({ state: 'visible' });
  }

  async getSystemHealthStatus() {
    const socketStatus = this.page.locator('text=/Socket:.*Connected|Disconnected/i');
    const detectionStatus = this.page.locator('text=/Detection Engine.*Online|Offline/i');
    const esp32Status = this.page.locator('text=/ESP32.*Online|Offline/i');

    return {
      socket: (await socketStatus.textContent())?.includes('Connected') ?? false,
      detectionEngine: (await detectionStatus.textContent())?.includes('Online') ?? false,
      esp32: (await esp32Status.textContent())?.includes('Online') ?? false,
    };
  }
}
