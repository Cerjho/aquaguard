import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import CameraGrid from './CameraGrid';
import api from '../../hooks/useApi';
import { useAlerts } from '../../context/AlertContext';

jest.mock('../../hooks/useApi', () => ({
  __esModule: true,
  default: {
    get: jest.fn(),
    post: jest.fn(),
  },
}));

jest.mock('../../context/AlertContext', () => ({
  useAlerts: jest.fn(),
}));

describe('CameraGrid stream token auth flow', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useAlerts.mockReturnValue({
      cameraStatuses: {
        zone_01: { zone_id: 'zone_01', status: 'online', zone_name: 'Main Pool' },
      },
      systemStatus: {
        detection_engine: { status: 'online' },
      },
    });
  });

  test('mints stream token per camera and renders stream URL with stream token', async () => {
    api.get.mockImplementation((url) => {
      if (url === '/api/v1/cameras') {
        return Promise.resolve({
          data: [
            {
              zone_id: 'zone_01',
              zone_name: 'Main Pool',
              location_description: 'North side',
              is_active: true,
            },
          ],
        });
      }
      if (url === '/api/v1/system/status') {
        return Promise.resolve({
          data: {
            detection_engine: { status: 'online' },
            camera_status: [{ zone_id: 'zone_01', status: 'online' }],
          },
        });
      }
      return Promise.reject(new Error('Unexpected GET URL'));
    });

    api.post.mockImplementation((url) => {
      if (url === '/api/v1/cameras/zone_01/stream-token') {
        return Promise.resolve({
          data: {
            stream_token: 'stream-short-lived',
            ttl_seconds: 30,
            expires_at: new Date(Date.now() + 30000).toISOString(),
          },
        });
      }
      return Promise.reject(new Error('Unexpected POST URL'));
    });

    render(<CameraGrid />);

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith('/api/v1/cameras/zone_01/stream-token');
    });

    const streamImage = await screen.findByAltText('Live feed — Main Pool');
    expect(streamImage).toHaveAttribute(
      'src',
      expect.stringContaining('/api/v1/cameras/zone_01/stream?token=stream-short-lived')
    );
  });
});
