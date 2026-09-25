import { db } from '../lib/firebase';
import { doc, getDoc, runTransaction } from 'firebase/firestore';

/**
 * Helper to check active trial or premium status in transaction
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
 * Executed outside transactions to prevent failed-precondition errors on non-existent documents.
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
 * During 21-day Reverse Trial or Premium, limit is 100 requests/day.
 * Post-trial (Basic Mode), AI feature access is locked / limited to 0 (or basic free limit).
 */
export async function incrementAiUsage(userId: string): Promise<void> {
  const today = new Date().toISOString().split('T')[0];
  const userRef = doc(db, 'users', userId);
  const billingInfo = await fetchBillingInfo(userId);

  await runTransaction(db, async (transaction) => {
    const userSnap = await transaction.get(userRef);
    if (!userSnap.exists()) {
      throw new Error('USER_NOT_FOUND');
    }

    const userData = userSnap.data();
    const tradeUserId = userData.tradeUserId || `trade_${userId}`;
    let tier = userData.subscriptionTier || 'free';
    let isBeta = billingInfo.isBeta;
    let trialEndsAtRaw: any = billingInfo.trialEndsAtRaw;

    const familyRef = doc(db, 'trade_users', tradeUserId);
    const familySnap = await transaction.get(familyRef);

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

    const usageRef = doc(db, 'trade_users', tradeUserId, 'usage', today);
    const usageSnap = await transaction.get(usageRef);
    const currentUses = usageSnap.exists() ? (usageSnap.data().aiUses || 0) : 0;

    const limit = isPremium ? 50 : 0;
    if (currentUses >= limit) {
      throw new Error('LIMIT_EXCEEDED');
    }

    transaction.set(usageRef, {
      aiUses: currentUses + 1,
      updatedAt: new Date().toISOString()
    }, { merge: true });
  });
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

  await runTransaction(db, async (transaction) => {
    const userSnap = await transaction.get(userRef);
    if (!userSnap.exists()) {
      throw new Error('USER_NOT_FOUND');
    }

    const userData = userSnap.data();
    const tradeUserId = tradeUserIdHint || userData.tradeUserId || `family_${userId}`;
    let tier = userData.subscriptionTier || 'free';
    let isBeta = billingInfo.isBeta;
    let trialEndsAtRaw: any = billingInfo.trialEndsAtRaw;

    const familyRef = doc(db, 'trade_users', tradeUserId);
    const familySnap = await transaction.get(familyRef);

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

    const usageRef = doc(db, 'trade_users', tradeUserId, 'usage', today);
    const usageSnap = await transaction.get(usageRef);
    const currentRuns = usageSnap.exists() ? (usageSnap.data().nearbyRuns || 0) : 0;

    const limit = isPremium ? 5 : 0;
    if (currentRuns >= limit) {
      throw new Error('LIMIT_EXCEEDED');
    }

    transaction.set(usageRef, {
      nearbyRuns: currentRuns + 1,
      updatedAt: new Date().toISOString()
    }, { merge: true });
  });
}

/**
 * Increments the daily Smart Convert counter for the family.
 */
export async function incrementSmartConvertUsage(userId: string): Promise<void> {
  const today = new Date().toISOString().split('T')[0];
  const userRef = doc(db, 'users', userId);
  const billingInfo = await fetchBillingInfo(userId);

  await runTransaction(db, async (transaction) => {
    const userSnap = await transaction.get(userRef);
    if (!userSnap.exists()) {
      throw new Error('USER_NOT_FOUND');
    }

    const userData = userSnap.data();
    const tradeUserId = userData.tradeUserId || `family_${userId}`;
    let tier = userData.subscriptionTier || 'free';
    let isBeta = billingInfo.isBeta;
    let trialEndsAtRaw: any = billingInfo.trialEndsAtRaw;

    const familyRef = doc(db, 'trade_users', tradeUserId);
    const familySnap = await transaction.get(familyRef);

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

    const usageRef = doc(db, 'trade_users', tradeUserId, 'usage', today);
    const usageSnap = await transaction.get(usageRef);
    const currentRuns = usageSnap.exists() ? (usageSnap.data().smartConvertRuns || 0) : 0;

    const limit = isPremium ? 20 : 0;
    if (currentRuns >= limit) {
      throw new Error('LIMIT_EXCEEDED');
    }

    transaction.set(usageRef, {
      smartConvertRuns: currentRuns + 1,
      updatedAt: new Date().toISOString()
    }, { merge: true });
  });
}

/**
 * Increments the daily Smart Capture counter for the family.
 */
export async function incrementSmartCaptureUsage(userId: string): Promise<void> {
  const today = new Date().toISOString().split('T')[0];
  const userRef = doc(db, 'users', userId);
  const billingInfo = await fetchBillingInfo(userId);

  await runTransaction(db, async (transaction) => {
    const userSnap = await transaction.get(userRef);
    if (!userSnap.exists()) {
      throw new Error('USER_NOT_FOUND');
    }

    const userData = userSnap.data();
    const tradeUserId = userData.tradeUserId || `family_${userId}`;
    let tier = userData.subscriptionTier || 'free';
    let isBeta = billingInfo.isBeta;
    let trialEndsAtRaw: any = billingInfo.trialEndsAtRaw;

    const familyRef = doc(db, 'trade_users', tradeUserId);
    const familySnap = await transaction.get(familyRef);

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

    const usageRef = doc(db, 'trade_users', tradeUserId, 'usage', today);
    const usageSnap = await transaction.get(usageRef);
    const currentRuns = usageSnap.exists() ? (usageSnap.data().smartCaptureRuns || 0) : 0;

    const limit = isPremium ? 20 : 0;
    if (currentRuns >= limit) {
      throw new Error('LIMIT_EXCEEDED');
    }

    transaction.set(usageRef, {
      smartCaptureRuns: currentRuns + 1,
      updatedAt: new Date().toISOString()
    }, { merge: true });
  });
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

  await runTransaction(db, async (transaction) => {
    const userSnap = await transaction.get(userRef);
    if (!userSnap.exists()) return;

    const userData = userSnap.data();
    const tradeUserId = tradeUserIdHint || userData.tradeUserId || `family_${userId}`;
    const usageRef = doc(db, 'trade_users', tradeUserId, 'usage', today);

    transaction.set(usageRef, {
      nearbyRuns: 0,
      updatedAt: new Date().toISOString()
    }, { merge: true });
  });
}
