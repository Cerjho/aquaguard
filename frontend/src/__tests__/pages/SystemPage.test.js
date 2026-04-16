import React from 'react';
import { render, screen } from '@testing-library/react';
import SystemPage from '../../pages/SystemPage.jsx';

const mockCameraManagementPanel = jest.fn();
const mockSystemStatus = jest.fn();

jest.mock('../../components/system/SystemStatus.jsx', () => () => {
  mockSystemStatus();
  return <div>Mock System Status</div>;
});

jest.mock('../../components/camera/CameraManagementPanel.jsx', () => (props) => {
  mockCameraManagementPanel(props);
  return <button type="button">Mock Camera Management</button>;
});

describe('SystemPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('renders system status page header and sections', () => {
    render(<SystemPage />);

    expect(screen.getByRole('heading', { name: /system status/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /system health/i })).toBeInTheDocument();
    expect(screen.getByText('Mock System Status')).toBeInTheDocument();
    expect(screen.getByText('Mock Camera Management')).toBeInTheDocument();
  });

  test('mounts child components for status and camera management', () => {
    render(<SystemPage />);

    expect(mockSystemStatus).toHaveBeenCalledTimes(1);
    expect(mockCameraManagementPanel).toHaveBeenCalledTimes(1);
  });
});
