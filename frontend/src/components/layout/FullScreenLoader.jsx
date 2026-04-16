import React from 'react';
import { motion } from 'framer-motion';
import BrandMark from './BrandMark.jsx';

function FullScreenLoader() {
  return (
    <div className="flex h-screen items-center justify-center bg-white">
      <motion.div
        className="text-center"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
      >
        <motion.div
          className="mx-auto w-fit animate-pulse"
          animate={{ y: [0, -4, 0] }}
          transition={{ duration: 2.2, repeat: Infinity, ease: 'easeInOut' }}
        >
          <BrandMark />
        </motion.div>
        <p className="mt-5 text-sm tracking-wide text-slate-500">
          Initializing Secure Workspace...
        </p>
      </motion.div>
    </div>
  );
}

export default FullScreenLoader;
