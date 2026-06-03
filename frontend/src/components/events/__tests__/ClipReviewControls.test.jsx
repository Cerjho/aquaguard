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
    expect(screen.getByText('DISMISS FALSE ALARM')).toBeInTheDocument();
    expect(screen.getByText('CONFIRM DROWNING')).toBeInTheDocument();
    expect(screen.getByText('+ ADD NOTES')).toBeInTheDocument();
    expect(screen.queryByPlaceholderText('OPTIONAL NOTES ABOUT THIS CLIP...')).not.toBeInTheDocument();
  });

  it('toggles notes textarea when Add Notes is clicked', () => {
    render(<ClipReviewControls clipId="clip123" onSuccess={mockOnSuccess} />);
    
    const addNotesBtn = screen.getByText('+ ADD NOTES');
    fireEvent.click(addNotesBtn);
    
    expect(screen.getByPlaceholderText('OPTIONAL NOTES ABOUT THIS CLIP...')).toBeInTheDocument();
    expect(screen.getByText('HIDE NOTES')).toBeInTheDocument();
    
    fireEvent.click(screen.getByText('HIDE NOTES'));
    expect(screen.queryByPlaceholderText('OPTIONAL NOTES ABOUT THIS CLIP...')).not.toBeInTheDocument();
  });

  it('handles successful confirm review', async () => {
    mockReviewClip.mockResolvedValueOnce({});
    
    render(<ClipReviewControls clipId="clip123" onSuccess={mockOnSuccess} />);
    
    fireEvent.click(screen.getByText('CONFIRM DROWNING'));
    
    expect(mockReviewClip).toHaveBeenCalledWith('clip123', 'confirmed', '');
    expect(screen.getByText('SAVING...')).toBeInTheDocument();
    
    await waitFor(() => {
      expect(mockDecrementPendingClips).toHaveBeenCalledWith('clip123');
      expect(mockOnSuccess).toHaveBeenCalled();
    });
  });

  it('handles successful dismiss review with notes', async () => {
    mockReviewClip.mockResolvedValueOnce({});
    
    render(<ClipReviewControls clipId="clip123" onSuccess={mockOnSuccess} />);
    
    // Add notes
    fireEvent.click(screen.getByText('+ ADD NOTES'));
    fireEvent.change(screen.getByPlaceholderText('OPTIONAL NOTES ABOUT THIS CLIP...'), { target: { value: 'Test note' } });
    
    // Dismiss
    fireEvent.click(screen.getByText('DISMISS FALSE ALARM'));
    
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
    
    fireEvent.click(screen.getByText('CONFIRM DROWNING'));
    
    await waitFor(() => {
      expect(screen.getByText('Network error occurred')).toBeInTheDocument();
      expect(mockDecrementPendingClips).not.toHaveBeenCalled();
      expect(mockOnSuccess).not.toHaveBeenCalled();
    });
    
    // Buttons should be re-enabled
    expect(screen.getByText('CONFIRM DROWNING')).not.toBeDisabled();
    expect(screen.getByText('DISMISS FALSE ALARM')).not.toBeDisabled();
  });
});
