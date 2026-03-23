import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import CameraManagementPanel from './CameraManagementPanel';
import api from '../../hooks/useApi';

jest.mock('../../hooks/useApi', () => ({
  __esModule: true,
  default: {
    get: jest.fn(),
    post: jest.fn(),
    put: jest.fn(),
  },
}));

describe('CameraManagementPanel', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('loads cameras with include_inactive=true and toggles active status', async () => {
    api.get.mockResolvedValueOnce({
      data: [
        { zone_id: 'zone_01', zone_name: 'Main Pool', rtsp_url: 'rtsp://one', is_active: true },
        { zone_id: 'zone_02', zone_name: 'Kiddie Pool', rtsp_url: 'rtsp://two', is_active: false },
      ],
    });
    api.put.mockResolvedValueOnce({ data: {} });
    api.get.mockResolvedValueOnce({
      data: [
        { zone_id: 'zone_01', zone_name: 'Main Pool', rtsp_url: 'rtsp://one', is_active: true },
        { zone_id: 'zone_02', zone_name: 'Kiddie Pool', rtsp_url: 'rtsp://two', is_active: true },
      ],
    });

    render(<CameraManagementPanel />);

    await waitFor(() => {
      expect(api.get).toHaveBeenCalledWith('/api/v1/cameras', {
        params: { include_inactive: true },
      });
    });

    fireEvent.click(await screen.findByRole('button', { name: /activate camera kiddie pool/i }));
    await waitFor(() => {
      expect(api.put).toHaveBeenCalledWith('/api/v1/cameras/zone_02', { is_active: true });
    });
  });

  test('adds and edits camera details with success feedback', async () => {
    const onCamerasChanged = jest.fn();

    api.get
      .mockResolvedValueOnce({
        data: [{ zone_id: 'zone_01', zone_name: 'Main Pool', rtsp_url: 'rtsp://one', is_active: true }],
      })
      .mockResolvedValueOnce({
        data: [
          { zone_id: 'zone_01', zone_name: 'Main Pool', rtsp_url: 'rtsp://one', is_active: true },
          { zone_id: 'zone_03', zone_name: 'Training Pool', rtsp_url: 'rtsp://three', is_active: true },
        ],
      })
      .mockResolvedValueOnce({
        data: [
          { zone_id: 'zone_01', zone_name: 'Main Pool Updated', rtsp_url: 'rtsp://one-new', is_active: true },
          { zone_id: 'zone_03', zone_name: 'Training Pool', rtsp_url: 'rtsp://three', is_active: true },
        ],
      });

    api.post.mockResolvedValueOnce({ data: {} });
    api.put.mockResolvedValueOnce({ data: {} });

    render(<CameraManagementPanel onCamerasChanged={onCamerasChanged} />);

    fireEvent.click(await screen.findByRole('button', { name: /add camera/i }));

    fireEvent.change(screen.getByLabelText(/zone id/i), { target: { value: 'zone_03' } });
    fireEvent.change(screen.getByLabelText(/zone name/i), { target: { value: 'Training Pool' } });
    fireEvent.change(screen.getByLabelText(/rtsp url/i), { target: { value: 'rtsp://three' } });
    fireEvent.click(screen.getByRole('button', { name: /create camera/i }));

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith('/api/v1/cameras', expect.objectContaining({
        zone_id: 'zone_03',
        zone_name: 'Training Pool',
      }));
    });
    expect(await screen.findByText(/camera zone_03 added/i)).toBeInTheDocument();

    fireEvent.click(screen.getAllByRole('button', { name: 'Edit' })[0]);
    fireEvent.change(screen.getByLabelText(/zone name/i), { target: { value: 'Main Pool Updated' } });
    fireEvent.change(screen.getByLabelText(/rtsp url/i), { target: { value: 'rtsp://one-new' } });
    fireEvent.click(screen.getByRole('button', { name: /save changes/i }));

    await waitFor(() => {
      expect(api.put).toHaveBeenCalledWith('/api/v1/cameras/zone_01', expect.objectContaining({
        zone_name: 'Main Pool Updated',
        rtsp_url: 'rtsp://one-new',
      }));
    });
    expect(await screen.findByText(/camera zone_01 updated/i)).toBeInTheDocument();
    expect(onCamerasChanged).toHaveBeenCalledTimes(2);
  });
});
