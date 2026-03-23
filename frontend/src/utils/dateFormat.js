/**
 * AquaGuard — Date formatting utilities
 */

/**
 * Format an ISO timestamp to a human-readable local date+time string.
 * @param {string|Date} timestamp
 * @returns {string}
 */
export function formatDateTime(timestamp) {
  if (!timestamp) return '—';
  try {
    return new Date(timestamp).toLocaleString();
  } catch {
    return String(timestamp);
  }
}

/**
 * Format an ISO timestamp to a local time string only (HH:MM:SS).
 * @param {string|Date} timestamp
 * @returns {string}
 */
export function formatTime(timestamp) {
  if (!timestamp) return '—';
  try {
    return new Date(timestamp).toLocaleTimeString();
  } catch {
    return String(timestamp);
  }
}

/**
 * Return a relative time label like "2 minutes ago".
 * @param {string|Date} timestamp
 * @returns {string}
 */
export function timeAgo(timestamp) {
  if (!timestamp) return '—';
  try {
    const diff = Math.floor((Date.now() - new Date(timestamp).getTime()) / 1000);
    if (diff < 60) return `${diff}s ago`;
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return `${Math.floor(diff / 86400)}d ago`;
  } catch {
    return String(timestamp);
  }
}
