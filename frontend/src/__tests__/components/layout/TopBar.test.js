import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import TopBar from '../../../components/layout/TopBar.jsx';
import { useAuth } from '../../../context/AuthContext.jsx';
import {
  useSocketState,
  useSystemState,
} from '../../../context/AlertContext.jsx';

jest.mock('../../../context/AuthContext.jsx', () => ({
  useAuth: jest.fn(),
}));

jest.mock('../../../context/AlertContext.jsx', () => ({
  useSocketState: jest.fn(),
  useSystemState: jest.fn(),
}));

describe('TopBar connectivity health strip', () => {
  beforeEach(() => {
    useAuth.mockReturnValue({
      currentUser: { username: 'admin', role: 'admin' },
      isAuthenticated: true,
      authError: null,
      loading: false,
      initializingSession: false,
      logout: jest.fn(),
      login: jest.fn(),
    });

    useSocketState.mockReturnValue({
      socketConnected: false,
    });
    useSystemState.mockReturnValue({
      apiStatus: { connected: false },
      systemStatus: {
        subsystems: {
          detection_engine: {
            freshness_seconds: 18,
            stale_threshold_seconds: 10,
          },
        },
      },
    });
  });

  test('shows degraded connectivity states', () => {
    render(
      <MemoryRouter>
        <TopBar />
      </MemoryRouter>
    );

    const statusStrip = screen.getByRole('status');
    expect(statusStrip).toHaveTextContent(/API\s*:\s*Offline/i);
    expect(statusStrip).toHaveTextContent(/Socket\s*:\s*Offline/i);
    expect(statusStrip).toHaveTextContent(/Detection\s*:\s*18s ago/i);
  });

  test('shows API checking during auth bootstrap', () => {
    useAuth.mockReturnValue({
      currentUser: null,
      isAuthenticated: false,
      authError: null,
      loading: false,
      initializingSession: true,
      logout: jest.fn(),
      login: jest.fn(),
    });
    useSystemState.mockReturnValue({
      apiStatus: { connected: null },
      systemStatus: { subsystems: { detection_engine: {} } },
    });

    render(
      <MemoryRouter>
        <TopBar />
      </MemoryRouter>
    );

    expect(screen.getByRole('status')).toHaveTextContent(/API\s*:\s*Checking/i);
  });
});

