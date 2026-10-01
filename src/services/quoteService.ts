import { db } from '../lib/firebase';
import { 
  collection, 
  doc, 
  onSnapshot, 
  setDoc, 
  deleteDoc, 
  updateDoc, 
  getDoc,
  query, 
  orderBy,
  serverTimestamp 
} from 'firebase/firestore';
import { Quote, BusinessDetails, DEFAULT_BUSINESS_DETAILS } from '../types/quote';
import { logger } from './logger';
import { removeAllocationsForTarget } from './shedService';

/**
 * Subscribes to quotes for a given trade account.
 */
export function subscribeQuotes(
  tradeUserId: string, 
  callback: (quotes: Quote[]) => void
): () => void {
  const quotesRef = collection(db, 'trade_users', tradeUserId, 'quotes');
  const q = query(quotesRef, orderBy('createdAt', 'desc'));

  return onSnapshot(q, (snapshot) => {
    const list: Quote[] = snapshot.docs.map(docSnap => ({
      id: docSnap.id,
      ...docSnap.data()
    } as Quote));
    callback(list);
    cleanupExpiredDeclinedQuotes(tradeUserId, list).catch(() => {});
  }, (err) => {
    logger.warn('Failed to subscribe to quotes', err);
    callback([]);
  });
}

/**
 * Subscribes to the Business Profile details.
 */
export function subscribeBusinessDetails(
  tradeUserId: string,
  callback: (details: BusinessDetails) => void
): () => void {
  const docRef = doc(db, 'trade_users', tradeUserId);
  return onSnapshot(docRef, async (snap) => {
    if (snap.exists()) {
      const data = snap.data();
      callback({
        ...DEFAULT_BUSINESS_DETAILS,
        businessName: data.businessName || data.familyName || '',
        tradingName: data.tradingName || '',
        addressLine1: data.addressLine1 || '',
        addressLine2: data.addressLine2 || '',
        townCity: data.townCity || '',
        postcode: data.postcode || '',
        phone: data.phone || '',
        email: data.email || '',
        website: data.website || '',
        companyNumber: data.companyNumber || '',
        isVatRegistered: data.isVatRegistered || false,
        vatNumber: data.vatNumber || '',
        defaultVatRate: data.defaultVatRate ?? 20,
        defaultHourlyRate: data.defaultHourlyRate ?? 45,
        defaultDayRate: data.defaultDayRate ?? 320,
        bankName: data.bankName || '',
        accountName: data.accountName || '',
        sortCode: data.sortCode || '',
        accountNumber: data.accountNumber || '',
        defaultPaymentTerms: data.defaultPaymentTerms || DEFAULT_BUSINESS_DETAILS.defaultPaymentTerms,
        defaultQuoteTerms: data.defaultQuoteTerms || DEFAULT_BUSINESS_DETAILS.defaultQuoteTerms,
        vehicles: data.vehicles || []
      });
    } else {
      if (tradeUserId.startsWith('trade_')) {
        const legacyId = tradeUserId.replace('trade_', 'family_');
        try {
          const legacySnap = await getDoc(doc(db, 'trade_users', legacyId));
          if (legacySnap.exists()) {
            const data = legacySnap.data();
            callback({
              ...DEFAULT_BUSINESS_DETAILS,
              businessName: data.businessName || data.familyName || '',
              tradingName: data.tradingName || '',
              addressLine1: data.addressLine1 || '',
              addressLine2: data.addressLine2 || '',
              townCity: data.townCity || '',
              postcode: data.postcode || '',
              phone: data.phone || '',
              email: data.email || '',
              website: data.website || '',
              companyNumber: data.companyNumber || '',
              isVatRegistered: data.isVatRegistered || false,
              vatNumber: data.vatNumber || '',
              defaultVatRate: data.defaultVatRate ?? 20,
              defaultHourlyRate: data.defaultHourlyRate ?? 45,
              defaultDayRate: data.defaultDayRate ?? 320,
              bankName: data.bankName || '',
              accountName: data.accountName || '',
              sortCode: data.sortCode || '',
              accountNumber: data.accountNumber || '',
              defaultPaymentTerms: data.defaultPaymentTerms || DEFAULT_BUSINESS_DETAILS.defaultPaymentTerms,
              defaultQuoteTerms: data.defaultQuoteTerms || DEFAULT_BUSINESS_DETAILS.defaultQuoteTerms,
              vehicles: data.vehicles || []
            });
            return;
          }
        } catch (e) {
          // ignore
        }
      }
      callback(DEFAULT_BUSINESS_DETAILS);
    }
  }, (err) => {
    logger.warn('Failed to subscribe to business details', err);
    callback(DEFAULT_BUSINESS_DETAILS);
  });
}

/**
 * Saves business details to the trade account document.
 */
