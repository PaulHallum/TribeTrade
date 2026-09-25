import { initializeApp } from 'firebase/app';
import { getAuth, setPersistence, browserLocalPersistence } from 'firebase/auth';
import { 
  initializeFirestore, 
  persistentLocalCache, 
  persistentMultipleTabManager,
  doc, 
  getDoc 
} from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import { getFunctions } from 'firebase/functions';
import { initializeAppCheck, ReCaptchaEnterpriseProvider } from 'firebase/app-check';
import firebaseConfig from '../../firebase-applet-config.json';

import { getMessaging, isSupported } from 'firebase/messaging';

const app = initializeApp(firebaseConfig);

// Initialize App Check (2026 Security Standard)
export let isAppCheckFailed = false;

const RECAPTCHA_KEY = import.meta.env.VITE_RECAPTCHA_SITE_KEY || '6LeXQs8sAAAAAJ779Yl3e7tSsPZaAuOKrF80tWm9';

if (typeof window !== 'undefined') {
  // Allow explicit debug token via environment variable if provided, or default to true on localhost
  const debugToken = import.meta.env.VITE_APPCHECK_DEBUG_TOKEN;
  if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
    (window as any).FIREBASE_APPCHECK_DEBUG_TOKEN = debugToken || true;
  }

  // Direct fetch probe to detect if ad-blockers or VPNs are blocking Google Recaptcha APIs
  fetch('https://www.google.com/recaptcha/enterprise.js', { 
    method: 'HEAD', 
    mode: 'no-cors',
    cache: 'no-store'
  }).catch((err) => {
    console.warn("reCAPTCHA script failed to fetch. Ad-blocker or VPN may be active.", err);
    isAppCheckFailed = true;
    (window as any).__appCheckFailed = true;
  });

  try {
    initializeAppCheck(app, {
      provider: new ReCaptchaEnterpriseProvider(RECAPTCHA_KEY),
      isTokenAutoRefreshEnabled: true
    });
  } catch (err) {
    console.warn("App Check failed to initialize:", err);
    isAppCheckFailed = true;
    (window as any).__appCheckFailed = true;
  }
}

export const auth = getAuth(app);

// Set persistence to local to ensure users stay logged in
setPersistence(auth, browserLocalPersistence).catch((error) => {
  console.error("Auth persistence error:", error);
});

// Modern Offline Persistence (Cost & Performance Optimization)
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({
    tabManager: persistentMultipleTabManager()
  })
});

export const storage = getStorage(app);
export const functions = getFunctions(app, 'europe-west2');

// Export messaging conditionally
export const messaging = async () => {
  const supported = await isSupported();
  return supported ? getMessaging(app) : null;
};

export default app;
