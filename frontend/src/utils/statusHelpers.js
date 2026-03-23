const ONLINE_VALUES = ['online', 'active', 'running', 'healthy', 'ok', 'connected'];
const OFFLINE_VALUES = ['offline', 'inactive', 'stopped', 'down', 'disconnected'];

export function normalizeServiceStatus(rawStatus) {
  if (typeof rawStatus === 'boolean') return rawStatus ? 'online' : 'offline';
  if (!rawStatus) return 'unknown';

  const value = String(rawStatus).toLowerCase();
  if (ONLINE_VALUES.includes(value)) return 'online';
  if (OFFLINE_VALUES.includes(value)) return 'offline';
  return value;
}