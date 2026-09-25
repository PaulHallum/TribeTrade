import React, { useState, useEffect, createContext, useContext, useCallback, useRef, ReactNode } from 'react';
import { auth, db, isAppCheckFailed } from '../lib/firebase';
import { onAuthStateChanged, signInWithPopup, signInWithCredential, GoogleAuthProvider, User } from 'firebase/auth';
import { doc, getDoc, setDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { logger } from '../services/logger';
import { ShieldAlert, Loader2 } from 'lucide-react';

const GOOGLE_SCOPES = [
  'https://www.googleapis.com/auth/calendar',
];
const TOKEN_KEY = 'tribe_google_token';
const TOKEN_EXPIRY_KEY = 'tribe_google_token_expiry';
const REFRESH_TOKEN_KEY = 'tribe_google_refresh_token';

// Migrate legacy local storage keys to the new tribe_ prefix
(function migrateLegacyLocalStorage() {
  if (typeof window !== 'undefined' && window.localStorage) {
    const legacyKeys = {
      'ng_google_token': 'tribe_google_token',
      'ng_google_token_expiry': 'tribe_google_token_expiry',
      'ng_google_refresh_token': 'tribe_google_refresh_token'
    };
    for (const [oldKey, newKey] of Object.entries(legacyKeys)) {
      const val = localStorage.getItem(oldKey);
      if (val !== null) {
        localStorage.setItem(newKey, val);
        localStorage.removeItem(oldKey);
      }
    }
  }
})();

interface AuthContextType {
  user: User | null;
  tradeUserId: string | null;
  loading: boolean;
  signIn: () => Promise<string | null>;
  googleAccessToken: string | null;
  refreshGoogleToken: () => Promise<string | null>;
  currentUserMemberId: string | null;
  isGoogleReauthRequired: boolean;
  dismissGoogleReauthPrompt: () => void;
  disconnectGoogle: () => void;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  tradeUserId: null,
  loading: true,
  signIn: async () => null,
  googleAccessToken: null,
  refreshGoogleToken: async () => null,
  currentUserMemberId: null,
  isGoogleReauthRequired: false,
  dismissGoogleReauthPrompt: () => {},
  disconnectGoogle: () => {},
});

