import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { AlertProvider, useAlerts } from './AlertContext';
import api from '../hooks/useApi';
import useAlertSocket from '../hooks/useAlertSocket';

jest.mock('../hooks/useApi', () => ({
  post: jest.fn(),
}));

jest.mock('../hooks/useAlertSocket', () => jest.fn());

let socketCallbacks = {};

function TestConsumer() {
  const { activeAlert, alertHistory, acknowledge } = useAlerts();

  return (
    <div>
      <span data-testid="active-alert-id">{activeAlert?.alert_id || ''}</span>
      <span data-testid="active-confidence">{String(activeAlert?.confidence ?? '')}</span>
      <span data-testid="active-alerted-at">{activeAlert?.alerted_at || ''}</span>
      <span data-testid="active-snapshot">{activeAlert?.frame_snapshot_path || ''}</span>
      <span data-testid="history-size">{String(alertHistory.length)}</span>
      <button onClick={() => acknowledge('legacy-param-id')}>Ack</button>
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

  test('acknowledge always calls API with canonical alert_id and clears active alert', async () => {
    api.post.mockResolvedValue({});
    renderWithProvider();

    act(() => {
      socketCallbacks.onAlert({
        id: 'legacy-ack-id',
      });
    });

    fireEvent.click(screen.getByText('Ack'));

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith('/api/v1/alerts/legacy-ack-id/acknowledge');
    });

    await waitFor(() => {
      expect(screen.getByTestId('active-alert-id')).toHaveTextContent('');
    });
  });

  test('prefers canonical alert_id for new payload shape over passed parameter', async () => {
    api.post.mockResolvedValue({});
    renderWithProvider();

    act(() => {
      socketCallbacks.onAlert({
        alert: {
          alert_id: 'canonical-777',
          confidence_score: 0.9,
          timestamp: '2026-02-02T00:00:00Z',
          snapshot_url: '/snapshots/canonical-777.jpg',
        },
      });
    });

    fireEvent.click(screen.getByText('Ack'));

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith('/api/v1/alerts/canonical-777/acknowledge');
    });
  });
});
