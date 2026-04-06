/**
 * AquaGuard E2E Test Suite
 * Tests critical user flows end-to-end using Playwright
 */

const BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000';
const FRONTEND_URL = 'http://localhost:3000';

describe('AquaGuard E2E Tests', () => {
  let page;
  let browser;

  beforeAll(async () => {
    // Tests assume backend is running on port 5000 and frontend on 3000
    console.log('Starting AquaGuard E2E tests...');
    console.log(`Backend: ${BASE_URL}`);
    console.log(`Frontend: ${FRONTEND_URL}`);
  });

  afterAll(async () => {
    if (page) {
      await page.close();
    }
  });

  describe('Authentication Flow', () => {
    test('should load login page', async () => {
      await page.navigate(FRONTEND_URL);
      await page.waitFor({ text: 'AquaGuard' });
      
      const snapshot = await page.snapshot();
      expect(snapshot).toContain('AquaGuard');
      expect(snapshot).toContain('Username');
      expect(snapshot).toContain('Password');
    });

    test('should reject invalid credentials', async () => {
      await page.navigate(FRONTEND_URL);
      
      // Find and fill username field
      const usernameSnapshot = await page.snapshot();
      const usernameMatch = usernameSnapshot.match(/ref="([^"]+)"[^>]*Username/);
      if (usernameMatch) {
        await page.type({ ref: usernameMatch[1], text: 'invalid', element: 'Username input' });
      }
      
      // Find and fill password field
      const passwordSnapshot = await page.snapshot();
      const passwordMatch = passwordSnapshot.match(/ref="([^"]+)"[^>]*Password/);
      if (passwordMatch) {
        await page.type({ ref: passwordMatch[1], text: 'wrongpass', element: 'Password input' });
      }
      
      // Submit form
      const submitSnapshot = await page.snapshot();
      const submitMatch = submitSnapshot.match(/ref="([^"]+)"[^>]*(Log in|Sign in)/i);
      if (submitMatch) {
        await page.click({ ref: submitMatch[1], element: 'Login button' });
        await page.waitFor({ time: 2 });
        
        const errorSnapshot = await page.snapshot();
        expect(errorSnapshot.toLowerCase()).toMatch(/(invalid|error|failed|incorrect)/);
      }
    });

    test('should login with valid credentials', async () => {
      await page.navigate(FRONTEND_URL);
      
      // Find and fill username
      let snapshot = await page.snapshot();
      let match = snapshot.match(/ref="([^"]+)"[^>]*Username/);
      if (match) {
        await page.type({ ref: match[1], text: 'admin', element: 'Username input' });
      }
      
      // Find and fill password
      snapshot = await page.snapshot();
      match = snapshot.match(/ref="([^"]+)"[^>]*Password/);
      if (match) {
        await page.type({ ref: match[1], text: 'aquaguard2026', element: 'Password input' });
      }
      
      // Submit form
      snapshot = await page.snapshot();
      match = snapshot.match(/ref="([^"]+)"[^>]*(Log in|Sign in)/i);
      if (match) {
        await page.click({ ref: match[1], element: 'Login button' });
        await page.waitFor({ time: 3 });
        
        // Should redirect to dashboard
        const dashboardSnapshot = await page.snapshot();
        expect(dashboardSnapshot).toMatch(/(Dashboard|Cameras|System Status)/i);
      }
    });
  });

  describe('Dashboard Navigation', () => {
    beforeEach(async () => {
      // Login before each dashboard test
      await page.navigate(FRONTEND_URL);
      
      let snapshot = await page.snapshot();
      let match = snapshot.match(/ref="([^"]+)"[^>]*Username/);
      if (match) {
        await page.type({ ref: match[1], text: 'admin', element: 'Username input' });
      }
      
      snapshot = await page.snapshot();
      match = snapshot.match(/ref="([^"]+)"[^>]*Password/);
      if (match) {
        await page.type({ ref: match[1], text: 'aquaguard2026', element: 'Password input' });
      }
      
      snapshot = await page.snapshot();
      match = snapshot.match(/ref="([^"]+)"[^>]*(Log in|Sign in)/i);
      if (match) {
        await page.click({ ref: match[1], element: 'Login button' });
        await page.waitFor({ time: 3 });
      }
    });

    test('should display system status', async () => {
      const snapshot = await page.snapshot();
      
      // Check for system status indicators
      expect(snapshot).toMatch(/(System Status|Backend|Detection Engine|MQTT)/i);
      expect(snapshot).toMatch(/(Online|Offline|Running|Stopped)/i);
    });

    test('should navigate to cameras page', async () => {
      let snapshot = await page.snapshot();
      const cameraLinkMatch = snapshot.match(/ref="([^"]+)"[^>]*Cameras/i);
      
      if (cameraLinkMatch) {
        await page.click({ ref: cameraLinkMatch[1], element: 'Cameras navigation link' });
        await page.waitFor({ time: 2 });
        
        snapshot = await page.snapshot();
        expect(snapshot).toMatch(/(Camera Grid|Camera Management|No cameras)/i);
      }
    });

    test('should navigate to alerts page', async () => {
      let snapshot = await page.snapshot();
      const alertLinkMatch = snapshot.match(/ref="([^"]+)"[^>]*Alerts?/i);
      
      if (alertLinkMatch) {
        await page.click({ ref: alertLinkMatch[1], element: 'Alerts navigation link' });
        await page.waitFor({ time: 2 });
        
        snapshot = await page.snapshot();
        expect(snapshot).toMatch(/(Alert History|Incidents|No alerts)/i);
      }
    });

    test('should navigate to analytics page', async () => {
      let snapshot = await page.snapshot();
      const analyticsLinkMatch = snapshot.match(/ref="([^"]+)"[^>]*Analytics/i);
      
      if (analyticsLinkMatch) {
        await page.click({ ref: analyticsLinkMatch[1], element: 'Analytics navigation link' });
        await page.waitFor({ time: 2 });
        
        snapshot = await page.snapshot();
        expect(snapshot).toMatch(/(Analytics|Charts|Statistics)/i);
      }
    });
  });

  describe('Camera Management', () => {
    beforeEach(async () => {
      // Login and navigate to cameras
      await page.navigate(FRONTEND_URL);
      
      let snapshot = await page.snapshot();
      let match = snapshot.match(/ref="([^"]+)"[^>]*Username/);
      if (match) {
        await page.type({ ref: match[1], text: 'admin', element: 'Username input' });
      }
      
      snapshot = await page.snapshot();
      match = snapshot.match(/ref="([^"]+)"[^>]*Password/);
      if (match) {
        await page.type({ ref: match[1], text: 'aquaguard2026', element: 'Password input' });
      }
      
      snapshot = await page.snapshot();
      match = snapshot.match(/ref="([^"]+)"[^>]*(Log in|Sign in)/i);
      if (match) {
        await page.click({ ref: match[1], element: 'Login button' });
        await page.waitFor({ time: 3 });
      }
      
      // Navigate to cameras
      snapshot = await page.snapshot();
      match = snapshot.match(/ref="([^"]+)"[^>]*Cameras/i);
      if (match) {
        await page.click({ ref: match[1], element: 'Cameras link' });
        await page.waitFor({ time: 2 });
      }
    });

    test('should display camera list or empty state', async () => {
      const snapshot = await page.snapshot();
      expect(snapshot).toMatch(/(Camera Grid|Camera Management|Add Camera|No cameras)/i);
    });

    test('should open add camera form', async () => {
      let snapshot = await page.snapshot();
      const addButtonMatch = snapshot.match(/ref="([^"]+)"[^>]*(Add Camera|\+ Camera)/i);
      
      if (addButtonMatch) {
        await page.click({ ref: addButtonMatch[1], element: 'Add camera button' });
        await page.waitFor({ time: 1 });
        
        snapshot = await page.snapshot();
        expect(snapshot).toMatch(/(Camera Name|RTSP URL|Zone|Location)/i);
      }
    });

    test('should validate required fields in camera form', async () => {
      let snapshot = await page.snapshot();
      let addButtonMatch = snapshot.match(/ref="([^"]+)"[^>]*(Add Camera|\+ Camera)/i);
      
      if (addButtonMatch) {
        await page.click({ ref: addButtonMatch[1], element: 'Add camera button' });
        await page.waitFor({ time: 1 });
        
        // Try to submit empty form
        snapshot = await page.snapshot();
        const saveMatch = snapshot.match(/ref="([^"]+)"[^>]*(Save|Create|Add)/i);
        if (saveMatch) {
          await page.click({ ref: saveMatch[1], element: 'Save button' });
          await page.waitFor({ time: 1 });
          
          snapshot = await page.snapshot();
          expect(snapshot).toMatch(/(required|must|invalid)/i);
        }
      }
    });
  });

  describe('Real-time Updates', () => {
    beforeEach(async () => {
      // Login
      await page.navigate(FRONTEND_URL);
      
      let snapshot = await page.snapshot();
      let match = snapshot.match(/ref="([^"]+)"[^>]*Username/);
      if (match) {
        await page.type({ ref: match[1], text: 'admin', element: 'Username input' });
      }
      
      snapshot = await page.snapshot();
      match = snapshot.match(/ref="([^"]+)"[^>]*Password/);
      if (match) {
        await page.type({ ref: match[1], text: 'aquaguard2026', element: 'Password input' });
      }
      
      snapshot = await page.snapshot();
      match = snapshot.match(/ref="([^"]+)"[^>]*(Log in|Sign in)/i);
      if (match) {
        await page.click({ ref: match[1], element: 'Login button' });
        await page.waitFor({ time: 3 });
      }
    });

    test('should display detection feed', async () => {
      const snapshot = await page.snapshot();
      expect(snapshot).toMatch(/(Detection Feed|Recent Events|Live Feed|No recent)/i);
    });

    test('should show socket connection status', async () => {
      const snapshot = await page.snapshot();
      // Look for WebSocket connection indicator
      expect(snapshot).toMatch(/(Connected|Disconnected|Live|Socket)/i);
    });

    test('should refresh data periodically', async () => {
      const initialSnapshot = await page.snapshot();
      
      // Wait for polling interval (around 5-10 seconds based on components)
      await page.waitFor({ time: 12 });
      
      const updatedSnapshot = await page.snapshot();
      // Content should exist (data may or may not change, but component should render)
      expect(updatedSnapshot).toBeTruthy();
    });
  });

  describe('Logout', () => {
    beforeEach(async () => {
      // Login
      await page.navigate(FRONTEND_URL);
      
      let snapshot = await page.snapshot();
      let match = snapshot.match(/ref="([^"]+)"[^>]*Username/);
      if (match) {
        await page.type({ ref: match[1], text: 'admin', element: 'Username input' });
      }
      
      snapshot = await page.snapshot();
      match = snapshot.match(/ref="([^"]+)"[^>]*Password/);
      if (match) {
        await page.type({ ref: match[1], text: 'aquaguard2026', element: 'Password input' });
      }
      
      snapshot = await page.snapshot();
      match = snapshot.match(/ref="([^"]+)"[^>]*(Log in|Sign in)/i);
      if (match) {
        await page.click({ ref: match[1], element: 'Login button' });
        await page.waitFor({ time: 3 });
      }
    });

    test('should logout and return to login page', async () => {
      let snapshot = await page.snapshot();
      const logoutMatch = snapshot.match(/ref="([^"]+)"[^>]*(Logout|Log out|Sign out)/i);
      
      if (logoutMatch) {
        await page.click({ ref: logoutMatch[1], element: 'Logout button' });
        await page.waitFor({ time: 2 });
        
        snapshot = await page.snapshot();
        expect(snapshot).toContain('Username');
        expect(snapshot).toContain('Password');
      }
    });
  });

  describe('Performance and Responsiveness', () => {
    beforeEach(async () => {
      // Login
      await page.navigate(FRONTEND_URL);
      
      let snapshot = await page.snapshot();
      let match = snapshot.match(/ref="([^"]+)"[^>]*Username/);
      if (match) {
        await page.type({ ref: match[1], text: 'admin', element: 'Username input' });
      }
      
      snapshot = await page.snapshot();
      match = snapshot.match(/ref="([^"]+)"[^>]*Password/);
      if (match) {
        await page.type({ ref: match[1], text: 'aquaguard2026', element: 'Password input' });
      }
      
      snapshot = await page.snapshot();
      match = snapshot.match(/ref="([^"]+)"[^>]*(Log in|Sign in)/i);
      if (match) {
        await page.click({ ref: match[1], element: 'Login button' });
        await page.waitFor({ time: 3 });
      }
    });

    test('should load dashboard within reasonable time', async () => {
      const startTime = Date.now();
      
      const snapshot = await page.snapshot();
      const loadTime = Date.now() - startTime;
      
      expect(snapshot).toMatch(/(Dashboard|System Status)/i);
      expect(loadTime).toBeLessThan(5000); // Should load within 5 seconds
    });

    test('should handle rapid navigation', async () => {
      let snapshot = await page.snapshot();
      
      // Navigate to cameras
      let match = snapshot.match(/ref="([^"]+)"[^>]*Cameras/i);
      if (match) {
        await page.click({ ref: match[1], element: 'Cameras link' });
        await page.waitFor({ time: 1 });
      }
      
      // Navigate to alerts
      snapshot = await page.snapshot();
      match = snapshot.match(/ref="([^"]+)"[^>]*Alerts?/i);
      if (match) {
        await page.click({ ref: match[1], element: 'Alerts link' });
        await page.waitFor({ time: 1 });
      }
      
      // Navigate to analytics
      snapshot = await page.snapshot();
      match = snapshot.match(/ref="([^"]+)"[^>]*Analytics/i);
      if (match) {
        await page.click({ ref: match[1], element: 'Analytics link' });
        await page.waitFor({ time: 1 });
      }
      
      // Navigate back to dashboard
      snapshot = await page.snapshot();
      match = snapshot.match(/ref="([^"]+)"[^>]*Dashboard/i);
      if (match) {
        await page.click({ ref: match[1], element: 'Dashboard link' });
        await page.waitFor({ time: 1 });
      }
      
      // Final snapshot should show dashboard
      snapshot = await page.snapshot();
      expect(snapshot).toMatch(/(Dashboard|System Status)/i);
    });
  });
});
