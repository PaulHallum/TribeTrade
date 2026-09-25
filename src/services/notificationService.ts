import { logger } from './logger';
import { getMessaging, onMessage, getToken } from 'firebase/messaging';
import { db } from '../lib/firebase';
import { doc, setDoc, getDoc } from 'firebase/firestore';

/**
 * Utility to convert the VAPID string to a Uint8Array
 */
function urlBase64ToUint8Array(base64String: string) {
  const sanitized = base64String.replace(/['"]+/g, '').trim();
  const padding = '='.repeat((4 - (sanitized.length % 4)) % 4);
  const base64 = (sanitized + padding)
    .replace(/-/g, '+')
    .replace(/_/g, '/');

  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

/**
 * EXPORT: Check current permission status
 */
export function getNotificationStatus() {
  if (!('Notification' in window)) return 'unsupported';
  if (Notification.permission === 'granted') return 'granted';
  if (Notification.permission === 'denied') return 'denied';
  return 'prompt';
}

/**
 * EXPORT: Check if iOS PWA is required
 */
export function isIOSStandaloneRequired() {
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream;
  const isStandalone = (window.navigator as any).standalone || window.matchMedia('(display-mode: standalone)').matches;
  return isIOS && !isStandalone;
}

/**
 * EXPORT 1: Request permission and subscribe to Push
 */
export async function requestNotificationPermission(userId: string) {
  try {
    if (!('Notification' in window)) {
      return null;
    }

    if (isIOSStandaloneRequired()) {
      return null;
    }

    if (Notification.permission === 'denied') {
      return null;
    }

    const permission = await Notification.requestPermission();

    if (permission !== 'granted') {
      return null;
    }

    const messaging = getMessaging();
    const vapidKey = import.meta.env.VITE_FIREBASE_VAPID_KEY;

    if (!vapidKey) {
      logger.error('VITE_FIREBASE_VAPID_KEY is missing');
      return;
    }

    // Get FCM Token using explicit registration to prevent timeout
    let registration = await navigator.serviceWorker.getRegistration();
    if (!registration) {
      registration = await navigator.serviceWorker.register('/firebase-messaging-sw.js');
    }
    
    // Fallback if still not ready (though register should return an active one)
    if (!registration) {
      registration = await navigator.serviceWorker.ready;
    }

    const fcmToken = await getToken(messaging, { 
      vapidKey: vapidKey.replace(/['"]+/g, '').trim(),
      serviceWorkerRegistration: registration
    });

    if (fcmToken) {
      logger.info('FCM Token generated', fcmToken);
      
      // Save token to Firestore for the backend ticker to use
      const tokenRef = doc(db, 'users', userId, 'settings', 'notifications');
      
      // Get existing tokens to avoid overwriting other devices
      const snap = await getDoc(tokenRef);
      let tokens: string[] = [];
      if (snap.exists()) {
        const data = snap.data();
        tokens = Array.isArray(data.fcmTokens) ? data.fcmTokens : (data.fcmToken ? [data.fcmToken] : []);
      }
      
      if (!tokens.includes(fcmToken)) {
        tokens.push(fcmToken);
      }

      await setDoc(tokenRef, {
        fcmToken, // Keep singular for backward compat
        fcmTokens: tokens, // Array for multiple devices
        updatedAt: new Date().toISOString(),
        enabled: true
      }, { merge: true });

      logger.info('Notification tokens updated in Firestore');
    }

    return fcmToken;
  } catch (error: any) {
    logger.error('Notification setup failed', error.message);
    throw error;
  }
}

/**
 * EXPORT 3: Unregister all and reset
 */
export async function unregisterNotifications(userId: string) {
  try {
    const messaging = getMessaging();
    
    // Clear token from Firestore
    const tokenRef = doc(db, 'users', userId, 'settings', 'notifications');
    await setDoc(tokenRef, {
      fcmToken: null,
      fcmTokens: [],
      enabled: false,
      updatedAt: new Date().toISOString()
    }, { merge: true });

    // Unregister SW registrations related to push
    const registrations = await navigator.serviceWorker.getRegistrations();
    for (const reg of registrations) {
      if (reg.active && reg.active.scriptURL.includes('firebase-messaging-sw.js')) {
        const subscription = await reg.pushManager.getSubscription();
        if (subscription) {
          await subscription.unsubscribe();
        }
      }
    }

    logger.info('Notifications unregistered and reset');
    return true;
  } catch (error: any) {
    logger.error('Failed to unregister notifications', error.message);
    return false;
  }
}

/**
 * EXPORT 2: Setup foreground listeners (MISSING EXPORT FIXED)
 * This handles alerts that arrive while the user is actively using the app.
 */
export function setupForegroundNotifications(onNotificationReceived?: (payload: any) => void) {
  try {
    const messaging = getMessaging();

    // This triggers when a push message is received while the app has focus
    const unsubscribe = onMessage(messaging, (payload) => {
      logger.info('Foreground notification received', payload);

      // Show a system notification even if the app is open
      // This is crucial for testing on mobile
      if ('serviceWorker' in navigator && Notification.permission === 'granted') {
        navigator.serviceWorker.ready.then(registration => {
          const title = payload.notification?.title || payload.data?.title || 'Tribe';
          const body = payload.notification?.body || payload.data?.body || '';
          registration.showNotification(title, {
            body: body,
            icon: '/icon-192.png',
            badge: '/icon-192.png',
            tag: payload.data?.id || 'foreground-notification'
          });
        });
      }

      // If we provided a callback (like a toast notification), trigger it
      if (onNotificationReceived) {
        onNotificationReceived(payload);
      }
    });

    return unsubscribe;
  } catch (error) {
    logger.error('Failed to setup foreground notifications', error);
    return () => { }; // Return empty cleanup function
  }
}