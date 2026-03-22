import React from 'react';
import { render, screen } from '@testing-library/react';
import SystemStatus from './SystemStatus';
import { useSocketState, useSystemState } from '../../context/AlertContext';

jest.mock('../../context/AlertContext', () => ({
  useSocketState: jest.fn(),
  useSystemState: jest.fn(),
}));

describe('SystemStatus', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useSocketState.mockReturnValue({
      socketConnected: true,
    });
    useSystemState.mockReturnValue({
      socketConnected: true,
      cameraStatuses: {
        zone_01: {
          zone_id: 'zone_01',
          zone_name: 'Main Pool',
          status: 'online',
          snapshot_age_seconds: 2,
          last_snapshot_at: new Date().toISOString(),
        },
      },
      systemStatus: {
        detection_engine: {
          status: 'online',
          message: 'Runtime ok',
        },
        esp32: {
          status: 'online',
          last_seen: new Date().toISOString(),
          message: 'ESP heartbeat active',
        },
        subsystems: {
          detection_engine: {
            freshness_seconds: 2,
            stale_threshold_seconds: 10,
          },
          esp32: {
            freshness_seconds: 5,
            stale_threshold_seconds: 90,
          },
        },
      },
    });
  });

  test('shows connectivity and subsystem status from shared context', async () => {
    render(<SystemStatus />);

    expect(await screen.findByText('Runtime ok')).toBeInTheDocument();
    expect(screen.getByText('Connected')).toBeInTheDocument();
    expect(screen.getByText('Detection Engine')).toBeInTheDocument();
    expect(screen.getByText('ESP heartbeat active')).toBeInTheDocument();
  });

  test('marks stale detection freshness as warning', async () => {
    useSocketState.mockReturnValue({
      socketConnected: false,
    });
    useSystemState.mockReturnValue({
      cameraStatuses: {},
      systemStatus: {
        detection_engine: {
          status: 'online',
          message: '',
        },
        subsystems: {
          detection_engine: {
            freshness_seconds: 15,
            stale_threshold_seconds: 10,
          },
        },
      },
    });

    render(<SystemStatus />);
    expect(await screen.findByText('Disconnected (status polling only)')).toBeInTheDocument();
    expect(screen.getByText(/Freshness: 15s/)).toBeInTheDocument();
    expect(screen.getByText('Warning')).toBeInTheDocument();
  });

  test('uses esp32 last_heartbeat_at field for heartbeat detail', async () => {
    useSocketState.mockReturnValue({
      socketConnected: true,
    });
    useSystemState.mockReturnValue({
      cameraStatuses: {},
      systemStatus: {
        esp32: {
          status: 'online',
          last_heartbeat_at: new Date().toISOString(),
          message: '',
        },
      },
    });

    render(<SystemStatus />);
    expect(await screen.findByText(/Last heartbeat:/i)).toBeInTheDocument();
  });
});
