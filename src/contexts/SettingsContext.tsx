import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { db } from '../lib/firebase';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import { useAuth } from '../App';
import { requestNotificationPermission, setupForegroundNotifications, unregisterNotifications } from '../services/notificationService';
import { logger } from '../services/logger';



import { useSubscriptionTier } from '../hooks/useSubscriptionTier';
import { ReminderOffset } from '../lib/reminderUtils';

interface Settings {
  themeColor: string;
  darkMode: boolean;
  notifications: boolean;
  defaultReminderOffset: ReminderOffset;
  pinLock: boolean;
  pinHash?: string;
  homeArea?: string;
  nearbyExclusions?: string;
  iconColor?: string;
}

interface SettingsContextType {
  settings: Settings;
  updateSettings: (newSettings: Partial<Settings>) => Promise<void>;
  loading: boolean;
}

const defaultSettings: Settings = {
  themeColor: '#10b981', // emerald-500
  darkMode: false,
  notifications: true,
  defaultReminderOffset: 'at_time',
  pinLock: false,
  iconColor: '#94a3b8' // default slate icon colour
};

const SettingsContext = createContext<SettingsContextType>({
  settings: defaultSettings,
  updateSettings: async () => {},
  loading: true,
});

export const useSettings = () => useContext(SettingsContext);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [settings, setSettings] = useState<Settings>(defaultSettings);
  const [loading, setLoading] = useState(true);
  const { subscriptionTier } = useSubscriptionTier();

  useEffect(() => {
    if (!user) {
      setSettings(defaultSettings);
      setLoading(false);
      return;
    }

    const settingsRef = doc(db, 'users', user.uid, 'settings', 'preferences');
    const unsubscribe = onSnapshot(settingsRef, (docSnap) => {
      if (docSnap.exists()) {
        setSettings({ ...defaultSettings, ...docSnap.data() });
      } else {
        // Initialize with defaults if not exists
        setDoc(settingsRef, defaultSettings).catch(err => {
          logger.warn('Failed to initialise default settings', err);
        });
      }
      setLoading(false);
    }, (err) => {
      logger.warn('Settings preferences listener error', err);
      setSettings(defaultSettings);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [user]);

  useEffect(() => {
    if (user && settings.notifications) {
      // Auto-register/refresh token on load only if browser permission is already granted
      if ('Notification' in window && Notification.permission === 'granted') {
        requestNotificationPermission(user.uid).catch(err => {
          logger.warn('Auto-registration of notifications failed', err);
        });
      }
    }
  }, [user, settings.notifications]);

  useEffect(() => {
    let unsubscribe: (() => void) | undefined;
    
    if (user && settings.notifications) {
      const setup = async () => {
        unsubscribe = await setupForegroundNotifications();
      };
      setup();
    }

    return () => {
      if (unsubscribe) {
        unsubscribe();
      }
    };
  }, [user, settings.notifications]);


  useEffect(() => {
    // Apply dark mode to document
    logger.info('User settings updated', settings);
    const root = document.documentElement;
    const body = document.body;
    
    if (settings.darkMode) {
      root.classList.add('dark');
      body.classList.add('dark');
    } else {
      root.classList.remove('dark');
      body.classList.remove('dark');
    }

    const isFree = subscriptionTier === 'free';
    
    // Apply theme color to CSS variable
    const activeColor = isFree ? '#10b981' : settings.themeColor;
    root.style.setProperty('--accent-color', activeColor);
    body.style.setProperty('--accent-color', activeColor);

    // Apply icon color to CSS variable
    const activeIconColor = isFree ? '#94a3b8' : (settings.iconColor || '#94a3b8');
    root.style.setProperty('--icon-color', activeIconColor);
    body.style.setProperty('--icon-color', activeIconColor);
  }, [settings.darkMode, settings.themeColor, settings.iconColor, subscriptionTier]);

  const updateSettings = async (newSettings: Partial<Settings>) => {
    if (!user) return;
    try {
      const updated = { ...settings, ...newSettings };
      setSettings(updated); // Optimistic update

      // If user is enabling notifications, request permission
      if (newSettings.notifications === true && user) {
        const granted = await requestNotificationPermission(user.uid);
        if (!granted) {
          updated.notifications = false;
          setSettings(updated);
        }
      } else if (newSettings.notifications === false && user) {
        await unregisterNotifications(user.uid);
      }

      const settingsRef = doc(db, 'users', user.uid, 'settings', 'preferences');
      await setDoc(settingsRef, updated, { merge: true });
    } catch (error) {
      logger.error('Settings update failed', error);
    }
  };


  return (
    <SettingsContext.Provider value={{ settings, updateSettings, loading }}>
      {children}
    </SettingsContext.Provider>
  );
}