export async function saveBusinessDetails(
  tradeUserId: string,
  details: Partial<BusinessDetails>
): Promise<void> {
  const docRef = doc(db, 'trade_users', tradeUserId);
  await setDoc(docRef, {
    ...details,
    updatedAt: serverTimestamp()
  }, { merge: true });
}

/**
 * Generates the next sequential quote reference (e.g. "Q-1001").
 * Preserves historical sequence even if previous quotes have been deleted.
 */
export function generateNextQuoteNumber(existingQuotes: Quote[], highestSavedNumber?: number): string {
  const numbers = (existingQuotes || [])
    .map(q => {
      const match = q.quoteNumber?.match(/(\d+)/);
      return match ? parseInt(match[1], 10) : 0;
    })
    .filter(n => !isNaN(n) && n > 0);

  const baseline = Math.max(1000, highestSavedNumber || 0);
  const maxNum = numbers.length > 0 ? Math.max(baseline, ...numbers) : baseline;
  return `Q-${maxNum + 1}`;
}

/**
 * Saves or updates a quote in Firestore.
 */
export async function saveQuote(
  tradeUserId: string,
  quote: Partial<Quote> & { id?: string }
): Promise<string> {
  const quotesRef = collection(db, 'trade_users', tradeUserId, 'quotes');
  
  const id = quote.id || doc(quotesRef).id;
  const quoteDoc = doc(quotesRef, id);

  const rawData: any = {
    ...quote,
    id,
    updatedAt: new Date().toISOString()
  };

  if (!quote.createdAt) {
    rawData.createdAt = new Date().toISOString();
  }

  if (quote.status === 'declined' && !quote.declinedAt) {
    rawData.declinedAt = new Date().toISOString();
  }

  // Remove undefined fields and nested undefined keys from items
  const cleanData: any = JSON.parse(JSON.stringify(rawData, (key, value) => value === undefined ? null : value));

  await setDoc(quoteDoc, cleanData, { merge: true });

  // Update highestQuoteNumber counter so deleting quotes never resets the sequence
  const match = cleanData.quoteNumber?.match(/(\d+)/);
  if (match) {
    const num = parseInt(match[1], 10);
    if (!isNaN(num) && num >= 1000) {
      try {
        const tradeUserRef = doc(db, 'trade_users', tradeUserId);
        const snap = await getDoc(tradeUserRef);
        const currentHighest = snap.exists() ? (snap.data()?.highestQuoteNumber || 1000) : 1000;
        if (num > currentHighest) {
          await updateDoc(tradeUserRef, { highestQuoteNumber: num });
        }
      } catch (err) {
        console.warn('[quoteService] Failed to update highestQuoteNumber sequence:', err);
      }
    }
  }

  return id;
}

/**
 * Deletes a quote from Firestore.
 */
export async function deleteQuote(
  tradeUserId: string,
  quoteId: string
): Promise<void> {
  // Release any allocated stock back to The Shed and remove allocation records
  try {
    await removeAllocationsForTarget(tradeUserId, quoteId, true);
  } catch (err) {
    logger.warn('[quoteService] Failed to clean up shed allocations for quote:', err);
  }

  const quoteDoc = doc(db, 'trade_users', tradeUserId, 'quotes', quoteId);
  await deleteDoc(quoteDoc);
}

/**
 * Updates quote status (e.g. 'draft' | 'pending' | 'accepted' | 'declined').
 */
export async function updateQuoteStatus(
  tradeUserId: string,
  quoteId: string,
  status: Quote['status']
): Promise<void> {
  const quoteDoc = doc(db, 'trade_users', tradeUserId, 'quotes', quoteId);
  const now = new Date().toISOString();
  const updateData: Record<string, any> = {
    status,
    updatedAt: now
  };
  if (status === 'declined') {
    updateData.declinedAt = now;
  }
  await updateDoc(quoteDoc, updateData);
}

/**
 * Automatically purges quotes that have been declined for 30 or more days.
 */
export async function cleanupExpiredDeclinedQuotes(
  tradeUserId: string,
  quotes: Quote[]
): Promise<void> {
  if (!tradeUserId || !quotes || quotes.length === 0) return;

  const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
  const now = Date.now();

  const expiredQuotes = quotes.filter(q => {
    if (q.status !== 'declined') return false;
    const timestampStr = q.declinedAt || q.updatedAt || q.createdAt;
    if (!timestampStr) return false;
    const time = new Date(timestampStr).getTime();
    if (isNaN(time)) return false;
    return (now - time) >= THIRTY_DAYS_MS;
  });

  if (expiredQuotes.length === 0) return;

  for (const q of expiredQuotes) {
    try {
      await deleteQuote(tradeUserId, q.id);
      logger.info(`[quoteService] Automatically deleted declined quote ${q.quoteNumber} (${q.id}) after 30 days.`);
    } catch (err) {
      logger.warn(`[quoteService] Failed to auto-delete expired quote ${q.id}:`, err);
    }
  }
}
