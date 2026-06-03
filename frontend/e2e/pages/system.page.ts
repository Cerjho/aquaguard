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
    this.systemHealthSection = page.getByRole('region', { name: /system diagnostics/i });
    this.cameraManagementSection = page.locator('section').filter({ hasText: /CAMERA REGISTRY/i }).first();
    this.addCameraButton = page.getByRole('button', { name: /\+ ADD CAMERA/i });
    this.cameraTable = page.getByRole('table', { name: /registered cameras/i }); // Kept for backwards compatibility but not used
    this.feedPreview = page.getByText(/feed refresh preview/i);

    // Form elements (visible when dialog is open)
    this.cameraForm = page.getByRole('dialog', { name: /add camera|edit camera/i });
    this.zoneIdInput = page.getByRole('textbox', { name: /^zone/i });
    this.zoneNameInput = page.getByRole('textbox', { name: /^camera name/i });
    this.rtspUrlInput = page.getByRole('textbox', { name: /rtsp \/ webcam url/i });
    this.locationInput = page.getByRole('textbox', { name: /location description/i });
    this.frameRateInput = page.getByRole('spinbutton', { name: /frame rate/i });
    this.resolutionInput = page.getByRole('textbox', { name: /resolution/i });
    this.activeCheckbox = page.getByRole('checkbox', { name: /active/i });
    this.cancelButton = page.getByRole('button', { name: /cancel/i });
    this.submitButton = page.getByRole('button', { name: /save camera/i });
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
    const rows = this.cameraManagementSection.locator('[data-testid^="camera-row-"]');
    return rows.count();
  }

  async toggleCameraStatus(zoneId: string) {
    const row = this.cameraManagementSection.locator(`[data-testid="camera-row-${zoneId}"]`);
    const menuButton = row.locator('[data-camera-menu-trigger]');
    await menuButton.click();
    
    // The menu is rendered in a portal, so we query the page body for the active menu items
    const activateButton = this.page.getByRole('button', { name: new RegExp(`activate|deactivate`, 'i') }).filter({ hasText: /ACTIVATE/i });
    await activateButton.click();
  }

  async editCamera(zoneId: string) {
    const row = this.cameraManagementSection.locator(`[data-testid="camera-row-${zoneId}"]`);
    const menuButton = row.locator('[data-camera-menu-trigger]');
    await menuButton.click();
    
    // Click EDIT from the context menu
    const editButton = this.page.getByRole('button', { name: /edit/i }).filter({ hasText: /EDIT/i });
    await editButton.click();
    await this.cameraForm.waitFor({ state: 'visible' });
  }

  async getSystemHealthStatus() {
    const socketStatus = this.page.locator('text=/WebSocket/i').locator('..');
    const detectionStatus = this.page.locator('text=/AI Engine/i').locator('..');
    const esp32Status = this.page.locator('text=/ESP32 Alarm/i').locator('..');

    return {
      socket: (await socketStatus.textContent())?.includes('SYNCED') ?? false,
      detectionEngine: (await detectionStatus.textContent())?.includes('ACTIVE') ?? false,
      esp32: (await esp32Status.textContent())?.includes('LINKED') ?? false,
    };
  }
}
