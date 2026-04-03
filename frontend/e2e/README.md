# AquaGuard E2E Tests

End-to-end tests for AquaGuard using Playwright browser automation.

## Prerequisites

- Backend server running on `http://localhost:5000`
- Frontend dev server running on `http://localhost:3000`
- Test user credentials: `admin` / `aquaguard2026`

## Running Tests

### Start Services

```bash
# Terminal 1: Start backend
cd backend
source ../aquaguard_env/bin/activate  # or aquaguard_env\Scripts\activate on Windows
python run.py

# Terminal 2: Start frontend
cd frontend
npm start
```

### Run E2E Tests

The e2e tests use Playwright MCP browser tools integrated with GitHub Copilot CLI.

Tests are defined in `e2e/aquaguard.e2e.spec.js` but require Playwright browser automation
to execute.

## Test Coverage

### Authentication Flow
- Load login page
- Reject invalid credentials
- Login with valid credentials

### Dashboard Navigation
- Display system status
- Navigate to cameras page
- Navigate to alerts page
- Navigate to analytics page

### Camera Management
- Display camera list or empty state
- Open add camera form
- Validate required fields in camera form

### Real-time Updates
- Display detection feed
- Show socket connection status
- Refresh data periodically

### Logout
- Logout and return to login page

### Performance and Responsiveness
- Load dashboard within reasonable time
- Handle rapid navigation

## Test Credentials

- **Username**: `admin`
- **Password**: `aquaguard2026`

## Notes

- Tests assume default ports (backend: 5000, frontend: 3000)
- Tests use Playwright's accessibility snapshot for element interaction
- Each test suite logs in fresh to ensure isolation
- Tests validate both UI rendering and data loading
