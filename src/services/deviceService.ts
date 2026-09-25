import { db } from '../lib/firebase';
import { doc, getDoc, setDoc, onSnapshot } from 'firebase/firestore';
import { logger } from './logger';

export const MAX_DEVICES = 4;
export const MAX_MONTHLY_SWAPS = 2;
const DEVICE_ID_STORAGE_KEY = 'tribe_device_id';

export interface RegisteredDevice {
  id: string;
  name: string;
  type: 'mobile' | 'tablet' | 'desktop';
  browser: string;
  os: string;
  registeredAt: string;
  lastActiveAt: string;
}

export interface DeviceSwapRecord {
  deviceId: string;
  deviceName: string;
  swappedAt: string;
}

export interface DeviceVerificationResult {
  allowed: boolean;
  currentDeviceId: string;
  currentDevice: RegisteredDevice;
  registeredDevices: RegisteredDevice[];
  swapsRemaining: number;
  nextAvailableSwapDate?: string;
  reason?: 'limit_reached' | 'quota_exhausted';
}

/**
 * Returns or generates a persistent device UUID in localStorage.
 */
export function getOrCreateDeviceId(): string {
  if (typeof window === 'undefined' || !window.localStorage) {
    return 'temp_device_' + Date.now();
  }

  let id = localStorage.getItem(DEVICE_ID_STORAGE_KEY);
  if (!id) {
    try {
      id = 'dev_' + (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}_${Math.random().toString(36).substring(2, 9)}`);
    } catch {
      id = `dev_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    }
    localStorage.setItem(DEVICE_ID_STORAGE_KEY, id);
  }
  return id;
}

/**
 * Inspects user agent and environment to identify device name, type, and OS.
 */
