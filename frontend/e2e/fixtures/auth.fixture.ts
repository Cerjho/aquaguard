import { test as base, expect, Page } from '@playwright/test';

// Test credentials
export const TEST_CREDENTIALS = {
  admin: {
    username: 'admin',
    password: 'aquaguard2026',
  },
};

// API endpoints
export const API_ENDPOINTS = {
  login: '/api/v1/auth/login',
  logout: '/api/v1/auth/logout',
  cameras: '/api/v1/cameras',
  alerts: '/api/v1/alerts',
  events: '/api/v1/events',
  analytics: '/api/v1/analytics/summary',
  systemStatus: '/api/v1/system/status',
};

// Page URLs
export const PAGES = {
  login: '/login',
  dashboard: '/',
  incidents: '/incidents',
  analytics: '/analytics',
  system: '/system',
};

/**
 * Authentication fixture - provides logged-in page
 */
export interface AuthFixtures {
  authenticatedPage: Page;
}

/**
 * Custom test fixture with authentication
 */
export const test = base.extend<AuthFixtures>({
  authenticatedPage: async ({ page }, use) => {
    // Navigate to login and wait for shell rendering.
    await page.goto(PAGES.login, { waitUntil: 'domcontentloaded', timeout: 30000 });

    // Wait for login form to be ready
    const usernameInput = page.getByRole('textbox', { name: /email|username/i });
    await usernameInput.waitFor({ state: 'visible', timeout: 10000 });

    // Fill credentials
    await usernameInput.fill(TEST_CREDENTIALS.admin.username);
    await page.getByRole('textbox', { name: /password/i }).fill(TEST_CREDENTIALS.admin.password);

    // Submit login
    await page.getByRole('button', { name: /sign in|secure login|login/i }).click();

    // Wait for dashboard heading as the primary authenticated-state signal.
    await expect(page.getByRole('heading', { name: /dashboard/i }).first()).toBeVisible({ timeout: 60000 });

    // Use the authenticated page
    await use(page);

    // Cleanup: logout after test (non-blocking)
    try {
      const logoutButton = page.getByRole('button', { name: /logout/i });
      if (await logoutButton.isVisible({ timeout: 2000 })) {
        await logoutButton.click();
        await expect(page).toHaveURL(/\/login(?:\?.*)?$/, { timeout: 10000 });
      }
    } catch {
      // Ignore logout errors during cleanup
    }
  },
});

export { expect };

/**
 * Helper: Wait for API response
 */
export async function waitForApiResponse(page: Page, urlPattern: string | RegExp) {
  return page.waitForResponse((response) => {
    const url = response.url();
    if (typeof urlPattern === 'string') {
      return url.includes(urlPattern);
    }
    return urlPattern.test(url);
  });
}

/**
 * Helper: Mock API response
 */
export async function mockApiResponse(
  page: Page,
  urlPattern: string | RegExp,
  response: { status?: number; body?: unknown }
) {
  await page.route(urlPattern, (route) => {
    route.fulfill({
      status: response.status || 200,
      contentType: 'application/json',
      body: JSON.stringify(response.body || {}),
    });
  });
}

/**
 * Helper: Take labeled screenshot
 */
export async function takeScreenshot(page: Page, name: string) {
  await page.screenshot({
    path: `e2e/screenshots/${name}-${Date.now()}.png`,
    fullPage: true,
  });
}

/**
 * Helper: Check for console errors
 */
export function setupConsoleErrorCapture(page: Page) {
  const errors: string[] = [];

  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      errors.push(msg.text());
    }
  });

  return {
    getErrors: () => errors,
    hasErrors: () => errors.length > 0,
    clear: () => (errors.length = 0),
  };
}
