import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import LoginPage from './LoginPage';
import * as AuthContext from '../context/AuthContext';

// Prevent axios ESM import errors from transitive deps
jest.mock('../hooks/useApi', () => ({ post: jest.fn(), get: jest.fn() }));

// Mock useNavigate
jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => jest.fn(),
}));

const mockLogin = jest.fn();

function renderLoginPage(authOverrides = {}) {
  jest.spyOn(AuthContext, 'useAuth').mockReturnValue({
    login: mockLogin,
    isAuthenticated: false,
    authError: null,
    loading: false,
    ...authOverrides,
  });

  return render(
    <MemoryRouter>
      <LoginPage />
    </MemoryRouter>
  );
}

afterEach(() => {
  jest.restoreAllMocks();
  mockLogin.mockReset();
});

describe('LoginPage', () => {
  test('renders username and password fields and sign-in button', () => {
    renderLoginPage();
    expect(screen.getByLabelText(/username/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument();
  });

  test('shows validation error when username is empty', () => {
    renderLoginPage();
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }));
    expect(screen.getByRole('alert')).toHaveTextContent('Username is required.');
    expect(mockLogin).not.toHaveBeenCalled();
  });

  test('shows validation error when password is empty', () => {
    renderLoginPage();
    fireEvent.change(screen.getByLabelText(/username/i), { target: { value: 'admin' } });
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }));
    expect(screen.getByRole('alert')).toHaveTextContent('Password is required.');
    expect(mockLogin).not.toHaveBeenCalled();
  });

  test('calls login with trimmed username and password on valid submit', async () => {
    mockLogin.mockResolvedValue(true);
    renderLoginPage();
    fireEvent.change(screen.getByLabelText(/username/i), { target: { value: '  admin  ' } });
    fireEvent.change(screen.getByLabelText(/password/i), { target: { value: 'secret' } });
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }));
    expect(mockLogin).toHaveBeenCalledWith('admin', 'secret', false);
  });

  test('displays authError returned from context', () => {
    renderLoginPage({ authError: 'Invalid credentials' });
    expect(screen.getByRole('alert')).toHaveTextContent('Invalid credentials');
  });

  test('disables button and inputs when loading', () => {
    renderLoginPage({ loading: true });
    expect(screen.getByRole('button')).toBeDisabled();
    expect(screen.getByLabelText(/username/i)).toBeDisabled();
    expect(screen.getByLabelText(/password/i)).toBeDisabled();
  });
});
