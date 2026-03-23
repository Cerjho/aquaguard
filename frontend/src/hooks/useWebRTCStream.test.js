import React from 'react';
import { render, waitFor } from '@testing-library/react';
import useWebRTCStream from './useWebRTCStream';
import api from './useApi';

jest.mock('./useApi', () => ({
  __esModule: true,
  default: {
    get: jest.fn(),
    post: jest.fn(),
  },
}));

jest.mock('../utils/constants', () => ({
  API_BASE_URL: 'http://localhost:5000',
  WEBRTC_ENABLE: true,
  WEBRTC_FORCE_RELAY: false,
  WEBRTC_STUN_URLS: 'stun:stun.l.google.com:19302',
  WEBRTC_TURN_URL: '',
  WEBRTC_TURN_USERNAME: '',
  WEBRTC_TURN_CREDENTIAL: '',
  WEBRTC_ICE_TRANSPORT_POLICY: 'all',
  WEBRTC_NEGOTIATION_TIMEOUT_MS: 60000,
  WEBRTC_STATUS_POLL_MS: 60000,
  WEBRTC_RETRY_INTERVAL_MS: 60000,
}));

class FakeRTCPeerConnection {
  constructor() {
    this.localDescription = null;
    this.onicecandidate = null;
    this.ontrack = null;
    this.onconnectionstatechange = null;
    this.connectionState = 'new';
  }

  async createOffer() {
    return { type: 'offer', sdp: 'fake-offer-sdp' };
  }

  async setLocalDescription(description) {
    this.localDescription = description;
  }

  async setRemoteDescription() {
    return undefined;
  }

  close() {
    this.connectionState = 'closed';
  }
}

function HookHarness({ streamToken }) {
  useWebRTCStream({
    zoneId: 'zone_dev',
    streamToken,
    shouldRenderStream: true,
    isActive: true,
  });
  return <div>harness</div>;
}

describe('useWebRTCStream', () => {
  const originalRtc = global.RTCPeerConnection;

  beforeEach(() => {
    jest.clearAllMocks();
    global.RTCPeerConnection = FakeRTCPeerConnection;

    api.get.mockImplementation((url) => {
      if (url === '/api/v1/webrtc/ice-config') {
        return Promise.resolve({
          data: {
            ice_servers: [],
            ice_transport_policy: 'all',
            force_relay: false,
          },
        });
      }
      if (url.startsWith('/api/v1/webrtc/session-status/')) {
        return Promise.resolve({ data: { status: 'answer_created' } });
      }
      return Promise.reject(new Error(`Unexpected GET URL ${url}`));
    });

    api.post.mockImplementation((url) => {
      if (url === '/api/v1/webrtc/offer') {
        return Promise.resolve({
          data: {
            session_id: '4e9f6592-1858-489d-95d7-b5d7bf5d4e26',
            status: 'answer_created',
            type: 'answer',
            sdp: 'fake-answer-sdp',
            fallback: { active: false },
          },
        });
      }
      return Promise.reject(new Error(`Unexpected POST URL ${url}`));
    });
  });

  afterEach(() => {
    global.RTCPeerConnection = originalRtc;
  });

  test('does not renegotiate when stream token rotates', async () => {
    const { rerender } = render(<HookHarness streamToken="token-one" />);

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith(
        '/api/v1/webrtc/offer',
        expect.objectContaining({ zone_id: 'zone_dev', type: 'offer' })
      );
    });

    const offerCallsBefore = api.post.mock.calls.filter((call) => call[0] === '/api/v1/webrtc/offer').length;
    expect(offerCallsBefore).toBe(1);

    rerender(<HookHarness streamToken="token-two" />);

    await new Promise((resolve) => setTimeout(resolve, 0));

    const offerCallsAfter = api.post.mock.calls.filter((call) => call[0] === '/api/v1/webrtc/offer').length;
    expect(offerCallsAfter).toBe(1);
  });
});
