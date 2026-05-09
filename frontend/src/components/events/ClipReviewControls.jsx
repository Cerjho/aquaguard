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
    <div className="flex flex-col gap-3 mt-4 border-t border-slate-800 pt-4">
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-mono font-bold text-slate-400 uppercase tracking-widest">Review Action</p>
        <button 
          onClick={() => setShowNotes(!showNotes)}
          className="text-[10px] font-mono font-bold tracking-widest uppercase text-cyan-400 hover:text-cyan-300"
        >
          {showNotes ? 'HIDE NOTES' : '+ ADD NOTES'}
        </button>
      </div>

      {showNotes && (
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="OPTIONAL NOTES ABOUT THIS CLIP..."
          className="w-full text-xs font-mono p-3 border border-slate-800 rounded bg-slate-900 text-slate-300 placeholder-slate-600 focus:ring-1 focus:ring-cyan-500/50 focus:border-cyan-500 focus:outline-none"
          rows={2}
          disabled={status === 'loading'}
        />
      )}

      <div className="flex gap-3">
        <button
          type="button"
          onClick={() => handleReview('dismissed')}
          disabled={status === 'loading'}
          className="flex-1 py-3 rounded text-[10px] font-mono font-bold tracking-widest uppercase text-slate-400 bg-transparent border border-slate-700 hover:bg-slate-800 hover:text-slate-200 transition-colors shadow-sm disabled:opacity-50"
        >
          DISMISS FALSE ALARM
        </button>
        <button
          type="button"
          onClick={() => handleReview('confirmed')}
          disabled={status === 'loading'}
          className="flex-1 py-3 rounded text-[10px] font-mono font-bold tracking-widest uppercase text-rose-100 bg-rose-500/20 border border-rose-500/50 hover:bg-rose-500 hover:shadow-[0_0_16px_rgba(244,63,94,0.6)] transition-all shadow-md disabled:opacity-50"
        >
          {status === 'loading' ? 'SAVING...' : 'CONFIRM DROWNING'}
        </button>
      </div>

      {status === 'error' && (
        <div className="text-[10px] font-mono font-bold tracking-widest uppercase text-rose-400 bg-rose-950/50 p-3 rounded border border-rose-500/50">
          {errorMsg}
        </div>
      )}
    </div>
  );
}

export default ClipReviewControls;
