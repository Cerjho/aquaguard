/**
 * Unit tests for RequireRole component
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import RequireRole from '../../../components/auth/RequireRole';

// Mock the useApi hook to prevent actual API calls
jest.mock('../../../hooks/useApi', () => ({
  __esModule: true,
  default: {
    get: jest.fn().mockRejectedValue(new Error('Not authenticated')),
    post: jest.fn(),
  },
}));

// Helper to render with AuthProvider and mock user
const renderWithAuth = (ui, { user = null } = {}) => {
  // Mock the AuthContext value
  const mockAuthValue = {
    currentUser: user,
    isAuthenticated: Boolean(user),
    isAdmin: user?.role === 'admin',
    canManageCameras: user?.role === 'admin',
    hasRole: (role) => user?.role === role,
    authError: null,
    loading: false,
    initializingSession: false,
    login: jest.fn(),
    logout: jest.fn(),
  };

  // Create a wrapper that provides the mock auth context
  const MockAuthProvider = ({ children }) => {
    const AuthContext = require('../../../context/AuthContext').default;
    return (
      <AuthContext.Provider value={mockAuthValue}>
        {children}
      </AuthContext.Provider>
    );
  };

  return render(ui, { wrapper: MockAuthProvider });
};

describe('RequireRole component', () => {
  const adminUser = { id: 1, username: 'admin', role: 'admin' };
  const lifeguardUser = { id: 2, username: 'lifeguard', role: 'lifeguard' };

  describe('when user has required role', () => {
    it('renders children for admin user with admin role required', () => {
      renderWithAuth(
        <RequireRole role="admin">
          <div data-testid="admin-content">Admin Only</div>
        </RequireRole>,
        { user: adminUser }
      );

      expect(screen.getByTestId('admin-content')).toBeInTheDocument();
      expect(screen.getByText('Admin Only')).toBeInTheDocument();
    });

    it('renders children for lifeguard user with lifeguard role required', () => {
      renderWithAuth(
        <RequireRole role="lifeguard">
          <div data-testid="lifeguard-content">Lifeguard Content</div>
        </RequireRole>,
        { user: lifeguardUser }
      );

      expect(screen.getByTestId('lifeguard-content')).toBeInTheDocument();
    });
  });

  describe('when user lacks required role', () => {
    it('does not render children for lifeguard when admin required', () => {
      renderWithAuth(
        <RequireRole role="admin">
          <div data-testid="admin-content">Admin Only</div>
        </RequireRole>,
        { user: lifeguardUser }
      );

      expect(screen.queryByTestId('admin-content')).not.toBeInTheDocument();
    });

    it('renders fallback content for lifeguard when admin required', () => {
      renderWithAuth(
        <RequireRole role="admin" fallback={<div data-testid="fallback">No Access</div>}>
          <div data-testid="admin-content">Admin Only</div>
        </RequireRole>,
        { user: lifeguardUser }
      );

      expect(screen.queryByTestId('admin-content')).not.toBeInTheDocument();
      expect(screen.getByTestId('fallback')).toBeInTheDocument();
      expect(screen.getByText('No Access')).toBeInTheDocument();
    });

    it('renders nothing when no fallback provided', () => {
      const { container } = renderWithAuth(
        <RequireRole role="admin">
          <div data-testid="admin-content">Admin Only</div>
        </RequireRole>,
        { user: lifeguardUser }
      );

      expect(screen.queryByTestId('admin-content')).not.toBeInTheDocument();
      expect(container.innerHTML).toBe('');
    });
  });

  describe('edge cases', () => {
    it('renders fallback when user is null', () => {
      renderWithAuth(
        <RequireRole role="admin" fallback={<div data-testid="fallback">Login Required</div>}>
          <div data-testid="admin-content">Admin Only</div>
        </RequireRole>,
        { user: null }
      );

      expect(screen.queryByTestId('admin-content')).not.toBeInTheDocument();
      expect(screen.getByTestId('fallback')).toBeInTheDocument();
    });

    it('handles multiple children', () => {
      renderWithAuth(
        <RequireRole role="admin">
          <div data-testid="child1">Child 1</div>
          <div data-testid="child2">Child 2</div>
        </RequireRole>,
        { user: adminUser }
      );

      expect(screen.getByTestId('child1')).toBeInTheDocument();
      expect(screen.getByTestId('child2')).toBeInTheDocument();
    });
  });
});
