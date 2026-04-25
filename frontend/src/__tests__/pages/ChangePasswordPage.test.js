import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import ChangePasswordPage from '../../pages/ChangePasswordPage.jsx';
import * as apiModule from '../../hooks/useApi';

// ---------------------------------------------------------------------------
// Global mocks (DotLottieReact and GSAP are already in setupTests / mocked globally)
// ---------------------------------------------------------------------------
jest.mock('../../hooks/useApi', () => ({
  __esModule: true,
  default: { post: jest.fn(), get: jest.fn() },
}));

jest.mock('gsap', () => ({
  __esModule: true,
  default: { fromTo: jest.fn(), to: jest.fn(), set: jest.fn(), killTweensOf: jest.fn() },
}), { virtual: true });

jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => mockNavigate,
}));

const mockNavigate = jest.fn();
const api = apiModule.default;

// Lottie files are binary — mock them so the import doesn't crash
jest.mock('../../vector/rocket.lottie', () => 'rocket.lottie', { virtual: true });
jest.mock('../../vector/success.lottie', () => 'success.lottie', { virtual: true });

function renderPage() {
  return render(
    <MemoryRouter>
      <ChangePasswordPage />
    </MemoryRouter>
  );
}

afterEach(() => {
  jest.clearAllMocks();
});

describe('ChangePasswordPage', () => {
  test('renders all three password fields and submit button', () => {
    renderPage();
    expect(screen.getByLabelText(/current password/i)).toBeInTheDocument();
    expect(screen.getByLabelText('New Password')).toBeInTheDocument();
    expect(screen.getByLabelText(/confirm new password/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /update password/i })).toBeInTheDocument();
  });

  test('shows error when new password is shorter than 8 characters', async () => {
    renderPage();
    fireEvent.change(screen.getByLabelText(/current password/i), { target: { value: 'OldPass1!' } });
    fireEvent.change(screen.getByLabelText('New Password'), { target: { value: 'short' } });
    fireEvent.change(screen.getByLabelText(/confirm new password/i), { target: { value: 'short' } });
    fireEvent.click(screen.getByRole('button', { name: /update password/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/at least 8 characters/i);
    expect(api.post).not.toHaveBeenCalled();
  });

  test('shows error when passwords do not match', async () => {
    renderPage();
    fireEvent.change(screen.getByLabelText(/current password/i), { target: { value: 'OldPass1!' } });
    fireEvent.change(screen.getByLabelText('New Password'), { target: { value: 'NewPass123!' } });
    fireEvent.change(screen.getByLabelText(/confirm new password/i), { target: { value: 'Different123!' } });
    fireEvent.click(screen.getByRole('button', { name: /update password/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/do not match/i);
    expect(api.post).not.toHaveBeenCalled();
  });

  test('calls API with correct payload on valid submit', async () => {
    api.post.mockResolvedValue({ data: { message: 'Password updated successfully' } });
    renderPage();

    fireEvent.change(screen.getByLabelText(/current password/i), { target: { value: 'OldPass1!' } });
    fireEvent.change(screen.getByLabelText('New Password'), { target: { value: 'NewPass123!' } });
    fireEvent.change(screen.getByLabelText(/confirm new password/i), { target: { value: 'NewPass123!' } });
    fireEvent.click(screen.getByRole('button', { name: /update password/i }));

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith('/api/v1/auth/change-password', {
        current_password: 'OldPass1!',
        new_password: 'NewPass123!',
      });
    });
  });

  test('shows success state after API resolves', async () => {
    api.post.mockResolvedValue({ data: { message: 'Password updated successfully' } });
    renderPage();

    fireEvent.change(screen.getByLabelText(/current password/i), { target: { value: 'OldPass1!' } });
    fireEvent.change(screen.getByLabelText('New Password'), { target: { value: 'NewPass123!' } });
    fireEvent.change(screen.getByLabelText(/confirm new password/i), { target: { value: 'NewPass123!' } });
    fireEvent.click(screen.getByRole('button', { name: /update password/i }));

    expect(await screen.findByText(/password updated/i)).toBeInTheDocument();
  });

  test('shows API error message when server returns 401', async () => {
    api.post.mockRejectedValue({
      response: { status: 401, data: { error: 'Current password is incorrect' } },
    });
    renderPage();

    fireEvent.change(screen.getByLabelText(/current password/i), { target: { value: 'WrongPass!' } });
    fireEvent.change(screen.getByLabelText('New Password'), { target: { value: 'NewPass123!' } });
    fireEvent.change(screen.getByLabelText(/confirm new password/i), { target: { value: 'NewPass123!' } });
    fireEvent.click(screen.getByRole('button', { name: /update password/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/current password is incorrect/i);
  });

  test('disables submit button while loading', async () => {
    // Never resolves during this test — button stays disabled
    api.post.mockReturnValue(new Promise(() => {}));
    renderPage();

    fireEvent.change(screen.getByLabelText(/current password/i), { target: { value: 'OldPass1!' } });
    fireEvent.change(screen.getByLabelText('New Password'), { target: { value: 'NewPass123!' } });
    fireEvent.change(screen.getByLabelText(/confirm new password/i), { target: { value: 'NewPass123!' } });
    fireEvent.click(screen.getByRole('button', { name: /update password/i }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /updating/i })).toBeDisabled();
    });
  });

  test('back button navigates to root', () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: /back/i }));
    expect(mockNavigate).toHaveBeenCalledWith('/');
  });
});
