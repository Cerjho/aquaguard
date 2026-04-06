import React, { useCallback, useEffect, useMemo, useState } from 'react';
import api from '../../hooks/useApi';

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
  const [cameras, setCameras] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState({ type: '', message: '' });
  const [error, setError] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [editingZoneId, setEditingZoneId] = useState(null);
  const [form, setForm] = useState(INITIAL_FORM);

  const fetchCameras = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await api.get('/api/v1/cameras', {
        params: { include_inactive: true },
      });
      const data = Array.isArray(res.data) ? res.data : res.data.cameras || [];
      setCameras(data);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load camera management data.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCameras();
  }, [fetchCameras]);

  const activeCount = useMemo(
    () => cameras.filter((camera) => camera.is_active).length,
    [cameras]
  );

  const closeForm = () => {
    setFormOpen(false);
    setEditingZoneId(null);
    setForm(INITIAL_FORM);
  };

  const openAddForm = () => {
    setFeedback({ type: '', message: '' });
    setForm(INITIAL_FORM);
    setEditingZoneId(null);
    setFormOpen(true);
  };

  const openEditForm = (camera) => {
    setFeedback({ type: '', message: '' });
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
  };

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

  const toggleActive = async (camera) => {
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
  };

  return (
    <section className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-base font-semibold text-slate-800">Camera Management</h3>
          <p className="text-xs text-slate-500">
            {activeCount} active / {cameras.length} total cameras
          </p>
        </div>
        <button
          type="button"
          onClick={openAddForm}
          className="px-3 py-1.5 text-sm rounded-md bg-sky-600 text-white hover:bg-sky-700 focus:outline-none focus:ring-2 focus:ring-sky-500"
        >
          Add Camera
        </button>
      </div>

      <div aria-live="polite" className="mt-3 min-h-[1.25rem]">
        {feedback.message && (
          <p
            className={`text-sm ${
              feedback.type === 'error' ? 'text-red-600' : 'text-green-700'
            }`}
          >
            {feedback.message}
          </p>
        )}
      </div>

      {loading ? (
        <p className="text-sm text-slate-500">Loading cameras…</p>
      ) : error ? (
        <div className="rounded border border-red-200 bg-red-50 p-3">
          <p className="text-sm text-red-600">{error}</p>
          <button
            type="button"
            onClick={fetchCameras}
            className="mt-2 text-sm text-red-700 underline"
          >
            Retry
          </button>
        </div>
      ) : (
        <div className="mt-2 overflow-x-auto">
          <table className="min-w-full text-sm">
            <caption className="sr-only">Registered cameras including inactive entries</caption>
            <thead>
              <tr className="text-left text-slate-500 border-b border-slate-200">
                <th scope="col" className="py-2 pr-3">Zone</th>
                <th scope="col" className="py-2 pr-3">Name</th>
                <th scope="col" className="py-2 pr-3">Status</th>
                <th scope="col" className="py-2 pr-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {cameras.map((camera) => (
                <tr key={camera.zone_id} className="border-b border-slate-100">
                  <td className="py-2 pr-3 font-mono text-xs">{camera.zone_id}</td>
                  <td className="py-2 pr-3">
                    <p className="font-medium text-slate-700">{camera.zone_name}</p>
                    <p className="text-xs text-slate-500 truncate max-w-[280px]">{camera.rtsp_url}</p>
                  </td>
                  <td className="py-2 pr-3">
                    <span
                      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                        camera.is_active
                          ? 'bg-green-100 text-green-700'
                          : 'bg-slate-200 text-slate-700'
                      }`}
                    >
                      {camera.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="py-2 pr-3">
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => openEditForm(camera)}
                        className="px-2 py-1 rounded border border-slate-300 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-sky-500"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => toggleActive(camera)}
                        className="px-2 py-1 rounded border border-slate-300 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-sky-500"
                        aria-label={`${camera.is_active ? 'Deactivate' : 'Activate'} camera ${camera.zone_name || camera.zone_id}`}
                      >
                        {camera.is_active ? 'Deactivate' : 'Activate'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {formOpen && (
        <div
          className="fixed inset-0 z-40 bg-slate-950/60 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="camera-form-title"
        >
          <div className="w-full max-w-lg bg-white rounded-lg shadow-xl border border-slate-200 p-4">
            <h4 id="camera-form-title" className="text-lg font-semibold text-slate-800">
              {editingZoneId ? `Edit Camera ${editingZoneId}` : 'Add Camera'}
            </h4>
            <form className="mt-3 space-y-3" onSubmit={saveCamera}>
              <div>
                <label className="block text-sm font-medium text-slate-700" htmlFor="zone_id">
                  Zone ID
                </label>
                <input
                  id="zone_id"
                  value={form.zone_id}
                  onChange={(e) => handleChange('zone_id', e.target.value)}
                  disabled={Boolean(editingZoneId)}
                  required
                  className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700" htmlFor="zone_name">
                  Zone Name
                </label>
                <input
                  id="zone_name"
                  value={form.zone_name}
                  onChange={(e) => handleChange('zone_name', e.target.value)}
                  required
                  className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700" htmlFor="rtsp_url">
                  RTSP URL
                </label>
                <input
                  id="rtsp_url"
                  value={form.rtsp_url}
                  onChange={(e) => handleChange('rtsp_url', e.target.value)}
                  required
                  className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700" htmlFor="location_description">
                  Location Description
                </label>
                <input
                  id="location_description"
                  value={form.location_description}
                  onChange={(e) => handleChange('location_description', e.target.value)}
                  className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm"
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
                    className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm"
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
                    className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm"
                  />
                </div>
              </div>

              <label className="inline-flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={form.is_active}
                  onChange={(e) => handleChange('is_active', e.target.checked)}
                />
                Active camera
              </label>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={closeForm}
                  className="px-3 py-1.5 rounded border border-slate-300 text-sm hover:bg-slate-100"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-3 py-1.5 rounded bg-sky-600 text-white text-sm hover:bg-sky-700 disabled:opacity-60"
                >
                  {saving ? 'Saving…' : editingZoneId ? 'Save Changes' : 'Create Camera'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  );
}

export default CameraManagementPanel;
