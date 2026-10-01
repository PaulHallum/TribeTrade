import { db } from '../lib/firebase';
import { doc, getDoc, setDoc, increment } from 'firebase/firestore';

/**
 * Helper to check active trial or premium status
 */
function checkIsActivePremium(tier: string, isBeta: boolean, trialEndsAtRaw: any): boolean {
  if (tier === 'premium' || isBeta) return true;
  if (trialEndsAtRaw) {
    const trialEnds = typeof trialEndsAtRaw.toDate === 'function' ? trialEndsAtRaw.toDate() : new Date(trialEndsAtRaw);
    if (trialEnds.getTime() > Date.now()) {
      return true;
    }
  }
  return false;
}

/**
 * Non-transactional helper to read private billing metadata
 */
async function fetchBillingInfo(userId: string): Promise<{ isBeta: boolean; trialEndsAtRaw: any }> {
  let isBeta = false;
  let trialEndsAtRaw: any = null;
  try {
    const billingRef = doc(db, 'users', userId, 'private', 'billing');
    const billingSnap = await getDoc(billingRef);
    if (billingSnap.exists()) {
      const bData = billingSnap.data();
      if (bData.isBetaTester === true) isBeta = true;
      if (bData.trialEndsAt) trialEndsAtRaw = bData.trialEndsAt;
    }
  } catch (e) {
    // Non-critical check for private subcollection
  }
  return { isBeta, trialEndsAtRaw };
}

/**
 * Increments the daily AI usage counter for the family associated with the user.
 * During 21-day Reverse Trial or Premium, limit is 50 requests/day.
 * Post-trial (Basic Mode), AI feature access is locked / limited to 0 (or basic free limit).
 */
export async function incrementAiUsage(userId: string): Promise<void> {
  const today = new Date().toISOString().split('T')[0];
  const userRef = doc(db, 'users', userId);
  const billingInfo = await fetchBillingInfo(userId);

  const userSnap = await getDoc(userRef);
  if (!userSnap.exists()) {
    throw new Error('USER_NOT_FOUND');
  }

  const userData = userSnap.data();
  const tradeUserId = userData.tradeUserId || `trade_${userId}`;
  let tier = userData.subscriptionTier || 'free';
  let isBeta = billingInfo.isBeta;
  let trialEndsAtRaw: any = billingInfo.trialEndsAtRaw;

  const familyRef = doc(db, 'trade_users', tradeUserId);
  const familySnap = await getDoc(familyRef);

  if (familySnap.exists()) {
    const familyData = familySnap.data();
    if (familyData.subscriptionTier === 'premium') {
      tier = 'premium';
    }
    if (familyData.isBetaTester === true) {
      isBeta = true;
    }
  }

  const isPremium = checkIsActivePremium(tier, isBeta, trialEndsAtRaw);
  const limit = isPremium ? 50 : 0;

  const usageRef = doc(db, 'trade_users', tradeUserId, 'usage', today);
  const usageSnap = await getDoc(usageRef);
  const currentUses = usageSnap.exists() ? (usageSnap.data().aiUses || 0) : 0;

  if (currentUses >= limit) {
    throw new Error('LIMIT_EXCEEDED');
  }

  await setDoc(usageRef, {
    aiUses: increment(1),
    updatedAt: new Date().toISOString()
  }, { merge: true });
}

/**
 * Increments the daily Nearby search counter for the family.
 * Gated behind active Premium or 21-day Reverse Trial.
 */
export async function incrementNearbyUsage(userId: string, tradeUserIdHint?: string): Promise<void> {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const today = `${year}-${month}-${day}`;
  const userRef = doc(db, 'users', userId);
  const billingInfo = await fetchBillingInfo(userId);

  const userSnap = await getDoc(userRef);
  if (!userSnap.exists()) {
    throw new Error('USER_NOT_FOUND');
  }

  const userData = userSnap.data();
  const tradeUserId = tradeUserIdHint || userData.tradeUserId || `family_${userId}`;
  let tier = userData.subscriptionTier || 'free';
  let isBeta = billingInfo.isBeta;
  let trialEndsAtRaw: any = billingInfo.trialEndsAtRaw;

  const familyRef = doc(db, 'trade_users', tradeUserId);
  const familySnap = await getDoc(familyRef);

  if (familySnap.exists()) {
    const familyData = familySnap.data();
    if (familyData.subscriptionTier === 'premium') {
      tier = 'premium';
    }
    if (familyData.isBetaTester === true) {
      isBeta = true;
    }
  }

  const isPremium = checkIsActivePremium(tier, isBeta, trialEndsAtRaw);
  const limit = isPremium ? 5 : 0;
  const usageRef = doc(db, 'trade_users', tradeUserId, 'usage', today);

  const usageSnap = await getDoc(usageRef);
  const currentRuns = usageSnap.exists() ? (usageSnap.data().nearbyRuns || 0) : 0;

  if (currentRuns >= limit) {
    throw new Error('LIMIT_EXCEEDED');
  }

  await setDoc(usageRef, {
    nearbyRuns: increment(1),
    updatedAt: new Date().toISOString()
  }, { merge: true });
}

