import React from 'react';
import { render, screen, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import { AlertProvider, useAlertState } from '../AlertContext';
import { useAuth } from '../AuthContext';
import useAlertSocket from '../../hooks/useAlertSocket';
import api from '../../hooks/useApi';

// Mock dependencies
jest.mock('../AuthContext');
jest.mock('../../hooks/useAlertSocket');
jest.mock('../../hooks/useApi');

// Test component to access context
const TestComponent = () => {
  const { pendingClips, pendingClipsCount, decrementPendingClips } = useAlertState();
  return (
    <div>
      <div data-testid="pending-count">{pendingClipsCount}</div>
      <div data-testid="clips-length">{pendingClips.length}</div>
      <div data-testid="clips-list">{pendingClips.map(c => c.clip_id).join(',')}</div>
      <button onClick={() => decrementPendingClips('clip1')}>Decrement clip1</button>
    </div>
  );
};

describe('AlertContext - Clips', () => {
  let socketCallback;

  beforeEach(() => {
    jest.clearAllMocks();
    
    useAuth.mockReturnValue({ isAuthenticated: true, initializingSession: false });
    
    // Capture the socket callbacks passed to useAlertSocket
    useAlertSocket.mockImplementation((config) => {
      socketCallback = config;
    });
    
    api.get.mockResolvedValue({
      data: {
        data: {
          clips: [],
          total: 0
        }
      }
    });
  });

  it('initializes with empty clips', async () => {
    await act(async () => {
      render(
        <AlertProvider>
          <TestComponent />
        </AlertProvider>
      );
    });
    
    expect(screen.getByTestId('pending-count')).toHaveTextContent('0');
    expect(screen.getByTestId('clips-length')).toHaveTextContent('0');
  });

  it('adds clip via socket and increments count', async () => {
    await act(async () => {
      render(
        <AlertProvider>
          <TestComponent />
        </AlertProvider>
      );
    });
    
    await act(async () => {
      socketCallback.onClipReady({ clip_id: 'clip1' });
    });
    
    expect(screen.getByTestId('pending-count')).toHaveTextContent('1');
    expect(screen.getByTestId('clips-length')).toHaveTextContent('1');
    expect(screen.getByTestId('clips-list')).toHaveTextContent('clip1');
  });

  it('deduplicates identical clip_ids via socket', async () => {
    await act(async () => {
      render(
        <AlertProvider>
          <TestComponent />
        </AlertProvider>
      );
    });
    
    await act(async () => {
      socketCallback.onClipReady({ clip_id: 'clip1' });
    });
    await act(async () => {
      socketCallback.onClipReady({ clip_id: 'clip1' });
    });
    
    expect(screen.getByTestId('pending-count')).toHaveTextContent('1');
    expect(screen.getByTestId('clips-length')).toHaveTextContent('1');
  });

  it('loads clips from API correctly and deduplicates', async () => {
    // API returns clip1 and clip2, total 2
    api.get.mockResolvedValueOnce({
      data: {
        data: {
          clips: [{ clip_id: 'clip1' }, { clip_id: 'clip2' }],
          total: 2
        }
      }
    });
    
    await act(async () => {
      render(
        <AlertProvider>
          <TestComponent />
        </AlertProvider>
      );
    });
    
    expect(screen.getByTestId('pending-count')).toHaveTextContent('2');
    expect(screen.getByTestId('clips-length')).toHaveTextContent('2');
    
    // Sort array in test to ignore order
    const listContent = screen.getByTestId('clips-list').textContent.split(',').sort().join(',');
    expect(listContent).toBe('clip1,clip2');
    
    // Now receive clip2 via socket (should deduplicate)
    await act(async () => {
      socketCallback.onClipReady({ clip_id: 'clip2' });
    });
    
    expect(screen.getByTestId('pending-count')).toHaveTextContent('2');
    expect(screen.getByTestId('clips-length')).toHaveTextContent('2');
  });

  it('decrements pending clips successfully', async () => {
    api.get.mockResolvedValueOnce({
      data: {
        data: {
          clips: [{ clip_id: 'clip1' }, { clip_id: 'clip2' }],
          total: 2
        }
      }
    });
    
    await act(async () => {
      render(
        <AlertProvider>
          <TestComponent />
        </AlertProvider>
      );
    });
    
    expect(screen.getByTestId('pending-count')).toHaveTextContent('2');
    
    await act(async () => {
      screen.getByText('Decrement clip1').click();
    });
    
    expect(screen.getByTestId('pending-count')).toHaveTextContent('1');
    expect(screen.getByTestId('clips-length')).toHaveTextContent('1');
    const listContentAfter = screen.getByTestId('clips-list').textContent;
    expect(listContentAfter === 'clip1' || listContentAfter === 'clip2').toBeTruthy();
  });
});
