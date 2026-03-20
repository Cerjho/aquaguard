import React from 'react';
import { render, waitFor, fireEvent, screen } from '@testing-library/react';
import AnalyticsChart from './AnalyticsChart';
import api from '../../hooks/useApi';
import { useAlerts } from '../../context/AlertContext';

const mockNavigate = jest.fn();

jest.mock('../../hooks/useApi', () => ({
  __esModule: true,
  default: {
    get: jest.fn(),
  },
}));

jest.mock('../../context/AlertContext', () => ({
  useAlerts: jest.fn(),
}));

jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => mockNavigate,
}));

jest.mock('recharts', () => {
  const React = require('react');
  return {
    ResponsiveContainer: ({ children }) => <div>{children}</div>,
    BarChart: ({ children, onClick }) => <button onClick={() => onClick?.({ activePayload: [{ payload: { zoneId: 'zone_01', zone: 'Main Pool' } }] })} data-testid="bar-chart">{children}</button>,
    LineChart: ({ children, onClick }) => <button onClick={() => onClick?.({ activePayload: [{ payload: { date: '2026-03-11' } }] })} data-testid="line-chart">{children}</button>,
    Bar: () => null,
    Line: () => null,
    XAxis: () => null,
    YAxis: () => null,
    CartesianGrid: () => null,
    Tooltip: () => null,
    Legend: () => null,
  };
});

describe('AnalyticsChart drilldown', () => {
  const setTriageFilters = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    useAlerts.mockReturnValue({ setTriageFilters });
    api.get.mockResolvedValue({
      data: {
        zones: [{ zone_id: 'zone_01', zone_name: 'Main Pool', alert_count: 4, event_count: 10 }],
        daily: [{ date: '2026-03-11', alert_count: 1, event_count: 2 }],
      },
    });
  });

  test('clicking zone/day applies triage filters and navigates to incidents', async () => {
    render(<AnalyticsChart />);

    await waitFor(() => expect(api.get).toHaveBeenCalled());
    await screen.findByTestId('bar-chart');

    fireEvent.click(screen.getByTestId('bar-chart'));
    expect(setTriageFilters).toHaveBeenCalledWith({ zone_id: 'zone_01' });
    expect(mockNavigate).toHaveBeenCalledWith('/incidents');

    fireEvent.click(screen.getByTestId('line-chart'));
    expect(setTriageFilters).toHaveBeenCalledWith(expect.objectContaining({ from: expect.any(String), to: expect.any(String) }));
    expect(mockNavigate).toHaveBeenCalledWith('/incidents');
  });
});

