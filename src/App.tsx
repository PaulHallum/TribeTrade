import { Suspense, useEffect } from 'react';
import { AuthProvider } from './contexts/AuthContext';
import PinGate from './components/auth/PinGate';
import DeviceGate from './components/auth/DeviceGate';
import { Loader2 } from 'lucide-react';
import { SettingsProvider } from './contexts/SettingsContext';
import { ToastProvider, useToast } from './contexts/ToastContext';
import { lazyWithRetry } from './utils/lazyWithRetry';
import { auth } from './lib/firebase';

const Shell = lazyWithRetry(() => import('./components/layout/Shell'));
const LegalPage = lazyWithRetry(() => import('./components/legal/LegalPage'));
const TryTribePage = lazyWithRetry(() => import('./components/overview/TryTribePage'));

export { useAuth } from './contexts/AuthContext';

function AuthActionHandler() {
  const { showToast } = useToast();

  useEffect(() => {
    const search = window.location.search;
    if (!search) return;

    const params = new URLSearchParams(search);
    const mode = params.get('mode');
    const oobCode = params.get('oobCode');
    const emailVerified = params.get('emailVerified');

    // 1. Direct verifyEmail action handling with oobCode
    if (mode === 'verifyEmail' && oobCode) {
      (async () => {
        try {
          const { applyActionCode } = await import('firebase/auth');
          await applyActionCode(auth, oobCode);
          if (auth.currentUser) {
            await auth.currentUser.reload();
          }
          showToast('Email verified successfully! Your account is fully active.', 'success');
        } catch (err: any) {
          // If the link was pre-fetched or already clicked, check if current user is already verified
          if (auth.currentUser) {
            await auth.currentUser.reload();
            if (auth.currentUser.emailVerified) {
              showToast('Your email address is already verified!', 'success');
              return;
            }
          }
          showToast('Verification link expired or already used. Please click Resend Email to get a fresh link.', 'error');
        } finally {
          const cleanUrl = window.location.pathname;
          window.history.replaceState({}, document.title, cleanUrl);
        }
      })();
      return;
    }

    // 2. User redirected from external verification or action handler
    if (emailVerified === 'true') {
      (async () => {
        if (auth.currentUser) {
          await auth.currentUser.reload();
          if (auth.currentUser.emailVerified) {
            showToast('Email verified successfully! Your account is fully active.', 'success');
          }
        }
        const cleanUrl = window.location.pathname;
        window.history.replaceState({}, document.title, cleanUrl);
      })();
    }
  }, [showToast]);

  return null;
}

export default function App() {
  const path = window.location.pathname.replace(/^\/|\/$/g, '').toLowerCase();

  if (path === 'trytribe' || path === 'try' || path === 'try-tribe' || path === 'overview') {
    return (
      <Suspense fallback={<div className="h-screen w-screen flex items-center justify-center bg-zinc-950 text-white"><Loader2 className="w-8 h-8 animate-spin text-emerald-500" /></div>}>
        <TryTribePage />
      </Suspense>
    );
  }
  
  if (path === 'privacy' || path === 'privacy-policy' || 
      path === 'terms' || path === 'terms-of-service' || 
      path === 'deletion' || path === 'data-deletion' || 
      path === 'guide' || path === 'user-guide') {
    return (
      <Suspense fallback={<div className="h-screen w-screen flex items-center justify-center bg-[#f1f3f5] dark:bg-[#141518]"><Loader2 className="w-8 h-8 animate-spin text-zinc-400" /></div>}>
        <LegalPage docType={path} />
      </Suspense>
    );
  }

  return (
    <ToastProvider>
      <AuthProvider>
        <AuthActionHandler />
        <SettingsProvider>
          <DeviceGate>
            <PinGate>
              <Suspense fallback={
                <div className="h-screen w-screen flex items-center justify-center bg-[#f1f3f5] dark:bg-[#141518]">
                  <Loader2 className="w-8 h-8 animate-spin text-zinc-400" />
                </div>
              }>
                <Shell />
              </Suspense>
            </PinGate>
          </DeviceGate>
        </SettingsProvider>
      </AuthProvider>
    </ToastProvider>
  );
}
