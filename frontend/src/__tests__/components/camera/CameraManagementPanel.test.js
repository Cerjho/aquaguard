import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import CameraManagementPanel from '../../../components/camera/CameraManagementPanel.jsx';
import api from '../../../hooks/useApi';

jest.mock('../../../hooks/useApi', () => ({
  __esModule: true,
  default: {
    get: jest.fn(),
    post: jest.fn(),
    put: jest.fn(),
    delete: jest.fn(),
  },
}));

describe('CameraManagementPanel', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('loads cameras and toggles active status from the actions menu', async () => {
    api.get.mockResolvedValueOnce({
      data: [
        {
          zone_id: 'zone_01',
          zone_name: 'Main Pool',
          rtsp_url: 'rtsp://one',
          status: 'active',
        },
        {
          zone_id: 'zone_02',
          zone_name: 'Kiddie Pool',
          rtsp_url: 'rtsp://two',
          status: 'inactive',
        },
      ],
    });
    api.put.mockResolvedValueOnce({ data: { status: 'active' } });

    render(<CameraManagementPanel />);

    await waitFor(() => {
      expect(api.get).toHaveBeenCalledWith('/api/v1/cameras', {
        params: { include_inactive: true },
      });
    });

    fireEvent.click(
      await screen.findByRole('button', {
        name: /open actions menu for kiddie pool/i,
      })
    );
    fireEvent.click(
      await screen.findByRole('button', {
        name: /activate camera kiddie pool/i,
      })
    );

    await waitFor(() => {
      expect(api.put).toHaveBeenCalledWith('/api/v1/cameras/zone_02', {
        status: 'active',
      });
    });
  });

  test('adds and edits camera details with success feedback', async () => {
    const onCamerasChanged = jest.fn();

    api.get.mockResolvedValueOnce({
      data: [
        {
          zone_id: 'zone_01',
          zone_name: 'Main Pool',
          rtsp_url: 'rtsp://one',
          status: 'active',
        },
      ],
    });

    api.post.mockResolvedValueOnce({
      data: {
        zone_id: 'zone_03',
        zone_name: 'Training Pool',
        rtsp_url: 'rtsp://three',
        status: 'active',
      },
    });

    api.put.mockResolvedValueOnce({
      data: {
        zone_id: 'zone_01',
        zone_name: 'Main Pool Updated',
        rtsp_url: 'rtsp://one-new',
        status: 'active',
      },
    });

    render(<CameraManagementPanel onCamerasChanged={onCamerasChanged} />);

    fireEvent.click(await screen.findByRole('button', { name: /add camera/i }));

    fireEvent.change(screen.getByLabelText(/^zone$/i), {
      target: { value: 'zone_03' },
    });
    fireEvent.change(screen.getByLabelText(/camera name/i), {
      target: { value: 'Training Pool' },
    });
    fireEvent.change(screen.getByLabelText(/rtsp \/ webcam url/i), {
      target: { value: 'rtsp://three' },
    });
    fireEvent.click(screen.getByRole('button', { name: /save camera/i }));

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith(
        '/api/v1/cameras',
        expect.objectContaining({
          zone_id: 'zone_03',
          zone_name: 'Training Pool',
          rtsp_url: 'rtsp://three',
        })
      );
    });

    expect(await screen.findByText(/camera zone_03 added\./i)).toBeInTheDocument();

    fireEvent.click(
      await screen.findByRole('button', { name: /open actions menu for main pool/i })
    );
    fireEvent.click(await screen.findByRole('button', { name: /^edit/i }));

    fireEvent.change(screen.getByLabelText(/camera name/i), {
      target: { value: 'Main Pool Updated' },
    });
    fireEvent.change(screen.getByLabelText(/rtsp \/ webcam url/i), {
      target: { value: 'rtsp://one-new' },
    });
    fireEvent.click(screen.getByRole('button', { name: /save camera/i }));

    await waitFor(() => {
      expect(api.put).toHaveBeenCalledWith(
        '/api/v1/cameras/zone_01',
        expect.objectContaining({
          zone_name: 'Main Pool Updated',
          rtsp_url: 'rtsp://one-new',
        })
      );
    });

    expect(await screen.findByText(/camera zone_01 updated\./i)).toBeInTheDocument();
    expect(onCamerasChanged).toHaveBeenCalledTimes(2);
  });

  test('soft deletes inactive camera and hides it from the list', async () => {
    api.get
      .mockResolvedValueOnce({
        data: [
          {
            zone_id: 'zone_02',
            zone_name: 'Kiddie Pool',
            rtsp_url: 'rtsp://two',
            status: 'inactive',
          },
        ],
      })
      .mockResolvedValueOnce({
        data: [
          {
            zone_id: 'zone_02',
            zone_name: 'Kiddie Pool',
            rtsp_url: 'rtsp://two',
            status: 'inactive',
          },
        ],
      })
      .mockResolvedValueOnce({ data: [] });

    api.delete.mockResolvedValueOnce({
      data: {
        message: 'Camera zone_02 soft deleted',
      },
    });

    render(<CameraManagementPanel />);

    await screen.findByText('Kiddie Pool');

    fireEvent.click(
      await screen.findByRole('button', {
        name: /open actions menu for kiddie pool/i,
      })
    );
    fireEvent.click(await screen.findByRole('button', { name: /delete/i }));
    fireEvent.click(await screen.findByRole('button', { name: /confirm deletion/i }));

    await waitFor(() => {
      expect(api.delete).toHaveBeenCalledWith('/api/v1/cameras/zone_02');
    });

    await waitFor(() => {
      expect(screen.queryByText('Kiddie Pool')).not.toBeInTheDocument();
    });
  });

  test('opens camera details drawer when a row is clicked', async () => {
    api.get.mockResolvedValueOnce({
      data: [
        {
          zone_id: 'zone_01',
          zone_name: 'Main Pool',
          rtsp_url: 'rtsp://one',
          location_description: 'North wing',
          frame_rate: 25,
          resolution: '1920x1080',
          status: 'active',
        },
      ],
    });

    render(<CameraManagementPanel />);

    fireEvent.click(await screen.findByText('Main Pool'));

    expect(await screen.findByTestId('camera-detail-drawer')).toBeInTheDocument();
    expect(screen.getByText('North wing')).toBeInTheDocument();
    expect(screen.getByText('1920x1080')).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText(/close camera details/i));

    await waitFor(() => {
      expect(screen.queryByTestId('camera-detail-drawer')).not.toBeInTheDocument();
    });
  });

  test('supports keyboard shortcuts in actions menu', async () => {
    api.get.mockResolvedValueOnce({
      data: [
        {
          zone_id: 'zone_01',
          zone_name: 'Main Pool',
          rtsp_url: 'rtsp://one',
          status: 'active',
        },
      ],
    });
    api.put.mockResolvedValueOnce({ data: { status: 'inactive' } });

    render(<CameraManagementPanel />);

    fireEvent.click(
      await screen.findByRole('button', {
        name: /open actions menu for main pool/i,
      })
    );

    fireEvent.keyDown(document, { key: 't', ctrlKey: true, altKey: true });

    await waitFor(() => {
      expect(api.put).toHaveBeenCalledWith('/api/v1/cameras/zone_01', {
        status: 'inactive',
      });
    });

    fireEvent.click(
      await screen.findByRole('button', {
        name: /open actions menu for main pool/i,
      })
    );

    fireEvent.keyDown(document, { key: 'Delete' });

    expect(await screen.findByRole('heading', { name: /remove camera/i })).toBeInTheDocument();
  });
});
