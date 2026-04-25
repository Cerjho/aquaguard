import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import IncidentHistory from '../../../components/events/IncidentHistory.jsx';
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

jest.mock('../../../context/DataCacheContext.jsx', () => ({
  useDataCache: jest.fn(),
}));

describe('IncidentHistory compatibility wrapper', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useAlertState.mockReturnValue({ detectionEvents: [] });
    useSocketState.mockReturnValue({ socketConnected: false });
    
    const { useDataCache } = require('../../../context/DataCacheContext.jsx');
    useDataCache.mockReturnValue({
      cameras: [],
      refreshCameras: jest.fn()
    });
  });

  test('renders DetectionFeed heading via compatibility export', async () => {
    api.get.mockResolvedValue({ data: { events: [] } });

    render(<IncidentHistory />);

    expect(await screen.findByText(/detection events/i)).toBeInTheDocument();
  });

  test('maps backend detection payload keys from polling data', async () => {
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
      },
    });

    render(<IncidentHistory />);

    expect(await screen.findByText('swimming')).toBeInTheDocument();
    expect(screen.getByText(/73.5%/)).toBeInTheDocument();

    await waitFor(() => {
      expect(api.get).toHaveBeenCalledWith('/api/v1/events', {
        params: { page: 1, limit: 10 },
      });
    });
  });
});
