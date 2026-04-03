/**
 * Jest Test Utilities for AquaGuard Frontend
 *
 * Provides helper functions for rendering components with providers,
 * mocking API responses, and common test assertions.
 */
import React from 'react';
import { render } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';

/**
 * Render a component with all necessary providers
 * @param {React.ReactElement} ui - Component to render
 * @param {object} options - Render options
 * @returns {object} Render result with custom queries
 */
export function renderWithProviders(ui, options = {}) {
  const { route = '/', ...renderOptions } = options;

  // Set initial route
  window.history.pushState({}, 'Test page', route);

  function Wrapper({ children }) {
    return <BrowserRouter>{children}</BrowserRouter>;
  }

  return {
    ...render(ui, { wrapper: Wrapper, ...renderOptions }),
    // Return additional helpers
    user: null, // Can be extended for userEvent
  };
}

/**
 * Create a mock API response
 * @param {*} data - Response data
 * @param {number} status - HTTP status code
 * @param {boolean} ok - Whether response is ok
 * @returns {object} Mock response object
 */
export function mockApiResponse(data, status = 200, ok = true) {
  return {
    ok,
    status,
    json: async () => data,
    text: async () => JSON.stringify(data),
    headers: new Headers({ 'Content-Type': 'application/json' }),
  };
}

/**
 * Create a mock fetch implementation
 * @param {object} handlers - Map of URL patterns to responses
 * @returns {function} Mock fetch function
 */
export function createMockFetch(handlers) {
  return jest.fn().mockImplementation((url, options = {}) => {
    for (const [pattern, response] of Object.entries(handlers)) {
      if (url.includes(pattern)) {
        if (typeof response === 'function') {
          return Promise.resolve(response(url, options));
        }
        return Promise.resolve(mockApiResponse(response));
      }
    }
    // Default 404 for unhandled URLs
    return Promise.resolve(mockApiResponse({ error: 'Not found' }, 404, false));
  });
}

/**
 * Wait for a condition to be true
 * @param {function} condition - Function that returns boolean
 * @param {number} timeout - Timeout in ms
 * @param {number} interval - Check interval in ms
 * @returns {Promise<void>}
 */
export async function waitForCondition(condition, timeout = 5000, interval = 100) {
  const startTime = Date.now();
  while (Date.now() - startTime < timeout) {
    if (condition()) return;
    await new Promise((resolve) => setTimeout(resolve, interval));
  }
  throw new Error(`Condition not met within ${timeout}ms`);
}

/**
 * Mock localStorage
 * @returns {object} Mock storage with methods
 */
export function mockLocalStorage() {
  const store = {};
  return {
    getItem: jest.fn((key) => store[key] || null),
    setItem: jest.fn((key, value) => {
      store[key] = String(value);
    }),
    removeItem: jest.fn((key) => {
      delete store[key];
    }),
    clear: jest.fn(() => {
      Object.keys(store).forEach((key) => delete store[key]);
    }),
    get length() {
      return Object.keys(store).length;
    },
    key: jest.fn((index) => Object.keys(store)[index] || null),
    _store: store, // For inspection
  };
}

/**
 * Create mock socket.io client
 * @returns {object} Mock socket with emit and on methods
 */
export function createMockSocket() {
  const listeners = {};
  return {
    connected: true,
    id: 'mock-socket-id',
    on: jest.fn((event, callback) => {
      if (!listeners[event]) listeners[event] = [];
      listeners[event].push(callback);
    }),
    off: jest.fn((event, callback) => {
      if (listeners[event]) {
        listeners[event] = listeners[event].filter((cb) => cb !== callback);
      }
    }),
    emit: jest.fn(),
    connect: jest.fn(),
    disconnect: jest.fn(),
    // Helper to trigger events in tests
    _trigger: (event, ...args) => {
      if (listeners[event]) {
        listeners[event].forEach((cb) => cb(...args));
      }
    },
    _listeners: listeners,
  };
}

/**
 * Suppress console errors/warnings during test
 * @param {string[]} patterns - Patterns to suppress
 * @returns {function} Cleanup function
 */
export function suppressConsole(patterns = []) {
  const originalError = console.error;
  const originalWarn = console.warn;

  console.error = (...args) => {
    const message = args.join(' ');
    if (patterns.some((p) => message.includes(p))) return;
    originalError.apply(console, args);
  };

  console.warn = (...args) => {
    const message = args.join(' ');
    if (patterns.some((p) => message.includes(p))) return;
    originalWarn.apply(console, args);
  };

  return () => {
    console.error = originalError;
    console.warn = originalWarn;
  };
}

export default {
  renderWithProviders,
  mockApiResponse,
  createMockFetch,
  waitForCondition,
  mockLocalStorage,
  createMockSocket,
  suppressConsole,
};
