import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Download, X, Smartphone } from 'lucide-react';
import { useSettings } from '../../contexts/SettingsContext';

export default function PWAInstallBanner() {
  const { settings } = useSettings();
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [showPrompt, setShowPrompt] = useState(false);
  const [isIOS, setIsIOS] = useState(false);

  useEffect(() => {
    // Check if app is running in standalone mode (already installed)
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches || (navigator as any).standalone;
    if (isStandalone) return;

    // Check if dismissed recently (within 7 days)
    const dismissedTime = localStorage.getItem('tribe_pwa_install_dismissed');
    if (dismissedTime && Date.now() - parseInt(dismissedTime, 10) < 7 * 24 * 60 * 60 * 1000) {
      return;
    }

    // Detect iOS
    const userAgent = window.navigator.userAgent.toLowerCase();
    const iosDevice = /iphone|ipad|ipod/.test(userAgent);
    setIsIOS(iosDevice);

    if (iosDevice) {
      // Apple devices don't fire beforeinstallprompt, so we just show the manual instructions
      setShowPrompt(true);
      return;
    }

    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setShowPrompt(true);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;

    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;

    if (outcome === 'accepted') {
      setShowPrompt(false);
    }
    setDeferredPrompt(null);
  };

  const handleDismiss = () => {
    setShowPrompt(false);
    localStorage.setItem('tribe_pwa_install_dismissed', Date.now().toString());
  };

  if (!showPrompt && !deferredPrompt) return null;

  return (
    <AnimatePresence>
      {showPrompt && (
        <motion.div
          initial={{ opacity: 0, y: 50, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 50, scale: 0.95 }}
          className="fixed bottom-24 left-4 right-4 sm:left-auto sm:right-6 sm:max-w-md z-40 bg-zinc-900/95 dark:bg-slate-900/95 text-white p-4 rounded-3xl shadow-2xl backdrop-blur-xl border border-white/10 flex items-center gap-3.5"
        >
          <div className="w-12 h-12 rounded-2xl bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center shrink-0">
            <Smartphone className="w-6 h-6 text-emerald-400" />
          </div>

          <div className="flex-1 min-w-0">
            <h4 className="text-xs font-black uppercase tracking-wider text-white">Install Tribe Trade</h4>
            <p className="text-[11px] text-zinc-300 dark:text-slate-300 mt-0.5 leading-snug line-clamp-2">
              {isIOS 
                ? 'Tap Share icon then select "Add to Home Screen" for 1-tap access.' 
                : 'Install Tribe Trade on your device home screen for quick offline access.'}
            </p>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {!isIOS && (
              <button
                onClick={handleInstallClick}
                className="px-3.5 py-2 rounded-xl text-xs font-black text-white transition-all shadow-md active:scale-95 flex items-center gap-1.5"
                style={{ backgroundColor: settings.themeColor || '#10b981' }}
              >
                <Download className="w-3.5 h-3.5" />
                Install
              </button>
            )}
            <button
              onClick={handleDismiss}
              className="p-2 text-zinc-400 hover:text-white hover:bg-white/10 rounded-xl transition-colors"
              title="Dismiss"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
