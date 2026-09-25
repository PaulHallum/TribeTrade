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
import { Invoice, Quote } from '../types/quote';
import { logger } from './logger';
import { updateQuoteStatus } from './quoteService';

/**
 * Subscribes to invoices for a given trade account.
 */
export function subscribeInvoices(
  tradeUserId: string, 
  callback: (invoices: Invoice[]) => void
): () => void {
  const invoicesRef = collection(db, 'trade_users', tradeUserId, 'invoices');
  const q = query(invoicesRef, orderBy('createdAt', 'desc'));

  return onSnapshot(q, (snapshot) => {
    const list: Invoice[] = snapshot.docs.map(docSnap => ({
      id: docSnap.id,
      ...docSnap.data()
    } as Invoice));
    callback(list);
  }, (err) => {
    logger.warn('Failed to subscribe to invoices', err);
    callback([]);
  });
}

/**
 * Generates the next sequential invoice reference (e.g. "INV-1001").
 * Preserves historical sequence even if previous invoices have been deleted.
 */
export function generateNextInvoiceNumber(existingInvoices: Invoice[], highestSavedNumber?: number): string {
  const numbers = (existingInvoices || [])
    .map(inv => {
      const match = inv.invoiceNumber?.match(/(\d+)/);
      return match ? parseInt(match[1], 10) : 0;
    })
    .filter(n => !isNaN(n) && n > 0);

  const baseline = Math.max(1000, highestSavedNumber || 0);
  const maxNum = numbers.length > 0 ? Math.max(baseline, ...numbers) : baseline;
  return `INV-${maxNum + 1}`;
}

/**
 * Saves or updates an invoice in Firestore.
 */
export async function saveInvoice(
  tradeUserId: string,
  invoice: Partial<Invoice> & { id?: string }
): Promise<string> {
  const invoicesRef = collection(db, 'trade_users', tradeUserId, 'invoices');
  
  const id = invoice.id || doc(invoicesRef).id;
  const invoiceDoc = doc(invoicesRef, id);

  const cleanData: any = {
    ...invoice,
    id,
    updatedAt: new Date().toISOString()
  };

  if (!invoice.createdAt) {
    cleanData.createdAt = new Date().toISOString();
  }

  await setDoc(invoiceDoc, cleanData, { merge: true });

  // Update highestInvoiceNumber counter so deleting invoices never resets sequence
  const match = cleanData.invoiceNumber?.match(/(\d+)/);
  if (match) {
    const num = parseInt(match[1], 10);
    if (!isNaN(num) && num >= 1000) {
      try {
        const tradeUserRef = doc(db, 'trade_users', tradeUserId);
        const snap = await getDoc(tradeUserRef);
        const currentHighest = snap.exists() ? (snap.data()?.highestInvoiceNumber || 1000) : 1000;
        if (num > currentHighest) {
          await updateDoc(tradeUserRef, { highestInvoiceNumber: num });
        }
      } catch (err) {
        console.warn('[invoiceService] Failed to update highestInvoiceNumber sequence:', err);
      }
    }
  }

  return id;
}

/**
 * Deletes an invoice from Firestore.
 */
export async function deleteInvoice(
  tradeUserId: string,
  invoiceId: string
): Promise<void> {
  const invoiceDoc = doc(db, 'trade_users', tradeUserId, 'invoices', invoiceId);
  await deleteDoc(invoiceDoc);
}

/**
 * Updates invoice status (e.g. 'draft' | 'sent' | 'paid' | 'overdue').
 */
export async function updateInvoiceStatus(
  tradeUserId: string,
  invoiceId: string,
  status: Invoice['status']
): Promise<void> {
  const invoiceDoc = doc(db, 'trade_users', tradeUserId, 'invoices', invoiceId);
  await updateDoc(invoiceDoc, {
    status,
    updatedAt: new Date().toISOString()
  });
}

/**
 * Converts a Quote into an Invoice with next invoice number,
 * linking both records together in Firestore.
 */
export async function convertQuoteToInvoice(
  tradeUserId: string,
  quote: Quote,
  existingInvoices: Invoice[],
  highestSavedNumber?: number
): Promise<Invoice> {
  const invoiceNumber = generateNextInvoiceNumber(existingInvoices, highestSavedNumber);
  
  // Calculate due date (default +14 days from today)
  const today = new Date();
  const dueDate = new Date();
  dueDate.setDate(today.getDate() + 14);

  const newInvoiceData: Partial<Invoice> = {
    invoiceNumber,
    quoteId: quote.id,
    quoteNumber: quote.quoteNumber,
    dateIssued: today.toISOString().split('T')[0],
    dueDate: dueDate.toISOString().split('T')[0],
    status: 'draft',
    customerName: quote.customerName,
    customerPhone: quote.customerPhone || '',
    customerEmail: quote.customerEmail || '',
    customerAddress: quote.customerAddress || '',
    jobTitle: quote.jobTitle,
    jobDescription: quote.jobDescription || '',
    items: quote.items || [],
    subtotalLabour: quote.subtotalLabour || 0,
    subtotalMaterials: quote.subtotalMaterials || 0,
    netTotal: quote.netTotal || 0,
    isVatRegistered: quote.isVatRegistered || false,
    vatRate: quote.vatRate || 20,
    vatAmount: quote.vatAmount || 0,
    grandTotal: quote.grandTotal || 0,
    paymentTerms: quote.paymentTerms || 'Payment due within 14 days of invoice date.',
    notes: quote.notes || ''
  };

  const invoiceId = await saveInvoice(tradeUserId, newInvoiceData);

  // Link back to the quote
  try {
    const quoteDoc = doc(db, 'trade_users', tradeUserId, 'quotes', quote.id);
    await updateDoc(quoteDoc, {
      invoiceId,
      updatedAt: new Date().toISOString()
    });
  } catch (err) {
    logger.warn('Failed to link invoiceId to quote doc', err);
  }

  return {
    ...newInvoiceData,
    id: invoiceId,
    createdAt: today.toISOString()
  } as Invoice;
}
