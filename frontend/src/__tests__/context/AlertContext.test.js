import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { AlertProvider, useAlerts } from '../../context/AlertContext.jsx';
import api from '../../hooks/useApi';
import useAlertSocket from '../../hooks/useAlertSocket';
import { useAuth } from '../../context/AuthContext.jsx';

jest.mock('../../hooks/useApi', () => ({
  post: jest.fn(),
}));

jest.mock('../../hooks/useAlertSocket', () => jest.fn());

jest.mock('../../context/AuthContext.jsx', () => ({
  useAuth: jest.fn(),
}));

let socketCallbacks = {};

function TestConsumer() {
  const {
    activeAlert,
    activeAlerts,
    alertHistory,
    detectionEvents,
    socketConnected,
  } = useAlerts();

  return (
    <div>
      <span data-testid="active-alert-id">{activeAlert?.alert_id || ''}</span>
      <span data-testid="active-confidence">{String(activeAlert?.confidence ?? '')}</span>
      <span data-testid="active-alerted-at">{activeAlert?.alerted_at || ''}</span>
      <span data-testid="active-snapshot">{activeAlert?.frame_snapshot_path || ''}</span>
      <span data-testid="history-size">{String(alertHistory.length)}</span>
      <span data-testid="active-alerts-size">{String(activeAlerts.length)}</span>
      <span data-testid="detection-history-size">{String(detectionEvents.length)}</span>
      <span data-testid="socket-connected">{String(socketConnected)}</span>
    </div>
  );
}

function renderWithProvider() {
  return render(
    <AlertProvider>
      <TestConsumer />
    </AlertProvider>
  );
}

describe('AlertContext payload normalization and acknowledge contract', () => {
  beforeEach(() => {
    socketCallbacks = {};
    jest.clearAllMocks();

    useAuth.mockReturnValue({
      isAuthenticated: true,
      initializingSession: false,
    });

    useAlertSocket.mockImplementation((callbacks = {}) => {
      socketCallbacks = callbacks;
    });
  });

  test('normalizes legacy payload shape and stores canonical alert_id', () => {
    renderWithProvider();

    act(() => {
      socketCallbacks.onAlert({
        id: 'legacy-123',
        confidence_score: 0.81,
        triggered_at: '2026-01-01T00:00:00Z',
        snapshot_path: '/snapshots/legacy-123.jpg',
      });
    });

    expect(screen.getByTestId('active-alert-id')).toHaveTextContent('legacy-123');
    expect(screen.getByTestId('active-confidence')).toHaveTextContent('0.81');
    expect(screen.getByTestId('active-alerted-at')).toHaveTextContent('2026-01-01T00:00:00Z');
    expect(screen.getByTestId('active-snapshot')).toHaveTextContent('/snapshots/legacy-123.jpg');
    expect(screen.getByTestId('history-size')).toHaveTextContent('1');
  });

  test('auto-expires active alerts after 5000ms', () => {
    jest.useFakeTimers();
    renderWithProvider();

    act(() => {
      socketCallbacks.onAlert({
        id: 'expire-id-123',
        zone_id: 'zone_a',
        confidence_score: 0.9,
      });
    });

    expect(screen.getByTestId('active-alert-id')).toHaveTextContent('expire-id-123');
    expect(screen.getByTestId('active-alerts-size')).toHaveTextContent('1');

    act(() => {
      jest.advanceTimersByTime(5000);
    });

    expect(screen.getByTestId('active-alert-id')).toHaveTextContent('');
    expect(screen.getByTestId('active-alerts-size')).toHaveTextContent('0');
    
    jest.useRealTimers();
  });

  test('prefers snapshot_url over snapshot_path fields during normalization', () => {
    renderWithProvider();

    act(() => {
      socketCallbacks.onAlert({
        id: 'snap-priority-1',
        snapshot_url: '/snapshots/url-first.jpg',
        snapshot_path: '/snapshots/path-second.jpg',
        frame_snapshot_path: '/snapshots/frame-third.jpg',
      });
    });

    expect(screen.getByTestId('active-snapshot')).toHaveTextContent('/snapshots/url-first.jpg');
  });

  test('stores detection_event payload from shared socket hook', () => {
    renderWithProvider();

    act(() => {
      socketCallbacks.onDetectionEvent({
        event_id: 'det-1',
        zone_id: 'zone_01',
        confidence_score: 0.82,
      });
    });

    return waitFor(() => {
      expect(screen.getByTestId('detection-history-size')).toHaveTextContent('1');
    });
  });

  test('tracks socket connection state transitions', () => {
    renderWithProvider();

    act(() => {
      socketCallbacks.onConnectionChange(true, { reason: 'connected' });
    });
    expect(screen.getByTestId('socket-connected')).toHaveTextContent('true');

    act(() => {
      socketCallbacks.onConnectionChange(false, { reason: 'disconnect' });
    });
    expect(screen.getByTestId('socket-connected')).toHaveTextContent('false');
  });
});
