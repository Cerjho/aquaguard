import { useEffect, useMemo, useRef, useState } from 'react';
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
  WEBRTC_RETRY_INTERVAL_MS,
} from '../utils/constants';

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

export default function useWebRTCStream({ zoneId, streamToken, shouldRenderStream, isActive }) {
  const [transport, setTransport] = useState('fallback');
  const [webrtcState, setWebrtcState] = useState('idle');
  const [streamUrl, setStreamUrl] = useState(null);
  const [videoStream, setVideoStream] = useState(null);

  const pcRef = useRef(null);
  const statusTimerRef = useRef(null);
  const retryTimerRef = useRef(null);
  const sessionIdRef = useRef(null);
  const negotiatedRef = useRef(false);
  const stoppedRef = useRef(false);

  const fallbackUrl = useMemo(() => {
    if (!zoneId || !streamToken) return null;
    return `${API_BASE_URL}/api/v1/cameras/${zoneId}/stream?token=${encodeURIComponent(streamToken)}`;
  }, [zoneId, streamToken]);

  useEffect(() => {
    setStreamUrl(fallbackUrl);
  }, [fallbackUrl]);

  useEffect(() => {
    if (!WEBRTC_ENABLE || !zoneId || !shouldRenderStream || !isActive) {
      setTransport('fallback');
      setWebrtcState(WEBRTC_ENABLE ? 'idle' : 'disabled');
      setVideoStream(null);
      return undefined;
    }
    if (typeof RTCPeerConnection === 'undefined') {
      setTransport('fallback');
      setWebrtcState('unsupported');
      setVideoStream(null);
      setStreamUrl(fallbackUrl);
      return undefined;
    }

    let negotiationTimeoutId = null;
    stoppedRef.current = false;
    negotiatedRef.current = false;

    const clearTimers = () => {
      if (statusTimerRef.current) {
        clearInterval(statusTimerRef.current);
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
        pcRef.current.close();
        pcRef.current = null;
      }
      setVideoStream(null);
    };

    const scheduleRetry = () => {
      if (stoppedRef.current) return;
      clearTimers();
      teardownPeer();
      setTransport('fallback');
      setWebrtcState('retrying');
      setStreamUrl(fallbackUrl);
      retryTimerRef.current = setTimeout(() => {
        if (!stoppedRef.current) startWebRTC();
      }, WEBRTC_RETRY_INTERVAL_MS);
    };

    const pollStatus = async () => {
      if (!sessionIdRef.current) return;
      try {
        const response = await api.get(`/api/v1/webrtc/session-status/${sessionIdRef.current}`);
        const status = response?.data?.status;
        if (status === 'fallback_active') {
          scheduleRetry();
        }
      } catch {
        scheduleRetry();
      }
    };

    const fetchIceConfig = async () => {
      try {
        const response = await api.get('/api/v1/webrtc/ice-config');
        const payload = response?.data || {};
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

    const startWebRTC = async () => {
      try {
        setTransport('webrtc');
        setWebrtcState('connecting');
        setStreamUrl(null);
        teardownPeer();

        const rtcConfig = await fetchIceConfig();
        const pc = new RTCPeerConnection(rtcConfig);
        pcRef.current = pc;

        pc.ontrack = (event) => {
          negotiatedRef.current = true;
          const media = event.streams?.[0] || null;
          setVideoStream(media);
          setWebrtcState('connected');
          setTransport('webrtc');
        };

        pc.onicecandidate = async (event) => {
          if (!event.candidate || !sessionIdRef.current) return;
          try {
            await api.post('/api/v1/webrtc/ice-candidate', {
              session_id: sessionIdRef.current,
              zone_id: zoneId,
              candidate: event.candidate.candidate,
              sdpMid: event.candidate.sdpMid,
              sdpMLineIndex: event.candidate.sdpMLineIndex,
            });
          } catch {
            scheduleRetry();
          }
        };

        pc.onconnectionstatechange = () => {
          if (['failed', 'disconnected', 'closed'].includes(pc.connectionState)) {
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

        sessionIdRef.current = offerResponse?.data?.session_id || null;
        const offerStatus = offerResponse?.data?.status;
        const fallbackActive = Boolean(offerResponse?.data?.fallback?.active);
        if (offerStatus === 'fallback_active' || fallbackActive) {
          scheduleRetry();
          return;
        }
        const answerSdp = offerResponse?.data?.sdp;
        const answerType = offerResponse?.data?.type || 'answer';
        if (!answerSdp) {
          scheduleRetry();
          return;
        }
        await pc.setRemoteDescription({ type: answerType, sdp: answerSdp });

        negotiationTimeoutId = setTimeout(() => {
          if (!negotiatedRef.current) scheduleRetry();
        }, WEBRTC_NEGOTIATION_TIMEOUT_MS);

        statusTimerRef.current = setInterval(pollStatus, WEBRTC_STATUS_POLL_MS);
      } catch {
        scheduleRetry();
      }
    };

    startWebRTC();

    return () => {
      stoppedRef.current = true;
      clearTimers();
      teardownPeer();
      sessionIdRef.current = null;
      negotiatedRef.current = false;
    };
  }, [zoneId, fallbackUrl, shouldRenderStream, isActive]);

  return {
    transport,
    webrtcState,
    streamUrl,
    videoStream,
  };
}
