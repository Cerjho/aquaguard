import React from 'react';
import { DotLottieReact } from '@lottiefiles/dotlottie-react';
import swimmingLottie from '../../vector/swimming.lottie';

export default function PremiumLoader() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] bg-white/80 backdrop-blur-sm rounded-3xl w-full h-full">
      <div className="w-24 h-24 sm:w-32 sm:h-32 relative">
        <DotLottieReact
          src={swimmingLottie}
          loop
          autoplay
        />
      </div>
      <p className="text-slate-400 text-sm font-medium tracking-wider mt-2 flex items-center">
        Please wait
        <span className="flex items-center ml-1 space-x-[2px]">
          <span className="animate-bounce" style={{ animationDelay: '0ms' }}>.</span>
          <span className="animate-bounce" style={{ animationDelay: '150ms' }}>.</span>
          <span className="animate-bounce" style={{ animationDelay: '300ms' }}>.</span>
        </span>
      </p>
    </div>
  );
}
