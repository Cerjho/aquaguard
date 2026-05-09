import React, { useCallback, useEffect, useMemo, useState } from 'react';
import api from '../../hooks/useApi';
import { useDataCache } from '../../context/DataCacheContext.jsx';

const INITIAL_FORM = {
  zone_id: '',
  zone_name: '',
  rtsp_url: '',
  location_description: '',
  frame_rate: '30',
  resolution: '1280x720',
  status: 'active',
};

function CameraManagementPanel({ onCamerasChanged }) {
  // Use shared cache - management panel needs inactive cameras too, so we fetch separately
  const { refreshCameras: refreshGlobalCache } = useDataCache();
  const [cameras, setCameras] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState({ type: '', message: '' });
  const [error, setError] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [menuOpenZoneId, setMenuOpenZoneId] = useState(null);
  const [menuPosition, setMenuPosition] = useState({ top: 0, left: 0 });
  const [deleteConfirm, setDeleteConfirm] = useState({ open: false, camera: null });
  const [editingZoneId, setEditingZoneId] = useState(null);
  const [form, setForm] = useState(INITIAL_FORM);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [selectedZoneId, setSelectedZoneId] = useState(null);

  const fetchCameras = useCallback(async (forceLoading = false) => {
    if (!hasLoaded || forceLoading) {
      setLoading(true);
    }
    setError('');
    try {
      const res = await api.get('/api/v1/cameras', {
        params: { include_inactive: true },
      });
      if (!res || typeof res !== 'object' || res.data === undefined) {
        throw new Error('Invalid camera response payload');
      }
      const payload = res?.data?.data ?? res?.data;
      const data = Array.isArray(payload) ? payload : payload?.cameras || [];
      setCameras(data);
      setHasLoaded(true);
    } catch (err) {
      if (!hasLoaded) {
        setError(err.response?.data?.error || 'Failed to load camera management data.');
      }
    } finally {
      setLoading(false);
    }
  }, [hasLoaded]);

  useEffect(() => {
    fetchCameras();
  }, [fetchCameras]);

  // Notify both parent and global cache when cameras change
  const notifyCamerasChanged = useCallback(() => {
    fetchCameras(false);
    refreshGlobalCache();
    if (onCamerasChanged) {
      onCamerasChanged();
    }
  }, [fetchCameras, refreshGlobalCache, onCamerasChanged]);

  const activeCount = useMemo(
    () => cameras.filter((camera) => camera.status === 'active').length,
    [cameras]
  );

  const selectedCamera = useMemo(
    () => cameras.find((camera) => camera.zone_id === selectedZoneId) || null,
    [cameras, selectedZoneId]
  );

  useEffect(() => {
    if (selectedZoneId && !selectedCamera) {
      setSelectedZoneId(null);
    }
  }, [selectedZoneId, selectedCamera]);

  useEffect(() => {
    if (!selectedCamera) return undefined;
    const closeDetailsOnEscape = (event) => {
      if (event.key === 'Escape') {
        setSelectedZoneId(null);
      }
    };
    document.addEventListener('keydown', closeDetailsOnEscape);
    return () => document.removeEventListener('keydown', closeDetailsOnEscape);
  }, [selectedCamera]);

  const closeForm = () => {
    setFormOpen(false);
    setEditingZoneId(null);
    setForm(INITIAL_FORM);
  };

  useEffect(() => {
    if (!menuOpenZoneId) return undefined;
    const closeMenuOnOutside = (event) => {
      if (
        event.target.closest('[data-camera-menu-trigger]') ||
        event.target.closest('[data-camera-menu-popover]')
      ) {
        return;
      }
      setMenuOpenZoneId(null);
    };
    document.addEventListener('mousedown', closeMenuOnOutside);
    return () => document.removeEventListener('mousedown', closeMenuOnOutside);
  }, [menuOpenZoneId]);

  useEffect(() => {
    if (!menuOpenZoneId) return undefined;
    const closeMenu = () => setMenuOpenZoneId(null);
    window.addEventListener('scroll', closeMenu, true);
    window.addEventListener('resize', closeMenu);
    return () => {
      window.removeEventListener('scroll', closeMenu, true);
      window.removeEventListener('resize', closeMenu);
    };
  }, [menuOpenZoneId]);

  const openAddForm = () => {
    setFeedback({ type: '', message: '' });
    setForm(INITIAL_FORM);
    setEditingZoneId(null);
    setMenuOpenZoneId(null);
    setFormOpen(true);
  };

  const openEditForm = useCallback((camera) => {
    setFeedback({ type: '', message: '' });
    setMenuOpenZoneId(null);
    setEditingZoneId(camera.zone_id);
    setForm({
      zone_id: camera.zone_id || '',
      zone_name: camera.zone_name || '',
      rtsp_url: camera.rtsp_url || '',
      location_description: camera.location_description || '',
      frame_rate: String(camera.frame_rate ?? 30),
      resolution: camera.resolution || '1280x720',
      status: camera.status || 'active',
    });
    setFormOpen(true);
  }, []);

  const handleChange = (field, value) => {
    setForm((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const saveCamera = async (event) => {
    event.preventDefault();
    setSaving(true);
    setFeedback({ type: '', message: '' });

    const payload = {
      zone_name: form.zone_name.trim(),
      rtsp_url: form.rtsp_url.trim(),
      location_description: form.location_description.trim(),
      frame_rate: Number(form.frame_rate || 30),
      resolution: form.resolution.trim(),
      status: form.status,
    };

    if (!editingZoneId) {
      payload.zone_id = form.zone_id.trim();
    }

    try {
      if (editingZoneId) {
        const res = await api.put(`/api/v1/cameras/${editingZoneId}`, payload);
        const updatedCamera = res.data || {};
        setCameras((prev) => prev.map((camera) => (
          camera.zone_id === editingZoneId
            ? { ...camera, ...updatedCamera }
            : camera
        )));
        setFeedback({ type: 'success', message: `Camera ${editingZoneId} updated.` });
      } else {
        const res = await api.post('/api/v1/cameras', payload);
        const createdCamera = res.data || payload;
        setCameras((prev) => {
          const withoutDuplicate = prev.filter((camera) => camera.zone_id !== createdCamera.zone_id);
          return [...withoutDuplicate, createdCamera];
        });
        setFeedback({ type: 'success', message: `Camera ${payload.zone_id} added.` });
      }
      closeForm();
      onCamerasChanged?.();
    } catch (err) {
      setFeedback({
        type: 'error',
        message: err.response?.data?.error || 'Failed to save camera changes.',
      });
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = useCallback(async (camera) => {
    setMenuOpenZoneId(null);
    setFeedback({ type: '', message: '' });
    try {
      const newStatus = camera.status === 'active' ? 'inactive' : 'active';
      const res = await api.put(`/api/v1/cameras/${camera.zone_id}`, {
        status: newStatus,
      });
      const updatedCamera = res.data || {};
      setCameras((prev) => prev.map((item) => (
        item.zone_id === camera.zone_id
          ? { ...item, ...updatedCamera, status: newStatus }
          : item
      )));
      setFeedback({
        type: 'success',
        message: `${camera.zone_name || camera.zone_id} ${
          newStatus === 'inactive' ? 'deactivated' : 'activated'
        }.`,
      });
      onCamerasChanged?.();
    } catch (err) {
      setFeedback({
        type: 'error',
        message: err.response?.data?.error || 'Failed to update camera status.',
      });
    }
  }, [onCamerasChanged]);

  const openDeleteConfirmation = useCallback((camera) => {
    setMenuOpenZoneId(null);
    setDeleteConfirm({ open: true, camera });
  }, []);

  const closeDeleteConfirmation = () => {
    setDeleteConfirm({ open: false, camera: null });
  };

  const deleteCamera = async () => {
    const camera = deleteConfirm.camera;
    if (!camera?.zone_id) return;
    setSaving(true);
    setFeedback({ type: '', message: '' });
    try {
      await api.delete(`/api/v1/cameras/${camera.zone_id}`);
      setCameras((prev) => prev.filter((item) => item.zone_id !== camera.zone_id));
      setFeedback({
        type: 'success',
        message: `${camera.zone_name || camera.zone_id} soft deleted and hidden.`,
      });
      closeDeleteConfirmation();
      notifyCamerasChanged();
    } catch (err) {
      setFeedback({
        type: 'error',
        message: err.response?.data?.error || 'Failed to delete camera.',
      });
    } finally {
      setSaving(false);
    }
  };

  const openContextMenu = (event, zoneId) => {
    if (menuOpenZoneId === zoneId) {
      setMenuOpenZoneId(null);
      return;
    }
    const rect = event.currentTarget.getBoundingClientRect();
    const MENU_WIDTH = 208;
    const MENU_HEIGHT = 172;
    const VIEWPORT_PAD = 12;

    const left = Math.max(
      VIEWPORT_PAD,
      Math.min(rect.right - MENU_WIDTH, window.innerWidth - MENU_WIDTH - VIEWPORT_PAD)
    );
    const preferredTop = rect.bottom + 8;
    const fallbackTop = rect.top - MENU_HEIGHT - 8;
    const top = preferredTop + MENU_HEIGHT > window.innerHeight - VIEWPORT_PAD
      ? Math.max(VIEWPORT_PAD, fallbackTop)
      : preferredTop;

    setMenuPosition({ top, left });
    setMenuOpenZoneId(zoneId);
  };

  const menuCamera = useMemo(
    () => cameras.find((camera) => camera.zone_id === menuOpenZoneId) || null,
    [cameras, menuOpenZoneId]
  );

  const openCameraDetails = useCallback((zoneId) => {
    setMenuOpenZoneId(null);
    setSelectedZoneId(zoneId);
  }, []);

  useEffect(() => {
    if (!menuCamera) return undefined;

    const handleMenuHotkeys = (event) => {
      if (event.repeat) return;

      if (event.target instanceof HTMLElement) {
        const tagName = event.target.tagName;
        const isTypingTarget =
          event.target.isContentEditable ||
          tagName === 'INPUT' ||
          tagName === 'TEXTAREA' ||
          tagName === 'SELECT';
        if (isTypingTarget) {
          return;
        }
      }

      const key = event.key.toLowerCase();
      const hasShortcutModifiers = event.ctrlKey && event.altKey;

      if (hasShortcutModifiers && key === 'e') {
        event.preventDefault();
        openEditForm(menuCamera);
        return;
      }

      if (hasShortcutModifiers && key === 't') {
        event.preventDefault();
        toggleActive(menuCamera);
        return;
      }

      if (event.key === 'Delete') {
        event.preventDefault();
        openDeleteConfirmation(menuCamera);
      }
    };

    document.addEventListener('keydown', handleMenuHotkeys);
    return () => document.removeEventListener('keydown', handleMenuHotkeys);
  }, [menuCamera, openDeleteConfirmation, openEditForm, toggleActive]);

  return (
    <section className="bg-[#0a0f18] rounded border border-slate-800 shadow-[0_8px_32px_rgba(0,0,0,0.5)] p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-xs font-mono font-bold tracking-[0.2em] uppercase text-slate-200">CAMERA REGISTRY</h3>
          <p className="text-[10px] font-mono tracking-widest text-slate-500 mt-1 uppercase">
            {activeCount} ACTIVE / {cameras.length} TOTAL CAMERAS
          </p>
        </div>
        <button
          type="button"
          onClick={openAddForm}
          className="rounded border border-cyan-500/50 bg-cyan-500/10 px-4 py-2 text-[10px] font-mono font-bold tracking-widest uppercase text-cyan-400 shadow-[0_0_12px_rgba(34,211,238,0.2)] transition-all hover:bg-cyan-500/20 hover:border-cyan-400 hover:shadow-[0_0_16px_rgba(34,211,238,0.4)] focus:outline-none focus:ring-1 focus:ring-cyan-500/50"
        >
          + ADD CAMERA
        </button>
      </div>

      <div aria-live="polite" className="mt-3 min-h-[1.25rem]">
        {feedback.message && (
          <p
            className={`text-[10px] font-mono font-bold tracking-widest uppercase ${
              feedback.type === 'error' ? 'text-rose-400' : 'text-emerald-400'
            }`}
          >
            {feedback.message}
          </p>
        )}
      </div>

      {loading ? (
        <p className="text-[10px] font-mono tracking-widest uppercase text-slate-500">LOADING CAMERA REGISTRY…</p>
      ) : error ? (
        <div className="rounded border border-rose-500/30 bg-rose-500/10 p-3">
          <p className="text-[10px] font-mono tracking-widest uppercase text-rose-400">{error}</p>
          <button
            type="button"
            onClick={fetchCameras}
            className="mt-2 text-[10px] font-mono font-bold tracking-widest uppercase text-rose-400 hover:text-rose-300"
          >
            RETRY
          </button>
        </div>
      ) : (
        <div className="mt-4">
          <div className="flex px-4 pb-4 text-[10px] uppercase tracking-widest font-mono font-bold text-slate-500">
            <div className="w-1/4">ZONE</div>
            <div className="w-1/2">NAME</div>
            <div className="w-1/4">STATUS</div>
          </div>
          <div className="border-b border-slate-800 mb-2" />
          
          <div className="space-y-1">
            {cameras.map((camera) => (
              <div
                key={camera.zone_id}
                onClick={() => openCameraDetails(camera.zone_id)}
                className="flex items-center px-4 py-4 hover:bg-slate-800/50 hover:border-slate-700 border border-transparent transition-all duration-300 cursor-pointer rounded mx-2 my-1"
                data-testid={`camera-row-${camera.zone_id}`}
              >
                <div className="w-1/4">
                  <span className="bg-slate-900 text-slate-400 rounded px-2 py-1 text-[10px] font-mono font-bold tracking-wider border border-slate-800">
                    {camera.zone_id}
                  </span>
                </div>
                <div className="w-1/2 font-mono text-[11px] font-bold tracking-wider uppercase text-slate-200">
                  {camera.zone_name}
                </div>
                <div className="w-1/4 flex justify-between items-center">
                  <div className="flex items-center gap-2">
                    <span
                      className={`h-2 w-2 rounded-sm ${
                        camera.status === 'active' ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.8)] animate-pulse' : 'bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.8)]'
                      }`}
                    ></span>
                    <span className="text-[10px] font-mono font-bold tracking-widest uppercase text-slate-400">
                      {camera.status === 'active' ? 'ACTIVE' : 'INACTIVE'}
                    </span>
                  </div>
                  <button
                    type="button"
                    data-camera-menu-trigger
                    data-camera-action
                    onClick={(event) => {
                      event.stopPropagation();
                      openContextMenu(event, camera.zone_id);
                    }}
                    className="inline-flex h-8 w-8 items-center justify-center rounded border border-slate-700 bg-slate-900 text-slate-500 shadow-sm transition-colors hover:bg-slate-800 hover:text-cyan-400 focus:outline-none focus:ring-1 focus:ring-cyan-500/50"
                    aria-label={`Open actions menu for ${camera.zone_name || camera.zone_id}`}
                  >
                    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                      <circle cx="12" cy="5" r="1.8" />
                      <circle cx="12" cy="12" r="1.8" />
                      <circle cx="12" cy="19" r="1.8" />
                    </svg>
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {menuCamera && (
        <div
          data-camera-menu-popover
          className="fixed z-[120] w-52 rounded border border-slate-700 bg-[#0a0f18]/95 p-1.5 shadow-[0_8px_32px_rgba(0,0,0,0.8)] backdrop-blur-md transition-all duration-300"
          style={{ top: `${menuPosition.top}px`, left: `${menuPosition.left}px` }}
        >
          <button
            type="button"
            onClick={() => openEditForm(menuCamera)}
            className="flex w-full items-center justify-between rounded px-3 py-2 text-left text-[10px] font-mono tracking-widest uppercase text-slate-300 hover:bg-slate-800 hover:text-cyan-400"
          >
            <span>EDIT</span>
            <span className="rounded bg-slate-900 border border-slate-800 px-1.5 py-0.5 text-[8px] font-bold text-slate-500">
              CTRL+ALT+E
            </span>
          </button>
          <button
            type="button"
            onClick={() => toggleActive(menuCamera)}
            className="flex w-full items-center justify-between rounded px-3 py-2 text-left text-[10px] font-mono tracking-widest uppercase text-slate-300 hover:bg-slate-800 hover:text-cyan-400"
            aria-label={`${menuCamera.status === 'active' ? 'Deactivate' : 'Activate'} camera ${menuCamera.zone_name || menuCamera.zone_id}`}
          >
            <span>{menuCamera.status === 'active' ? 'DEACTIVATE' : 'ACTIVATE'}</span>
            <span className="rounded bg-slate-900 border border-slate-800 px-1.5 py-0.5 text-[8px] font-bold text-slate-500">
              CTRL+ALT+T
            </span>
          </button>
          <div role="separator" className="my-1 h-px bg-slate-800" />
          <button
            type="button"
            onClick={() => openDeleteConfirmation(menuCamera)}
            className="flex w-full items-center justify-between rounded px-3 py-2 text-left text-[10px] font-mono tracking-widest uppercase text-rose-400 hover:bg-rose-500/10 hover:text-rose-300"
          >
            <span>DELETE</span>
            <span className="rounded bg-rose-950 border border-rose-900 px-1.5 py-0.5 text-[8px] font-bold text-rose-500">
              DEL
            </span>
          </button>
        </div>
      )}

      {selectedCamera && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#05080f]/80 backdrop-blur-md p-4 animate-in fade-in duration-300"
          onClick={() => setSelectedZoneId(null)}
          aria-hidden="true"
        >
          <div
            className="max-w-2xl w-full bg-[#0a0f18] border border-slate-800 rounded shadow-[0_8px_32px_rgba(0,0,0,0.8)] p-8 animate-in fade-in zoom-in-95 duration-300"
            onClick={(e) => e.stopPropagation()}
            aria-label="Camera detail modal"
            data-testid="camera-detail-drawer"
          >
            <div className="flex items-start justify-between mb-8 pb-4 border-b border-slate-800">
              <div>
                <h4 className="text-xl font-mono font-bold tracking-[0.2em] text-slate-200 uppercase">
                  {selectedCamera.zone_name || selectedCamera.zone_id || 'UNKNOWN CAMERA'}
                </h4>
                <p className="mt-1 text-[10px] font-mono tracking-widest text-slate-500 uppercase">
                  ZONE: {selectedCamera.zone_id}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedZoneId(null)}
                className="hover:bg-slate-800 rounded p-2 transition-colors text-slate-500 hover:text-slate-300"
                aria-label="Close camera details"
              >
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="bg-slate-900 border border-slate-800 rounded p-4">
                <p className="mb-1 text-[9px] font-mono text-slate-500 font-bold uppercase tracking-[0.2em]">IP ADDRESS / SOURCE</p>
                <p className="text-[11px] font-mono text-cyan-400 break-all">{selectedCamera.rtsp_url || '—'}</p>
              </div>
              <div className="bg-slate-900 border border-slate-800 rounded p-4">
                <p className="mb-1 text-[9px] font-mono text-slate-500 font-bold uppercase tracking-[0.2em]">LOCATION / MAC</p>
                <p className="text-[11px] font-mono text-slate-300 truncate uppercase tracking-wider">{selectedCamera.location_description || '—'}</p>
              </div>
              <div className="bg-slate-900 border border-slate-800 rounded p-4">
                <p className="mb-1 text-[9px] font-mono text-slate-500 font-bold uppercase tracking-[0.2em]">RESOLUTION</p>
                <p className="text-[11px] font-mono text-slate-300 uppercase tracking-wider">{selectedCamera.resolution || '—'}</p>
              </div>
              <div className="bg-slate-900 border border-slate-800 rounded p-4">
                <p className="mb-1 text-[9px] font-mono text-slate-500 font-bold uppercase tracking-[0.2em]">FPS</p>
                <p className="text-[11px] font-mono text-slate-300 uppercase tracking-wider">{selectedCamera.frame_rate || '—'}</p>
              </div>
            </div>

            <div className="mt-8 flex items-center justify-end gap-3 pt-4 border-t border-slate-800">
              <button
                type="button"
                onClick={() => {
                  setSelectedZoneId(null);
                  openEditForm(selectedCamera);
                }}
                className="rounded border border-slate-700 bg-transparent px-6 py-2.5 text-[10px] font-mono font-bold tracking-widest uppercase text-slate-400 transition-colors hover:bg-slate-800 hover:text-slate-200"
              >
                EDIT
              </button>
              <button
                type="button"
                onClick={() => toggleActive(selectedCamera)}
                className="rounded border border-slate-700 bg-transparent px-6 py-2.5 text-[10px] font-mono font-bold tracking-widest uppercase text-slate-400 transition-colors hover:bg-slate-800 hover:text-slate-200"
              >
                {selectedCamera.status === 'active' ? 'DEACTIVATE' : 'ACTIVATE'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setSelectedZoneId(null);
                  openDeleteConfirmation(selectedCamera);
                }}
                className="rounded bg-rose-500/10 border border-rose-500/30 px-6 py-2.5 text-[10px] font-mono font-bold tracking-widest uppercase text-rose-400 transition-colors hover:bg-rose-500/20 hover:text-rose-300"
              >
                DELETE
              </button>
            </div>
          </div>
        </div>
      )}

      {formOpen && (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center bg-[#05080f]/80 p-4 backdrop-blur-md transition-all duration-300"
          role="dialog"
          aria-modal="true"
          aria-labelledby="camera-form-title"
        >
          <div className="w-full max-w-xl rounded border border-slate-800 bg-[#0a0f18] p-6 shadow-[0_8px_32px_rgba(0,0,0,0.8)]">
            <h4 id="camera-form-title" className="text-xl font-mono font-bold tracking-[0.2em] text-slate-200 uppercase">
              {editingZoneId ? `EDIT CAMERA ${editingZoneId}` : 'ADD CAMERA'}
            </h4>
            <p className="mt-1 text-[10px] font-mono tracking-widest text-slate-500 uppercase">
              CONFIGURE STREAM SOURCE AND RUNTIME SETTINGS FOR THIS CAMERA ZONE.
            </p>
            <form className="mt-5 space-y-4" onSubmit={saveCamera}>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="relative">
                  <input
                    id="zone_id"
                    value={form.zone_id}
                    onChange={(e) => handleChange('zone_id', e.target.value)}
                    disabled={Boolean(editingZoneId)}
                    required
                    placeholder=" "
                    className="peer w-full rounded border border-slate-700 bg-slate-900/50 px-3 py-3 text-sm font-mono text-slate-200 outline-none transition-all focus:border-cyan-500 focus:bg-slate-900 focus:ring-1 focus:ring-cyan-500/50 disabled:opacity-50"
                  />
                  <label
                    className="pointer-events-none absolute left-3 top-3 bg-transparent px-1 text-[10px] font-mono tracking-widest uppercase text-slate-500 transition-all peer-placeholder-shown:top-3.5 peer-placeholder-shown:text-xs peer-focus:-top-2 peer-focus:text-[9px] peer-focus:bg-[#0a0f18] peer-focus:text-cyan-400 peer-[:not(:placeholder-shown)]:-top-2 peer-[:not(:placeholder-shown)]:text-[9px] peer-[:not(:placeholder-shown)]:bg-[#0a0f18]"
                    htmlFor="zone_id"
                  >
                    ZONE
                  </label>
                </div>
                <div className="relative">
                  <input
                    id="zone_name"
                    value={form.zone_name}
                    onChange={(e) => handleChange('zone_name', e.target.value)}
                    required
                    placeholder=" "
                    className="peer w-full rounded border border-slate-700 bg-slate-900/50 px-3 py-3 text-sm font-mono text-slate-200 outline-none transition-all focus:border-cyan-500 focus:bg-slate-900 focus:ring-1 focus:ring-cyan-500/50"
                  />
                  <label
                    className="pointer-events-none absolute left-3 top-3 bg-transparent px-1 text-[10px] font-mono tracking-widest uppercase text-slate-500 transition-all peer-placeholder-shown:top-3.5 peer-placeholder-shown:text-xs peer-focus:-top-2 peer-focus:text-[9px] peer-focus:bg-[#0a0f18] peer-focus:text-cyan-400 peer-[:not(:placeholder-shown)]:-top-2 peer-[:not(:placeholder-shown)]:text-[9px] peer-[:not(:placeholder-shown)]:bg-[#0a0f18]"
                    htmlFor="zone_name"
                  >
                    CAMERA NAME
                  </label>
                </div>
              </div>

              <div className="relative">
                <input
                  id="rtsp_url"
                  value={form.rtsp_url}
                  onChange={(e) => handleChange('rtsp_url', e.target.value)}
                  required
                  placeholder=" "
                  className="peer w-full rounded border border-slate-700 bg-slate-900/50 px-3 py-3 text-sm font-mono text-slate-200 outline-none transition-all focus:border-cyan-500 focus:bg-slate-900 focus:ring-1 focus:ring-cyan-500/50"
                />
                <label
                  className="pointer-events-none absolute left-3 top-3 bg-transparent px-1 text-[10px] font-mono tracking-widest uppercase text-slate-500 transition-all peer-placeholder-shown:top-3.5 peer-placeholder-shown:text-xs peer-focus:-top-2 peer-focus:text-[9px] peer-focus:bg-[#0a0f18] peer-focus:text-cyan-400 peer-[:not(:placeholder-shown)]:-top-2 peer-[:not(:placeholder-shown)]:text-[9px] peer-[:not(:placeholder-shown)]:bg-[#0a0f18]"
                  htmlFor="rtsp_url"
                >
                  RTSP / WEBCAM URL
                </label>
              </div>

              <div>
                <label className="block text-[10px] font-mono font-bold tracking-widest uppercase text-slate-500" htmlFor="location_description">
                  LOCATION DESCRIPTION
                </label>
                <input
                  id="location_description"
                  value={form.location_description}
                  onChange={(e) => handleChange('location_description', e.target.value)}
                  className="mt-1 w-full rounded border border-slate-700 bg-slate-900/50 px-3 py-2 text-sm font-mono text-slate-200 outline-none focus:border-cyan-500 focus:bg-slate-900 focus:ring-1 focus:ring-cyan-500/50"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-mono font-bold tracking-widest uppercase text-slate-500" htmlFor="frame_rate">
                    FRAME RATE
                  </label>
                  <input
                    id="frame_rate"
                    type="number"
                    min="1"
                    value={form.frame_rate}
                    onChange={(e) => handleChange('frame_rate', e.target.value)}
                    className="mt-1 w-full rounded border border-slate-700 bg-slate-900/50 px-3 py-2 text-sm font-mono text-slate-200 outline-none focus:border-cyan-500 focus:bg-slate-900 focus:ring-1 focus:ring-cyan-500/50"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-mono font-bold tracking-widest uppercase text-slate-500" htmlFor="resolution">
                    RESOLUTION
                  </label>
                  <input
                    id="resolution"
                    value={form.resolution}
                    onChange={(e) => handleChange('resolution', e.target.value)}
                    className="mt-1 w-full rounded border border-slate-700 bg-slate-900/50 px-3 py-2 text-sm font-mono text-slate-200 outline-none focus:border-cyan-500 focus:bg-slate-900 focus:ring-1 focus:ring-cyan-500/50"
                  />
                </div>
              </div>

              <label className="inline-flex cursor-pointer select-none items-center gap-3 text-slate-400 transition-colors hover:text-cyan-400">
                <div className="relative flex items-center">
                  <input
                    type="checkbox"
                    checked={form.status === 'active'}
                    onChange={(e) => handleChange('status', e.target.checked ? 'active' : 'inactive')}
                    className="peer h-4 w-4 appearance-none rounded-sm border border-slate-700 bg-slate-900 transition-all checked:border-cyan-500 checked:bg-cyan-500/20 focus:outline-none focus:ring-1 focus:ring-cyan-500/50"
                  />
                  <svg className="absolute left-1/2 top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 text-cyan-400 opacity-0 transition-opacity peer-checked:opacity-100 pointer-events-none" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="3 8 6 11 13 4" />
                  </svg>
                </div>
                <span className="text-[10px] font-mono font-bold tracking-widest uppercase">ACTIVE CAMERA</span>
              </label>

              <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-800">
                <button
                  type="button"
                  onClick={closeForm}
                  className="rounded border border-slate-700 bg-transparent px-6 py-2.5 text-[10px] font-mono font-bold tracking-widest uppercase text-slate-400 transition-colors hover:bg-slate-800 hover:text-slate-200"
                >
                  CANCEL
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="rounded border border-cyan-500/50 bg-cyan-500/10 px-6 py-2.5 text-[10px] font-mono font-bold tracking-widest uppercase text-cyan-400 shadow-[0_0_12px_rgba(34,211,238,0.2)] transition-colors hover:bg-cyan-500/20 hover:border-cyan-400 hover:shadow-[0_0_16px_rgba(34,211,238,0.4)] disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {saving ? 'SAVING…' : 'SAVE CAMERA'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {deleteConfirm.open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#05080f]/80 p-4 backdrop-blur-md transition-all duration-300"
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-camera-title"
        >
          <div className="w-full max-w-md rounded border border-rose-500/50 bg-[#0a0f18] p-6 shadow-[0_8px_32px_rgba(244,63,94,0.15)]">
            <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded bg-rose-500/10 border border-rose-500/30 text-rose-500 shadow-[0_0_12px_rgba(244,63,94,0.3)]">
              <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v4m0 4h.01M10.29 3.86l-8.04 13.92A2 2 0 004 21h16a2 2 0 001.75-3.22L13.71 3.86a2 2 0 00-3.42 0z" />
              </svg>
            </div>
            <h4 id="delete-camera-title" className="text-xl font-mono font-bold tracking-[0.2em] text-slate-200 uppercase">
              REMOVE CAMERA
            </h4>
            <p className="mt-2 text-[10px] font-mono tracking-widest text-slate-500 uppercase">
              ARE YOU SURE YOU WANT TO REMOVE THIS CAMERA? THIS WILL DISABLE DROWNING DETECTION IN THIS ZONE.
            </p>
            <div className="mt-6 flex items-center justify-end gap-3 pt-4 border-t border-slate-800">
              <button
                type="button"
                onClick={closeDeleteConfirmation}
                disabled={saving}
                className="rounded border border-slate-700 bg-transparent px-6 py-2.5 text-[10px] font-mono font-bold tracking-widest uppercase text-slate-400 transition-colors hover:bg-slate-800 hover:text-slate-200 disabled:opacity-50"
              >
                CANCEL
              </button>
              <button
                type="button"
                onClick={deleteCamera}
                disabled={saving}
                className="rounded border border-rose-500/50 bg-rose-500/10 px-6 py-2.5 text-[10px] font-mono font-bold tracking-widest uppercase text-rose-400 shadow-[0_0_12px_rgba(244,63,94,0.2)] transition-colors hover:bg-rose-500/20 hover:border-rose-400 hover:shadow-[0_0_16px_rgba(244,63,94,0.4)] disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {saving ? 'REMOVING…' : 'CONFIRM DELETION'}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

export default CameraManagementPanel;
