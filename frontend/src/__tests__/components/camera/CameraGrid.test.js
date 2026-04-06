import React from 'react';
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';
import CameraGrid from '../../../components/camera/CameraGrid';
import api from '../../../hooks/useApi';
import { useSystemState, useAlertState } from '../../../context/AlertContext';

jest.mock('../../../hooks/useApi', () => ({
  __esModule: true,
  default: {
    get: jest.fn(),
    post: jest.fn(),
  },
}));

jest.mock('../../../context/AlertContext', () => ({
  useSystemState: jest.fn(),
  useAlertState: jest.fn(),
}));

describe('CameraGrid stream token auth flow', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useSystemState.mockReturnValue({
      cameraStatuses: {
        zone_01: { zone_id: 'zone_01', status: 'online', zone_name: 'Main Pool' },
      },
      systemStatus: {
        detection_engine: { status: 'online' },
      },
    });
    useAlertState.mockReturnValue({
      activeAlerts: [],
      acknowledge: jest.fn(),
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
      if (url === '/api/v1/cameras/zone_01/stream-token') {
        return Promise.resolve({
          data: {
            stream_token: 'stream-short-lived',
            ttl_seconds: 30,
            expires_at: new Date(Date.now() + 30000).toISOString(),
          },
        });
      }
      return Promise.reject(new Error('Unexpected GET URL'));
    });

    render(<CameraGrid />);

    await waitFor(() => {
      expect(api.get).toHaveBeenCalledWith('/api/v1/cameras/zone_01/stream-token');
    });

    const streamImage = await screen.findByAltText('Live feed — Main Pool');
    expect(streamImage).toHaveAttribute(
      'src',
      expect.stringContaining('/api/v1/cameras/zone_01/stream?token=stream-short-lived')
    );
  });

  test('opens and closes focus mode from camera card with zone context and recent events/alerts', async () => {
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
      if (url === '/api/v1/cameras/zone_01/stream-token') {
        return Promise.resolve({
          data: { stream_token: 'stream-short-lived', ttl_seconds: 30, expires_at: new Date(Date.now() + 30000).toISOString() },
        });
      }
      return Promise.reject(new Error(`Unexpected GET URL ${url}`));
    });

    api.post.mockResolvedValue({
      data: { stream_token: 'stream-short-lived', ttl_seconds: 30, expires_at: new Date(Date.now() + 30000).toISOString() },
    });

    render(<CameraGrid />);

    const cameraCard = await screen.findByRole('button', { name: /camera card main pool/i });
    expect(screen.queryByRole('button', { name: /focus camera main pool/i })).not.toBeInTheDocument();
    fireEvent.click(cameraCard);

    expect(await screen.findByRole('dialog', { name: /focused view for main pool/i })).toBeInTheDocument();
    expect(await screen.findByText(/recent detections/i)).toBeInTheDocument();
    expect(screen.getByText(/drowning/i)).toBeInTheDocument();
    expect(screen.getByText(/unacknowledged/i)).toBeInTheDocument();

    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: /focused view for main pool/i })).not.toBeInTheDocument();
    });
  });

  test('opens focus mode via keyboard Enter on camera card', async () => {
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
        return Promise.resolve({ data: { events: [] } });
      }
      if (url === '/api/v1/alerts' && config?.params?.zone_id === 'zone_01') {
        return Promise.resolve({ data: { alerts: [] } });
      }
      return Promise.reject(new Error(`Unexpected GET URL ${url}`));
    });

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
        return Promise.resolve({ data: { events: [] } });
      }
      if (url === '/api/v1/alerts' && config?.params?.zone_id === 'zone_01') {
        return Promise.resolve({ data: { alerts: [] } });
      }
      if (url === '/api/v1/cameras/zone_01/stream-token') {
        return Promise.resolve({
          data: { stream_token: 'stream-short-lived', ttl_seconds: 30, expires_at: new Date(Date.now() + 30000).toISOString() },
        });
      }
      return Promise.reject(new Error(`Unexpected GET URL ${url}`));
    });

    render(<CameraGrid />);

    const cameraCard = await screen.findByRole('button', { name: /camera card main pool/i });
    fireEvent.keyDown(cameraCard, { key: 'Enter' });

    expect(await screen.findByRole('dialog', { name: /focused view for main pool/i })).toBeInTheDocument();
  });

  test('limits concurrent grid streams to reduce duplicate load', async () => {
    const cameraList = Array.from({ length: 5 }).map((_, idx) => ({
      zone_id: `zone_${idx + 1}`,
      zone_name: `Pool ${idx + 1}`,
      location_description: `Lane ${idx + 1}`,
      is_active: true,
    }));

    // Override mock for this test with matching zone IDs
    const cameraStatuses = {};
    cameraList.forEach((cam) => {
      cameraStatuses[cam.zone_id] = { zone_id: cam.zone_id, status: 'online', zone_name: cam.zone_name };
    });
    useSystemState.mockReturnValue({
      cameraStatuses,
      systemStatus: {
        detection_engine: { status: 'online' },
      },
    });

    api.get.mockImplementation((url) => {
      if (url === '/api/v1/cameras') {
        return Promise.resolve({ data: cameraList });
      }
      const match = url.match(/\/api\/v1\/cameras\/(.+)\/stream-token/);
      if (!match) return Promise.reject(new Error(`Unexpected GET URL ${url}`));
      const zoneId = match[1];
      return Promise.resolve({
        data: {
          stream_token: `token-${zoneId}`,
          ttl_seconds: 30,
          expires_at: new Date(Date.now() + 30000).toISOString(),
        },
      });
    });

    render(<CameraGrid />);

    await waitFor(() => {
      expect(api.get).toHaveBeenCalledWith('/api/v1/cameras/zone_1/stream-token');
    });
    await waitFor(() => {
      expect(api.get).toHaveBeenCalledWith('/api/v1/cameras/zone_2/stream-token');
    });
    await waitFor(() => {
      expect(api.get).toHaveBeenCalledWith('/api/v1/cameras/zone_3/stream-token');
    });
    await waitFor(() => {
      expect(api.get).toHaveBeenCalledWith('/api/v1/cameras/zone_4/stream-token');
    });

    expect(await screen.findByAltText('Live feed — Pool 1')).toBeInTheDocument();
    expect(screen.getByAltText('Live feed — Pool 2')).toBeInTheDocument();
    expect(screen.getByAltText('Live feed — Pool 3')).toBeInTheDocument();
    expect(screen.getByAltText('Live feed — Pool 4')).toBeInTheDocument();
    expect(screen.queryByAltText('Live feed — Pool 5')).not.toBeInTheDocument();
    expect(screen.getAllByText(/Click to focus live stream/i).length).toBeGreaterThan(0);
  });

  test('pauses grid stream rendering while tab is hidden and restores when visible', async () => {
    let hidden = true;
    Object.defineProperty(document, 'hidden', {
      configurable: true,
      get: () => hidden,
    });

    api.get.mockImplementation((url) => {
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
      return Promise.reject(new Error(`Unexpected GET URL ${url}`));
    });

    api.get.mockImplementation((url) => {
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
      if (url === '/api/v1/cameras/zone_01/stream-token') {
        return Promise.resolve({
          data: { stream_token: 'stream-short-lived', ttl_seconds: 30, expires_at: new Date(Date.now() + 30000).toISOString() },
        });
      }
      return Promise.reject(new Error(`Unexpected GET URL ${url}`));
    });

    render(<CameraGrid />);

    expect(await screen.findByText(/Paused in background tab/i)).toBeInTheDocument();
    expect(screen.queryByAltText('Live feed — Main Pool')).not.toBeInTheDocument();

    hidden = false;
    fireEvent(document, new Event('visibilitychange'));

    expect(await screen.findByAltText('Live feed — Main Pool')).toBeInTheDocument();
  });

  test('keeps stream URL stable when reload token changes', async () => {
    api.get.mockImplementation((url) => {
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
      return Promise.reject(new Error(`Unexpected GET URL ${url}`));
    });

    api.get.mockImplementation((url) => {
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

    const { rerender } = render(<CameraGrid reloadToken="route-a" />);

    const firstImage = await screen.findByAltText('Live feed — Main Pool');
    const firstSrc = firstImage.getAttribute('src');
    expect(firstSrc).toContain('/api/v1/cameras/zone_01/stream?token=stream-short-lived');

    rerender(<CameraGrid reloadToken="route-b" />);

    await waitFor(() => {
      const nextImage = screen.getByAltText('Live feed — Main Pool');
      const nextSrc = nextImage.getAttribute('src');
      expect(nextSrc).toBe(firstSrc);
    });
  });

  test('deduplicates in-flight stream token refresh per zone', async () => {
    jest.useFakeTimers();
    let refreshResolve;
    let streamTokenCallCount = 0;

    try {
      api.get.mockImplementation((url) => {
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
        if (url === '/api/v1/cameras/zone_01/stream-token') {
          streamTokenCallCount += 1;
          if (streamTokenCallCount === 1) {
            return Promise.resolve({
              data: {
                stream_token: 'initial-token',
                ttl_seconds: 1,
                expires_at: new Date(Date.now() + 1000).toISOString(),
              },
            });
          }
          return new Promise((resolve) => {
            refreshResolve = resolve;
          });
        }
        return Promise.reject(new Error(`Unexpected GET URL ${url}`));
      });

      render(<CameraGrid />);

      await waitFor(() => {
        expect(api.get).toHaveBeenCalledWith('/api/v1/cameras/zone_01/stream-token');
      });

      await act(async () => {
        jest.advanceTimersByTime(11000);
        await Promise.resolve();
      });

      // 1 initial mint + 1 refresh request, even after multiple interval ticks.
      expect(
        api.get.mock.calls.filter((call) => call[0] === '/api/v1/cameras/zone_01/stream-token').length
      ).toBe(2);

      await act(async () => {
        refreshResolve({
          data: {
            stream_token: 'refreshed-token',
            ttl_seconds: 30,
            expires_at: new Date(Date.now() + 30000).toISOString(),
          },
        });
        await Promise.resolve();
      });
    } finally {
      jest.useRealTimers();
    }
  });
});
