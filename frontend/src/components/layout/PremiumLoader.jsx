import React from 'react';
import { DotLottieReact } from '@lottiefiles/dotlottie-react';
import swimmingLottie from '../../vector/swimming.lottie';

export default function PremiumLoader() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] bg-[#0a0f18]/80 backdrop-blur-sm rounded-3xl w-full h-full">
      <div className="w-24 h-24 sm:w-32 sm:h-32 relative opacity-50 mix-blend-screen">
        <DotLottieReact
          src={swimmingLottie}
          loop
          autoplay
        />
      </div>
      <p className="text-cyan-400 text-[10px] font-mono font-bold tracking-widest uppercase mt-4 flex items-center shadow-[0_0_8px_rgba(34,211,238,0.3)] px-3 py-1 rounded border border-cyan-500/20 bg-cyan-500/10">
        INITIALIZING FEED
        <span className="flex items-center ml-2 space-x-[2px]">
          <span className="animate-bounce" style={{ animationDelay: '0ms' }}>.</span>
          <span className="animate-bounce" style={{ animationDelay: '150ms' }}>.</span>
          <span className="animate-bounce" style={{ animationDelay: '300ms' }}>.</span>
        </span>
      </p>
    </div>
  );
}
