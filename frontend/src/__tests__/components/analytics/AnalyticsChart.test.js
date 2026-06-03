import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import AnalyticsChart from '../../../components/analytics/AnalyticsChart.jsx';
import api from '../../../hooks/useApi';
import { useDataCache } from '../../../context/DataCacheContext.jsx';

const mockSetAnalyticsSnapshot = jest.fn();

jest.mock('../../../context/AlertContext.jsx', () => ({
  useSystemState: jest.fn(),
  useSocketState: jest.fn(),
}));

jest.mock('../../../hooks/useApi', () => ({
  __esModule: true,
  default: {
    get: jest.fn(),
  },
}));

jest.mock('../../../context/DataCacheContext.jsx', () => ({
  __esModule: true,
  useDataCache: jest.fn(),
}));

jest.mock('recharts', () => {
  const React = require('react');
  return {
    ResponsiveContainer: ({ children }) => <div>{children}</div>,
    LineChart: ({ children }) => <div data-testid="line-chart">{children}</div>,
    PieChart: ({ children }) => <div data-testid="pie-chart">{children}</div>,
    ComposedChart: ({ children }) => <div data-testid="composed-chart">{children}</div>,
    Pie: () => null,
    Cell: () => null,
    Sector: () => null,
    XAxis: () => null,
    YAxis: () => null,
    CartesianGrid: () => null,
    Tooltip: () => null,
    Legend: () => null,
    Line: () => null,
    Area: () => null,
  };
});

jest.mock('framer-motion', () => ({
  AnimatePresence: ({ children }) => <>{children}</>,
  motion: {
    section: ({ children, ...props }) => <section {...props}>{children}</section>,
    div: ({ children, ...props }) => <div {...props}>{children}</div>,
  },
  useReducedMotion: () => false,
}));

describe('AnalyticsChart', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useDataCache.mockReturnValue({
      analyticsSnapshot: null,
      setAnalyticsSnapshot: mockSetAnalyticsSnapshot,
    });
    
    const { useSystemState, useSocketState } = require('../../../context/AlertContext.jsx');
    useSystemState.mockReturnValue({
      cameraStatuses: {},
      systemStatus: {
        subsystems: {
          detection_engine: { status: 'online' },
          esp32: { status: 'online' }
        }
      }
    });
    useSocketState.mockReturnValue({ socketConnected: true });
  });

  test('loads analytics data and renders chart section headings', async () => {
    api.get.mockImplementation((url) => {
      if (url === '/api/v1/reports/summary') {
        return Promise.resolve({
          data: {
            zones: [
              {
                zone_id: 'zone_01',
                zone_name: 'Main Pool',
                alert_count: 4,
                event_count: 10,
              },
            ],
            daily: [{ date: '2026-03-11', alert_count: 1, event_count: 2 }],
          },
        });
      }
      if (url === '/api/v1/events') {
        return Promise.resolve({
          data: {
            events: [
              {
                id: 'evt_1',
                zone_id: 'zone_01',
                alert_triggered: true,
                timestamp: new Date().toISOString(),
              },
            ],
          },
        });
      }
      return Promise.reject(new Error(`Unexpected URL: ${url}`));
    });

    render(<AnalyticsChart />);

    await waitFor(() => {
      expect(api.get).toHaveBeenCalledWith(
        '/api/v1/reports/summary',
        expect.objectContaining({ params: expect.any(Object) })
      );
    });

    expect(await screen.findByText(/incidents by time of day/i)).toBeInTheDocument();
    expect(screen.getByText(/detection frequency/i)).toBeInTheDocument();
  });

  test('renders error message when summary request fails', async () => {
    api.get.mockRejectedValue(new Error('network failed'));

    render(<AnalyticsChart />);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      /failed to load analytics data/i
    );
    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
  });
});
