import { useCallback } from 'react';
import api from './useApi';
import { API_BASE_URL } from '../utils/constants';

export function useClipsApi() {
  const fetchClips = useCallback(async (params) => {
    const res = await api.get('/api/v1/clips', { params });
    return res?.data?.data ?? res?.data;
  }, []);

  const getClipMetadata = useCallback(async (clipId) => {
    const res = await api.get(`/api/v1/clips/${clipId}`);
    return res?.data?.data ?? res?.data;
  }, []);

  const reviewClip = useCallback(async (clipId, outcome, notes = '') => {
    const res = await api.patch(`/api/v1/clips/${clipId}/review`, { outcome, notes });
    return res?.data?.data ?? res?.data;
  }, []);

  const getClipStreamUrl = useCallback((clipId) => {
    return `${API_BASE_URL}/api/v1/clips/${clipId}/video`;
  }, []);

  return {
    fetchClips,
    getClipMetadata,
    reviewClip,
    getClipStreamUrl,
  };
}

export default useClipsApi;
