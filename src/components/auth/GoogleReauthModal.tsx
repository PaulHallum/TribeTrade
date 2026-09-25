import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { AlertTriangle, Loader2, X, RefreshCw } from 'lucide-react';
import { useAuth } from '../../App';
import GoogleIcon from '../layout/GoogleIcon';
import { useToast } from '../../contexts/ToastContext';

export default function GoogleReauthModal() {
  const { isGoogleReauthRequired, dismissGoogleReauthPrompt, signIn } = useAuth();
  const { showToast } = useToast();
  const [authenticating, setAuthenticating] = useState(false);

  if (!isGoogleReauthRequired) return null;

  const handleSignIn = async () => {
    setAuthenticating(true);
    try {
      const token = await signIn();
      if (token) {
        showToast('Google Services re-connected successfully!', 'success');
      } else {
        showToast('Google Services login was cancelled or failed.', 'error');
      }
    } catch (err: any) {
      showToast('Authentication failed: ' + (err.message || 'Unknown error'), 'error');
    } finally {
      setAuthenticating(false);
    }
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-zinc-950/60 backdrop-blur-sm">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 10 }}
          className="max-w-md w-full bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-[32px] p-6 sm:p-8 shadow-2xl space-y-6 relative overflow-hidden"
        >
          {/* Close button */}
          <button
            onClick={dismissGoogleReauthPrompt}
            className="absolute top-4 right-4 p-2 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 rounded-full hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-all"
            title="Remind Me Later"
          >
            <X className="w-5 h-5" />
          </button>

          {/* Header Icon */}
          <div className="flex items-center gap-3">
            <div className="w-14 h-14 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/40 rounded-2xl flex items-center justify-center shrink-0">
              <GoogleIcon className="w-7 h-7" isColoured={true} />
            </div>
            <div>
              <span className="text-[10px] font-black uppercase tracking-widest text-amber-600 dark:text-amber-400">
                Action Required
              </span>
              <h2 className="text-lg font-black text-zinc-900 dark:text-white leading-tight">
                Google Services Disconnected
              </h2>
            </div>
          </div>

          {/* Body Text */}
          <div className="space-y-3">
            <p className="text-xs sm:text-sm text-zinc-600 dark:text-zinc-300 font-medium leading-relaxed">
              Your Google Services connection (Google Calendar live synchronisation) has expired or requires re-authentication.
            </p>
            <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-100 dark:border-amber-900/30 rounded-2xl p-3.5 flex items-start gap-2.5">
              <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
              <p className="text-[11px] font-semibold text-amber-900 dark:text-amber-200 leading-snug">
                Please log back in to Google to maintain seamless live calendar synchronisation.
              </p>
            </div>
          </div>

          {/* Actions */}
          <div className="space-y-2 pt-2">
            <button
              onClick={handleSignIn}
              disabled={authenticating}
              className="w-full py-3.5 px-4 bg-indigo-600 hover:bg-indigo-700 active:scale-[0.98] text-white text-xs font-black uppercase tracking-widest rounded-xl transition-all shadow-lg shadow-indigo-600/20 flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {authenticating ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Logging Back In...
                </>
              ) : (
                <>
                  <RefreshCw className="w-4 h-4" />
                  Log Back In to Google Services
                </>
              )}
            </button>

            <button
              onClick={dismissGoogleReauthPrompt}
              disabled={authenticating}
              className="w-full py-3 text-xs font-bold text-zinc-500 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200 transition-colors"
            >
              Remind Me Later
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
