import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import AlertHistory from './AlertHistory';
import api from '../../hooks/useApi';
import { useFilterState } from '../../context/AlertContext';

jest.mock('../../hooks/useApi', () => ({
  __esModule: true,
  default: {
    get: jest.fn(),
  },
}));

jest.mock('../../context/AlertContext', () => ({
  useFilterState: jest.fn(),
}));

describe('AlertHistory shared triage filters', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useFilterState.mockReturnValue({
      triageFilters: {
        zone_id: 'zone_01',
        status: 'unacknowledged',
        min_confidence: '0.7',
        from: '',
        to: '',
      },
      setTriageFilters: jest.fn(),
      resetTriageFilters: jest.fn(),
    });
  });

  test('applies shared filter params to alerts query', async () => {
    api.get.mockResolvedValue({
      data: [{ id: 'a1', zone_id: 'zone_01', status: 'unacknowledged', alerted_at: new Date().toISOString() }],
    });

    render(<AlertHistory />);

    await waitFor(() => {
      expect(api.get).toHaveBeenCalledWith('/api/v1/alerts', {
        params: expect.objectContaining({
          page: 1,
          limit: 10,
          zone_id: 'zone_01',
          status: 'unacknowledged',
          min_confidence: '0.7',
        }),
      });
    });

    const matches = await screen.findAllByText(/Unacknowledged/i);
    expect(matches.length).toBeGreaterThan(0);
  });
});
