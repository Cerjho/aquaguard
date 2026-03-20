import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import TopBar from './TopBar';
import { useAuth } from '../../context/AuthContext';
import { useAlerts } from '../../context/AlertContext';

jest.mock('../../context/AuthContext', () => ({
  useAuth: jest.fn(),
}));

jest.mock('../../context/AlertContext', () => ({
  useAlerts: jest.fn(),
}));

describe('TopBar connectivity health strip', () => {
  beforeEach(() => {
    useAuth.mockReturnValue({
      currentUser: { username: 'admin', role: 'admin' },
      logout: jest.fn(),
    });
    useAlerts.mockReturnValue({
      unacknowledgedCount: 2,
      socketConnected: false,
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
});

