import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
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

  test('opens and closes focus mode with zone context and recent events/alerts', async () => {
    api.get.mockImplementation((url, config) => {
      if (url === '/api/v1/cameras') {
        return Promise.resolve({
          data: [{ zone_id: 'zone_01', zone_name: 'Main Pool', location_description: 'North side', is_active: true }],
        });
      }
      if (url === '/api/v1/system/status') {
        return Promise.resolve({
          data: { detection_engine: { status: 'online' }, camera_status: [{ zone_id: 'zone_01', status: 'online' }] },
        });
      }
      if (url === '/api/v1/events' && config?.params?.zone_id === 'zone_01') {
        return Promise.resolve({
          data: {
            events: [{ id: 'e1', class_name: 'drowning', timestamp: '2026-03-10T00:00:00Z' }],
          },
        });
      }
      if (url === '/api/v1/alerts' && config?.params?.zone_id === 'zone_01') {
        return Promise.resolve({
          data: {
            alerts: [{ id: 'a1', status: 'unacknowledged', alerted_at: '2026-03-10T00:00:01Z' }],
          },
        });
      }
      return Promise.reject(new Error(`Unexpected GET URL ${url}`));
    });

    api.post.mockResolvedValue({
      data: { stream_token: 'stream-short-lived', ttl_seconds: 30, expires_at: new Date(Date.now() + 30000).toISOString() },
    });

    render(<CameraGrid />);

    const focusButton = await screen.findByRole('button', { name: /focus camera main pool/i });
    fireEvent.click(focusButton);

    expect(await screen.findByRole('dialog', { name: /focused view for main pool/i })).toBeInTheDocument();
    expect(await screen.findByText(/recent detections/i)).toBeInTheDocument();
    expect(screen.getByText(/drowning/i)).toBeInTheDocument();
    expect(screen.getByText(/unacknowledged/i)).toBeInTheDocument();

    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: /focused view for main pool/i })).not.toBeInTheDocument();
    });
  });
});
