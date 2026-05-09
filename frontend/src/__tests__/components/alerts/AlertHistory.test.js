import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import AlertHistory from '../../../components/alerts/AlertHistory.jsx';
import api from '../../../hooks/useApi';
import { useFilterState } from '../../../context/AlertContext.jsx';
import { mockIncidentHistoryAlerts } from '../../fixtures/mockData';

jest.mock('../../../hooks/useApi', () => ({
  __esModule: true,
  default: {
    get: jest.fn(),
  },
}));

jest.mock('../../../context/AlertContext.jsx', () => ({
  useFilterState: jest.fn(),
}));

jest.mock('../../../context/DataCacheContext.jsx', () => ({
  useDataCache: jest.fn(),
}));

describe('AlertHistory shared triage filters', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useFilterState.mockReturnValue({
      triageFilters: {
        zone_id: 'zone_01',
        min_confidence: '0.7',
        from: '',
        to: '',
      },
      setTriageFilters: jest.fn(),
      resetTriageFilters: jest.fn(),
    });
    
    const { useDataCache } = require('../../../context/DataCacheContext.jsx');
    useDataCache.mockReturnValue({
      alertHistorySnapshot: null,
      setAlertHistorySnapshot: jest.fn()
    });
  });

  test('applies shared filter params to alerts query', async () => {
    api.get.mockImplementation((url) => {
      if (url === '/api/v1/alerts') {
        return Promise.resolve({ data: mockIncidentHistoryAlerts });
      }
      if (url === '/api/v1/cameras') {
        return Promise.resolve({ data: [] });
      }
      return Promise.resolve({ data: {} });
    });

    render(<AlertHistory />);

    await waitFor(() => {
      expect(api.get).toHaveBeenCalledWith('/api/v1/alerts', {
        params: expect.objectContaining({
          page: 1,
          limit: 10,
          zone_id: 'zone_01',
          min_confidence: 0.7,
        }),
      });
    });

    const matches = await screen.findAllByText(/Drowning Alert/i);
    expect(matches.length).toBeGreaterThan(0);
  });

  test('keeps filters collapsed by default and reveals on Add Filter', async () => {
    api.get.mockImplementation((url) => {
      if (url === '/api/v1/alerts') {
        return Promise.resolve({ data: mockIncidentHistoryAlerts });
      }
      if (url === '/api/v1/cameras') {
        return Promise.resolve({ data: [] });
      }
      return Promise.resolve({ data: {} });
    });

    render(<AlertHistory />);

    expect(await screen.findByRole('button', { name: /^filter/i })).toBeInTheDocument();
    expect(screen.queryByLabelText(/filter alerts by zone id/i)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /^filter/i }));

    expect(await screen.findByLabelText(/filter alerts by zone id/i)).toBeInTheDocument();
  });
});
