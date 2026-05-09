import React, { useState } from 'react';
import useClipsApi from '../../hooks/useClipsApi';
import { useAlertState } from '../../context/AlertContext.jsx';

function ClipReviewControls({ clipId, onSuccess }) {
  const { reviewClip } = useClipsApi();
  const { decrementPendingClips } = useAlertState();
  const [status, setStatus] = useState('idle'); // idle, loading, error
  const [errorMsg, setErrorMsg] = useState(null);
  const [notes, setNotes] = useState('');
  const [showNotes, setShowNotes] = useState(false);

  const handleReview = async (outcome) => {
    setStatus('loading');
    setErrorMsg(null);
    try {
      await reviewClip(clipId, outcome, notes);
      setStatus('success');
      decrementPendingClips(clipId);
      if (onSuccess) onSuccess();
    } catch (err) {
      setStatus('error');
      setErrorMsg(err.response?.data?.message || err.response?.data?.error || 'Failed to submit review');
    }
  };

  return (
    <div className="flex flex-col gap-3 mt-4 border-t border-slate-100 pt-4">
      <div className="flex items-center justify-between">
        <p className="text-xs font-bold text-slate-800 uppercase tracking-widest">Review Action</p>
        <button 
          onClick={() => setShowNotes(!showNotes)}
          className="text-xs text-blue-600 hover:text-blue-800 font-medium"
        >
          {showNotes ? 'Hide Notes' : '+ Add Notes'}
        </button>
      </div>

      {showNotes && (
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Optional notes about this clip..."
          className="w-full text-sm p-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-slate-50"
          rows={2}
          disabled={status === 'loading'}
        />
      )}

      <div className="flex gap-3">
        <button
          type="button"
          onClick={() => handleReview('dismissed')}
          disabled={status === 'loading'}
          className="flex-1 py-3 rounded-xl text-sm font-bold text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 transition-colors shadow-sm disabled:opacity-50"
        >
          Dismiss False Alarm
        </button>
        <button
          type="button"
          onClick={() => handleReview('confirmed')}
          disabled={status === 'loading'}
          className="flex-1 py-3 rounded-xl text-sm font-bold text-white bg-rose-600 hover:bg-rose-700 transition-colors shadow-md disabled:opacity-50"
        >
          {status === 'loading' ? 'Saving...' : 'Confirm Drowning'}
        </button>
      </div>

      {status === 'error' && (
        <div className="text-xs text-rose-600 bg-rose-50 p-2 rounded-lg border border-rose-100">
          {errorMsg}
        </div>
      )}
    </div>
  );
}

export default ClipReviewControls;
