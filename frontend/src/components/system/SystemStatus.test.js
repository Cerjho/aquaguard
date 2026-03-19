import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import SystemStatus from './SystemStatus';
import api from '../../hooks/useApi';

jest.mock('../../hooks/useApi', () => ({
  __esModule: true,
  default: {
    get: jest.fn(),
  },
}));

jest.mock('../../hooks/useAlertSocket', () => jest.fn());

describe('SystemStatus', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('fetches initial runtime status on mount and shows detection engine online', async () => {
    api.get.mockImplementation((url) => {
      if (url === '/api/v1/system/status') {
        return Promise.resolve({
          data: {
            detection_engine: {
              status: 'running',
              message: 'Runtime ok',
            },
            camera_status: [],
          },
        });
      }

      if (url === '/api/v1/alerts') {
        return Promise.resolve({ data: { alerts: [] } });
      }

      return Promise.reject(new Error('Unexpected URL'));
    });

    render(<SystemStatus />);

    await waitFor(() => {
      expect(api.get).toHaveBeenCalledWith('/api/v1/system/status');
    });

    expect(await screen.findByText('Runtime ok')).toBeInTheDocument();
    expect(screen.getByText('Detection Engine')).toBeInTheDocument();
    expect(screen.getAllByText('Online').length).toBeGreaterThan(0);
  });

  test('normalizes initial camera payload fields from runtime status response', async () => {
    api.get.mockImplementation((url) => {
      if (url === '/api/v1/system/status') {
        return Promise.resolve({
          data: {
            system_status: { status: 'online', message: 'Engine connected' },
            camera_status: [
              {
                zone_id: 'zone_01',
                zone_name: 'Main Pool',
                status: 'online',
                last_snapshot_at: new Date().toISOString(),
                snapshot_age_seconds: 12,
              },
            ],
          },
        });
      }

      if (url === '/api/v1/alerts') {
        return Promise.resolve({ data: [] });
      }

      return Promise.reject(new Error('Unexpected URL'));
    });

    render(<SystemStatus />);

    expect(await screen.findByText('Main Pool')).toBeInTheDocument();
    expect(screen.getByText(/Zone: zone_01/)).toBeInTheDocument();
    expect(screen.getByText(/Snapshot age: 12s/)).toBeInTheDocument();
    expect(screen.getByText(/Last snapshot:/)).toBeInTheDocument();
  });
});
