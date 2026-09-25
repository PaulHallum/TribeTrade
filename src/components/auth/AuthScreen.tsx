import { useState, useEffect } from 'react';
import { useAuth } from '../../App';
import { motion } from 'motion/react';
import GoogleIcon from '../layout/GoogleIcon';
import MicrosoftIcon from '../layout/MicrosoftIcon';
import YahooIcon from '../layout/YahooIcon';
import AppleIcon from '../layout/AppleIcon';
import { auth } from '../../lib/firebase';
import { signInWithCustomToken } from 'firebase/auth';
import { useToast } from '../../contexts/ToastContext';
import { logger } from '../../services/logger';
import { Loader2, ShieldCheck } from 'lucide-react';
import AppSpecificPasswordModal from '../settings/AppSpecificPasswordModal';

export default function AuthScreen() {
  const { signIn } = useAuth();
  const { showToast } = useToast();
  const [connectingProvider, setConnectingProvider] = useState<string | null>(null);
  const [isICloudModalOpen, setIsICloudModalOpen] = useState(false);

  // Check URL parameters for pre-selected provider
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const providerParam = params.get('provider')?.toLowerCase();
    if (providerParam === 'outlook' || providerParam === 'microsoft') {
      handleProviderSignIn('microsoft');
    } else if (providerParam === 'yahoo' || providerParam === 'sky') {
      handleProviderSignIn('yahoo');
    } else if (providerParam === 'apple' || providerParam === 'icloud') {
      setIsICloudModalOpen(true);
    }
  }, []);

  const handleProviderSignIn = async (provider: 'microsoft' | 'yahoo') => {
    setConnectingProvider(provider);
    try {
      const firebaseUser = auth.currentUser;
      const headers: Record<string, string> = {};
      if (firebaseUser) {
        try {
          const idToken = await firebaseUser.getIdToken();
          headers['Authorization'] = `Bearer ${idToken}`;
        } catch (e) {}
      }

      // Initiate /api/oauth/connect directly
      const res = await fetch(`/api/oauth/connect?provider=${encodeURIComponent(provider)}`, { headers });
      const responseText = await res.text();
      let data: any = {};
      try {
        data = JSON.parse(responseText);
      } catch (err) {
        console.error('[OAuth] Non-JSON response:', responseText);
        showToast('Backend server connection error. Please try again shortly.', 'error');
        setConnectingProvider(null);
        return;
      }

      if (!res.ok || !data.authUrl) {
        showToast(data.error || 'Failed to initiate login popup.', 'error');
        setConnectingProvider(null);
        return;
      }

      const width = 550, height = 650;
      const left = window.screenX + (window.outerWidth - width) / 2;
      const top = window.screenY + (window.outerHeight - height) / 2;
      const popup = window.open(data.authUrl, `${provider}-auth`, `width=${width},height=${height},left=${left},top=${top}`);

      const messageHandler = async (event: MessageEvent) => {
        if (event.data?.type === 'OAUTH_SUCCESS') {
          window.removeEventListener('message', messageHandler);
          if (event.data.customToken) {
            try {
              await signInWithCustomToken(auth, event.data.customToken);
              showToast(`Signed in with ${provider === 'microsoft' ? 'Outlook' : 'Sky/Yahoo'}!`, 'success');
            } catch (authErr: any) {
              logger.error('signInWithCustomToken failed:', authErr);
              showToast('Account connected! Please sign in with Google to access your hub.', 'info');
            }
          } else {
            showToast(`Connected ${provider === 'microsoft' ? 'Outlook' : 'Sky/Yahoo'} email account!`, 'success');
          }
          setConnectingProvider(null);
        } else if (event.data?.type === 'OAUTH_ERROR') {
          window.removeEventListener('message', messageHandler);
          showToast(`OAuth Error: ${event.data.error || 'Failed to connect account'}`, 'error');
          setConnectingProvider(null);
        }
      };

      window.addEventListener('message', messageHandler);

      const checkClosed = setInterval(() => {
        if (popup?.closed) {
          clearInterval(checkClosed);
          window.removeEventListener('message', messageHandler);
          setConnectingProvider(null);
        }
      }, 1000);

    } catch (err: any) {
      showToast('Connection error: ' + (err.message || 'Unknown error'), 'error');
      setConnectingProvider(null);
    }
  };

  return (
    <div className="min-h-[calc(100vh-3.5rem)] w-full flex items-center justify-center bg-white dark:bg-zinc-950 text-zinc-900 dark:text-white overflow-y-auto relative py-12">
      {/* Background decoration */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[-5%] left-[-5%] w-[30%] h-[30%] bg-emerald-500/5 blur-[120px] rounded-full" />
        <div className="absolute bottom-[-5%] right-[-5%] w-[30%] h-[30%] bg-blue-500/5 blur-[120px] rounded-full" />
      </div>

      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
        className="relative z-10 max-w-sm w-full px-8 text-center"
      >
        <div className="mb-6 flex justify-center">
          <div className="relative">
            <div className="w-32 h-32 flex items-center justify-center overflow-hidden">
              <img src="/logo.png" alt="Tribe Logo" className="w-full h-full object-contain" />
            </div>
            <div className="absolute -top-2 -right-2 w-7 h-7 bg-white dark:bg-zinc-800 rounded-full flex items-center justify-center border border-zinc-100 dark:border-zinc-800">
              <div className="w-3.5 h-3.5 bg-emerald-500 rounded-full animate-pulse" />
            </div>
          </div>
        </div>
        
        <div className="space-y-2 mb-6 mt-2">
          <h1 className="text-xl font-black text-zinc-900 dark:text-white tracking-tight">TribeTrade</h1>
          <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400 max-w-xs mx-auto">
            The intelligent business command centre for tradespeople: manage job diaries, tasks & materials, client notes, and daily AI briefings.
          </p>
        </div>

        {/* Feature Highlights */}
        <div className="grid grid-cols-2 gap-2 mb-6 text-left">
          <div className="bg-zinc-50 dark:bg-zinc-900/80 p-2.5 rounded-2xl border border-zinc-150 dark:border-zinc-800">
            <div className="text-[11px] font-bold text-zinc-800 dark:text-zinc-200">📅 Job Diary</div>
            <div className="text-[10px] text-zinc-500 dark:text-zinc-400">Sync Google, Outlook & Apple</div>
          </div>
          <div className="bg-zinc-50 dark:bg-zinc-900/80 p-2.5 rounded-2xl border border-zinc-150 dark:border-zinc-800">
            <div className="text-[11px] font-bold text-zinc-800 dark:text-zinc-200">✨ Morning Brief</div>
            <div className="text-[10px] text-zinc-500 dark:text-zinc-400">Daily intelligent summaries & voice</div>
          </div>
          <div className="bg-zinc-50 dark:bg-zinc-900/80 p-2.5 rounded-2xl border border-zinc-150 dark:border-zinc-800">
            <div className="text-[11px] font-bold text-zinc-800 dark:text-zinc-200">✅ Jobs & Milestones</div>
            <div className="text-[10px] text-zinc-500 dark:text-zinc-400">Site tasks, checklists & snagging</div>
          </div>
          <div className="bg-zinc-50 dark:bg-zinc-900/80 p-2.5 rounded-2xl border border-zinc-150 dark:border-zinc-800">
            <div className="text-[11px] font-bold text-zinc-800 dark:text-zinc-200">📋 Materials & Supplies</div>
            <div className="text-[10px] text-zinc-500 dark:text-zinc-400">Merchant pick lists & stock notes</div>
          </div>
        </div>

        {/* Supported Email Account Sign In Options */}
        <div className="space-y-3 mb-6">
          <div className="text-xs font-extrabold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider mb-3">
            Select your email account to sign in:
          </div>

          {/* 1. Google */}
          <button
            onClick={() => signIn()}
            disabled={connectingProvider !== null}
            className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3.5 px-4 rounded-[20px] flex items-center justify-between shadow-lg shadow-emerald-500/20 transition-all active:scale-[0.98] group disabled:opacity-50"
          >
            <div className="flex items-center gap-3">
              <div className="w-7 h-7 bg-white rounded-xl flex items-center justify-center transition-colors">
                <GoogleIcon className="w-4 h-4" isColoured={true} />
              </div>
              <span className="text-xs font-black uppercase tracking-wider">Sign In with Google</span>
            </div>
            <span className="text-[10px] bg-white/20 px-2 py-0.5 rounded-full font-bold uppercase">Google</span>
          </button>

          {/* 2. Microsoft / Outlook */}
          <button
            onClick={() => handleProviderSignIn('microsoft')}
            disabled={connectingProvider !== null}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3.5 px-4 rounded-[20px] flex items-center justify-between shadow-lg shadow-blue-500/20 transition-all active:scale-[0.98] group disabled:opacity-50"
          >
            <div className="flex items-center gap-3">
              <div className="w-7 h-7 bg-white rounded-xl flex items-center justify-center transition-colors">
                {connectingProvider === 'microsoft' ? (
                  <Loader2 className="w-4 h-4 text-blue-600 animate-spin" />
                ) : (
                  <MicrosoftIcon className="w-4 h-4" isColoured={true} />
                )}
              </div>
              <span className="text-xs font-black uppercase tracking-wider">Sign In with Outlook</span>
            </div>
            <span className="text-[10px] bg-white/20 px-2 py-0.5 rounded-full font-bold uppercase">Office 365</span>
          </button>

          {/* 3. Sky Mail & Yahoo Mail */}
          <button
            onClick={() => handleProviderSignIn('yahoo')}
            disabled={connectingProvider !== null}
            className="w-full bg-purple-600 hover:bg-purple-700 text-white font-bold py-3.5 px-4 rounded-[20px] flex items-center justify-between shadow-lg shadow-purple-500/20 transition-all active:scale-[0.98] group disabled:opacity-50"
          >
            <div className="flex items-center gap-3">
              <div className="w-7 h-7 bg-white rounded-xl flex items-center justify-center transition-colors">
                {connectingProvider === 'yahoo' ? (
                  <Loader2 className="w-4 h-4 text-purple-600 animate-spin" />
                ) : (
                  <YahooIcon className="w-4 h-4" isColoured={true} />
                )}
              </div>
              <span className="text-xs font-black uppercase tracking-wider">Sign In with Sky / Yahoo</span>
            </div>
            <span className="text-[10px] bg-white/20 px-2 py-0.5 rounded-full font-bold uppercase">Sky / Yahoo</span>
          </button>

          {/* 4. Apple Mail (iCloud) */}
          <button
            onClick={() => setIsICloudModalOpen(true)}
            disabled={connectingProvider !== null}
            className="w-full bg-zinc-900 hover:bg-black text-white dark:bg-white dark:hover:bg-zinc-100 dark:text-zinc-900 font-bold py-3.5 px-4 rounded-[20px] flex items-center justify-between shadow-lg shadow-zinc-900/10 transition-all active:scale-[0.98] group disabled:opacity-50 cursor-pointer"
          >
            <div className="flex items-center gap-3">
              <div className="w-7 h-7 bg-white dark:bg-zinc-900 rounded-xl flex items-center justify-center transition-colors">
                <AppleIcon className="w-4 h-4 text-zinc-900 dark:text-white" isColoured={false} />
              </div>
              <span className="text-xs font-black uppercase tracking-wider">Sign In with iCloud</span>
            </div>
            <span className="text-[10px] bg-white/20 dark:bg-zinc-900/20 px-2 py-0.5 rounded-full font-bold uppercase">Apple / iCloud</span>
          </button>
        </div>

        <p className="mt-3 text-[10px] font-medium text-zinc-400 dark:text-zinc-500 leading-relaxed">
          Select your email provider above to sign in or register.<br />
          You can connect additional email accounts at any time in Settings.
        </p>

        {/* Prominent Privacy & Security Guarantee */}
        <div className="mt-6 pt-4 border-t border-zinc-100 dark:border-zinc-800/80 space-y-2">
          <div className="flex items-center justify-center gap-4 text-xs font-semibold text-zinc-600 dark:text-zinc-400">
            <a 
              href="/privacy.html" 
              target="_blank" 
              rel="noopener noreferrer" 
              className="inline-flex items-center gap-1.5 hover:text-emerald-600 dark:hover:text-emerald-400 underline underline-offset-2 transition-colors font-bold"
            >
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
              Privacy Policy
            </a>
            <span className="text-zinc-300 dark:text-zinc-700">•</span>
            <a 
              href="/terms.html" 
              target="_blank" 
              rel="noopener noreferrer" 
              className="hover:text-emerald-600 dark:hover:text-emerald-400 underline underline-offset-2 transition-colors"
            >
              Terms of Service
            </a>
          </div>
          <p className="text-[10px] text-zinc-400 dark:text-zinc-500">
            TribeTrade protects your trade & business data with AES-256 encryption.
          </p>
        </div>
      </motion.div>

      {/* Apple & iCloud Sign-In Modal */}
      {isICloudModalOpen && (
        <AppSpecificPasswordModal
          initialProvider="apple"
          isAuthMode={true}
          onClose={() => setIsICloudModalOpen(false)}
          onSuccess={() => {
            setIsICloudModalOpen(false);
            showToast('Signed in with iCloud!', 'success');
          }}
        />
      )}
    </div>
  );
}

