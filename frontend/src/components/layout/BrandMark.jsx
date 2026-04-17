import React from 'react';

function BrandMark({ showText = true, className = '' }) {
  return (
    <div className={`flex items-center gap-3 ${className}`}>
      <div className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-800 shadow-sm">
        <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0l5.65-5.66zm0-2.83L4.93 6.93a10 10 0 1 0 14.14 0L12-.14z" />
          <path d="M12 8a4 4 0 0 0-4 4c0 .55.45 1 1 1s1-.45 1-1a2 2 0 0 1 2-2c.55 0 1-.45 1-1s-.45-1-1-1z" />
        </svg>
      </div>
      {showText && (
        <div>
          <h1 className="text-slate-800 font-bold text-xl tracking-tight">AquaGuard</h1>
          <p className="text-slate-500 text-xs">Drowning Detection System</p>
        </div>
      )}
    </div>
  );
}

export default BrandMark;
