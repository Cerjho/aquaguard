import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import DashboardPage from '../../pages/DashboardPage.jsx';

jest.mock('../../components/camera/CameraGrid.jsx', () => () => <div>Mock Camera Grid</div>);
jest.mock('../../components/events/DetectionFeed.jsx', () => () => <div>Mock Detection Feed</div>);
jest.mock('../../components/system/SystemStatus.jsx', () => () => <div>Mock System Status</div>);
jest.mock('../../components/camera/CameraManagementPanel.jsx', () => () => <div>Mock Camera Management</div>);
jest.mock('../../components/dashboard/StatsBar.jsx', () => () => <div>Mock Stats Bar</div>);

describe('DashboardPage', () => {
  test('keeps dashboard focused on monitoring and excludes camera management panel', () => {
    render(
      <MemoryRouter>
        <DashboardPage />
      </MemoryRouter>
    );

    expect(screen.getByText(/real-time pool monitoring/i)).toBeInTheDocument();
    expect(screen.getByText('Mock Camera Grid')).toBeInTheDocument();
    expect(screen.getByText('Mock Detection Feed')).toBeInTheDocument();
    expect(screen.getByText('Mock System Status')).toBeInTheDocument();
    expect(screen.getByText('Mock Stats Bar')).toBeInTheDocument();
    expect(screen.queryByText('Mock Camera Management')).not.toBeInTheDocument();
  });
});
