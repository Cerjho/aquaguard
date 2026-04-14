import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import SystemPage from '../../pages/SystemPage.jsx';

const mockCameraGrid = jest.fn();
const mockCameraManagementPanel = jest.fn();
const mockSystemStatus = jest.fn();

jest.mock('../../components/system/SystemStatus.jsx', () => () => {
  mockSystemStatus();
  return <div>Mock System Status</div>;
});

jest.mock('../../components/camera/CameraGrid.jsx', () => (props) => {
  mockCameraGrid(props);
  return <div>Mock Camera Grid</div>;
});

jest.mock('../../components/camera/CameraManagementPanel.jsx', () => (props) => {
  mockCameraManagementPanel(props);
  return (
    <button type="button" onClick={props.onCamerasChanged}>
      Trigger Cameras Changed
    </button>
  );
});

describe('SystemPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('renders system status and camera management in separated sections', () => {
    render(<SystemPage />);

    expect(screen.getByRole('heading', { name: /system health/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /camera operations & configuration/i })).toBeInTheDocument();
    expect(screen.getByText('Mock System Status')).toBeInTheDocument();
    expect(screen.getByText('Trigger Cameras Changed')).toBeInTheDocument();
    expect(screen.getByText('Mock Camera Grid')).toBeInTheDocument();
  });

  test('wires camera management changes to camera grid reload token', () => {
    render(<SystemPage />);

    expect(mockCameraGrid).toHaveBeenCalledWith(
      expect.objectContaining({ reloadToken: 0 })
    );

    fireEvent.click(screen.getByRole('button', { name: /trigger cameras changed/i }));

    expect(mockCameraGrid).toHaveBeenLastCalledWith(
      expect.objectContaining({ reloadToken: 1 })
    );
  });
});
