import React from 'react';

function BrandMark({ showText = true, className = '' }) {
  return (
    <div className={`flex items-center gap-3 ${className}`}>
      <div className="h-10 w-10 rounded-2xl bg-[#a3cef1]/20 border border-[#a3cef1]/40 flex items-center justify-center">
        <svg className="h-5 w-5 text-[#6daedc]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.7} d="M12 3l7.5 3v5.6c0 4.3-2.8 8.1-6.9 9.4a2 2 0 01-1.2 0C7.3 19.7 4.5 15.9 4.5 11.6V6L12 3z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.7} d="M8.25 12.25c1.2-1.4 2.3-1.4 3.5 0s2.3 1.4 3.5 0" />
        </svg>
      </div>
      {showText && (
        <div>
          <h1 className="text-slate-800 font-bold text-xl tracking-tight">AquaGuard</h1>
          <p className="text-slate-500 text-xs">Drowning Detection</p>
        </div>
      )}
    </div>
  );
}

export default BrandMark;
