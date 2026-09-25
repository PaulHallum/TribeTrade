import { Suspense } from 'react';
import { AuthProvider } from './contexts/AuthContext';
import PinGate from './components/auth/PinGate';
import DeviceGate from './components/auth/DeviceGate';
import { Loader2 } from 'lucide-react';
import { SettingsProvider } from './contexts/SettingsContext';
import { ToastProvider } from './contexts/ToastContext';
import { lazyWithRetry } from './utils/lazyWithRetry';

const Shell = lazyWithRetry(() => import('./components/layout/Shell'));
const LegalPage = lazyWithRetry(() => import('./components/legal/LegalPage'));
const TryTribePage = lazyWithRetry(() => import('./components/overview/TryTribePage'));

export { useAuth } from './contexts/AuthContext';

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
