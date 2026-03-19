import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import IncidentHistory from './IncidentHistory';
import api from '../../hooks/useApi';

jest.mock('../../hooks/useApi', () => ({
  __esModule: true,
  default: {
    get: jest.fn(),
  },
}));

describe('IncidentHistory mapping resilience', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('maps class_name, confidence_score, and timestamp keys from backend payload', async () => {
    api.get.mockResolvedValue({
      data: {
        events: [
          {
            id: 'evt-2',
            zone_name: 'Kiddie Pool',
            class_name: 'swimming',
            confidence_score: 0.735,
            timestamp: '2026-03-02T08:30:00Z',
            alert_triggered: false,
          },
        ],
        total: 1,
      },
    });

    render(<IncidentHistory />);

    expect(await screen.findByText('Kiddie Pool')).toBeInTheDocument();
    expect(screen.getByText('swimming')).toBeInTheDocument();
    expect(screen.getByText('73.5%')).toBeInTheDocument();
    expect(screen.getByText('No')).toBeInTheDocument();

    await waitFor(() => {
      expect(api.get).toHaveBeenCalledWith('/api/v1/events', {
        params: { page: 1, limit: 10 },
      });
    });
  });
});
