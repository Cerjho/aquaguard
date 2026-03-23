import api from './useApi';
import MockAdapter from 'axios-mock-adapter';

const mock = new MockAdapter(api);

afterEach(() => {
  mock.reset();
  document.cookie = 'csrf_access_token=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/';
  document.cookie = 'csrf_refresh_token=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/';
});

describe('useApi (axios instance)', () => {
  test('does not attach Authorization header for cookie-auth requests', async () => {
    mock.onGet('/api/v1/test').reply(200, {});

    const response = await api.get('/api/v1/test');

    expect(response.config.headers.Authorization).toBeUndefined();
  });

  test('adds X-CSRF-TOKEN on mutating requests when csrf_access_token exists', async () => {
    document.cookie = 'csrf_access_token=csrf-token-123; path=/';
    mock.onPost('/api/v1/protected').reply(200, { ok: true });

    const response = await api.post('/api/v1/protected', { sample: true });

    expect(response.config.headers['X-CSRF-TOKEN']).toBe('csrf-token-123');
  });

  test('keeps request rejection behavior on 401 response', async () => {
    mock.onGet('/api/v1/protected').reply(401);

    await expect(api.get('/api/v1/protected')).rejects.toThrow();
  });

  test('resolves successfully on 200 response', async () => {
    mock.onGet('/api/v1/cameras').reply(200, [{ id: 1, name: 'Cam 1' }]);

    const response = await api.get('/api/v1/cameras');

    expect(response.status).toBe(200);
    expect(response.data).toHaveLength(1);
  });
});
