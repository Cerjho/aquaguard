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
  is_active: true,
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
      const data = Array.isArray(res.data) ? res.data : res.data.cameras || [];
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
    () => cameras.filter((camera) => camera.is_active).length,
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
      is_active: Boolean(camera.is_active),
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
      is_active: Boolean(form.is_active),
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
      const res = await api.put(`/api/v1/cameras/${camera.zone_id}`, {
        is_active: !camera.is_active,
      });
      const updatedCamera = res.data || {};
      setCameras((prev) => prev.map((item) => (
        item.zone_id === camera.zone_id
          ? { ...item, ...updatedCamera, is_active: !camera.is_active }
          : item
      )));
      setFeedback({
        type: 'success',
        message: `${camera.zone_name || camera.zone_id} ${
          camera.is_active ? 'deactivated' : 'activated'
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
    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-md">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold tracking-tight text-slate-900">Camera Registry</h3>
          <p className="text-xs text-slate-500 mt-1">
            {activeCount} active / {cameras.length} total cameras
          </p>
        </div>
        <button
          type="button"
          onClick={openAddForm}
          className="rounded-2xl border border-[#a3cef1] bg-[#a3cef1]/30 px-4 py-2 text-sm font-medium text-slate-800 shadow-sm transition-all hover:-translate-y-0.5 hover:bg-[#a3cef1]/45 focus:outline-none focus:ring-2 focus:ring-[#a3cef1]/60"
        >
          + Add Camera
        </button>
      </div>

      <div aria-live="polite" className="mt-3 min-h-[1.25rem]">
        {feedback.message && (
          <p
            className={`text-sm ${
              feedback.type === 'error' ? 'text-rose-600' : 'text-emerald-700'
            }`}
          >
            {feedback.message}
          </p>
        )}
      </div>

      {loading ? (
        <p className="text-sm text-slate-500">Loading camera registry…</p>
      ) : error ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-100 p-3">
          <p className="text-sm text-rose-700">{error}</p>
          <button
            type="button"
            onClick={fetchCameras}
            className="mt-2 text-sm text-rose-700 underline"
          >
            Retry
          </button>
        </div>
      ) : (
        <div className="relative mt-2 rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="overflow-x-auto overflow-y-visible rounded-2xl">
            <table className="min-w-full text-sm">
            <caption className="sr-only">Registered cameras including inactive entries</caption>
            <thead>
              <tr className="text-left text-slate-500 border-b border-slate-200 bg-slate-50">
                <th scope="col" className="px-4 py-3">Zone</th>
                <th scope="col" className="px-4 py-3">Name</th>
                <th scope="col" className="px-4 py-3">Status</th>
                <th scope="col" className="px-4 py-3 w-[164px]">Actions</th>
              </tr>
            </thead>
              <tbody>
              {cameras.map((camera) => {
                const isMenuOpen = menuOpenZoneId === camera.zone_id;
                const isSelected = selectedZoneId === camera.zone_id;

                return (
                  <tr
                    key={camera.zone_id}
                    className={`group border-b border-slate-100 transition-colors ${
                      isSelected
                        ? 'bg-[#a3cef1]/25 ring-1 ring-inset ring-[#8cbfe8]'
                        : isMenuOpen
                          ? 'bg-slate-50'
                          : 'hover:bg-slate-50/80 focus-within:bg-slate-50/80'
                    }`}
                  >
                    <td className="p-0 align-middle">
                      <button
                        type="button"
                        data-testid={`camera-row-${camera.zone_id}`}
                        onClick={() => openCameraDetails(camera.zone_id)}
                        className="block h-full w-full rounded-none px-4 py-3 text-left font-mono text-xs text-slate-600 transition-colors hover:bg-slate-100/70 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-blue-200"
                        aria-label={`Open details for ${camera.zone_name || camera.zone_id}`}
                      >
                        {camera.zone_id}
                      </button>
                    </td>
                    <td className="p-0 align-middle">
                      <button
                        type="button"
                        onClick={() => openCameraDetails(camera.zone_id)}
                        className="block h-full w-full rounded-none px-4 py-3 text-left transition-colors hover:bg-slate-100/70 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-blue-200"
                        aria-label={`Open details for ${camera.zone_name || camera.zone_id}`}
                      >
                        <span className="block font-medium text-slate-700">{camera.zone_name}</span>
                        <span className="block truncate max-w-[280px] text-xs text-slate-500">{camera.rtsp_url}</span>
                      </button>
                    </td>
                    <td className="p-0 align-middle">
                      <button
                        type="button"
                        onClick={() => openCameraDetails(camera.zone_id)}
                        className="block h-full w-full rounded-none px-4 py-3 text-left transition-colors hover:bg-slate-100/70 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-blue-200"
                        aria-label={`Open details for ${camera.zone_name || camera.zone_id}`}
                      >
                        <span
                          className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${
                            camera.is_active
                              ? 'bg-emerald-100 text-emerald-700 border border-emerald-200'
                              : 'bg-slate-100 text-slate-700 border border-slate-200'
                          }`}
                        >
                          {camera.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </button>
                    </td>
                    <td className="relative px-4 py-3">
                      <div className="relative z-20 flex justify-end">
                        <div
                          className={`inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white/95 p-1 shadow-sm transition-all duration-200 ${
                            isMenuOpen || isSelected
                              ? 'opacity-100 translate-y-0 pointer-events-auto'
                              : 'opacity-100 translate-y-0 sm:opacity-0 sm:translate-y-1 sm:pointer-events-none sm:group-hover:opacity-100 sm:group-hover:translate-y-0 sm:group-hover:pointer-events-auto sm:group-focus-within:opacity-100 sm:group-focus-within:translate-y-0 sm:group-focus-within:pointer-events-auto'
                          }`}
                        >
                          <button
                            type="button"
                            data-camera-action
                            onClick={(event) => {
                              event.stopPropagation();
                              openEditForm(camera);
                            }}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-full text-slate-700 transition-colors hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-200"
                            aria-label={`Quick edit camera ${camera.zone_name || camera.zone_id}`}
                            title="Edit"
                          >
                            <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24" aria-hidden="true">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 3.487a2.1 2.1 0 112.97 2.97L8.25 18.04 4 20l1.96-4.25L16.862 3.487z" />
                            </svg>
                            <span className="sr-only">Edit</span>
                          </button>
                          <button
                            type="button"
                            data-camera-action
                            onClick={(event) => {
                              event.stopPropagation();
                              toggleActive(camera);
                            }}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-full text-slate-700 transition-colors hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-200"
                            aria-label={`Quick toggle camera status for ${camera.zone_name || camera.zone_id}`}
                            title={camera.is_active ? 'Deactivate' : 'Activate'}
                          >
                            {camera.is_active ? (
                              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                                <rect x="6.5" y="5" width="4" height="14" rx="1" />
                                <rect x="13.5" y="5" width="4" height="14" rx="1" />
                              </svg>
                            ) : (
                              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                                <path d="M8 6.5v11a1 1 0 001.53.85l8.5-5.5a1 1 0 000-1.7l-8.5-5.5A1 1 0 008 6.5z" />
                              </svg>
                            )}
                            <span className="sr-only">Toggle status</span>
                          </button>
                        </div>
                        <button
                          type="button"
                          data-camera-menu-trigger
                          data-camera-action
                          onClick={(event) => {
                            event.stopPropagation();
                            openContextMenu(event, camera.zone_id);
                          }}
                          className="ml-1 inline-flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 shadow-sm transition-colors hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-200"
                          aria-label={`Open actions menu for ${camera.zone_name || camera.zone_id}`}
                        >
                          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                            <circle cx="12" cy="5" r="1.8" />
                            <circle cx="12" cy="12" r="1.8" />
                            <circle cx="12" cy="19" r="1.8" />
                          </svg>
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {menuCamera && (
        <div
          data-camera-menu-popover
          className="fixed z-[120] w-52 rounded-2xl border border-slate-100 bg-white/90 p-1.5 shadow-lg backdrop-blur-md transition-all duration-300"
          style={{ top: `${menuPosition.top}px`, left: `${menuPosition.left}px` }}
        >
          <button
            type="button"
            onClick={() => openEditForm(menuCamera)}
            className="flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-xs font-medium text-slate-700 hover:bg-slate-100"
          >
            <span className="inline-flex items-center gap-2">
              <svg className="h-4 w-4 text-slate-500" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 3.487a2.1 2.1 0 112.97 2.97L8.25 18.04 4 20l1.96-4.25L16.862 3.487z" />
              </svg>
              <span>Edit</span>
            </span>
            <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
              Ctrl+Alt+E
            </span>
          </button>
          <button
            type="button"
            onClick={() => toggleActive(menuCamera)}
            className="flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-xs font-medium text-slate-700 hover:bg-slate-100"
            aria-label={`${menuCamera.is_active ? 'Deactivate' : 'Activate'} camera ${menuCamera.zone_name || menuCamera.zone_id}`}
          >
            <span className="inline-flex items-center gap-2">
              {menuCamera.is_active ? (
                <svg className="h-4 w-4 text-slate-500" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <rect x="6.5" y="5" width="4" height="14" rx="1" />
                  <rect x="13.5" y="5" width="4" height="14" rx="1" />
                </svg>
              ) : (
                <svg className="h-4 w-4 text-slate-500" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path d="M8 6.5v11a1 1 0 001.53.85l8.5-5.5a1 1 0 000-1.7l-8.5-5.5A1 1 0 008 6.5z" />
                </svg>
              )}
              <span>{menuCamera.is_active ? 'Deactivate' : 'Activate'}</span>
            </span>
            <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
              Ctrl+Alt+T
            </span>
          </button>
          <div role="separator" className="my-1 h-px bg-slate-200" />
          <button
            type="button"
            onClick={() => openDeleteConfirmation(menuCamera)}
            className="flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-xs font-medium text-rose-500 hover:bg-rose-50"
          >
            <span className="inline-flex items-center gap-2">
              <svg className="h-4 w-4 text-rose-500" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 7h16M9 7V5a1 1 0 011-1h4a1 1 0 011 1v2m-8 0l1 12a1 1 0 001 .9h6a1 1 0 001-.9l1-12" />
              </svg>
              <span>Delete</span>
            </span>
            <span className="rounded bg-rose-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-rose-500">
              Del
            </span>
          </button>
        </div>
      )}

      {selectedCamera && (
        <>
          <div
            className="fixed inset-0 z-30 bg-slate-900/25 backdrop-blur-[1px]"
            onClick={() => setSelectedZoneId(null)}
            aria-hidden="true"
          />
          <aside
            className="fixed top-0 right-0 z-[35] h-full w-full max-w-xl overflow-y-auto border-l border-[#e7ecef] bg-white p-6 shadow-md"
            aria-label="Camera detail drawer"
            data-testid="camera-detail-drawer"
          >
            <div className="mb-6 flex items-start justify-between">
              <div>
                <p className="text-xs uppercase tracking-wide text-slate-500">Camera Details</p>
                <h4 className="mt-1 text-xl font-semibold text-slate-900">
                  {selectedCamera.zone_name || selectedCamera.zone_id || 'Unknown Camera'}
                </h4>
              </div>
              <button
                type="button"
                onClick={() => setSelectedZoneId(null)}
                className="rounded-full border border-slate-200 p-2 text-slate-500 transition-all hover:bg-slate-50"
                aria-label="Close camera details"
              >
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.75" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="space-y-4">
              <div className="rounded-2xl border border-[#e7ecef] bg-white p-4 shadow-sm">
                <p className="mb-1 text-xs text-slate-500">Zone ID</p>
                <p className="text-sm font-medium text-slate-900">{selectedCamera.zone_id || '—'}</p>
              </div>
              <div className="rounded-2xl border border-[#e7ecef] bg-white p-4 shadow-sm">
                <p className="mb-1 text-xs text-slate-500">Stream Source</p>
                <p className="break-all text-sm font-medium text-slate-900">{selectedCamera.rtsp_url || '—'}</p>
              </div>
              <div className="rounded-2xl border border-[#e7ecef] bg-white p-4 shadow-sm">
                <p className="mb-1 text-xs text-slate-500">Location</p>
                <p className="text-sm font-medium text-slate-900">
                  {selectedCamera.location_description || 'No location description'}
                </p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="rounded-2xl border border-[#e7ecef] bg-white p-4 shadow-sm">
                  <p className="mb-1 text-xs text-slate-500">Frame Rate</p>
                  <p className="text-sm font-semibold text-slate-900">{selectedCamera.frame_rate || '—'}</p>
                </div>
                <div className="rounded-2xl border border-[#e7ecef] bg-white p-4 shadow-sm">
                  <p className="mb-1 text-xs text-slate-500">Resolution</p>
                  <p className="text-sm font-semibold text-slate-900">{selectedCamera.resolution || '—'}</p>
                </div>
              </div>
              <div className="rounded-2xl border border-[#e7ecef] bg-white p-4 shadow-sm">
                <p className="mb-1 text-xs text-slate-500">Status</p>
                <p className="text-sm font-semibold text-slate-900">
                  {selectedCamera.is_active ? 'Active' : 'Inactive'}
                </p>
              </div>
            </div>

            <div className="mt-6 grid grid-cols-1 gap-2 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => openEditForm(selectedCamera)}
                className="rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
              >
                Edit Camera
              </button>
              <button
                type="button"
                onClick={() => toggleActive(selectedCamera)}
                className="rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
              >
                {selectedCamera.is_active ? 'Deactivate Camera' : 'Activate Camera'}
              </button>
              <button
                type="button"
                onClick={() => openDeleteConfirmation(selectedCamera)}
                className="rounded-2xl bg-rose-500 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-rose-600 sm:col-span-2"
              >
                Remove Camera
              </button>
            </div>
          </aside>
        </>
      )}

      {formOpen && (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/20 p-4 backdrop-blur-sm transition-all duration-300"
          role="dialog"
          aria-modal="true"
          aria-labelledby="camera-form-title"
        >
          <div className="w-full max-w-xl rounded-3xl border border-slate-100 bg-white p-6 shadow-xl">
            <h4 id="camera-form-title" className="text-xl font-semibold tracking-tight text-slate-900">
              {editingZoneId ? `Edit Camera ${editingZoneId}` : 'Add Camera'}
            </h4>
            <p className="mt-1 text-xs text-slate-500">
              Configure stream source and runtime settings for this camera zone.
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
                    className="peer w-full rounded-2xl border border-slate-200 bg-white px-3 py-3 text-sm text-slate-800 outline-none transition-all focus:border-[#a3cef1] focus:ring-2 focus:ring-[#a3cef1]/30"
                  />
                  <label
                    className="pointer-events-none absolute left-3 top-3 bg-white px-1 text-sm text-slate-500 transition-all peer-placeholder-shown:top-3 peer-placeholder-shown:text-sm peer-focus:-top-2 peer-focus:text-xs peer-focus:text-slate-600 peer-[:not(:placeholder-shown)]:-top-2 peer-[:not(:placeholder-shown)]:text-xs"
                    htmlFor="zone_id"
                  >
                    Zone
                  </label>
                </div>
                <div className="relative">
                  <input
                    id="zone_name"
                    value={form.zone_name}
                    onChange={(e) => handleChange('zone_name', e.target.value)}
                    required
                    placeholder=" "
                    className="peer w-full rounded-2xl border border-slate-200 bg-white px-3 py-3 text-sm text-slate-800 outline-none transition-all focus:border-[#a3cef1] focus:ring-2 focus:ring-[#a3cef1]/30"
                  />
                  <label
                    className="pointer-events-none absolute left-3 top-3 bg-white px-1 text-sm text-slate-500 transition-all peer-placeholder-shown:top-3 peer-placeholder-shown:text-sm peer-focus:-top-2 peer-focus:text-xs peer-focus:text-slate-600 peer-[:not(:placeholder-shown)]:-top-2 peer-[:not(:placeholder-shown)]:text-xs"
                    htmlFor="zone_name"
                  >
                    Camera Name
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
                  className="peer w-full rounded-2xl border border-slate-200 bg-white px-3 py-3 text-sm text-slate-800 outline-none transition-all focus:border-[#a3cef1] focus:ring-2 focus:ring-[#a3cef1]/30"
                />
                <label
                  className="pointer-events-none absolute left-3 top-3 bg-white px-1 text-sm text-slate-500 transition-all peer-placeholder-shown:top-3 peer-placeholder-shown:text-sm peer-focus:-top-2 peer-focus:text-xs peer-focus:text-slate-600 peer-[:not(:placeholder-shown)]:-top-2 peer-[:not(:placeholder-shown)]:text-xs"
                  htmlFor="rtsp_url"
                >
                  RTSP / Webcam URL
                </label>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700" htmlFor="location_description">
                  Location Description
                </label>
                <input
                  id="location_description"
                  value={form.location_description}
                  onChange={(e) => handleChange('location_description', e.target.value)}
                  className="mt-1 w-full rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-slate-700" htmlFor="frame_rate">
                    Frame Rate
                  </label>
                  <input
                    id="frame_rate"
                    type="number"
                    min="1"
                    value={form.frame_rate}
                    onChange={(e) => handleChange('frame_rate', e.target.value)}
                    className="mt-1 w-full rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700" htmlFor="resolution">
                    Resolution
                  </label>
                  <input
                    id="resolution"
                    value={form.resolution}
                    onChange={(e) => handleChange('resolution', e.target.value)}
                    className="mt-1 w-full rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
                  />
                </div>
              </div>

              <label className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={form.is_active}
                  onChange={(e) => handleChange('is_active', e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 text-blue-500 focus:ring-blue-200"
                />
                Active camera
              </label>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={closeForm}
                  className="rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-2xl border border-[#a3cef1] bg-[#a3cef1] px-4 py-2 text-sm font-semibold text-slate-900 shadow-sm transition-colors hover:bg-[#8cbfe8] disabled:opacity-60"
                >
                  {saving ? 'Saving…' : 'Save Camera'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {deleteConfirm.open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/20 p-4 backdrop-blur-sm transition-all duration-300"
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-camera-title"
        >
          <div className="w-full max-w-md rounded-3xl border border-slate-100 bg-white p-6 shadow-xl">
            <div className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-full bg-rose-100 text-rose-600">
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v4m0 4h.01M10.29 3.86l-8.04 13.92A2 2 0 004 21h16a2 2 0 001.75-3.22L13.71 3.86a2 2 0 00-3.42 0z" />
              </svg>
            </div>
            <h4 id="delete-camera-title" className="text-lg font-semibold text-slate-900">
              Remove Camera
            </h4>
            <p className="mt-2 text-sm text-slate-600">
              Are you sure you want to remove this camera? This will disable drowning detection in this zone.
            </p>
            <div className="mt-5 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={closeDeleteConfirmation}
                disabled={saving}
                className="rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={deleteCamera}
                disabled={saving}
                className="rounded-2xl bg-rose-500 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-rose-600 disabled:opacity-60"
              >
                {saving ? 'Removing…' : 'Yes, Remove Camera'}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

export default CameraManagementPanel;