/**
 * Increments the daily Smart Convert counter for the family.
 */
export async function incrementSmartConvertUsage(userId: string): Promise<void> {
  const today = new Date().toISOString().split('T')[0];
  const userRef = doc(db, 'users', userId);
  const billingInfo = await fetchBillingInfo(userId);

  const userSnap = await getDoc(userRef);
  if (!userSnap.exists()) {
    throw new Error('USER_NOT_FOUND');
  }

  const userData = userSnap.data();
  const tradeUserId = userData.tradeUserId || `trade_${userId}`;
  let tier = userData.subscriptionTier || 'free';
  let isBeta = billingInfo.isBeta;
  let trialEndsAtRaw: any = billingInfo.trialEndsAtRaw;

  const familyRef = doc(db, 'trade_users', tradeUserId);
  const familySnap = await getDoc(familyRef);

  if (familySnap.exists()) {
    const familyData = familySnap.data();
    if (familyData.subscriptionTier === 'premium') {
      tier = 'premium';
    }
    if (familyData.isBetaTester === true) {
      isBeta = true;
    }
  }

  const isPremium = checkIsActivePremium(tier, isBeta, trialEndsAtRaw);
  const limit = isPremium ? 20 : 0;
  const usageRef = doc(db, 'trade_users', tradeUserId, 'usage', today);

  const usageSnap = await getDoc(usageRef);
  const currentRuns = usageSnap.exists() ? (usageSnap.data().smartConvertUses || 0) : 0;

  if (currentRuns >= limit) {
    throw new Error('LIMIT_EXCEEDED');
  }

  await setDoc(usageRef, {
    smartConvertUses: increment(1),
    updatedAt: new Date().toISOString()
  }, { merge: true });
}

/**
 * Increments the daily Smart Capture counter for the family.
 */
export async function incrementSmartCaptureUsage(userId: string): Promise<void> {
  const today = new Date().toISOString().split('T')[0];
  const userRef = doc(db, 'users', userId);
  const billingInfo = await fetchBillingInfo(userId);

  const userSnap = await getDoc(userRef);
  if (!userSnap.exists()) {
    throw new Error('USER_NOT_FOUND');
  }

  const userData = userSnap.data();
  const tradeUserId = userData.tradeUserId || `trade_${userId}`;
  let tier = userData.subscriptionTier || 'free';
  let isBeta = billingInfo.isBeta;
  let trialEndsAtRaw: any = billingInfo.trialEndsAtRaw;

  const familyRef = doc(db, 'trade_users', tradeUserId);
  const familySnap = await getDoc(familyRef);

  if (familySnap.exists()) {
    const familyData = familySnap.data();
    if (familyData.subscriptionTier === 'premium') {
      tier = 'premium';
    }
    if (familyData.isBetaTester === true) {
      isBeta = true;
    }
  }

  const isPremium = checkIsActivePremium(tier, isBeta, trialEndsAtRaw);
  const limit = isPremium ? 20 : 0;
  const usageRef = doc(db, 'trade_users', tradeUserId, 'usage', today);

  const usageSnap = await getDoc(usageRef);
  const currentRuns = usageSnap.exists() ? (usageSnap.data().smartCaptureUses || 0) : 0;

  if (currentRuns >= limit) {
    throw new Error('LIMIT_EXCEEDED');
  }

  await setDoc(usageRef, {
    smartCaptureUses: increment(1),
    updatedAt: new Date().toISOString()
  }, { merge: true });
}

/**
 * Resets the daily Nearby search counter for testing.
 */
export async function resetNearbyUsage(userId: string, tradeUserIdHint?: string): Promise<void> {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const today = `${year}-${month}-${day}`;
  const userRef = doc(db, 'users', userId);

  const userSnap = await getDoc(userRef);
  if (!userSnap.exists()) return;

  const userData = userSnap.data();
  const tradeUserId = tradeUserIdHint || userData.tradeUserId || `family_${userId}`;
  const usageRef = doc(db, 'trade_users', tradeUserId, 'usage', today);

  await setDoc(usageRef, {
    nearbyRuns: 0,
    updatedAt: new Date().toISOString()
  }, { merge: true });
}
