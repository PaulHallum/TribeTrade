import { useState, useEffect } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../App';

export interface SubscriptionStatus {
  subscriptionTier: 'free' | 'premium';
  isTrial: boolean;
  trialDaysRemaining: number;
  trialEndsAt: Date | null;
  trialHasEnded: boolean;
  isBetaTester: boolean;
  cancelAtPeriodEnd: boolean;
  currentPeriodEnd: Date | null;
  loading: boolean;
}

export function useSubscriptionTier(): SubscriptionStatus {
  const { user } = useAuth();
  const [subscriptionTier, setSubscriptionTier] = useState<'free' | 'premium'>('free');
  const [isTrial, setIsTrial] = useState(false);
  const [trialDaysRemaining, setTrialDaysRemaining] = useState(0);
  const [trialEndsAt, setTrialEndsAt] = useState<Date | null>(null);
  const [isBetaTester, setIsBetaTester] = useState(false);
  const [cancelAtPeriodEnd, setCancelAtPeriodEnd] = useState(false);
  const [currentPeriodEnd, setCurrentPeriodEnd] = useState<Date | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }
    
    setLoading(true);
    const userRef = doc(db, 'users', user.uid);
    const billingRef = doc(db, 'users', user.uid, 'private', 'billing');

    let unsubFamily: (() => void) | null = null;
    let unsubBilling: (() => void) | null = null;

    const evalTier = (
      userTierVal: string, 
      famTierVal: string, 
      betaVal: boolean, 
      tEndsVal: Date | null
    ) => {
      setIsBetaTester(betaVal);

      if (userTierVal === 'premium' || famTierVal === 'premium' || betaVal) {
        setSubscriptionTier('premium');
        setIsTrial(false);
        setTrialDaysRemaining(0);
        return;
      }

      if (tEndsVal && tEndsVal.getTime() > Date.now()) {
        const msLeft = tEndsVal.getTime() - Date.now();
        const daysLeft = Math.ceil(msLeft / (1000 * 60 * 60 * 24));
        setSubscriptionTier('premium');
        setIsTrial(true);
        setTrialDaysRemaining(daysLeft);
      } else {
        setSubscriptionTier('free');
        setIsTrial(false);
        setTrialDaysRemaining(0);
      }
    };

    let currentUserTier = 'free';
    let currentFamTier = 'free';
    let currentBeta = false;
    let currentTEnds: Date | null = null;

    unsubBilling = onSnapshot(billingRef, (bSnap) => {
      if (bSnap.exists()) {
        const bData = bSnap.data();
        if (bData.isBetaTester === true) currentBeta = true;

        if (bData.trialEndsAt) {
          const raw = bData.trialEndsAt;
          currentTEnds = typeof raw.toDate === 'function' ? raw.toDate() : new Date(raw);
          setTrialEndsAt(currentTEnds);
        }
      }
      evalTier(currentUserTier, currentFamTier, currentBeta, currentTEnds);
    }, () => {});

    const unsubUser = onSnapshot(userRef, (snap) => {
      if (snap.exists()) {
        const userData = snap.data();
        currentUserTier = userData.subscriptionTier || 'free';
        const fid = userData.tradeUserId;
        
        if (fid) {
          if (unsubFamily) unsubFamily();
          unsubFamily = onSnapshot(doc(db, 'trade_users', fid), (famSnap) => {
            if (famSnap.exists()) {
              const fData = famSnap.data();
              currentFamTier = fData.subscriptionTier || 'free';
              setCancelAtPeriodEnd(Boolean(fData.cancelAtPeriodEnd));
              if (fData.currentPeriodEnd) {
                const rawEnd = fData.currentPeriodEnd;
                setCurrentPeriodEnd(typeof rawEnd.toDate === 'function' ? rawEnd.toDate() : new Date(rawEnd));
              } else {
                setCurrentPeriodEnd(null);
              }
              if (fData.isBetaTester === true) currentBeta = true;
            }
            evalTier(currentUserTier, currentFamTier, currentBeta, currentTEnds);
            setLoading(false);
          }, (err) => {
            console.error('Error listening to family sub tier', err);
            evalTier(currentUserTier, currentFamTier, currentBeta, currentTEnds);
            setLoading(false);
          });
        } else {
          evalTier(currentUserTier, currentFamTier, currentBeta, currentTEnds);
          setLoading(false);
        }
      } else {
        setLoading(false);
      }
    }, (err) => {
      console.error('Error listening to user sub tier', err);
      setLoading(false);
    });

    return () => {
      unsubUser();
      if (unsubFamily) unsubFamily();
      if (unsubBilling) unsubBilling();
    };
  }, [user]);

  const trialHasEnded = Boolean(
    subscriptionTier === 'free' && 
    !isBetaTester && 
    trialEndsAt && 
    trialEndsAt.getTime() <= Date.now()
  );

  return { subscriptionTier, isTrial, trialDaysRemaining, trialEndsAt, trialHasEnded, isBetaTester, cancelAtPeriodEnd, currentPeriodEnd, loading };
}
