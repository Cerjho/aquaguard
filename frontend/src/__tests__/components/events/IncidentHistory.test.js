import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import IncidentHistory from '../../../components/events/IncidentHistory.jsx';
import api from '../../../hooks/useApi';
import { useFilterState } from '../../../context/AlertContext.jsx';

jest.mock('../../../hooks/useApi', () => ({
  __esModule: true,
  default: {
    get: jest.fn(),
  },
}));

jest.mock('../../../context/AlertContext.jsx', () => ({
  useFilterState: jest.fn(),
}));

jest.mock('framer-motion', () => ({
  ...jest.requireActual('framer-motion'),
  useReducedMotion: () => false,
}));

describe('IncidentHistory mapping resilience', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useFilterState.mockReturnValue({
      triageFilters: {
        zone_id: '',
        status: '',
        min_confidence: '',
        from: '',
        to: '',
      },
      setTriageFilters: jest.fn(),
      resetTriageFilters: jest.fn(),
    });
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

  test('shows loading status skeleton while fetching', async () => {
    let resolveRequest;
    api.get.mockReturnValue(new Promise((resolve) => {
      resolveRequest = resolve;
    }));

    render(<IncidentHistory />);

    expect(
      screen.getByRole('status', { name: /loading incident history/i })
    ).toBeInTheDocument();

    resolveRequest({
      data: {
        events: [],
        total: 0,
      },
    });

    await screen.findByText(/No events recorded/i);
  });
});
