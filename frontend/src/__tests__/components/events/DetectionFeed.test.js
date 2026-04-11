import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import DetectionFeed from '../../../components/events/DetectionFeed.jsx';
import api from '../../../hooks/useApi';
import { useAlertState, useSocketState } from '../../../context/AlertContext.jsx';

jest.mock('../../../hooks/useApi', () => ({
  __esModule: true,
  default: {
    get: jest.fn(),
  },
}));

jest.mock('../../../context/AlertContext.jsx', () => ({
  useAlertState: jest.fn(),
  useSocketState: jest.fn(),
}));

async function renderFeed() {
  render(<DetectionFeed />);
}

describe('DetectionFeed mapping resilience', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useAlertState.mockReturnValue({
      detectionEvents: [],
    });
    useSocketState.mockReturnValue({
      socketConnected: false,
    });
    Object.defineProperty(document, 'hidden', { configurable: true, value: false });
  });

  test('maps confidence_score, class_name, and timestamp fallback keys', async () => {
    api.get.mockResolvedValue({
      data: {
        events: [
          {
            id: 'evt-1',
            class_name: 'drowning',
            confidence_score: 0.88,
            timestamp: '2026-03-01T12:00:00Z',
            zone_name: 'Main Pool',
            alert_triggered: true,
          },
        ],
      },
    });

    await renderFeed();

    expect(await screen.findByText('drowning')).toBeInTheDocument();
    expect(screen.getByText(/88% confidence/)).toBeInTheDocument();
    expect(screen.getByText(/⚠ ALERT/)).toBeInTheDocument();

    await waitFor(() => {
      expect(api.get).toHaveBeenCalledWith('/api/v1/events', {
        params: { limit: 20, page: 1 },
      });
    });
  });

  test('prefers realtime detection events from socket context', async () => {
    useAlertState.mockReturnValue({
      detectionEvents: [
        {
          event_id: 'ws-1',
          class_label: 'drowning',
          confidence_score: 0.91,
          timestamp: '2026-03-01T12:01:00Z',
          zone_name: 'Realtime Pool',
          alert_triggered: true,
        },
      ],
    });
    useSocketState.mockReturnValue({
      socketConnected: true,
    });
    api.get.mockResolvedValue({ data: { events: [] } });

    await renderFeed();

    expect(await screen.findByText('drowning')).toBeInTheDocument();
    expect(screen.getByText(/Live \(socket\)/)).toBeInTheDocument();

    // With socket connected, polling is skipped - events come via WebSocket
    expect(api.get).not.toHaveBeenCalledWith('/api/v1/events', expect.anything());
  });

  test('pauses aggressive polling when tab is hidden', async () => {
    jest.useFakeTimers();
    api.get.mockResolvedValue({ data: { events: [] } });

    Object.defineProperty(document, 'hidden', { configurable: true, value: true });
    await renderFeed();

    await waitFor(() => {
      expect(api.get).toHaveBeenCalledTimes(1);
    });

    jest.advanceTimersByTime(20000);
    await Promise.resolve();
    expect(api.get).toHaveBeenCalledTimes(1);
    jest.useRealTimers();
  });
});
