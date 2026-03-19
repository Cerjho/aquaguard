import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import DetectionFeed from './DetectionFeed';
import api from '../../hooks/useApi';

jest.mock('../../hooks/useApi', () => ({
  __esModule: true,
  default: {
    get: jest.fn(),
  },
}));

describe('DetectionFeed mapping resilience', () => {
  beforeEach(() => {
    jest.clearAllMocks();
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
});
