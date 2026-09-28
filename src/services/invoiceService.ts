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

  // If invoice is completed or paid, automatically record as Trade Income for HMRC MTD / Expenses
  if (status === 'completed' || status === 'paid') {
    try {
      const snap = await getDoc(invoiceDoc);
      if (snap.exists()) {
        const inv = snap.data() as Invoice;
        const transDocRef = doc(db, 'trade_users', tradeUserId, 'transactions', `inv_trans_${invoiceId}`);
        const grossAmount = Number(inv.grandTotal) || 0;
        const netAmount = Number(inv.netTotal) || grossAmount;
        const vatAmount = Number(inv.vatAmount) || 0;
        const vatRate = Number(inv.vatRate) || 20;

        await setDoc(transDocRef, {
          id: `inv_trans_${invoiceId}`,
          type: 'income',
          date: inv.dateIssued || new Date().toISOString().split('T')[0],
          vendor: inv.customerName || 'Trade Client',
          category: 'trade_income',
          categoryLabel: 'Turnover / Trade Sales & Work Completed',
          hmrcBox: 'Box 10: Turnover / Trade Income',
          description: `Invoice ${inv.invoiceNumber}: ${inv.jobTitle || 'Trade Works'}`,
          reference: inv.invoiceNumber,
          netAmount,
          vatRate: inv.isVatRegistered ? vatRate : 0,
          vatAmount: inv.isVatRegistered ? vatAmount : 0,
          grossAmount,
          paymentMethod: 'bank_transfer',
          source: 'manual',
          notes: `Automated income recording from completed Invoice ${inv.invoiceNumber}`,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        }, { merge: true });
      }
    } catch (transErr) {
      console.warn('Failed to auto-record invoice completion to expenses/income transactions:', transErr);
    }
  }
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

/**
 * Reverts an invoice back to a quote.
 * Deletes the invoice and clears the quote's invoiceId so it reappears in active quotes.
 */
export async function revertInvoiceToQuote(
  tradeUserId: string,
  invoice: Invoice
): Promise<void> {
  // 1. Delete the invoice
  await deleteInvoice(tradeUserId, invoice.id);

  // 2. Unlink the quote if referenced
  if (invoice.quoteId) {
    try {
      const quoteDoc = doc(db, 'trade_users', tradeUserId, 'quotes', invoice.quoteId);
      await updateDoc(quoteDoc, {
        invoiceId: '',
        status: 'accepted',
        updatedAt: new Date().toISOString()
      });
    } catch (err) {
      logger.warn('Failed to unlink quote from reverted invoice', err);
    }
  }
}

/**
 * Escapes values for CSV output
 */
function escapeCsv(val: any): string {
  if (val === undefined || val === null) return '""';
  const str = String(val).replace(/"/g, '""');
  return `"${str}"`;
}

/**
 * Generates an Invoice Summary CSV export compatible with Xero and UK accounting spreadsheets.
 */
export function generateInvoiceSummaryCsv(
  invoices: Invoice[],
  businessDetails?: any
): string {
  const lines: string[] = [];

  // Metadata headers
  lines.push('"TRIBE TRADE - INVOICE SUMMARY EXPORT (XERO / SPREADSHEET COMPATIBLE)"');
  lines.push(`"Business Name:",${escapeCsv(businessDetails?.businessName || 'Trade Business')}`);
  if (businessDetails?.vatNumber) {
    lines.push(`"VAT Registration:",${escapeCsv(businessDetails.vatNumber)}`);
  }
  lines.push(`"Export Generated At:",${escapeCsv(new Date().toLocaleString('en-GB'))}`);
  lines.push(`"Total Invoices:",${invoices.length}`);
  lines.push('');

  // Table Headers
  const headers = [
    'Invoice Number',
    'Customer Name',
    'Customer Email',
    'Customer Phone',
    'Customer Address',
    'Job Description',
    'Date Issued',
    'Due Date',
    'Status',
    'Labour Net (£)',
    'Materials Net (£)',
    'Net Subtotal (£)',
    'VAT Rate (%)',
    'VAT Amount (£)',
    'Grand Total (£)',
    'Quote Reference',
    'Payment Terms'
  ];
  lines.push(headers.map(escapeCsv).join(','));

  // Rows
  let totalNet = 0;
  let totalVat = 0;
  let totalGross = 0;

  invoices.forEach(inv => {
    totalNet += inv.netTotal || 0;
    totalVat += inv.vatAmount || 0;
    totalGross += inv.grandTotal || 0;

    const row = [
      inv.invoiceNumber || '',
      inv.customerName || '',
      inv.customerEmail || '',
      inv.customerPhone || '',
      inv.customerAddress || '',
      inv.jobTitle || '',
      inv.dateIssued || '',
      inv.dueDate || '',
      inv.status || 'draft',
      (inv.subtotalLabour || 0).toFixed(2),
      (inv.subtotalMaterials || 0).toFixed(2),
      (inv.netTotal || 0).toFixed(2),
      (inv.vatRate || 0).toString(),
      (inv.vatAmount || 0).toFixed(2),
      (inv.grandTotal || 0).toFixed(2),
      inv.quoteNumber || '',
      inv.paymentTerms || ''
    ];
    lines.push(row.map(escapeCsv).join(','));
  });

  lines.push('');
  lines.push([
    '"TOTALS"',
    '""',
    '""',
    '""',
    '""',
    '""',
    '""',
    '""',
    '""',
    '""',
    '""',
    `"${totalNet.toFixed(2)}"`,
    '""',
    `"${totalVat.toFixed(2)}"`,
    `"${totalGross.toFixed(2)}"`,
    '""',
    '""'
  ].join(','));

  return lines.join('\r\n');
}

