/**
 * Mock Data Fixtures for AquaGuard Frontend Tests
 *
 * Provides realistic test data for cameras, alerts, detection events,
 * and API responses used across unit tests.
 */

// Mock Camera Data
export const mockCameras = [
  {
    id: 1,
    zone_id: 'zone_pool_main',
    zone_name: 'Main Pool',
    rtsp_url: 'rtsp://192.168.1.100:554/stream',
    is_active: true,
    created_at: '2024-01-15T08:00:00Z',
    updated_at: '2024-01-15T08:00:00Z',
  },
  {
    id: 2,
    zone_id: 'zone_pool_kids',
    zone_name: 'Kids Pool',
    rtsp_url: 'rtsp://192.168.1.101:554/stream',
    is_active: true,
    created_at: '2024-01-15T08:00:00Z',
    updated_at: '2024-01-15T08:00:00Z',
  },
  {
    id: 3,
    zone_id: 'zone_pool_deep',
    zone_name: 'Deep End',
    rtsp_url: 'rtsp://192.168.1.102:554/stream',
    is_active: false,
    created_at: '2024-01-15T08:00:00Z',
    updated_at: '2024-01-15T08:00:00Z',
  },
];

// Mock Alert Data
export const mockAlerts = [
  {
    id: 101,
    zone_id: 'zone_pool_main',
    zone_name: 'Main Pool',
    alert_type: 'drowning',
    confidence: 0.92,
    status: 'pending',
    snapshot_path: '/snapshots/alert_101.jpg',
    created_at: '2024-01-20T14:30:00Z',
    acknowledged_at: null,
    resolved_at: null,
    notes: null,
  },
  {
    id: 102,
    zone_id: 'zone_pool_kids',
    zone_name: 'Kids Pool',
    alert_type: 'drowning',
    confidence: 0.88,
    status: 'acknowledged',
    snapshot_path: '/snapshots/alert_102.jpg',
    created_at: '2024-01-20T14:25:00Z',
    acknowledged_at: '2024-01-20T14:26:00Z',
    resolved_at: null,
    notes: 'Lifeguard responding',
  },
  {
    id: 103,
    zone_id: 'zone_pool_main',
    zone_name: 'Main Pool',
    alert_type: 'drowning',
    confidence: 0.95,
    status: 'resolved',
    snapshot_path: '/snapshots/alert_103.jpg',
    created_at: '2024-01-20T14:00:00Z',
    acknowledged_at: '2024-01-20T14:01:00Z',
    resolved_at: '2024-01-20T14:10:00Z',
    notes: 'False positive - swimmer practicing breath holding',
  },
];

// Mock Detection Events
export const mockDetectionEvents = [
  {
    id: 'evt_001',
    zone_id: 'zone_pool_main',
    confidence: 0.75,
    alert_triggered: false,
    timestamp: '2024-01-20T14:35:00Z',
  },
  {
    id: 'evt_002',
    zone_id: 'zone_pool_kids',
    confidence: 0.92,
    alert_triggered: true,
    timestamp: '2024-01-20T14:30:00Z',
  },
  {
    id: 'evt_003',
    zone_id: 'zone_pool_main',
    confidence: 0.65,
    alert_triggered: false,
    timestamp: '2024-01-20T14:25:00Z',
  },
];

// Mock Analytics Data
export const mockAnalytics = {
  alerts_by_zone: [
    { zone_id: 'zone_pool_main', zone_name: 'Main Pool', count: 15 },
    { zone_id: 'zone_pool_kids', zone_name: 'Kids Pool', count: 8 },
    { zone_id: 'zone_pool_deep', zone_name: 'Deep End', count: 3 },
  ],
  detections_over_time: [
    { date: '2024-01-14', count: 42 },
    { date: '2024-01-15', count: 38 },
    { date: '2024-01-16', count: 55 },
    { date: '2024-01-17', count: 49 },
    { date: '2024-01-18', count: 61 },
    { date: '2024-01-19', count: 45 },
    { date: '2024-01-20', count: 52 },
  ],
  total_alerts: 26,
  total_detections: 342,
  avg_confidence: 0.82,
};

// Mock System Health
export const mockSystemHealth = {
  detection_engine: {
    status: 'running',
    uptime: 3600,
    cameras_active: 2,
    cameras_total: 3,
  },
  api: {
    status: 'healthy',
    response_time_ms: 45,
  },
  database: {
    status: 'connected',
    connections: 5,
  },
  mqtt: {
    status: 'connected',
    messages_per_minute: 120,
  },
};

// Mock User Data
export const mockUser = {
  id: 1,
  username: 'admin',
  email: 'admin@aquaguard.io',
  role: 'admin',
  created_at: '2024-01-01T00:00:00Z',
};

// API Response Wrappers
export const createSuccessResponse = (data, message = 'Success') => ({
  status: 'success',
  data,
  message,
});

export const createErrorResponse = (message, statusCode = 400) => ({
  status: 'error',
  data: null,
  message,
  statusCode,
});

// Paginated Response
export const createPaginatedResponse = (items, page = 1, perPage = 10, total = null) => ({
  status: 'success',
  data: {
    items,
    page,
    per_page: perPage,
    total: total ?? items.length,
    total_pages: Math.ceil((total ?? items.length) / perPage),
  },
  message: null,
});

// Factory Functions
export const createCamera = (overrides = {}) => ({
  id: Math.floor(Math.random() * 1000),
  zone_id: `zone_${Date.now()}`,
  zone_name: 'Test Camera',
  rtsp_url: 'rtsp://test/stream',
  is_active: true,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  ...overrides,
});

export const createAlert = (overrides = {}) => ({
  id: Math.floor(Math.random() * 1000),
  zone_id: 'zone_test',
  zone_name: 'Test Zone',
  alert_type: 'drowning',
  confidence: 0.85,
  status: 'pending',
  snapshot_path: '/snapshots/test.jpg',
  created_at: new Date().toISOString(),
  acknowledged_at: null,
  resolved_at: null,
  notes: null,
  ...overrides,
});

export const createDetectionEvent = (overrides = {}) => ({
  id: `evt_${Date.now()}`,
  zone_id: 'zone_test',
  confidence: 0.75,
  alert_triggered: false,
  timestamp: new Date().toISOString(),
  ...overrides,
});

export default {
  mockCameras,
  mockAlerts,
  mockDetectionEvents,
  mockAnalytics,
  mockSystemHealth,
  mockUser,
  createSuccessResponse,
  createErrorResponse,
  createPaginatedResponse,
  createCamera,
  createAlert,
  createDetectionEvent,
};
