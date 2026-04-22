import React from 'react';
import { render, screen } from '@testing-library/react';
import SystemStatus from '../../../components/system/SystemStatus.jsx';
import { useSocketState, useSystemState } from '../../../context/AlertContext.jsx';

jest.mock('../../../context/AlertContext.jsx', () => ({
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
      apiStatus: { connected: true },
      cameraStatuses: {
        zone_01: {
          zone_id: 'zone_01',
          zone_name: 'Main Pool',
          status: 'online',
        },
      },
      cameraHealthMap: {},
      systemStatus: {
        detection_engine: {
          status: 'online',
          message: 'Runtime ok',
        },
        esp32: {
          status: 'online',
          message: 'ESP heartbeat active',
        },
        subsystems: {
          detection_engine: {
            freshness_seconds: 2,
            stale_threshold_seconds: 10,
          },
        },
      },
    });
  });

  test('renders status cards and subsystem detail rows', () => {
    render(<SystemStatus />);

    expect(screen.getByText('API')).toBeInTheDocument();
    expect(screen.getByText('Socket')).toBeInTheDocument();
    expect(screen.getByText('AI')).toBeInTheDocument();
    expect(screen.getByText('ESP32 Alarm')).toBeInTheDocument();
    expect(screen.getByText('ESP heartbeat active')).toBeInTheDocument();
    expect(screen.getByText('Main Pool')).toBeInTheDocument();
  });

  test('shows waiting message when no camera statuses are available', () => {
    useSystemState.mockReturnValue({
      apiStatus: { connected: false },
      cameraStatuses: {},
      cameraHealthMap: {},
      systemStatus: {
        subsystems: {
          detection_engine: {
            freshness_seconds: 20,
            stale_threshold_seconds: 10,
          },
        },
      },
    });

    render(<SystemStatus />);

    expect(screen.getByText(/waiting for camera status/i)).toBeInTheDocument();
  });

  test('renders relative heartbeat detail from last_heartbeat_at', () => {
    useSystemState.mockReturnValue({
      apiStatus: { connected: true },
      cameraStatuses: {},
      cameraHealthMap: {},
      systemStatus: {
        esp32: {
          status: 'online',
          last_heartbeat_at: new Date().toISOString(),
        },
      },
    });

    render(<SystemStatus />);

    expect(screen.getByText(/ago|just now/i)).toBeInTheDocument();
  });

  test('shows Offline (not Stale) when backend marks ESP32 offline', () => {
    useSystemState.mockReturnValue({
      apiStatus: { connected: true },
      cameraStatuses: {},
      cameraHealthMap: {},
      systemStatus: {
        esp32: {
          status: 'offline',
          last_heartbeat_at: new Date(Date.now() - 4 * 60 * 1000).toISOString(),
        },
        subsystems: {
          esp32: {
            freshness_seconds: 240,
            stale_threshold_seconds: 30,
          },
        },
      },
    });

    render(<SystemStatus showCameraIndicators showCameraStatusList={false} />);

    expect(screen.getByText('Offline')).toBeInTheDocument();
    expect(screen.queryByText('Stale')).not.toBeInTheDocument();
  });
});
