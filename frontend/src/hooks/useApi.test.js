import api from './useApi';
import axios from 'axios';
import MockAdapter from 'axios-mock-adapter';

const mock = new MockAdapter(api);

afterEach(() => {
  mock.reset();
  localStorage.clear();
});

describe('useApi (axios instance)', () => {
  test('attaches Authorization header when token exists in localStorage', async () => {
    localStorage.setItem('token', 'test-jwt-token');
    mock.onGet('/api/v1/test').reply(200, { ok: true });

    const response = await api.get('/api/v1/test');

    expect(response.config.headers.Authorization).toBe('Bearer test-jwt-token');
  });

  test('does not attach Authorization header when no token', async () => {
    mock.onGet('/api/v1/test').reply(200, {});

    const response = await api.get('/api/v1/test');

    expect(response.config.headers.Authorization).toBeUndefined();
  });

  test('removes token and user from localStorage on 401 response', async () => {
    localStorage.setItem('token', 'expired-token');
    localStorage.setItem('user', JSON.stringify({ id: 1 }));
    mock.onGet('/api/v1/protected').reply(401);

    await expect(api.get('/api/v1/protected')).rejects.toThrow();

    expect(localStorage.getItem('token')).toBeNull();
    expect(localStorage.getItem('user')).toBeNull();
  });

  test('resolves successfully on 200 response', async () => {
    mock.onGet('/api/v1/cameras').reply(200, [{ id: 1, name: 'Cam 1' }]);

    const response = await api.get('/api/v1/cameras');

    expect(response.status).toBe(200);
    expect(response.data).toHaveLength(1);
  });
});