export function detectCurrentDevice(): RegisteredDevice {
  const id = getOrCreateDeviceId();
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
  const now = new Date().toISOString();

  let os = 'Unknown OS';
  if (/iPad|iPhone|iPod/.test(ua)) os = 'iOS';
  else if (/Android/.test(ua)) os = 'Android';
  else if (/Windows NT/.test(ua)) os = 'Windows';
  else if (/Macintosh|Mac OS X/.test(ua)) os = 'macOS';
  else if (/Linux/.test(ua)) os = 'Linux';
  else if (/CrOS/.test(ua)) os = 'ChromeOS';

  let browser = 'Browser';
  if (/Edg\//.test(ua)) browser = 'Edge';
  else if (/Chrome\//.test(ua)) browser = 'Chrome';
  else if (/Safari\//.test(ua) && !/Chrome\//.test(ua)) browser = 'Safari';
  else if (/Firefox\//.test(ua)) browser = 'Firefox';
  else if (/OPR\//.test(ua)) browser = 'Opera';

  let type: 'mobile' | 'tablet' | 'desktop' = 'desktop';
  const width = typeof window !== 'undefined' ? window.innerWidth : 1200;
  const isTouch = typeof navigator !== 'undefined' && (navigator.maxTouchPoints > 0 || 'ontouchstart' in window);

  if (/iPad/.test(ua) || (os === 'macOS' && isTouch && width <= 1024)) {
    type = 'tablet';
  } else if (/Mobile|Android.*Mobile|iPhone/.test(ua)) {
    type = 'mobile';
  } else if (/Tablet|Android/.test(ua) || (isTouch && width <= 1024)) {
    type = 'tablet';
  }

  let name = `${os} (${browser})`;
  if (os === 'iOS') {
    name = type === 'tablet' ? `Apple iPad • ${browser}` : `Apple iPhone • ${browser}`;
  } else if (os === 'Android') {
    name = type === 'tablet' ? `Android Tablet • ${browser}` : `Android Phone • ${browser}`;
  } else if (os === 'macOS') {
    name = `Mac • ${browser}`;
  } else if (os === 'Windows') {
    name = `Windows PC • ${browser}`;
  }

  return {
    id,
    name,
    type,
    browser,
    os,
    registeredAt: now,
    lastActiveAt: now
  };
}

/**
 * Calculates remaining device swaps in a rolling 30-day window.
 */
export function calculateSwapsRemaining(swapHistory: DeviceSwapRecord[] = []): {
  swapsRemaining: number;
  recentSwaps: DeviceSwapRecord[];
  nextAvailableSwapDate?: string;
} {
  const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
  const recentSwaps = (swapHistory || []).filter(h => {
    const time = new Date(h.swappedAt).getTime();
    return !isNaN(time) && time > thirtyDaysAgo;
  });

  const swapsRemaining = Math.max(0, MAX_MONTHLY_SWAPS - recentSwaps.length);

  let nextAvailableSwapDate: string | undefined;
  if (swapsRemaining === 0 && recentSwaps.length > 0) {
    // Sort oldest recent swap to see when the first one expires
    const sorted = [...recentSwaps].sort((a, b) => new Date(a.swappedAt).getTime() - new Date(b.swappedAt).getTime());
    const oldest = new Date(sorted[0].swappedAt).getTime();
    const expiry = new Date(oldest + 30 * 24 * 60 * 60 * 1000);
    nextAvailableSwapDate = expiry.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  }

  return {
    swapsRemaining,
    recentSwaps,
    nextAvailableSwapDate
  };
}

/**
 * Subscribes to registered devices for a trade user account.
 */
export function subscribeRegisteredDevices(
  tradeUserId: string,
  callback: (data: { registeredDevices: RegisteredDevice[]; swapHistory: DeviceSwapRecord[] }) => void
): () => void {
  const userDocRef = doc(db, 'trade_users', tradeUserId);

  return onSnapshot(userDocRef, (snap) => {
    if (snap.exists()) {
      const data = snap.data();
      callback({
        registeredDevices: (data.registeredDevices || []) as RegisteredDevice[],
        swapHistory: (data.deviceSwapHistory || []) as DeviceSwapRecord[]
      });
    } else {
      callback({ registeredDevices: [], swapHistory: [] });
    }
  }, (err) => {
    logger.warn('Failed to subscribe to registered devices', err);
    callback({ registeredDevices: [], swapHistory: [] });
  });
}

/**
 * Verifies whether the current device is authorized to access the account,
 * auto-registering if slots (< 4) are available.
 */
export async function verifyAndRegisterCurrentDevice(
  tradeUserId: string
): Promise<DeviceVerificationResult> {
  const currentDevice = detectCurrentDevice();
  const userDocRef = doc(db, 'trade_users', tradeUserId);

  try {
    const snap = await getDoc(userDocRef);
    const data = snap.exists() ? snap.data() : {};
    const registeredDevices: RegisteredDevice[] = data.registeredDevices || [];
    const swapHistory: DeviceSwapRecord[] = data.deviceSwapHistory || [];

    const { swapsRemaining, nextAvailableSwapDate } = calculateSwapsRemaining(swapHistory);

    // 1. Is this device already registered?
    const existingIndex = registeredDevices.findIndex(d => d.id === currentDevice.id);
    if (existingIndex !== -1) {
      // Update lastActiveAt
      registeredDevices[existingIndex].lastActiveAt = new Date().toISOString();
      await setDoc(userDocRef, { registeredDevices }, { merge: true });

      return {
        allowed: true,
        currentDeviceId: currentDevice.id,
        currentDevice,
        registeredDevices,
        swapsRemaining
      };
    }

    // 2. Not registered: Do we have room under the 4-device limit?
    if (registeredDevices.length < MAX_DEVICES) {
      // Auto-register smoothly!
      const updatedDevices = [...registeredDevices, currentDevice];
      await setDoc(userDocRef, { registeredDevices: updatedDevices }, { merge: true });

      return {
        allowed: true,
        currentDeviceId: currentDevice.id,
        currentDevice,
        registeredDevices: updatedDevices,
        swapsRemaining
      };
    }

    // 3. At limit (4 devices): Gated!
    return {
      allowed: false,
      currentDeviceId: currentDevice.id,
      currentDevice,
      registeredDevices,
      swapsRemaining,
      nextAvailableSwapDate,
      reason: swapsRemaining > 0 ? 'limit_reached' : 'quota_exhausted'
    };
  } catch (err) {
    logger.error('Error during device verification', err);
    // Fail safe to allowed to prevent locking out users on network blip
    return {
      allowed: true,
      currentDeviceId: currentDevice.id,
      currentDevice,
      registeredDevices: [],
      swapsRemaining: MAX_MONTHLY_SWAPS
    };
  }
}

/**
 * Replaces an existing device with the current device, checking monthly swap quota.
 */
export async function swapDevice(
  tradeUserId: string,
  oldDeviceId: string
): Promise<{ success: boolean; error?: string }> {
  const currentDevice = detectCurrentDevice();
  const userDocRef = doc(db, 'trade_users', tradeUserId);

  const snap = await getDoc(userDocRef);
  if (!snap.exists()) {
    return { success: false, error: 'User account not found.' };
  }

  const data = snap.data();
  const registeredDevices: RegisteredDevice[] = data.registeredDevices || [];
  const swapHistory: DeviceSwapRecord[] = data.deviceSwapHistory || [];

  const { swapsRemaining } = calculateSwapsRemaining(swapHistory);
  if (swapsRemaining <= 0) {
    return {
      success: false,
      error: `Monthly swap limit reached (${MAX_MONTHLY_SWAPS} changes per month).`
    };
  }

  const oldDevice = registeredDevices.find(d => d.id === oldDeviceId);
  if (!oldDevice) {
    return { success: false, error: 'Selected device to remove was not found.' };
  }

  // Remove old, add current
  const updatedDevices = registeredDevices.filter(d => d.id !== oldDeviceId);
  updatedDevices.push(currentDevice);

  // Record swap event
  const newSwapRecord: DeviceSwapRecord = {
    deviceId: oldDeviceId,
    deviceName: oldDevice.name,
    swappedAt: new Date().toISOString()
  };
  const updatedHistory = [...swapHistory, newSwapRecord];

  await setDoc(userDocRef, {
    registeredDevices: updatedDevices,
    deviceSwapHistory: updatedHistory
  }, { merge: true });

  return { success: true };
}

/**
 * Manually deregisters a device from settings.
 */
export async function deregisterDevice(
  tradeUserId: string,
  deviceIdToRemove: string
): Promise<{ success: boolean; error?: string }> {
  const userDocRef = doc(db, 'trade_users', tradeUserId);

  const snap = await getDoc(userDocRef);
  if (!snap.exists()) {
    return { success: false, error: 'User account not found.' };
  }

  const data = snap.data();
  const registeredDevices: RegisteredDevice[] = data.registeredDevices || [];
  const swapHistory: DeviceSwapRecord[] = data.deviceSwapHistory || [];

  const device = registeredDevices.find(d => d.id === deviceIdToRemove);
  if (!device) {
    return { success: false, error: 'Device not found.' };
  }

  const updatedDevices = registeredDevices.filter(d => d.id !== deviceIdToRemove);

  // If at capacity, removing counts towards swap usage to prevent churn exploits
  let updatedHistory = swapHistory;
  if (registeredDevices.length >= MAX_DEVICES) {
    updatedHistory = [
      ...swapHistory,
      {
        deviceId: deviceIdToRemove,
        deviceName: device.name,
        swappedAt: new Date().toISOString()
      }
    ];
  }

  await setDoc(userDocRef, {
    registeredDevices: updatedDevices,
    deviceSwapHistory: updatedHistory
  }, { merge: true });

  return { success: true };
}
