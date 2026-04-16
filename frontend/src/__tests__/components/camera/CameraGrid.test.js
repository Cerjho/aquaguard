import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import CameraGrid from '../../../components/camera/CameraGrid.jsx';
import api from '../../../hooks/useApi';
import { useAlertState, useSystemState } from '../../../context/AlertContext.jsx';
import { useDataCache } from '../../../context/DataCacheContext.jsx';

jest.mock('../../../hooks/useApi', () => ({
  __esModule: true,
  default: {
    get: jest.fn(),
  },
}));

jest.mock('../../../context/AlertContext.jsx', () => ({
  useSystemState: jest.fn(),
  useAlertState: jest.fn(),
}));

jest.mock('../../../context/DataCacheContext.jsx', () => ({
  useDataCache: jest.fn(),
}));

describe('CameraGrid', () => {
  const baseCamera = {
    zone_id: 'zone_01',
    zone_name: 'Main Pool',
    location_description: 'North side',
    is_active: true,
  };

  beforeEach(() => {
    jest.clearAllMocks();

    useAlertState.mockReturnValue({
      activeAlerts: [],
      acknowledge: jest.fn(),
    });

    useSystemState.mockReturnValue({
      cameraStatuses: {
        zone_01: {
          zone_id: 'zone_01',
          zone_name: 'Main Pool',
          status: 'online',
        },
      },
      cameraHealthMap: {},
      systemStatus: {
        detection_engine: { status: 'online' },
      },
    });

    useDataCache.mockReturnValue({
      cameras: [baseCamera],
      camerasLoading: false,
      camerasError: null,
      fetchCameras: jest.fn(),
      refreshCameras: jest.fn(),
    });
  });

  test('shows empty state when there are no cameras', () => {
    useDataCache.mockReturnValue({
      cameras: [],
      camerasLoading: false,
      camerasError: null,
      fetchCameras: jest.fn(),
      refreshCameras: jest.fn(),
    });

    render(<CameraGrid />);

    expect(screen.getByText(/no cameras registered/i)).toBeInTheDocument();
  });

  test('mints stream token and renders live feed image for active camera', async () => {
    api.get.mockImplementation((url) => {
      if (url === '/api/v1/cameras/zone_01/stream-token') {
        return Promise.resolve({
          data: {
            stream_token: 'stream-short-lived',
            ttl_seconds: 30,
            expires_at: new Date(Date.now() + 30000).toISOString(),
          },
        });
      }
      return Promise.reject(new Error(`Unexpected GET URL ${url}`));
    });

    render(<CameraGrid />);

    await waitFor(() => {
      expect(api.get).toHaveBeenCalledWith('/api/v1/cameras/zone_01/stream-token');
    });

    expect(
      await screen.findByRole('button', { name: /camera card main pool/i })
    ).toBeInTheDocument();
  });

  test('opens focused dialog from camera card and closes on Escape', async () => {
    api.get.mockImplementation((url) => {
      if (url === '/api/v1/cameras/zone_01/stream-token') {
        return Promise.resolve({
          data: {
            stream_token: 'stream-short-lived',
            ttl_seconds: 30,
            expires_at: new Date(Date.now() + 30000).toISOString(),
          },
        });
      }
      if (url === '/api/v1/events') {
        return Promise.resolve({ data: { events: [] } });
      }
      if (url === '/api/v1/alerts') {
        return Promise.resolve({ data: { alerts: [] } });
      }
      return Promise.reject(new Error(`Unexpected GET URL ${url}`));
    });

    render(<CameraGrid />);

    const cameraCard = await screen.findByRole('button', {
      name: /camera card main pool/i,
    });
    fireEvent.click(cameraCard);

    expect(
      await screen.findByRole('dialog', { name: /focused view for main pool/i })
    ).toBeInTheDocument();

    fireEvent.keyDown(document, { key: 'Escape' });

    await waitFor(() => {
      expect(
        screen.queryByRole('dialog', { name: /focused view for main pool/i })
      ).not.toBeInTheDocument();
    });
  });
});
