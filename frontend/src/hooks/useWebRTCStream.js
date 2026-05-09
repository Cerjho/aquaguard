import { useEffect, useRef, useState } from 'react';
import api from './useApi';
import {
  API_BASE_URL,
  WEBRTC_ENABLE,
  WEBRTC_FORCE_RELAY,
  WEBRTC_STUN_URLS,
  WEBRTC_TURN_URL,
  WEBRTC_TURN_USERNAME,
  WEBRTC_TURN_CREDENTIAL,
  WEBRTC_ICE_TRANSPORT_POLICY,
  WEBRTC_NEGOTIATION_TIMEOUT_MS,
  WEBRTC_STATUS_POLL_MS,
  WEBRTC_STATUS_POLL_MAX_MS,
  WEBRTC_STATUS_POLL_429_BACKOFF_FACTOR,
  WEBRTC_RETRY_INTERVAL_MS,
} from '../utils/constants';

// ── Constants ────────────────────────────────────────────────────────────
// Exponential backoff: 1.5s → 3s → 6s → 12s → 24s → cap at 30s
const BACKOFF_BASE_MS = WEBRTC_RETRY_INTERVAL_MS;
const BACKOFF_MAX_MS = 30000;

function toIceServersFromEnv() {
  const servers = [];
  const stun = (WEBRTC_STUN_URLS || '').split(',').map((v) => v.trim()).filter(Boolean);
  if (stun.length) servers.push({ urls: stun.length === 1 ? stun[0] : stun });
  if (WEBRTC_TURN_URL && WEBRTC_TURN_USERNAME && WEBRTC_TURN_CREDENTIAL) {
    servers.push({
      urls: WEBRTC_TURN_URL,
      username: WEBRTC_TURN_USERNAME,
      credential: WEBRTC_TURN_CREDENTIAL,
    });
  }
  return servers;
}

/**
 * useWebRTCStream — Dual-transport stream hook.
 *
 * Design principle: **MJPEG-first, WebRTC as a progressive upgrade.**
 *
 * The MJPEG fallback stream starts immediately and is never interrupted.
 * WebRTC negotiates silently in the background. Only when WebRTC actually
 * delivers video (ontrack fires) does the hook switch `transport` from
 * 'fallback' to 'webrtc'. If WebRTC fails, MJPEG continues undisturbed.
 *
 * Retries use exponential backoff (1.5s → 3s → … → 30s cap) so a broken
 * TURN server does not generate constant network chatter.
 */
