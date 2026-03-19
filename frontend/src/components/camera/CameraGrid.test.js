import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import CameraGrid from './CameraGrid';
import api from '../../hooks/useApi';

jest.mock('../../hooks/useApi', () => ({
  __esModule: true,
  default: {
    get: jest.fn(),
    post: jest.fn(),
  },
}));

jest.mock('../../hooks/useAlertSocket', () => jest.fn());

describe('CameraGrid stream token auth flow', () => {
  beforeEach(() => {
    jest.clearAllMocks();
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
        return Promise.resolve({ data: { stream_token: 'stream-short-lived' } });
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
