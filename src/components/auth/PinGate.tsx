import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ShieldCheck, Lock, Loader2, Mail, Key, ArrowLeft } from 'lucide-react';
import { useSettings } from '../../contexts/SettingsContext';
import { useToast } from '../../contexts/ToastContext';
import { hashPin } from '../../utils/crypto';
import { useAuth } from '../../App';
import PinSetupModal from '../settings/PinSetupModal';
import { auth } from '../../lib/firebase';
import { signInWithEmailAndPassword, sendSignInLinkToEmail, GoogleAuthProvider, signInWithPopup } from 'firebase/auth';
import GoogleIcon from '../layout/GoogleIcon';

interface PinGateProps {
  children: React.ReactNode;
}

export default function PinGate({ children }: PinGateProps) {
  const { settings, updateSettings, loading } = useSettings();
  const { showToast } = useToast();
  const [isLocked, setIsLocked] = useState(false);
  const [hasChecked, setHasChecked] = useState(false);

  // Fallback / Reset states
  const [showFallback, setShowFallback] = useState(false);
  const [fallbackMode, setFallbackMode] = useState<'password' | 'magic' | 'google'>('google');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fallbackLoading, setFallbackLoading] = useState(false);
  const [fallbackError, setFallbackError] = useState<string | null>(null);
  const [magicLinkSent, setMagicLinkSent] = useState(false);
  const [showPinResetPrompt, setShowPinResetPrompt] = useState(false);
  
  // PIN states
  const [enteredPin, setEnteredPin] = useState('');
  const [pinError, setPinError] = useState(false);

  const { user } = useAuth();

  useEffect(() => {
    if (loading || !user) return; // Wait until settings load and user is logged in

    // Check if returning from Stripe checkout or customer portal
    const params = new URLSearchParams(window.location.search);
    const isStripeReturn = 
      params.has('payment') || 
      params.has('session_id') || 
      params.has('fromStripe') || 
      sessionStorage.getItem('stripe_redirect') === 'true';

    if (!hasChecked) {
      if (isStripeReturn) {
        sessionStorage.removeItem('stripe_redirect');
        setIsLocked(false);
        setHasChecked(true);
      } else if (settings.pinLock && settings.pinHash) {
        setIsLocked(true);
      } else {
        setHasChecked(true);
      }
    }
  }, [loading, user, hasChecked, settings.pinLock, settings.pinHash]);

  const handlePinKeyPress = async (num: number) => {
    if (enteredPin.length >= 4) return;
    
    setPinError(false);
    const newPin = enteredPin + num;
    setEnteredPin(newPin);
    
    if (newPin.length === 4) {
      const hashed = await hashPin(newPin);
      if (hashed === settings.pinHash) {
        setIsLocked(false);
        setHasChecked(true);
      } else {
        setPinError(true);
        setTimeout(() => {
          setEnteredPin('');
          setPinError(false);
        }, 800);
      }
    }
  };

  const handlePinDelete = () => {
    setEnteredPin(prev => prev.slice(0, -1));
  };

  const handleSuccessfulAccountVerification = async () => {
    setIsLocked(false);
    setHasChecked(true);
    setShowFallback(false);
    showToast('Account verified! Please enter a new PIN.', 'success');
    setShowPinResetPrompt(true);
  };

  const handlePasswordSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setFallbackLoading(true);
    setFallbackError(null);
    try {
      await signInWithEmailAndPassword(auth, email, password);
      await handleSuccessfulAccountVerification();
    } catch (err: any) {
      setFallbackError(err.message || 'Failed to authenticate account');
    } finally {
      setFallbackLoading(false);
    }
  };

  const handleSendMagicLink = async (e: React.FormEvent) => {
    e.preventDefault();
    setFallbackLoading(true);
    setFallbackError(null);
    try {
      const actionCodeSettings = {
        url: window.location.origin,
        handleCodeInApp: true,
      };
      await sendSignInLinkToEmail(auth, email, actionCodeSettings);
      window.localStorage.setItem('emailForSignIn', email);
      setMagicLinkSent(true);
      showToast('Magic link sent to your email!', 'success');
    } catch (err: any) {
      setFallbackError(err.message || 'Failed to send magic link');
    } finally {
      setFallbackLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setFallbackLoading(true);
    setFallbackError(null);
    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
      await handleSuccessfulAccountVerification();
    } catch (err: any) {
      setFallbackError(err.message || 'Failed to authenticate with Google');
    } finally {
      setFallbackLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-zinc-50 dark:bg-zinc-950">
        <Loader2 className="w-8 h-8 animate-spin text-zinc-400" />
      </div>
    );
  }

  if (isLocked) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/90 backdrop-blur-xl p-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="w-full max-w-md bg-white dark:bg-zinc-900 rounded-[32px] p-8 border border-zinc-200 dark:border-zinc-800 shadow-2xl text-center"
        >
          <div className="w-16 h-16 rounded-full bg-emerald-500/10 text-emerald-500 flex items-center justify-center mx-auto mb-6">
            <Lock className="w-8 h-8" />
          </div>

          <h2 className="text-2xl font-bold text-zinc-900 dark:text-white mb-2">
            Tribe Lock Screen
          </h2>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-8">
            Enter your 4-digit PIN to access your family hub
          </p>

          {!showFallback ? (
            <div className="space-y-6">
              {/* PIN Indicator */}
              <div className="flex justify-center gap-4 mb-8">
                {[0, 1, 2, 3].map(idx => (
                  <motion.div
                    key={idx}
                    animate={pinError ? { x: [-10, 10, -10, 10, 0] } : {}}
                    transition={{ duration: 0.4 }}
                    className={`w-4 h-4 rounded-full border-2 transition-all ${
                      enteredPin.length > idx
                        ? 'bg-emerald-500 border-emerald-500 scale-110'
                        : pinError
                        ? 'border-red-500 bg-red-500/20'
                        : 'border-zinc-300 dark:border-zinc-700'
                    }`}
                  />
                ))}
              </div>

              {/* Number Keypad */}
              <div className="grid grid-cols-3 gap-4 max-w-[280px] mx-auto">
                {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(num => (
                  <button
                    key={num}
                    onClick={() => handlePinKeyPress(num)}
                    className="w-16 h-16 rounded-full bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-900 dark:text-white text-xl font-semibold flex items-center justify-center transition-colors mx-auto active:scale-95"
                  >
                    {num}
                  </button>
                ))}
                <div />
                <button
                  onClick={() => handlePinKeyPress(0)}
                  className="w-16 h-16 rounded-full bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-900 dark:text-white text-xl font-semibold flex items-center justify-center transition-colors mx-auto active:scale-95"
                >
                  0
                </button>
                <button
                  onClick={handlePinDelete}
                  className="w-16 h-16 rounded-full bg-zinc-100/50 dark:bg-zinc-800/50 hover:bg-zinc-200/50 dark:hover:bg-zinc-700/50 text-zinc-500 dark:text-zinc-400 text-sm font-medium flex items-center justify-center transition-colors mx-auto active:scale-95"
                >
                  Delete
                </button>
              </div>

              <button
                onClick={() => setShowFallback(true)}
                className="mt-6 text-xs text-zinc-400 hover:text-emerald-500 transition-colors"
              >
                Forgot PIN? Reset via Account Verification
              </button>
            </div>
          ) : (
            /* Account Recovery / Fallback Auth */
            <div className="space-y-4">
              <div className="flex justify-between items-center mb-4">
                <button
                  onClick={() => setShowFallback(false)}
                  className="text-xs text-zinc-400 hover:text-zinc-600 flex items-center gap-1"
                >
                  <ArrowLeft className="w-4 h-4" /> Back to PIN
                </button>
                <span className="text-xs text-zinc-500 font-medium">Verify Identity</span>
              </div>

              {fallbackError && (
                <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-red-500 text-xs">
                  {fallbackError}
                </div>
              )}

              {/* Mode Selectors */}
              <div className="flex gap-2 p-1 bg-zinc-100 dark:bg-zinc-800 rounded-xl text-xs">
                <button
                  onClick={() => setFallbackMode('google')}
                  className={`flex-1 py-1.5 rounded-lg transition-all ${
                    fallbackMode === 'google'
                      ? 'bg-white dark:bg-zinc-700 text-zinc-900 dark:text-white shadow-sm'
                      : 'text-zinc-500'
                  }`}
                >
                  Google
                </button>
                <button
                  onClick={() => setFallbackMode('password')}
                  className={`flex-1 py-1.5 rounded-lg transition-all ${
                    fallbackMode === 'password'
                      ? 'bg-white dark:bg-zinc-700 text-zinc-900 dark:text-white shadow-sm'
                      : 'text-zinc-500'
                  }`}
                >
                  Password
                </button>
                <button
                  onClick={() => setFallbackMode('magic')}
                  className={`flex-1 py-1.5 rounded-lg transition-all ${
                    fallbackMode === 'magic'
                      ? 'bg-white dark:bg-zinc-700 text-zinc-900 dark:text-white shadow-sm'
                      : 'text-zinc-500'
                  }`}
                >
                  Magic Link
                </button>
              </div>

              {/* Google Form */}
              {fallbackMode === 'google' && (
                <div className="py-4">
                  <button
                    onClick={handleGoogleSignIn}
                    disabled={fallbackLoading}
                    className="w-full py-3 px-4 rounded-2xl bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-900 dark:text-white font-medium flex items-center justify-center gap-3 transition-colors disabled:opacity-50"
                  >
                    {fallbackLoading ? (
                      <Loader2 className="w-5 h-5 animate-spin" />
                    ) : (
                      <>
                        <GoogleIcon className="w-5 h-5" />
                        Verify with Google Account
                      </>
                    )}
                  </button>
                </div>
              )}

              {/* Password Form */}
              {fallbackMode === 'password' && (
                <form onSubmit={handlePasswordSignIn} className="space-y-3">
                  <input
                    type="email"
                    placeholder="Account Email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    required
                    className="w-full px-4 py-2.5 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-transparent text-sm"
                  />
                  <input
                    type="password"
                    placeholder="Account Password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    required
                    className="w-full px-4 py-2.5 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-transparent text-sm"
                  />
                  <button
                    type="submit"
                    disabled={fallbackLoading}
                    className="w-full py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white font-medium text-sm flex items-center justify-center gap-2"
                  >
                    {fallbackLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Verify Password'}
                  </button>
                </form>
              )}

              {/* Magic Link Form */}
              {fallbackMode === 'magic' && (
                <form onSubmit={handleSendMagicLink} className="space-y-3">
                  {magicLinkSent ? (
                    <div className="p-4 bg-emerald-500/10 text-emerald-500 rounded-xl text-xs">
                      Check your email for the magic link. Click it to verify your identity and reset your PIN.
                    </div>
                  ) : (
                    <>
                      <input
                        type="email"
                        placeholder="Enter account email"
                        value={email}
                        onChange={e => setEmail(e.target.value)}
                        required
                        className="w-full px-4 py-2.5 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-transparent text-sm"
                      />
                      <button
                        type="submit"
                        disabled={fallbackLoading}
                        className="w-full py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white font-medium text-sm flex items-center justify-center gap-2"
                      >
                        {fallbackLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Send Magic Link'}
                      </button>
                    </>
                  )}
                </form>
              )}
            </div>
          )}

          <div className="mt-4 pt-3 border-t border-zinc-100 dark:border-zinc-800 text-center">
            <a 
              href="/privacy.html" 
              target="_blank" 
              rel="noopener noreferrer" 
              className="text-[11px] text-zinc-400 hover:text-emerald-500 underline underline-offset-2 transition-colors"
            >
              Privacy Policy
            </a>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <>
      {children}
      {showPinResetPrompt && (
        <PinSetupModal isOpen={showPinResetPrompt}
          onClose={() => setShowPinResetPrompt(false)}
        />
      )}
    </>
  );
}
