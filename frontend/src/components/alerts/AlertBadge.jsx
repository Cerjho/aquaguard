/**
 * AquaGuard — AlertBadge component (Modern Minimalist)
 *
 * Displays a clean notification badge with unacknowledged alert count.
 */

import React from 'react';
import { motion } from 'framer-motion';

function AlertBadge({ count = 0 }) {
  if (count === 0) {
    return (
      <div className="relative" title="NO UNACKNOWLEDGED ALERTS">
        <div className="w-10 h-10 rounded bg-slate-900 border border-slate-800 flex items-center justify-center shadow-[inset_0_1px_0_rgba(255,255,255,0.02)]">
          <svg
            className="w-5 h-5 text-slate-500"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.5}
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0"
            />
          </svg>
        </div>
      </div>
    );
  }

  return (
    <motion.div 
      className="relative" 
      title={`${count} UNACKNOWLEDGED ALERT${count !== 1 ? 'S' : ''}`}
      animate={{ scale: [1, 1.05, 1] }}
      transition={{ duration: 1, repeat: Infinity }}
    >
      <div className="w-10 h-10 rounded bg-rose-500/10 border border-rose-500/30 flex items-center justify-center shadow-[0_0_12px_rgba(244,63,94,0.3)]">
        <svg
          className="w-5 h-5 text-rose-400 drop-shadow-[0_0_8px_rgba(244,63,94,0.5)]"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.5}
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0"
          />
        </svg>
      </div>
      <motion.span 
        className="absolute -top-1 -right-1 min-w-[20px] h-5 flex items-center justify-center rounded bg-rose-500 text-[#05080f] text-[10px] font-mono font-bold px-1.5 border border-rose-400 shadow-[0_0_8px_rgba(244,63,94,0.8)]"
        animate={{ scale: [1, 1.1, 1] }}
        transition={{ duration: 0.5, repeat: Infinity }}
      >
        {count > 99 ? '99+' : count}
      </motion.span>
    </motion.div>
  );
}

export default AlertBadge;
