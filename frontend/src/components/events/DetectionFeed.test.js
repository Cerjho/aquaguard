import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import DetectionFeed from './DetectionFeed';
import api from '../../hooks/useApi';
import { useAlertState, useSocketState } from '../../context/AlertContext';

jest.mock('../../hooks/useApi', () => ({
  __esModule: true,
  default: {
    get: jest.fn(),
  },
}));

jest.mock('../../context/AlertContext', () => ({
  useAlertState: jest.fn(),
  useSocketState: jest.fn(),
}));

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

    render(<DetectionFeed />);

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

    render(<DetectionFeed />);

    expect(await screen.findByText('drowning')).toBeInTheDocument();
    expect(screen.getByText(/Live \(socket\)/)).toBeInTheDocument();

    await waitFor(() => {
      expect(api.get).toHaveBeenCalledWith('/api/v1/events', {
        params: { limit: 20, page: 1 },
      });
    });
  });

  test('pauses aggressive polling when tab is hidden', async () => {
    jest.useFakeTimers();
    api.get.mockResolvedValue({ data: { events: [] } });

    Object.defineProperty(document, 'hidden', { configurable: true, value: true });
    render(<DetectionFeed />);

    await waitFor(() => {
      expect(api.get).toHaveBeenCalledTimes(1);
    });

    jest.advanceTimersByTime(20000);
    expect(api.get).toHaveBeenCalledTimes(1);
    jest.useRealTimers();
  });
});
