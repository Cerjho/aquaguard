import React from 'react';
import { render, screen, act, waitFor } from '@testing-library/react';
import { AuthProvider, useAuth } from './AuthContext';
import api from '../hooks/useApi';

jest.mock('../hooks/useApi', () => ({
  post: jest.fn(),
}));

function TestConsumer() {
  const { isAuthenticated, currentUser, authError, loading, login, logout } = useAuth();
  return (
    <div>
      <span data-testid="isAuthenticated">{String(isAuthenticated)}</span>
      <span data-testid="currentUser">{currentUser ? currentUser.username : 'null'}</span>
      <span data-testid="authError">{authError || ''}</span>
      <span data-testid="loading">{String(loading)}</span>
      <button onClick={() => login('admin', 'pass')}>Login</button>
      <button onClick={() => logout()}>Logout</button>
    </div>
  );
}

function renderWithProvider() {
  return render(
    <AuthProvider>
      <TestConsumer />
    </AuthProvider>
  );
}

beforeEach(() => {
  localStorage.clear();
  jest.clearAllMocks();
});

describe('AuthContext', () => {
  test('provides isAuthenticated=false by default', () => {
    renderWithProvider();
    expect(screen.getByTestId('isAuthenticated')).toHaveTextContent('false');
  });

  test('provides currentUser=null by default', () => {
    renderWithProvider();
    expect(screen.getByTestId('currentUser')).toHaveTextContent('null');
  });

  test('login sets currentUser and stores token on success', async () => {
    api.post.mockResolvedValue({
      data: { access_token: 'jwt123', user: { id: 1, username: 'admin' } },
    });

    renderWithProvider();
    await act(async () => {
      screen.getByText('Login').click();
    });

    await waitFor(() => {
      expect(screen.getByTestId('currentUser')).toHaveTextContent('admin');
    });
    expect(localStorage.getItem('token')).toBe('jwt123');
  });

  test('login sets authError on failure', async () => {
    api.post.mockRejectedValue({
      response: { data: { message: 'Invalid credentials' } },
    });

    renderWithProvider();
    await act(async () => {
      screen.getByText('Login').click();
    });

    await waitFor(() => {
      expect(screen.getByTestId('authError')).toHaveTextContent('Invalid credentials');
    });
    expect(screen.getByTestId('currentUser')).toHaveTextContent('null');
  });

  test('logout clears currentUser and localStorage', async () => {
    localStorage.setItem('token', 'jwt123');
    localStorage.setItem('user', JSON.stringify({ id: 1, username: 'admin' }));
    api.post.mockResolvedValue({});

    renderWithProvider();
    await act(async () => {
      screen.getByText('Logout').click();
    });

    await waitFor(() => {
      expect(screen.getByTestId('currentUser')).toHaveTextContent('null');
    });
    expect(localStorage.getItem('token')).toBeNull();
  });

  test('throws if useAuth is used outside AuthProvider', () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => render(<TestConsumer />)).toThrow('useAuth must be used inside <AuthProvider>');
    spy.mockRestore();
  });
});
