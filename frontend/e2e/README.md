# AquaGuard E2E Tests

Professional end-to-end tests for AquaGuard using Playwright Test framework.

## Quick Start

```bash
# Install Playwright browsers (first time only)
npm run playwright:install

# Run all E2E tests
npm run test:e2e

# Run in headed mode (see browser)
npm run test:e2e:headed

# Run with UI mode (interactive)
npm run test:e2e:ui

# Debug tests
npm run test:e2e:debug

# View HTML report
npm run playwright:report
```

## Prerequisites

- Node.js 18+ installed
- Backend server accessible at `http://localhost:5000`
- Test user: `admin` / `aquaguard2026`

**Note:** The Playwright config automatically starts the frontend dev server before tests.

## Architecture

```
e2e/
├── fixtures/           # Test fixtures and setup
│   └── auth.fixture.ts # Authentication, helpers
├── pages/              # Page Object Models
│   ├── login.page.ts
│   ├── dashboard.page.ts
│   ├── system.page.ts
│   ├── incidents.page.ts
│   ├── analytics.page.ts
│   └── index.ts        # Barrel export
├── tests/              # Test specifications
│   ├── auth.spec.ts
│   ├── dashboard.spec.ts
│   ├── camera-management.spec.ts
│   ├── incidents.spec.ts
│   └── analytics.spec.ts
└── utils/              # Helper utilities
```

## Test Suites

### Authentication (`auth.spec.ts`)
- Display login page elements
- Reject invalid credentials
- Login with valid credentials
- Remember me functionality
- Logout flow
- Protected route redirects

### Dashboard (`dashboard.spec.ts`)
- Display main sections
- API and socket status
- Navigation between pages
- Camera count display
- Performance (load time < 5s)

### Camera Management (`camera-management.spec.ts`)
- System status page display
- System health status
- Camera table display
- Add/cancel camera form
- Form validation
- Feed preview

### Incidents (`incidents.spec.ts`)
- Tab navigation
- Alert history table
- Filter by zone
- Filter by status
- Reset filters
- Pagination
- Total count display

### Analytics (`analytics.spec.ts`)
- Chart display
- Time range selector
- Grouping selector
- Data visualization

## Page Object Model

Each page has a corresponding class that encapsulates:

- **Locators**: Element selectors using accessible roles
- **Actions**: Methods for common interactions
- **Assertions**: Helper methods for state verification

Example usage:

```typescript
import { LoginPage } from '../pages';

test('login flow', async ({ page }) => {
  const loginPage = new LoginPage(page);
  await loginPage.goto();
  await loginPage.login('admin', 'password');
  await expect(page).toHaveURL('/');
});
```

## Fixtures

### `authenticatedPage`
Pre-authenticated page that skips login flow:

```typescript
test('dashboard test', async ({ authenticatedPage }) => {
  // Already logged in
  await expect(authenticatedPage).toHaveURL('/');
});
```

### Helper Functions
- `waitForApiResponse()` - Wait for specific API calls
- `mockApiResponse()` - Mock API endpoints
- `takeScreenshot()` - Save screenshot with timestamp
- `captureConsoleErrors()` - Track console errors

## Configuration

See `playwright.config.ts` for full configuration:

- **Browsers**: Chromium, Firefox, WebKit, Mobile
- **Timeouts**: 30s test, 10s action, 10s expect
- **Retries**: 2 on CI, 0 locally
- **Reporters**: HTML, JSON, list
- **Artifacts**: Screenshots on failure, video on retry

## CI Integration

Tests run automatically in CI with:

```bash
CI=true npm run test:e2e
```

CI mode enables:
- `forbidOnly` - Fail if `.only` tests found
- `retries: 2` - Retry failed tests
- `workers: 1` - Single worker for stability
- Full trace collection on failure

## Test Credentials

| Username | Password       | Role  |
|----------|----------------|-------|
| admin    | aquaguard2026  | admin |

## Troubleshooting

### Tests fail with timeout
- Ensure backend is running: `python run.py`
- Check network connectivity
- Increase timeout in `playwright.config.ts`

### Element not found
- Use `test:e2e:debug` to step through
- Check if page structure changed
- Verify selectors in Page Objects

### CI failures
- Check `playwright-report/` for HTML report
- Review `test-results/` for screenshots/traces
- Run `npx playwright show-report` locally