export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [tradeUserId, setTradeUserId] = useState<string | null>(null);
  const [currentUserMemberId, setCurrentUserMemberId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [googleAccessToken, setGoogleAccessToken] = useState<string | null>(null);
  const [isGoogleReauthRequired, setIsGoogleReauthRequired] = useState(false);
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [appCheckBlocked, setAppCheckBlocked] = useState(false);

  const dismissGoogleReauthPrompt = useCallback(() => {
    setIsGoogleReauthRequired(false);
  }, []);

  const disconnectGoogle = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(TOKEN_EXPIRY_KEY);
    localStorage.removeItem(REFRESH_TOKEN_KEY);
    setGoogleAccessToken(null);
  }, []);

  // Monitor App Check / reCAPTCHA load failures
  useEffect(() => {
    const checkAppCheck = () => {
      if (isAppCheckFailed || (window as any).__appCheckFailed) {
        setAppCheckBlocked(true);
      }
    };
    checkAppCheck();
    const interval = setInterval(checkAppCheck, 1000);
    return () => clearInterval(interval);
  }, []);

  /** Persist token to localStorage and update state */
  const storeToken = useCallback((token: string | null, expiry?: number, refreshToken?: string | null) => {
    setGoogleAccessToken(token);
    if (token) {
      setIsGoogleReauthRequired(false);
      localStorage.setItem(TOKEN_KEY, token);
      localStorage.setItem(TOKEN_EXPIRY_KEY, String(expiry || (Date.now() + 3500_000)));
      if (refreshToken) {
        localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
      }
    } else {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(TOKEN_EXPIRY_KEY);
      localStorage.removeItem(REFRESH_TOKEN_KEY);
    }
  }, []);

  /** Silent refresh using backend */
  const silentRefresh = useCallback(async (refreshToken: string): Promise<string | null> => {
    try {
      const response = await fetch('/api/auth/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken })
      });
      const contentType = response.headers.get('content-type');
      if (response.ok && contentType?.includes('application/json')) {
        const data = await response.json();
        const newToken = data.access_token;
        const expiry = Date.now() + (data.expires_in * 1000) - 60000;
        storeToken(newToken, expiry, data.refresh_token || refreshToken);
        return newToken;
      }
    } catch (error) {
      logger.error('Silent refresh failed', error);
    }
    return null;
  }, [storeToken]);

  /** Core Google sign-in flow — requests Calendar scope */
  const doGoogleSignIn = useCallback(async (): Promise<string | null> => {
    try {
      const currentOrigin = typeof window !== 'undefined' ? window.location.origin : '';
      const authUrlRes = await fetch(`/api/auth/url?origin=${encodeURIComponent(currentOrigin)}`);
      const contentType = authUrlRes.headers.get('content-type');
      if (!authUrlRes.ok || !contentType?.includes('application/json')) {
        logger.warn('Google sign-in endpoint is not currently reachable');
        return null;
      }
      const { url } = await authUrlRes.json();
      
      return new Promise((resolve) => {
        const width = 500, height = 600;
        const left = window.screenX + (window.outerWidth - width) / 2;
        const top = window.screenY + (window.outerHeight - height) / 2;
        const popup = window.open(url, 'google-auth', `width=${width},height=${height},left=${left},top=${top}`);

        const messageHandler = async (event: MessageEvent) => {
          if (event.data?.type === 'GOOGLE_AUTH_SUCCESS') {
            window.removeEventListener('message', messageHandler);
            const { tokens } = event.data;
            const expiry = Date.now() + (tokens.expiry_date - Date.now()) - 60000;
            storeToken(tokens.access_token, expiry, tokens.refresh_token);
            
            if (tokens.id_token && !auth.currentUser) {
              try {
                const credential = GoogleAuthProvider.credential(tokens.id_token);
                await signInWithCredential(auth, credential);
              } catch (credErr) {
                logger.warn('signInWithCredential failed', credErr);
              }
            }
            
            if (tokens.refresh_token && auth.currentUser) {
              const ref = doc(db, 'users', auth.currentUser.uid, 'settings', 'integrations');
              await setDoc(ref, {
                googleRefreshToken: tokens.refresh_token,
                googleCalendarEnabled: true,
                connectedAt: new Date().toISOString(),
              }, { merge: true });
            }
            resolve(tokens.access_token);
          }
        };

        window.addEventListener('message', messageHandler);

        const checkClosed = setInterval(() => {
          if (popup?.closed) {
            clearInterval(checkClosed);
            window.removeEventListener('message', messageHandler);
            resolve(null);
          }
        }, 1000);
      });
    } catch (error) {
      logger.error('Google sign-in failed', error);
      return null;
    }
  }, [storeToken]);

  /** Schedule a proactive token refresh before expiry */
  const scheduleRefresh = useCallback(() => {
    if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);

    const expiry = Number(localStorage.getItem(TOKEN_EXPIRY_KEY) || '0');
    const delay = Math.max(expiry - Date.now() - 5 * 60_000, 60_000);

    refreshTimerRef.current = setTimeout(() => {
      const rt = localStorage.getItem(REFRESH_TOKEN_KEY);
      if (rt) {
        silentRefresh(rt).catch(() => {});
      } else {
        doGoogleSignIn().catch(() => {});
      }
    }, delay);
  }, [doGoogleSignIn, silentRefresh]);

  /** Public: refreshes the Google access token */
  const refreshGoogleToken = useCallback(async (): Promise<string | null> => {
    const rt = localStorage.getItem(REFRESH_TOKEN_KEY);
    if (rt) {
      const token = await silentRefresh(rt);
      if (token) return token;
    }
    return null;
  }, [silentRefresh]);

  // Auth state listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      try {
        if (firebaseUser) {
          setUser(firebaseUser);

          const userRef = doc(db, 'users', firebaseUser.uid);
          let userSnap: any = null;
          try {
            userSnap = await getDoc(userRef);
          } catch (err) {
            logger.warn('Failed to fetch user profile document', err);
          }

          if (userSnap && userSnap.exists()) {
            const data = userSnap.data();
            const fid = data.tradeUserId;
            setTradeUserId(fid);
            setCurrentUserMemberId(data.memberId || null);
            logger.setContext(firebaseUser.uid, fid);
          } else {
            let resolvedTradeUserId = `trade_${firebaseUser.uid}`;
            const isOwnerAdmin = firebaseUser.email?.toLowerCase() === 'paulhallum@googlemail.com' || firebaseUser.email?.toLowerCase() === 'paulhallum@gmail.com';
            let resolvedRole = isOwnerAdmin ? 'admin' : 'member';

            if (firebaseUser.email) {
              try {
                const q = query(collection(db, 'users'), where('email', '==', firebaseUser.email));
                const qSnap = await getDocs(q);
                if (!qSnap.empty) {
                  const existingDoc = qSnap.docs[0].data();
                  if (existingDoc.tradeUserId) {
                    resolvedTradeUserId = existingDoc.tradeUserId;
                    resolvedRole = existingDoc.role || (isOwnerAdmin ? 'admin' : 'member');
                  }
                }
              } catch (err) {
                logger.warn('Failed to query existing user by email', err);
              }
            }

            const createdAtStr = new Date().toISOString();
            const trialEndsAtStr = new Date(Date.now() + 21 * 24 * 60 * 60 * 1000).toISOString();
            
            try {
              await setDoc(userRef, {
                email: firebaseUser.email,
                displayName: firebaseUser.displayName || 'Trade User',
                tradeUserId: resolvedTradeUserId,
                role: resolvedRole,
                subscriptionTier: 'free',
                createdAt: createdAtStr,
              });

              const billingRef = doc(db, 'users', firebaseUser.uid, 'private', 'billing');
              await setDoc(billingRef, {
                createdAt: createdAtStr,
                trialEndsAt: trialEndsAtStr,
                subscriptionTier: 'free'
              }, { merge: true });
            } catch (err) {
              logger.warn('Failed to initialise user document in Firestore', err);
            }

            setTradeUserId(resolvedTradeUserId);
            logger.setContext(firebaseUser.uid, resolvedTradeUserId);
          }

          const cachedToken = localStorage.getItem(TOKEN_KEY);
          const expiry = Number(localStorage.getItem(TOKEN_EXPIRY_KEY) || '0');
          const refreshToken = localStorage.getItem(REFRESH_TOKEN_KEY);

          let activeToken: string | null = null;
          let isPreviouslyConnected = false;

          if (cachedToken && Date.now() < expiry) {
            activeToken = cachedToken;
            setGoogleAccessToken(cachedToken);
          } else if (refreshToken) {
            isPreviouslyConnected = true;
            activeToken = await silentRefresh(refreshToken);
          } else {
            try {
              const intRef = doc(db, 'users', firebaseUser.uid, 'settings', 'integrations');
              const intSnap = await getDoc(intRef);
              if (intSnap.exists()) {
                const data = intSnap.data();
                if (data.googleCalendarEnabled || data.googleRefreshToken) {
                  isPreviouslyConnected = true;
                  if (data.googleRefreshToken) {
                    activeToken = await silentRefresh(data.googleRefreshToken);
                  }
                }
              }
            } catch (err) {
              logger.warn('Failed to check Google integrations doc', err);
            }
          }

          if (isPreviouslyConnected && !activeToken) {
            setIsGoogleReauthRequired(true);
          } else {
            setIsGoogleReauthRequired(false);
          }
        } else {
          setUser(null);
          setTradeUserId(null);
          setCurrentUserMemberId(null);
          setIsGoogleReauthRequired(false);
          storeToken(null);
          logger.setContext(null, null);
        }
      } catch (err) {
        logger.error('Error during auth state processing', err);
      } finally {
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, [storeToken, silentRefresh]);

  useEffect(() => {
    if (googleAccessToken) {
      scheduleRefresh();
    }
    return () => {
      if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    };
  }, [googleAccessToken, scheduleRefresh]);

  const signIn = async (): Promise<string | null> => {
    if ('geolocation' in navigator) {
      try {
        await new Promise((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 5000 });
        });
      } catch (err) {
        logger.warn('Location access declined or timed out during sign-in', err);
      }
    }

    if (!auth.currentUser) {
      const provider = new GoogleAuthProvider();
      try {
        await signInWithPopup(auth, provider);
      } catch (error) {
        logger.error('Firebase sign-in failed', error);
        return null;
      }
    }
    return doGoogleSignIn();
  };

  if (appCheckBlocked) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-[#f1f3f5] dark:bg-[#141518] p-4">
        <div className="max-w-md w-full bg-white dark:bg-zinc-900 border border-zinc-250/60 dark:border-zinc-800/80 rounded-[32px] p-8 shadow-xl text-center space-y-6">
          <div className="w-16 h-16 mx-auto bg-red-50 dark:bg-red-950/20 text-red-500 rounded-2xl flex items-center justify-center">
            <ShieldAlert className="w-8 h-8" />
          </div>
          <div className="space-y-2">
            <h2 className="text-xl font-black text-zinc-900 dark:text-white">Security Check Blocked</h2>
            <p className="text-sm text-zinc-650 dark:text-zinc-400 font-medium">
              We require Firebase App Check & reCAPTCHA verification to prevent bots and protect our app's APIs from abuse.
            </p>
          </div>
          <div className="bg-amber-50 dark:bg-amber-950/10 border border-amber-100 dark:border-amber-900/20 rounded-2xl p-4 text-xs font-semibold text-amber-800 dark:text-amber-300 text-left space-y-1">
            <p>💡 Common Causes:</p>
            <ul className="list-disc pl-4 space-y-1 font-medium text-zinc-650 dark:text-zinc-400">
              <li>A strict browser extension or ad-blocker (e.g. uBlock Origin) is blocking `google.com` or `recaptcha` services.</li>
              <li>A VPN or firewall is blocking security verification endpoints.</li>
            </ul>
            <p className="mt-2 text-amber-700 dark:text-amber-400">
              Please temporary disable your ad-blocker or VPN, then click refresh below.
            </p>
          </div>
          <button
            onClick={() => window.location.reload()}
            className="w-full py-3.5 bg-zinc-900 hover:bg-black dark:bg-white dark:hover:bg-zinc-100 text-white dark:text-zinc-950 text-xs font-black uppercase tracking-widest rounded-xl transition-all shadow-md active:scale-95"
          >
            Retry Verification
          </button>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-[#f1f3f5] dark:bg-[#141518]">
        <Loader2 className="w-8 h-8 animate-spin text-zinc-400" />
      </div>
    );
  }

  return (
    <AuthContext.Provider value={{
      user,
      tradeUserId,
      loading,
      signIn,
      googleAccessToken,
      refreshGoogleToken,
      currentUserMemberId,
      isGoogleReauthRequired,
      dismissGoogleReauthPrompt,
      disconnectGoogle
    }}>
      {children}
    </AuthContext.Provider>
  );
}