export default function useWebRTCStream({ zoneId, streamToken, streamSessionId, shouldRenderStream, isActive }) {
  const [transport, setTransport] = useState('fallback');
  const [webrtcState, setWebrtcState] = useState('idle');
  const [streamUrl, setStreamUrl] = useState(null);
  const [videoStream, setVideoStream] = useState(null);

  const pcRef = useRef(null);
  const statusTimerRef = useRef(null);
  const retryTimerRef = useRef(null);
  const sessionIdRef = useRef(null);
  const fallbackUrlRef = useRef(null);
  const activeFallbackSessionRef = useRef(null);
  const negotiatedRef = useRef(false);
  const stoppedRef = useRef(false);
  const retryScheduledRef = useRef(false);
  const retryCountRef = useRef(0);
  const pollFailureCountRef = useRef(0);
  const pollIntervalMsRef = useRef(WEBRTC_STATUS_POLL_MS);

  // ── Keep fallback URL in sync (session-stable) ──────────────────────
  useEffect(() => {
    if (!zoneId || !streamToken) {
      fallbackUrlRef.current = null;
      activeFallbackSessionRef.current = null;
      return;
    }
    const sessionKey = `${zoneId}-${streamSessionId || ''}`;
    if (activeFallbackSessionRef.current !== sessionKey) {
      activeFallbackSessionRef.current = sessionKey;
      fallbackUrlRef.current = `${API_BASE_URL}/api/v1/cameras/${zoneId}/stream?token=${encodeURIComponent(streamToken)}&session=${encodeURIComponent(streamSessionId || Date.now())}`;
      
      // Push updated URL to any active fallback stream
      setStreamUrl((currentUrl) => {
        if (currentUrl) return fallbackUrlRef.current;
        return currentUrl;
      });
    }
  }, [zoneId, streamToken, streamSessionId]);

  // ── Main effect — manages both transports ───────────────────────────
  useEffect(() => {
    // Gate: if WebRTC is disabled or stream shouldn't render, go straight to MJPEG
    if (!WEBRTC_ENABLE || !zoneId || !shouldRenderStream || !isActive) {
      setTransport('fallback');
      setWebrtcState(WEBRTC_ENABLE ? 'idle' : 'disabled');
      setVideoStream(null);
      setStreamUrl(fallbackUrlRef.current);
      return undefined;
    }
    if (typeof RTCPeerConnection === 'undefined') {
      setTransport('fallback');
      setWebrtcState('unsupported');
      setVideoStream(null);
      setStreamUrl(fallbackUrlRef.current);
      return undefined;
    }

    // ─── Always start MJPEG immediately ──────────────────────────────
    // This is the key design decision: the user sees a live stream from
    // frame one. WebRTC upgrades it later if possible.
    setTransport('fallback');
    setStreamUrl(fallbackUrlRef.current);

    let negotiationTimeoutId = null;
    stoppedRef.current = false;
    negotiatedRef.current = false;
    retryScheduledRef.current = false;
    retryCountRef.current = 0;
    pollFailureCountRef.current = 0;
    pollIntervalMsRef.current = WEBRTC_STATUS_POLL_MS;

    const clearTimers = () => {
      if (statusTimerRef.current) {
        clearTimeout(statusTimerRef.current);
        statusTimerRef.current = null;
      }
      if (retryTimerRef.current) {
        clearTimeout(retryTimerRef.current);
        retryTimerRef.current = null;
      }
      if (negotiationTimeoutId) {
        clearTimeout(negotiationTimeoutId);
        negotiationTimeoutId = null;
      }
    };

    const teardownPeer = () => {
      if (pcRef.current) {
        pcRef.current.onicecandidate = null;
        pcRef.current.ontrack = null;
        pcRef.current.onconnectionstatechange = null;
        pcRef.current.oniceconnectionstatechange = null;
        pcRef.current.close();
        pcRef.current = null;
      }
      setVideoStream(null);
    };

    // ── Exponential backoff retry ────────────────────────────────────
    // MJPEG stays running. Only the WebRTC peer is torn down.
    const scheduleRetry = () => {
      if (stoppedRef.current) return;
      if (retryScheduledRef.current) return;
      retryScheduledRef.current = true;
      retryCountRef.current += 1;
      clearTimers();
      teardownPeer();

      // If WebRTC was previously connected and just dropped, revert to
      // MJPEG so the user still has video.
      if (transport === 'webrtc' || negotiatedRef.current) {
        setTransport('fallback');
        setStreamUrl(fallbackUrlRef.current);
      }

      // Exponential backoff: 1.5s → 3s → 6s → 12s → 24s → 30s cap
      const delay = Math.min(
        BACKOFF_BASE_MS * Math.pow(2, retryCountRef.current - 1),
        BACKOFF_MAX_MS
      );
      setWebrtcState('retrying');

      retryTimerRef.current = setTimeout(() => {
        retryScheduledRef.current = false;
        if (!stoppedRef.current) startWebRTC();
      }, delay);
    };

    // ICE restart: re-use existing peer connection with fresh candidates.
    const attemptIceRestart = async () => {
      const pc = pcRef.current;
      if (!pc || !sessionIdRef.current) {
        scheduleRetry();
        return;
      }
      try {
        setWebrtcState('reconnecting');
        const offer = await pc.createOffer({ iceRestart: true });
        await pc.setLocalDescription(offer);
        const response = await api.post('/api/v1/webrtc/offer', {
          zone_id: zoneId,
          session_id: sessionIdRef.current,
          type: offer.type,
          sdp: offer.sdp,
          fallback_transport: 'mjpeg',
        });
        const data = response?.data?.data || response?.data || {};
        const answerSdp = data.sdp;
        if (!answerSdp) {
          scheduleRetry();
          return;
        }
        await pc.setRemoteDescription({ type: data.type || 'answer', sdp: answerSdp });
      } catch {
        scheduleRetry();
      }
    };

    const pollStatus = async () => {
      if (!sessionIdRef.current) return;
      try {
        const response = await api.get(`/api/v1/webrtc/session-status/${sessionIdRef.current}`);
        const payload = response?.data?.data || response?.data || {};
        const status = payload.status;
        pollFailureCountRef.current = 0;
        pollIntervalMsRef.current = WEBRTC_STATUS_POLL_MS;
        if (status === 'fallback_active' && !negotiatedRef.current) {
          clearTimers();
          teardownPeer();
          setTransport('fallback');
          setWebrtcState('fallback');
          setStreamUrl(fallbackUrlRef.current);
        }
      } catch (error) {
        pollFailureCountRef.current += 1;
        if (error?.response?.status === 429) {
          const nextDelay = Math.min(
            Math.max(pollIntervalMsRef.current, WEBRTC_STATUS_POLL_MS)
              * WEBRTC_STATUS_POLL_429_BACKOFF_FACTOR,
            WEBRTC_STATUS_POLL_MAX_MS
          );
          pollIntervalMsRef.current = nextDelay;
        }
      }
    };

    const scheduleStatusPoll = () => {
      if (stoppedRef.current || !sessionIdRef.current) return;
      statusTimerRef.current = setTimeout(async () => {
        await pollStatus();
        scheduleStatusPoll();
      }, pollIntervalMsRef.current);
    };

    const fetchIceConfig = async () => {
      try {
        const response = await api.get('/api/v1/webrtc/ice-config');
        const payload = response?.data?.data || response?.data || {};
        const servers = Array.isArray(payload.ice_servers) ? payload.ice_servers : [];
        const policy = payload.ice_transport_policy || WEBRTC_ICE_TRANSPORT_POLICY;
        const forceRelay = Boolean(payload.force_relay || WEBRTC_FORCE_RELAY);
        return {
          iceServers: servers.length ? servers : toIceServersFromEnv(),
          iceTransportPolicy: forceRelay ? 'relay' : policy,
        };
      } catch {
        return {
          iceServers: toIceServersFromEnv(),
          iceTransportPolicy: WEBRTC_FORCE_RELAY ? 'relay' : WEBRTC_ICE_TRANSPORT_POLICY,
        };
      }
    };

    // ── WebRTC negotiation (background, non-destructive) ─────────────
    // Key: we do NOT change `transport` or `streamUrl` here.
    // MJPEG stays active. Only `ontrack` promotes to WebRTC.
    const startWebRTC = async () => {
      try {
        setWebrtcState('connecting');
        teardownPeer();

        const rtcConfig = await fetchIceConfig();
        const pc = new RTCPeerConnection(rtcConfig);
        pcRef.current = pc;
        pollFailureCountRef.current = 0;

        // ── SUCCESS: WebRTC delivers video → promote transport ──────
        pc.ontrack = (event) => {
          negotiatedRef.current = true;
          retryCountRef.current = 0; // Reset backoff on success
          const media = event.streams?.[0] || null;
          setVideoStream(media);
          setWebrtcState('connected');
          setTransport('webrtc');
        };

        pc.onicecandidate = async (event) => {
          if (!event.candidate || !sessionIdRef.current) return;
          if (!String(event.candidate.candidate || '').trim()) return;
          try {
            await api.post('/api/v1/webrtc/ice-candidate', {
              session_id: sessionIdRef.current,
              zone_id: zoneId,
              candidate: event.candidate.candidate,
              sdpMid: event.candidate.sdpMid,
              sdpMLineIndex: event.candidate.sdpMLineIndex,
            });
          } catch {
            // ICE candidate relay errors can be transient and should not force full renegotiation.
          }
        };

        pc.onconnectionstatechange = () => {
          if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
            scheduleRetry();
          }
        };

        // Detect ICE connectivity loss before full connection failure.
        // "disconnected" is recoverable via ICE restart; "failed" is not.
        pc.oniceconnectionstatechange = () => {
          if (pc.iceConnectionState === 'disconnected') {
            attemptIceRestart();
          } else if (pc.iceConnectionState === 'failed') {
            scheduleRetry();
          }
        };

        const offer = await pc.createOffer({ offerToReceiveVideo: true, offerToReceiveAudio: false });
        await pc.setLocalDescription(offer);
        const offerResponse = await api.post('/api/v1/webrtc/offer', {
          zone_id: zoneId,
          type: offer.type,
          sdp: offer.sdp,
          fallback_transport: 'mjpeg',
        });

        const offerData = offerResponse?.data?.data || offerResponse?.data || {};
        sessionIdRef.current = offerData.session_id || null;
        const offerStatus = offerData.status;
        const fallbackActive = Boolean(offerData.fallback?.active);
        if (offerStatus === 'fallback_active' || fallbackActive) {
          // Server says "just use MJPEG" — no need to retry
          clearTimers();
          teardownPeer();
          setTransport('fallback');
          setWebrtcState('fallback');
          setStreamUrl(fallbackUrlRef.current);
          return;
        }
        const answerSdp = offerData.sdp;
        const answerType = offerData.type || 'answer';
        if (!answerSdp) {
          scheduleRetry();
          return;
        }
        await pc.setRemoteDescription({ type: answerType, sdp: answerSdp });

        negotiationTimeoutId = setTimeout(() => {
          if (!negotiatedRef.current) scheduleRetry();
        }, WEBRTC_NEGOTIATION_TIMEOUT_MS);

        scheduleStatusPoll();
      } catch {
        scheduleRetry();
      }
    };

    startWebRTC();

    // Recover immediately when the browser detects network restoration.
    const onOnline = () => {
      if (stoppedRef.current) return;
      const pc = pcRef.current;
      if (pc && pc.iceConnectionState !== 'connected' && pc.iceConnectionState !== 'completed') {
        attemptIceRestart();
      } else if (!pc) {
        retryCountRef.current = 0; // Fresh network = fresh backoff
        scheduleRetry();
      }
    };
    window.addEventListener('online', onOnline);

    return () => {
      stoppedRef.current = true;
      clearTimers();
      teardownPeer();
      sessionIdRef.current = null;
      negotiatedRef.current = false;
      window.removeEventListener('online', onOnline);
    };
  }, [zoneId, shouldRenderStream, isActive]);

  return {
    transport,
    webrtcState,
    streamUrl,
    videoStream,
  };
}
