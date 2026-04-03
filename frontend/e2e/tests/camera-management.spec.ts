import { test, expect } from '../fixtures/auth.fixture';
import { SystemPage } from '../pages';

test.describe('Camera Management', () => {
  test('should display system status page', async ({ authenticatedPage }) => {
    const systemPage = new SystemPage(authenticatedPage);
    await systemPage.goto();
    await systemPage.isLoaded();

    await expect(systemPage.heading).toBeVisible();
    await expect(systemPage.systemHealthSection).toBeVisible();
    await expect(systemPage.cameraManagementSection).toBeVisible();
  });

  test('should show system health status', async ({ authenticatedPage }) => {
    const systemPage = new SystemPage(authenticatedPage);
    await systemPage.goto();
    await systemPage.isLoaded();

    const status = await systemPage.getSystemHealthStatus();
    // At least socket status should be available
    expect(typeof status.socket).toBe('boolean');
    expect(typeof status.detectionEngine).toBe('boolean');
  });

  test('should display camera table', async ({ authenticatedPage }) => {
    const systemPage = new SystemPage(authenticatedPage);
    await systemPage.goto();
    await systemPage.isLoaded();

    await expect(systemPage.cameraTable).toBeVisible();
    await expect(systemPage.addCameraButton).toBeVisible();
  });

  test('should open add camera form', async ({ authenticatedPage }) => {
    const systemPage = new SystemPage(authenticatedPage);
    await systemPage.goto();
    await systemPage.isLoaded();

    await systemPage.openAddCameraForm();

    await expect(systemPage.cameraForm).toBeVisible();
    await expect(systemPage.zoneIdInput).toBeVisible();
    await expect(systemPage.zoneNameInput).toBeVisible();
    await expect(systemPage.rtspUrlInput).toBeVisible();
  });

  test('should cancel camera form without saving', async ({ authenticatedPage }) => {
    const systemPage = new SystemPage(authenticatedPage);
    await systemPage.goto();
    await systemPage.isLoaded();

    const initialCount = await systemPage.getCameraCount();

    await systemPage.openAddCameraForm();
    await systemPage.fillCameraForm({
      zoneId: 'test_zone',
      zoneName: 'Test Camera',
      rtspUrl: 'rtsp://test/stream',
    });
    await systemPage.cancelCameraForm();

    // Form should be closed and camera count unchanged
    await expect(systemPage.cameraForm).not.toBeVisible();
    const finalCount = await systemPage.getCameraCount();
    expect(finalCount).toBe(initialCount);
  });

  test('should validate required fields in camera form', async ({ authenticatedPage }) => {
    const systemPage = new SystemPage(authenticatedPage);
    await systemPage.goto();
    await systemPage.isLoaded();

    await systemPage.openAddCameraForm();

    // Try to submit empty form - browser validation should prevent
    await systemPage.submitButton.click();

    // Form should still be visible (validation failed)
    await expect(systemPage.cameraForm).toBeVisible();
  });

  test('should show feed preview section', async ({ authenticatedPage }) => {
    const systemPage = new SystemPage(authenticatedPage);
    await systemPage.goto();
    await systemPage.isLoaded();

    await expect(systemPage.feedPreview).toBeVisible();
  });

  test('should display camera status in table', async ({ authenticatedPage }) => {
    const systemPage = new SystemPage(authenticatedPage);
    await systemPage.goto();
    await systemPage.isLoaded();

    // Table should have status column with Active/Inactive indicators
    const activeIndicator = authenticatedPage.locator('text=/Active|Inactive/');
    await expect(activeIndicator.first()).toBeVisible();
  });
});
