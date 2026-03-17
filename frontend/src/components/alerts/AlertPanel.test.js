import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import AlertPanel from './AlertPanel';
import * as AlertContext from '../../context/AlertContext';

// Prevent axios ESM import errors from transitive deps
jest.mock('../../hooks/useApi', () => ({ post: jest.fn(), get: jest.fn() }));
// Prevent useAlertSocket from connecting during tests
jest.mock('../../hooks/useAlertSocket', () => jest.fn());

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
  jest.spyOn(AlertContext, 'useAlerts').mockReturnValue({
    activeAlert: null,
    acknowledge: mockAcknowledge,
    ...contextOverrides,
  });
  return render(<AlertPanel />);
}

afterEach(() => {
  jest.restoreAllMocks();
  mockAcknowledge.mockReset();
});

const sampleAlert = {
  id: 1,
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

  test('renders alert dialog when activeAlert is set', () => {
    renderAlertPanel({ activeAlert: sampleAlert });
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
    expect(screen.getByText(/drowning alert/i)).toBeInTheDocument();
  });

  test('displays zone name', () => {
    renderAlertPanel({ activeAlert: sampleAlert });
    expect(screen.getByText('Pool A')).toBeInTheDocument();
  });

  test('displays confidence as percentage', () => {
    renderAlertPanel({ activeAlert: sampleAlert });
    expect(screen.getByText('92.0%')).toBeInTheDocument();
  });

  test('calls acknowledge with alert id when button is clicked', () => {
    renderAlertPanel({ activeAlert: sampleAlert });
    fireEvent.click(screen.getByRole('button', { name: /acknowledge alert/i }));
    expect(mockAcknowledge).toHaveBeenCalledWith(1);
  });

  test('shows dash for confidence when confidence is null', () => {
    renderAlertPanel({ activeAlert: { ...sampleAlert, confidence: null } });
    expect(screen.getByText('—')).toBeInTheDocument();
  });
});
