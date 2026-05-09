import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import ClipReviewControls from '../ClipReviewControls';
import useClipsApi from '../../../hooks/useClipsApi';
import { useAlertState } from '../../../context/AlertContext';

// Mock the hooks
jest.mock('../../../hooks/useClipsApi');
jest.mock('../../../context/AlertContext');

describe('ClipReviewControls', () => {
  const mockReviewClip = jest.fn();
  const mockDecrementPendingClips = jest.fn();
  const mockOnSuccess = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Default mock implementations
    useClipsApi.mockReturnValue({ reviewClip: mockReviewClip });
    useAlertState.mockReturnValue({ decrementPendingClips: mockDecrementPendingClips });
  });

  it('renders default state correctly', () => {
    render(<ClipReviewControls clipId="clip123" onSuccess={mockOnSuccess} />);
    
    expect(screen.getByText('Review Action')).toBeInTheDocument();
    expect(screen.getByText('Dismiss False Alarm')).toBeInTheDocument();
    expect(screen.getByText('Confirm Drowning')).toBeInTheDocument();
    expect(screen.getByText('+ Add Notes')).toBeInTheDocument();
    expect(screen.queryByPlaceholderText('Optional notes about this clip...')).not.toBeInTheDocument();
  });

  it('toggles notes textarea when Add Notes is clicked', () => {
    render(<ClipReviewControls clipId="clip123" onSuccess={mockOnSuccess} />);
    
    const addNotesBtn = screen.getByText('+ Add Notes');
    fireEvent.click(addNotesBtn);
    
    expect(screen.getByPlaceholderText('Optional notes about this clip...')).toBeInTheDocument();
    expect(screen.getByText('Hide Notes')).toBeInTheDocument();
    
    fireEvent.click(screen.getByText('Hide Notes'));
    expect(screen.queryByPlaceholderText('Optional notes about this clip...')).not.toBeInTheDocument();
  });

  it('handles successful confirm review', async () => {
    mockReviewClip.mockResolvedValueOnce({});
    
    render(<ClipReviewControls clipId="clip123" onSuccess={mockOnSuccess} />);
    
    fireEvent.click(screen.getByText('Confirm Drowning'));
    
    expect(mockReviewClip).toHaveBeenCalledWith('clip123', 'confirmed', '');
    expect(screen.getByText('Saving...')).toBeInTheDocument();
    
    await waitFor(() => {
      expect(mockDecrementPendingClips).toHaveBeenCalledWith('clip123');
      expect(mockOnSuccess).toHaveBeenCalled();
    });
  });

  it('handles successful dismiss review with notes', async () => {
    mockReviewClip.mockResolvedValueOnce({});
    
    render(<ClipReviewControls clipId="clip123" onSuccess={mockOnSuccess} />);
    
    // Add notes
    fireEvent.click(screen.getByText('+ Add Notes'));
    fireEvent.change(screen.getByPlaceholderText('Optional notes about this clip...'), { target: { value: 'Test note' } });
    
    // Dismiss
    fireEvent.click(screen.getByText('Dismiss False Alarm'));
    
    expect(mockReviewClip).toHaveBeenCalledWith('clip123', 'dismissed', 'Test note');
    
    await waitFor(() => {
      expect(mockDecrementPendingClips).toHaveBeenCalledWith('clip123');
      expect(mockOnSuccess).toHaveBeenCalled();
    });
  });

  it('displays error message and handles failure', async () => {
    const errorResponse = {
      response: { data: { message: 'Network error occurred' } }
    };
    mockReviewClip.mockRejectedValueOnce(errorResponse);
    
    render(<ClipReviewControls clipId="clip123" onSuccess={mockOnSuccess} />);
    
    fireEvent.click(screen.getByText('Confirm Drowning'));
    
    await waitFor(() => {
      expect(screen.getByText('Network error occurred')).toBeInTheDocument();
      expect(mockDecrementPendingClips).not.toHaveBeenCalled();
      expect(mockOnSuccess).not.toHaveBeenCalled();
    });
    
    // Buttons should be re-enabled
    expect(screen.getByText('Confirm Drowning')).not.toBeDisabled();
    expect(screen.getByText('Dismiss False Alarm')).not.toBeDisabled();
  });
});
