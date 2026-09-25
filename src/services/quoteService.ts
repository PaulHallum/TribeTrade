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
  return onSnapshot(docRef, (snap) => {
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
        defaultQuoteTerms: data.defaultQuoteTerms || DEFAULT_BUSINESS_DETAILS.defaultQuoteTerms
      });
    } else {
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

  const cleanData: any = {
    ...quote,
    id,
    updatedAt: new Date().toISOString()
  };

  if (!quote.createdAt) {
    cleanData.createdAt = new Date().toISOString();
  }

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
  await updateDoc(quoteDoc, {
    status,
    updatedAt: new Date().toISOString()
  });
}
