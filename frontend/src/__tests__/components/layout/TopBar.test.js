import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import TopBar from '../../../components/layout/TopBar';
import { useAuth } from '../../../context/AuthContext';
import {
  useAlertState,
  useSocketState,
  useSystemState,
} from '../../../context/AlertContext';

jest.mock('../../../context/AuthContext', () => ({
  useAuth: jest.fn(),
}));

jest.mock('../../../context/AlertContext', () => ({
  useAlertState: jest.fn(),
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
    useAlertState.mockReturnValue({
      unacknowledgedCount: 2,
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

    expect(screen.getByText(/API: Offline/i)).toBeInTheDocument();
    expect(screen.getByText(/Socket: Disconnected/i)).toBeInTheDocument();
    expect(screen.getByText(/Detection freshness: 18s/i)).toBeInTheDocument();
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

    expect(screen.getByText(/API: Checking/i)).toBeInTheDocument();
  });
});

