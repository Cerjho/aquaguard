import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import AlertPanel, { resolveSnapshotUrl } from '../../../components/alerts/AlertPanel.jsx';
import * as AlertContext from '../../../context/AlertContext.jsx';

// Prevent axios ESM import errors from transitive deps
jest.mock('../../../hooks/useApi', () => ({ post: jest.fn(), get: jest.fn() }));
// Prevent useAlertSocket from connecting during tests
jest.mock('../../../hooks/useAlertSocket', () => jest.fn());

// Mock Audio — jsdom doesn't implement it
beforeAll(() => {
  global.Audio = jest.fn().mockImplementation(() => ({
    play: jest.fn().mockResolvedValue(undefined),
    pause: jest.fn(),
    loop: false,
    volume: 1,
  }));
});

const mockAcknowledge = jest.fn();

function renderAlertPanel(contextOverrides = {}) {
  jest.spyOn(AlertContext, 'useAlertState').mockReturnValue({
    activeAlert: null,
    activeAlerts: [],
    acknowledge: mockAcknowledge,
    acknowledgingAlertId: null,
    acknowledgeError: null,
    dismissActive: jest.fn(),
    ...contextOverrides,
  });
  return render(<AlertPanel />);
}

afterEach(() => {
  jest.restoreAllMocks();
  mockAcknowledge.mockReset();
});

beforeEach(() => {
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});

const sampleAlert = {
  id: 1,
  zone_id: 'zone_01',
  zone_name: 'Pool A',
  confidence: 0.92,
  alerted_at: '2024-01-01T10:00:00Z',
  frame_snapshot_path: null,
};

describe('AlertPanel', () => {
  test('renders nothing when there is no active alert', () => {
    const { container } = renderAlertPanel({ activeAlert: null });
    expect(container).toBeEmptyDOMElement();
  });

  test('renders non-blocking alert banner when activeAlert is set', () => {
    renderAlertPanel({ activeAlert: sampleAlert });
    expect(screen.getByRole('status', { name: /active drowning alerts/i })).toBeInTheDocument();
    expect(screen.getByText(/active alert/i)).toBeInTheDocument();
  });

  test('displays active zone name chips', () => {
    renderAlertPanel({ activeAlert: sampleAlert });
    expect(screen.getByRole('button', { name: 'Pool A' })).toBeInTheDocument();
  });

  test('calls acknowledge with oldest unacknowledged alert id', () => {
    renderAlertPanel({
      activeAlert: sampleAlert,
      activeAlerts: [
        { ...sampleAlert, id: 11, zone_id: 'zone_01', zone_name: 'Pool A' },
        { ...sampleAlert, id: 22, zone_id: 'zone_02', zone_name: 'Pool B' },
      ],
    });
    fireEvent.click(screen.getByRole('button', { name: /acknowledge oldest/i }));
    expect(mockAcknowledge).toHaveBeenCalledWith(22);
  });

  test('keyboard A acknowledges the oldest unacknowledged alert', () => {
    renderAlertPanel({
      activeAlert: sampleAlert,
      activeAlerts: [
        { ...sampleAlert, id: 10, zone_id: 'zone_01', zone_name: 'Pool A' },
        { ...sampleAlert, id: 20, zone_id: 'zone_02', zone_name: 'Pool B' },
      ],
    });
    fireEvent.keyDown(window, { key: 'a' });
    expect(mockAcknowledge).toHaveBeenCalledWith(20);
  });

  test('Esc dismisses banner without acknowledging', () => {
    renderAlertPanel({ activeAlert: sampleAlert });
    expect(screen.getByRole('status', { name: /active drowning alerts/i })).toBeInTheDocument();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('status', { name: /active drowning alerts/i })).not.toBeInTheDocument();
    expect(mockAcknowledge).not.toHaveBeenCalled();
  });

  test('shows acknowledge error banner when present', () => {
    renderAlertPanel({
      activeAlert: sampleAlert,
      acknowledgeError: 'Acknowledge failed.',
    });
    expect(screen.getByText('Acknowledge failed.')).toBeInTheDocument();
  });

  test('clicking zone chip scrolls to camera card', () => {
    const scrollIntoView = jest.fn();
    const getElementByIdSpy = jest.spyOn(document, 'getElementById').mockReturnValue({
      scrollIntoView,
    });

    renderAlertPanel({ activeAlert: sampleAlert });
    fireEvent.click(screen.getByRole('button', { name: 'Pool A' }));

    expect(getElementByIdSpy).toHaveBeenCalledWith('camera-card-zone_01');
    expect(scrollIntoView).toHaveBeenCalled();
  });

  describe('resolveSnapshotUrl', () => {
    test('returns absolute http/https snapshot path as-is', () => {
      expect(
        resolveSnapshotUrl('https://cdn.example.com/snapshots/frame.jpg', 'http://api.example.com')
      ).toBe('https://cdn.example.com/snapshots/frame.jpg');
      expect(
        resolveSnapshotUrl('http://cdn.example.com/snapshots/frame.jpg', 'http://api.example.com')
      ).toBe('http://cdn.example.com/snapshots/frame.jpg');
    });

    test('joins relative path with api base without duplicate slashes', () => {
      expect(resolveSnapshotUrl('/snapshots/frame.jpg', 'http://api.example.com/'))
        .toBe('http://api.example.com/snapshots/frame.jpg');
      expect(resolveSnapshotUrl('snapshots/frame.jpg', 'http://api.example.com///'))
        .toBe('http://api.example.com/snapshots/frame.jpg');
    });

    test('returns sensible relative path when api base is missing', () => {
      expect(resolveSnapshotUrl('/snapshots/frame.jpg', '')).toBe('/snapshots/frame.jpg');
      expect(resolveSnapshotUrl('snapshots/frame.jpg', '')).toBe('/snapshots/frame.jpg');
      expect(resolveSnapshotUrl('snapshots/frame.jpg', '   ')).toBe('/snapshots/frame.jpg');
    });
  });
});
