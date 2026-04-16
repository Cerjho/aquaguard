import api from '../../hooks/useApi';
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

  test('refreshes token and retries original request on 401', async () => {
    mock.onGet('/api/v1/protected').replyOnce(401);
    mock.onPost('/api/v1/auth/refresh').reply(200, { access_token: 'new-token' });
    mock.onGet('/api/v1/protected').reply(200, { ok: true });

    const response = await api.get('/api/v1/protected');

    expect(response.status).toBe(200);
    expect(response.data.ok).toBe(true);
    expect(mock.history.post.some((req) => req.url === '/api/v1/auth/refresh')).toBe(true);
    expect(mock.history.get.filter((req) => req.url === '/api/v1/protected')).toHaveLength(2);
  });

  test('deduplicates refresh for concurrent 401 responses', async () => {
    mock.onGet('/api/v1/protected-a').replyOnce(401);
    mock.onGet('/api/v1/protected-b').replyOnce(401);
    mock.onPost('/api/v1/auth/refresh').reply(() => new Promise((resolve) => {
      setTimeout(() => resolve([200, { access_token: 'new-token' }]), 25);
    }));
    mock.onGet('/api/v1/protected-a').reply(200, { ok: true, resource: 'a' });
    mock.onGet('/api/v1/protected-b').reply(200, { ok: true, resource: 'b' });

    const [resA, resB] = await Promise.all([
      api.get('/api/v1/protected-a'),
      api.get('/api/v1/protected-b'),
    ]);

    expect(resA.status).toBe(200);
    expect(resB.status).toBe(200);
    expect(
      mock.history.post.filter((req) => req.url === '/api/v1/auth/refresh')
    ).toHaveLength(1);
    expect(mock.history.get.filter((req) => req.url === '/api/v1/protected-a')).toHaveLength(2);
    expect(mock.history.get.filter((req) => req.url === '/api/v1/protected-b')).toHaveLength(2);
  });

  test('dispatches token-refreshed event after successful refresh', async () => {
    const refreshedListener = jest.fn();
    window.addEventListener('token-refreshed', refreshedListener);

    mock.onGet('/api/v1/protected').replyOnce(401);
    mock.onPost('/api/v1/auth/refresh').reply(200, { access_token: 'new-token' });
    mock.onGet('/api/v1/protected').reply(200, { ok: true });

    await api.get('/api/v1/protected');

    expect(refreshedListener).toHaveBeenCalledTimes(1);
    window.removeEventListener('token-refreshed', refreshedListener);
  });

  test('keeps request rejection behavior on auth endpoint 401 response', async () => {
    window.history.pushState({}, '', '/login');
    mock.onPost('/api/v1/auth/login').reply(401);

    await expect(api.post('/api/v1/auth/login', {
      username: 'admin',
      password: 'wrong',
    })).rejects.toThrow();

    window.history.pushState({}, '', '/');
  });

  test('does not attempt refresh while logout request is in progress', async () => {
    window.history.pushState({}, '', '/incidents');
    mock.onPost('/api/v1/auth/logout').reply(() => new Promise((resolve) => {
      setTimeout(() => resolve([200, { message: 'ok' }]), 20);
    }));
    mock.onGet('/api/v1/alerts?page=1&limit=10').reply(401);
    mock.onPost('/api/v1/auth/refresh').reply(200, { access_token: 'new-token' });

    const logoutPromise = api.post('/api/v1/auth/logout');
    await expect(api.get('/api/v1/alerts?page=1&limit=10')).rejects.toThrow();
    await logoutPromise;

    expect(mock.history.post.filter((req) => req.url === '/api/v1/auth/refresh')).toHaveLength(0);
    window.history.pushState({}, '', '/');
  });

  test('resolves successfully on 200 response', async () => {
    mock.onGet('/api/v1/cameras').reply(200, [{ id: 1, name: 'Cam 1' }]);

    const response = await api.get('/api/v1/cameras');

    expect(response.status).toBe(200);
    expect(response.data).toHaveLength(1);
  });
});
