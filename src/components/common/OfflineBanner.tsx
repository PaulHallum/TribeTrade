import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { WifiOff, RefreshCcw } from 'lucide-react';

export default function OfflineBanner() {
  const [isOffline, setIsOffline] = useState(typeof navigator !== 'undefined' ? !navigator.onLine : false);

  useEffect(() => {
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return (
    <AnimatePresence>
      {isOffline && (
        <motion.div
          initial={{ opacity: 0, y: -50, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -50, scale: 0.95 }}
          transition={{ type: 'spring', stiffness: 400, damping: 25 }}
          className="fixed top-4 sm:top-6 left-0 right-0 z-[60] flex justify-center px-4 pointer-events-none"
        >
          <div className="bg-zinc-900/95 dark:bg-slate-900/95 backdrop-blur-xl border border-zinc-700/50 shadow-2xl rounded-full px-4 py-3 flex items-center gap-3.5 pointer-events-auto max-w-sm w-full sm:w-auto">
            <div className="w-9 h-9 rounded-full bg-red-500/20 border border-red-500/30 flex items-center justify-center shrink-0">
              <WifiOff className="w-4.5 h-4.5 text-red-400" />
            </div>
            
            <div className="flex-1 min-w-0 flex flex-col justify-center">
              <span className="text-[13px] font-bold text-white leading-tight">No Internet Connection</span>
              <span className="text-[11px] text-zinc-400 dark:text-slate-400 mt-0.5 leading-tight truncate">
                Please check your connection.
              </span>
            </div>
            
            <button 
              onClick={() => window.location.reload()}
              className="ml-1 w-9 h-9 flex items-center justify-center rounded-full bg-white/5 hover:bg-white/15 transition-colors shrink-0 active:scale-95"
              title="Refresh"
            >
              <RefreshCcw className="w-4 h-4 text-zinc-300" />
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
