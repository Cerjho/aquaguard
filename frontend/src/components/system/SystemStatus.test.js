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

  test('prefers esp32 block from system status payload and skips alerts fallback', async () => {
    api.get.mockImplementation((url) => {
      if (url === '/api/v1/system/status') {
        return Promise.resolve({
          data: {
            detection_engine: { status: 'online', message: 'Engine online' },
            esp32: {
              status: 'online',
              last_seen: '2026-03-01T00:00:00Z',
              message: 'ESP heartbeat active',
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

    expect(await screen.findByText('ESP heartbeat active')).toBeInTheDocument();
    expect(screen.getByText('ESP32 Alarm Device')).toBeInTheDocument();
    expect(api.get).toHaveBeenCalledWith('/api/v1/system/status');
    expect(api.get).not.toHaveBeenCalledWith('/api/v1/alerts', expect.anything());
  });

  test('falls back to alerts heartbeat when esp32 block is missing', async () => {
    api.get.mockImplementation((url) => {
      if (url === '/api/v1/system/status') {
        return Promise.resolve({
          data: {
            detection_engine: { status: 'running', message: 'Runtime ok' },
            camera_status: [],
          },
        });
      }
      if (url === '/api/v1/alerts') {
        return Promise.resolve({
          data: {
            alerts: [{ alerted_at: new Date().toISOString() }],
          },
        });
      }
      return Promise.reject(new Error('Unexpected URL'));
    });

    render(<SystemStatus />);

    expect(await screen.findByText(/Last heartbeat:/)).toBeInTheDocument();
    expect(api.get).toHaveBeenCalledWith('/api/v1/alerts', { params: { limit: 1, page: 1 } });
  });
});
