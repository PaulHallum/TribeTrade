import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Lock, Mail, Loader2, CheckCircle2, AlertCircle, ExternalLink, ShieldCheck, KeyRound } from 'lucide-react';
import { useSettings } from '../../contexts/SettingsContext';
import { useAuth } from '../../App';
import AppleIcon from '../layout/AppleIcon';
import GoogleIcon from '../layout/GoogleIcon';
import MicrosoftIcon from '../layout/MicrosoftIcon';
import YahooIcon from '../layout/YahooIcon';

import { auth, db } from '../../lib/firebase';
import { signInWithCustomToken, OAuthProvider, signInWithPopup } from 'firebase/auth';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';

interface AppSpecificPasswordModalProps {
  onClose: () => void;
  onSuccess?: () => void;
  initialProvider?: 'apple' | 'google' | 'outlook' | 'yahoo' | 'sky';
  isAuthMode?: boolean;
}

export default function AppSpecificPasswordModal({
  onClose,
  onSuccess,
  initialProvider = 'apple',
  isAuthMode = false
}: AppSpecificPasswordModalProps) {
  const { settings } = useSettings();
  const { user, tradeUserId } = useAuth();

  const [provider, setProvider] = useState<'apple' | 'google' | 'outlook' | 'yahoo' | 'sky'>(initialProvider);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  // Pre-fill email if user's current account matches
  useEffect(() => {
    if (user?.email) {
      const lower = user.email.toLowerCase();
      if (provider === 'google' && (lower.endsWith('@gmail.com') || lower.endsWith('@googlemail.com'))) {
        setEmail(user.email);
      } else if (provider === 'apple' && (lower.endsWith('@icloud.com') || lower.endsWith('@me.com') || lower.endsWith('@mac.com'))) {
        setEmail(user.email);
      } else if ((provider as string) === 'outlook' && (lower.endsWith('@outlook.com') || lower.endsWith('@hotmail.com') || lower.endsWith('@live.com'))) {
        setEmail(user.email);
      } else if (provider === 'yahoo' && lower.endsWith('@yahoo.com')) {
        setEmail(user.email);
      } else if (provider === 'sky' && lower.endsWith('@sky.com')) {
        setEmail(user.email);
      }
    }
  }, [provider, user]);

  const getProviderTitle = () => {
    switch (provider) {
      case 'google': return 'Gmail';
      case 'apple': return 'Apple Mail (iCloud)';
      case 'outlook': return 'Outlook';
      case 'yahoo': return 'Yahoo Mail';
      case 'sky': return 'Sky Mail';
    }
  };

  const getProviderIcon = () => {
    switch (provider) {
      case 'google': return <GoogleIcon className="w-5 h-5" isColoured={true} />;
      case 'apple': return <AppleIcon className="w-5 h-5 text-zinc-900 dark:text-white" isColoured={true} />;
      case 'outlook': return <MicrosoftIcon className="w-5 h-5" isColoured={true} />;
      case 'yahoo': return <YahooIcon className="w-5 h-5" isColoured={true} />;
      case 'sky': return <YahooIcon className="w-5 h-5" isColoured={true} />;
    }
  };

  const getManageUrl = () => {
    switch (provider) {
      case 'google': return 'https://myaccount.google.com/apppasswords';
      case 'apple': return 'https://account.apple.com';
      case 'outlook': return 'https://account.live.com/proofs/Manage';
      case 'yahoo': return 'https://login.yahoo.com/account/security';
      case 'sky': return 'https://login.yahoo.com/account/security';
    }
  };

  // Automatically format 16-character passwords into xxxx-xxxx-xxxx-xxxx as user types
  const handlePasswordChange = (raw: string) => {
    const cleaned = raw.replace(/[^a-zA-Z0-9]/g, '').slice(0, 16).toLowerCase();
    const chunks = cleaned.match(/.{1,4}/g);
    const formatted = chunks ? chunks.join('-') : cleaned;
    setPassword(formatted);
    if (errorMessage) setErrorMessage('');
  };

  const handleConnect = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password || isSaving || saved) return;

    const rawPassword = password.replace(/[\s-]/g, '');
    if (rawPassword.length < 16) {
      setErrorMessage('Please enter the complete 16-character app-specific password.');
      return;
    }

    setIsSaving(true);
    setErrorMessage('');

    try {
      if (isAuthMode || !user) {
        const res = await fetch('/api/auth/icloud-signin', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: email.trim(),
            password: rawPassword
          })
        });

        const data = await res.json();
        if (!res.ok || !data.success || !data.customToken) {
          setErrorMessage(data.error || 'Failed to sign in with iCloud. Please check your credentials.');
          setIsSaving(false);
          return;
        }

        await signInWithCustomToken(auth, data.customToken);
        setSaved(true);
        if (onSuccess) onSuccess();
        setTimeout(() => {
          onClose();
        }, 1000);
        return;
      }

      const idToken = await user?.getIdToken();
      if (!idToken) {
        setErrorMessage('Authentication session expired. Please sign in again.');
        setIsSaving(false);
        return;
      }

      let connectedViaBackend = false;
      try {
        const res = await fetch('/api/email/connect-app-password', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${idToken}`
          },
          body: JSON.stringify({
            provider,
            email: email.trim(),
            password: rawPassword
          })
        });

        const contentType = res.headers.get('content-type');
        if (contentType?.includes('application/json')) {
          const data = await res.json();
          if (res.ok && data.success) {
            connectedViaBackend = true;
          } else if (data.error) {
            setErrorMessage(data.error);
            setIsSaving(false);
            return;
          }
        }
      } catch (backendErr) {
        console.warn('[AppSpecificPasswordModal] Backend API call failed, falling back to direct Firestore connection:', backendErr);
      }

      // If backend is not running or unreachable, connect directly to Firestore
      if (!connectedViaBackend) {
        if (!tradeUserId) {
          setErrorMessage('Could not determine trade account ID. Please refresh and try again.');
          setIsSaving(false);
          return;
        }

        const normalizedProvider = provider === 'gmail' ? 'google' : provider;
        const cleanEmail = email.trim().toLowerCase();
        const accountsRef = collection(db, 'trade_users', tradeUserId, 'connectedAccounts');

        await addDoc(accountsRef, {
          tradeUserId,
          userId: user.uid,
          provider: normalizedProvider,
          emailAddress: cleanEmail,
          displayName: cleanEmail.split('@')[0] || `${getProviderTitle()} Account`,
          status: 'active',
          accessTokenEncrypted: '',
          refreshTokenEncrypted: rawPassword,
          tokenExpiresAt: 0,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
      }

      setSaved(true);
      if (onSuccess) onSuccess();

      setTimeout(() => {
        onClose();
      }, 1200);
    } catch (err: any) {
      console.error('[AppSpecificPasswordModal] Connection error:', err);
      setErrorMessage(err.message || 'Connection error. Please try again shortly.');
      setIsSaving(false);
    }
  };

  const handleAppleOAuth = async () => {
    try {
      setIsSaving(true);
      setErrorMessage('');
      const appleProvider = new OAuthProvider('apple.com');
      appleProvider.addScope('email');
      appleProvider.addScope('name');
      await signInWithPopup(auth, appleProvider);
      setSaved(true);
      if (onSuccess) onSuccess();
      setTimeout(() => { onClose(); }, 1000);
    } catch (err: any) {
      setIsSaving(false);
      if (err?.code === 'auth/popup-closed-by-user') return;
      if (err?.code === 'auth/operation-not-allowed' || err?.code === 'auth/configuration-not-found') {
        setErrorMessage('Apple ID popup sign-in is not configured. Please sign in below using your iCloud email and app-specific password.');
      } else {
        setErrorMessage(err.message || 'Apple sign-in encountered an error.');
      }
    }
  };

  const handleOAuthConnect = async (oauthProvider: string) => {
    try {
      setIsSaving(true);
      setErrorMessage('');
      const idToken = await user?.getIdToken();
      if (!idToken) {
        setErrorMessage('Authentication session expired. Please sign in again.');
        setIsSaving(false);
        return;
      }
      const res = await fetch(`/api/oauth/connect?provider=${encodeURIComponent(oauthProvider)}`, {
        headers: { Authorization: `Bearer ${idToken}` }
      });
      const data = await res.json();
      if (!res.ok || !data.authUrl) {
        setErrorMessage(data.error || `Failed to start connection with ${oauthProvider}.`);
        setIsSaving(false);
        return;
      }
      const width = 550, height = 650;
      const left = window.screenX + (window.outerWidth - width) / 2;
      const top = window.screenY + (window.outerHeight - height) / 2;
      const popup = window.open(data.authUrl, `${oauthProvider}-auth`, `width=${width},height=${height},left=${left},top=${top}`);

      const messageHandler = (event: MessageEvent) => {
        if (event.data?.type === 'OAUTH_SUCCESS') {
          window.removeEventListener('message', messageHandler);
          setSaved(true);
          setIsSaving(false);
          if (onSuccess) onSuccess();
          setTimeout(() => { onClose(); }, 1200);
        } else if (event.data?.type === 'OAUTH_ERROR') {
          window.removeEventListener('message', messageHandler);
          setErrorMessage(event.data.error || `Failed to connect ${oauthProvider}.`);
          setIsSaving(false);
        }
      };
      window.addEventListener('message', messageHandler);

      const checkClosed = setInterval(() => {
        if (popup?.closed) {
          clearInterval(checkClosed);
          window.removeEventListener('message', messageHandler);
          setIsSaving(false);
        }
      }, 1000);
    } catch (err: any) {
      setErrorMessage('Connection error: ' + err.message);
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="absolute inset-0 bg-zinc-900/60 backdrop-blur-sm"
      />

      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        className="relative w-full max-w-lg bg-white dark:bg-zinc-900 rounded-[28px] overflow-hidden flex flex-col border border-zinc-200 dark:border-zinc-800 shadow-2xl max-h-[90vh]"
      >
        {/* Header */}
        <div className="p-5 sm:p-6 border-b border-zinc-100 dark:border-zinc-800 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700/60 flex items-center justify-center shrink-0">
              {getProviderIcon()}
            </div>
            <div>
              <h3 className="text-base sm:text-lg font-bold text-zinc-900 dark:text-white">
                {isAuthMode ? 'Sign In with Apple & iCloud' : `Connect ${getProviderTitle()}`}
              </h3>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                {isAuthMode ? 'Secure login & trade mailbox link' : 'Secure IMAP inbox sync for client & supplier updates'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-xl transition-colors text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Provider Selector Tabs (only when not in auth mode) */}
        {!isAuthMode && (
        <div className="px-5 sm:px-6 py-2.5 border-b border-zinc-100 dark:border-zinc-800/80 bg-zinc-50/50 dark:bg-zinc-850/40 flex items-center gap-2 overflow-x-auto shrink-0">
          <span className="text-[10px] font-black text-zinc-400 uppercase tracking-wider shrink-0 mr-1">Switch:</span>
          <button
            type="button"
            onClick={() => { setProvider('google'); setErrorMessage(''); }}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shrink-0 cursor-pointer ${
              provider === 'google'
                ? 'bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/30 shadow-xs'
                : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200/60 dark:hover:bg-zinc-800'
            }`}
          >
            <GoogleIcon className="w-3.5 h-3.5" isColoured={provider === 'google'} />
            Gmail
          </button>
          <button
            type="button"
            onClick={() => { setProvider('apple'); setErrorMessage(''); }}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shrink-0 cursor-pointer ${
              provider === 'apple'
                ? 'bg-zinc-900 text-white dark:bg-white dark:text-zinc-900 shadow-xs'
                : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200/60 dark:hover:bg-zinc-800'
            }`}
          >
            <AppleIcon className="w-3.5 h-3.5" isColoured={provider === 'apple'} />
            Apple
          </button>
          <button
            type="button"
            onClick={() => { setProvider('outlook'); setErrorMessage(''); }}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shrink-0 cursor-pointer ${
              (provider as string) === 'outlook'
                ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/30 shadow-xs'
                : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200/60 dark:hover:bg-zinc-800'
            }`}
          >
            <MicrosoftIcon className="w-3.5 h-3.5" isColoured={(provider as string) === 'outlook'} />
            Outlook
          </button>
          <button
            type="button"
            onClick={() => { setProvider('yahoo'); setErrorMessage(''); }}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shrink-0 cursor-pointer ${
              provider === 'yahoo' || provider === 'sky'
                ? 'bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/30 shadow-xs'
                : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200/60 dark:hover:bg-zinc-800'
            }`}
          >
            <YahooIcon className="w-3.5 h-3.5" isColoured={provider === 'yahoo' || provider === 'sky'} />
            Yahoo / Sky
          </button>
        </div>
        )}

        {/* Scrollable Content */}
        <div className="p-5 sm:p-6 space-y-5 overflow-y-auto max-h-[calc(90vh-145px)]">
          {/* Optional One-Click Apple OAuth in Auth Mode */}
          {isAuthMode && (
            <div className="space-y-3 pb-2 border-b border-zinc-150 dark:border-zinc-800">
              <button
                type="button"
                onClick={handleAppleOAuth}
                disabled={isSaving || saved}
                className="w-full py-3.5 px-4 rounded-2xl bg-zinc-900 hover:bg-black text-white dark:bg-white dark:hover:bg-zinc-100 dark:text-zinc-900 font-bold text-xs flex items-center justify-center gap-2.5 shadow-sm transition-all active:scale-[0.98] cursor-pointer disabled:opacity-50"
              >
                <AppleIcon className="w-4 h-4" isColoured={false} />
                Continue with Apple ID
              </button>
              <div className="flex items-center gap-3 pt-1">
                <div className="h-px bg-zinc-200 dark:bg-zinc-800 flex-1" />
                <span className="text-[10px] uppercase font-bold text-zinc-400">or sign in with iCloud Mail</span>
                <div className="h-px bg-zinc-200 dark:bg-zinc-800 flex-1" />
              </div>
            </div>
          )}
          {/* Provider Specific Guides & Forms */}
          {(provider as string) === 'outlook' ? (
            /* Microsoft Modern Authentication Card (Microsoft retired app passwords Sept 2024) */
            <div className="space-y-4">
              <div className="p-5 bg-blue-50/80 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800/60 rounded-2xl space-y-3.5">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center shrink-0 shadow-xs">
                    <MicrosoftIcon className="w-5 h-5" isColoured={false} />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-blue-950 dark:text-blue-100">
                      Microsoft Modern Authentication (OAuth 2.0)
                    </h4>
                    <p className="text-[11px] text-blue-700 dark:text-blue-300">
                      Required for Outlook.com, Hotmail, and Live accounts
                    </p>
                  </div>
                </div>

                <p className="text-xs text-blue-900/90 dark:text-blue-200 leading-relaxed">
                  As of <strong>16 September 2024</strong>, Microsoft officially retired Basic Authentication and App Passwords for all personal accounts. To ensure maximum mailbox security, Microsoft accounts now connect via secure 1-click Modern Authentication.
                </p>

                <div className="pt-1">
                  <button
                    type="button"
                    onClick={() => handleOAuthConnect('microsoft')}
                    disabled={isSaving || saved}
                    className="w-full py-3.5 px-4 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold uppercase tracking-wider rounded-xl shadow-sm transition-all active:scale-[0.98] flex items-center justify-center gap-2.5 cursor-pointer disabled:opacity-50"
                  >
                    {isSaving ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Connecting with Microsoft...
                      </>
                    ) : saved ? (
                      <>
                        <CheckCircle2 className="w-4 h-4" />
                        Connected Successfully!
                      </>
                    ) : (
                      <>
                        <MicrosoftIcon className="w-4 h-4" isColoured={false} />
                        Sign In with Microsoft (1-Click)
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Error Message */}
              <AnimatePresence>
                {errorMessage && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="p-3 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/50 rounded-xl flex items-start gap-2.5 text-xs text-red-600 dark:text-red-400"
                  >
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>{errorMessage}</span>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          ) : (
            <>
              {/* Optional 1-Click Yahoo OAuth Banner */}
              {(provider === 'yahoo' || provider === 'sky') && (
                <div className="p-3.5 bg-purple-50 dark:bg-purple-950/30 border border-purple-200/80 dark:border-purple-800/40 rounded-2xl flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-purple-950 dark:text-purple-200 truncate">
                      Quick Connect via Yahoo OAuth
                    </p>
                    <p className="text-[11px] text-purple-700 dark:text-purple-400">
                      Sign in directly with your Yahoo credentials
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleOAuthConnect('yahoo')}
                    disabled={isSaving || saved}
                    className="px-3.5 py-2 bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold rounded-xl shrink-0 transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                  >
                    <YahooIcon className="w-3.5 h-3.5" isColoured={false} />
                    1-Click Sign In
                  </button>
                </div>
              )}

              {/* Step-by-Step Interactive Guide */}
              <div className="p-4 sm:p-5 bg-zinc-50 dark:bg-zinc-850/70 rounded-2xl border border-zinc-200/80 dark:border-zinc-800 space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-black uppercase tracking-wider text-zinc-700 dark:text-zinc-300 flex items-center gap-1.5">
                    <ShieldCheck className="w-4 h-4 text-emerald-500" />
                    Step-by-Step Setup Guide
                  </span>
                  <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/50 px-2 py-0.5 rounded-md border border-emerald-200 dark:border-emerald-800/40 uppercase tracking-wider">
                    1-Time Setup
                  </span>
                </div>

                {/* Step 1 */}
                <div className="flex items-start gap-3">
                  <div className="w-6 h-6 rounded-full bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 flex items-center justify-center text-xs font-black shrink-0 mt-0.5 shadow-xs">
                    1
                  </div>
                  <div className="space-y-2 flex-1 min-w-0">
                    <p className="text-xs font-bold text-zinc-800 dark:text-zinc-200">
                      Open your {getProviderTitle()} security page:
                    </p>
                    <a
                      href={getManageUrl()}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 px-4 py-2.5 bg-zinc-900 hover:bg-zinc-800 dark:bg-white dark:hover:bg-zinc-100 text-white dark:text-zinc-900 rounded-xl text-xs font-bold transition-all shadow-xs active:scale-95 cursor-pointer"
                    >
                      {provider === 'google' && <GoogleIcon className="w-4 h-4" isColoured={false} />}
                      {provider === 'apple' && <AppleIcon className="w-4 h-4 text-white dark:text-zinc-900" isColoured={false} />}
                      {(provider === 'yahoo' || provider === 'sky') && <YahooIcon className="w-4 h-4" isColoured={false} />}
                      <span>
                        {provider === 'apple' ? 'Open account.apple.com' : provider === 'google' ? 'Open Google Security' : 'Open Yahoo Account Security'}
                      </span>
                      <ExternalLink className="w-3.5 h-3.5 ml-0.5" />
                    </a>
                    {provider === 'google' && (
                      <p className="text-[11px] text-zinc-500 dark:text-zinc-400 leading-normal">
                        ⚠️ Note: You must have <span className="font-bold text-zinc-800 dark:text-zinc-200">2-Step Verification</span> turned ON in your Google Account for App Passwords to appear.
                      </p>
                    )}
                    {provider === 'apple' && (
                      <p className="text-[11px] text-zinc-500 dark:text-zinc-400 leading-normal">
                        ⚠️ Note: Two-Factor Authentication must be turned on for your Apple Account.
                      </p>
                    )}
                    {(provider === 'yahoo' || provider === 'sky') && (
                      <p className="text-[11px] text-zinc-500 dark:text-zinc-400 leading-normal">
                        ⚠️ Note: Use a standard browser window (not Incognito) and ensure 2-Step Verification is active.
                      </p>
                    )}
                  </div>
                </div>

                {/* Step 2 */}
                <div className="flex items-start gap-3">
                  <div className="w-6 h-6 rounded-full bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 flex items-center justify-center text-xs font-black shrink-0 mt-0.5 shadow-xs">
                    2
                  </div>
                  <div className="space-y-1 flex-1 text-xs text-zinc-600 dark:text-zinc-300 leading-relaxed">
                    {provider === 'google' && (
                      <>
                        <p>
                          On that page, locate the box titled <span className="font-bold text-zinc-900 dark:text-white">"App name"</span>.
                        </p>
                        <p>
                          Type <span className="px-2 py-0.5 bg-zinc-200 dark:bg-zinc-750 font-bold font-mono text-zinc-900 dark:text-white rounded">Tribe Trade</span> and click the blue <span className="font-bold text-zinc-900 dark:text-white">Create</span> button.
                        </p>
                      </>
                    )}
                    {provider === 'apple' && (
                      <>
                        <p>
                          In the <span className="font-bold text-zinc-900 dark:text-white">Sign-In and Security</span> section, select <span className="font-bold text-zinc-900 dark:text-white">App-Specific Passwords</span>.
                        </p>
                        <p>
                          Click <span className="font-bold text-zinc-900 dark:text-white">Generate an app-specific password</span> (or the <span className="font-bold text-zinc-900 dark:text-white">+</span> button), enter <span className="px-2 py-0.5 bg-zinc-200 dark:bg-zinc-750 font-bold font-mono text-zinc-900 dark:text-white rounded">Tribe Trade</span>, and click <span className="font-bold text-zinc-900 dark:text-white">Create</span>.
                        </p>
                      </>
                    )}
                    {(provider === 'yahoo' || provider === 'sky') && (
                      <>
                        <p>
                          Scroll down to the <span className="font-bold text-zinc-900 dark:text-white">External connections</span> section.
                        </p>
                        <p>
                          Click <span className="font-bold text-zinc-900 dark:text-white">Create app password</span>, enter <span className="px-2 py-0.5 bg-zinc-200 dark:bg-zinc-750 font-bold font-mono text-zinc-900 dark:text-white rounded">Tribe Trade</span> as the app name, and click <span className="font-bold text-zinc-900 dark:text-white">Generate password</span>.
                        </p>
                      </>
                    )}
                  </div>
                </div>

                {/* Step 3 */}
                <div className="flex items-start gap-3">
                  <div className="w-6 h-6 rounded-full bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 flex items-center justify-center text-xs font-black shrink-0 mt-0.5 shadow-xs">
                    3
                  </div>
                  <div className="space-y-1.5 flex-1 text-xs text-zinc-600 dark:text-zinc-300 leading-relaxed">
                    <p>
                      Copy the generated <span className="font-bold text-zinc-900 dark:text-white">16-character code</span> shown on screen:
                    </p>
                    <div className="inline-block px-3 py-1 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 rounded-xl text-amber-800 dark:text-amber-300 font-mono text-[11px] font-bold tracking-wider">
                      abcd efgh ijkl mnop
                    </div>
                  </div>
                </div>

                {/* Step 4 */}
                <div className="flex items-start gap-3">
                  <div className="w-6 h-6 rounded-full bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 flex items-center justify-center text-xs font-black shrink-0 mt-0.5 shadow-xs">
                    4
                  </div>
                  <div className="flex-1 text-xs text-zinc-600 dark:text-zinc-300 leading-relaxed">
                    <p>
                      {provider === 'apple' ? (
                        <>
                          Enter your <span className="font-bold text-zinc-900 dark:text-white">@icloud.com</span> address and paste your 16-character code below, then tap <span className="font-bold text-zinc-900 dark:text-white">Connect Apple Mail</span>!
                        </>
                      ) : (
                        <>
                          Paste your 16-character code into the password box below and tap <span className="font-bold text-zinc-900 dark:text-white">Connect {getProviderTitle()}</span>!
                        </>
                      )}
                    </p>
                  </div>
                </div>
              </div>

              {/* Form */}
              <form onSubmit={handleConnect} className="space-y-4">
                <div>
                  <label className="block text-[11px] font-black uppercase tracking-widest text-zinc-500 dark:text-zinc-400 mb-1.5">
                    {provider === 'google' ? 'Gmail Address' : provider === 'apple' ? 'iCloud Email Address (@icloud.com)' : 'Email Address'}
                  </label>
                  <div className="relative">
                    <Mail className="w-4 h-4 text-zinc-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => {
                        setEmail(e.target.value);
                        if (errorMessage) setErrorMessage('');
                      }}
                      placeholder={provider === 'google' ? 'name@gmail.com' : provider === 'apple' ? 'name@icloud.com' : 'name@example.com'}
                      className="w-full pl-10 pr-4 py-3 bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200 dark:border-zinc-700/80 rounded-2xl text-sm font-medium text-zinc-900 dark:text-white placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-all"
                    />
                  </div>
                  {/* Apple IMAP friendly address helper */}
                  {provider === 'apple' && email && !email.endsWith('@icloud.com') && !email.endsWith('@me.com') && !email.endsWith('@mac.com') && (
                    <div className="mt-2 p-2.5 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 rounded-xl text-[11px] text-amber-800 dark:text-amber-300 flex items-start gap-2 leading-relaxed">
                      <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" />
                      <span>
                        <strong>Apple IMAP Address:</strong> Apple requires your <strong>@icloud.com</strong> (or @me.com / @mac.com) address. If your Apple Account uses an external address (such as Hotmail or Gmail), find your iCloud Mail address on your Apple device under <em>Settings &gt; [Your Name] &gt; iCloud &gt; iCloud Mail</em>.
                      </span>
                    </div>
                  )}
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="block text-[11px] font-black uppercase tracking-widest text-zinc-500 dark:text-zinc-400">
                      {provider === 'google' ? 'Google App Password' : `${getProviderTitle()} App Password`}
                    </label>
                    <span className="text-[10px] text-zinc-400 font-mono">
                      {password.replace(/[\s-]/g, '').length}/16 chars
                    </span>
                  </div>
                  <div className="relative">
                    <KeyRound className="w-4 h-4 text-zinc-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      type="text"
                      required
                      value={password}
                      onChange={(e) => handlePasswordChange(e.target.value)}
                      placeholder="abcd-efgh-ijkl-mnop"
                      maxLength={19}
                      className="w-full pl-10 pr-4 py-3 bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200 dark:border-zinc-700/80 rounded-2xl text-sm font-mono font-medium text-zinc-900 dark:text-white placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-all"
                    />
                  </div>
                  <p className="text-[11px] text-zinc-400 mt-1 pl-1">
                    {provider === 'google'
                      ? 'Your master Google password is never stored or requested.'
                      : provider === 'apple'
                      ? 'Your master Apple Account password is never stored or requested.'
                      : (provider as string) === 'outlook'
                      ? 'Your master Microsoft password is never stored or requested.'
                      : 'Your master Yahoo password is never stored or requested.'}
                  </p>
                </div>

                {/* Error Message */}
                <AnimatePresence>
                  {errorMessage && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className="p-3 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/50 rounded-xl flex items-start gap-2.5 text-xs text-red-600 dark:text-red-400"
                    >
                      <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                      <span>{errorMessage}</span>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Submit Button */}
                <div className="pt-2">
                  <button
                    type="submit"
                    disabled={!email || password.replace(/[\s-]/g, '').length < 16 || isSaving || saved}
                    className="w-full py-3.5 px-4 text-white rounded-2xl font-bold text-xs uppercase tracking-wider transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-sm cursor-pointer"
                    style={{ backgroundColor: saved ? '#10b981' : settings.themeColor }}
                  >
                    {isSaving ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        {isAuthMode ? 'Signing in with iCloud...' : `Verifying with ${getProviderTitle()}...`}
                      </>
                    ) : saved ? (
                      <>
                        <CheckCircle2 className="w-4 h-4" />
                        {isAuthMode ? 'Signed in Successfully!' : 'Connected Successfully!'}
                      </>
                    ) : (
                      <>
                        <Lock className="w-4 h-4" />
                        {isAuthMode ? 'Sign In with iCloud' : `Connect ${getProviderTitle()}`}
                      </>
                    )}
                  </button>
                </div>
              </form>
            </>
          )}
        </div>
      </motion.div>
    </div>
  );
}

