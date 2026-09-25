import { getGenerativeModel } from 'firebase/ai';
import { googleAI, FLASH_3_1_LITE, withSilentRetry } from './ai/aiUtils';
import { logger } from './logger';
import { db } from '../lib/firebase';
import {
  collection,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  query,
  orderBy
} from 'firebase/firestore';
import {
  Transaction,
  TRANSACTION_CATEGORIES,
  TransactionCategoryKey,
  PaymentMethod
} from '../types/transaction';

export interface ExtractedReceiptData {
  vendor: string;
  date: string;
  category: TransactionCategoryKey;
  description: string;
  reference: string;
  netAmount: number;
  vatRate: number;
  vatAmount: number;
  grossAmount: number;
  paymentMethod: PaymentMethod;
  lineItems?: Array<{ description: string; quantity?: number; amount: number }>;
  notes?: string;
}

/**
 * Ephemerally extracts transaction details from a receipt or invoice photo.
 * PRIVACY GUARANTEE: The raw image Base64 data is processed only in volatile memory
 * during the API call and is never saved to Firestore, Firebase Storage, or disk.
 */
export async function extractReceiptData(input: {
  imageBase64: string;
  mimeType?: string;
}): Promise<ExtractedReceiptData> {
  const parts: any[] = [];

  parts.push({
    inlineData: {
      data: input.imageBase64,
      mimeType: input.mimeType || 'image/jpeg'
    }
  });

  const categoryKeys = TRANSACTION_CATEGORIES.map(c => `"${c.key}" (${c.label})`).join(', ');

  const systemInstruction = `You are a specialist UK Trade Bookkeeping and OCR AI assistant for Tribe Trade.
Your job is to accurately extract financial information from UK trade receipts, merchant till slips, petrol receipts, supplier invoices, and delivery notes.

Strict Rules:
1. CURRENCY: All amounts are British Pounds (£ GBP). Format amounts as decimal numbers (e.g. 45.50), not strings.
2. DATES: Parse UK dates (DD/MM/YYYY or DD-MMM-YYYY) into strict ISO "YYYY-MM-DD" format. If no year is present, assume current year.
3. VENDOR / MERCHANT: Extract the official trading name (e.g. "Screwfix", "Travis Perkins", "Toolstation", "B&Q", "Shell", "City Plumbing", "CEF").
4. VAT & NET / GROSS:
   - Identify the Gross (Total amount paid/due).
   - Identify the VAT Amount (£) and VAT Rate (typically 20% in the UK, occasionally 5% or 0% / Exempt).
   - Calculate or verify Net Amount = Gross Amount - VAT Amount.
   - If VAT is not explicitly itemised but the receipt is a standard UK trade merchant with a VAT number, standard UK VAT is 20%: Net = Gross / 1.20, VAT = Gross - Net.
5. CATEGORIES: Choose the most fitting key from:
   ${categoryKeys}
   - Building materials, timber, screws, paint, copper fittings -> "materials_goods"
   - Power tools, drill bits, tool hire, plant hire, skips -> "tools_equipment"
   - Diesel, petrol, van wash, parking, congestion zone -> "motor_travel"
   - Subcontractor invoices -> "subcontractors"
   - Stationery, printer ink, mobile phone -> "office_admin"
   - Workwear, PPE, boots, hi-vis -> "other_expenses"
6. PAYMENT METHOD: Infer from receipt (e.g. "Visa", "Mastercard", "Contactless" -> "card"; "Cash" -> "cash"; "Account" / "Invoice" -> "account").
7. REFERENCE: Extract till receipt number, invoice number, or order reference if legible.
8. DESCRIPTION: Concisely summarise the primary items purchased (e.g. "15mm copper pipe, solder fittings & gas canister").

Return valid JSON with this exact structure:
{
  "vendor": "Merchant Name",
  "date": "YYYY-MM-DD",
  "category": "materials_goods",
  "description": "Short summary of goods",
  "reference": "Receipt/Inv #",
  "netAmount": 0.00,
  "vatRate": 20,
  "vatAmount": 0.00,
  "grossAmount": 0.00,
  "paymentMethod": "card",
  "lineItems": [
    { "description": "Item description", "quantity": 1, "amount": 0.00 }
  ],
  "notes": "Any other helpful details"
}`;

  return withSilentRetry(async () => {
    try {
      const model = getGenerativeModel(googleAI, {
        model: FLASH_3_1_LITE,
        systemInstruction,
        generationConfig: {
          responseMimeType: 'application/json',
          thinkingConfig: { thinkingBudget: 1024 }
        }
      });

      const result = await model.generateContent({ contents: [{ role: 'user', parts }] });
      const rawText = result.response.text();
      const parsed = JSON.parse(rawText || '{}');

      // Validate category
      const matchedCategory = TRANSACTION_CATEGORIES.find(c => c.key === parsed.category);
      const safeCategory: TransactionCategoryKey = matchedCategory ? matchedCategory.key : 'materials_goods';

      // Fallback calculations if AI missed any numeric relationships
      const gross = typeof parsed.grossAmount === 'number' ? parsed.grossAmount : 0;
      const vatRate = typeof parsed.vatRate === 'number' ? parsed.vatRate : 20;
      let vat = typeof parsed.vatAmount === 'number' ? parsed.vatAmount : 0;
      let net = typeof parsed.netAmount === 'number' ? parsed.netAmount : 0;

      if (gross > 0 && net === 0 && vat === 0) {
        if (vatRate > 0) {
          net = Math.round((gross / (1 + vatRate / 100)) * 100) / 100;
          vat = Math.round((gross - net) * 100) / 100;
        } else {
          net = gross;
          vat = 0;
        }
      } else if (gross > 0 && net > 0 && vat === 0) {
        vat = Math.round((gross - net) * 100) / 100;
      }

      return {
        vendor: parsed.vendor || 'Unknown Supplier',
        date: parsed.date || new Date().toISOString().split('T')[0],
        category: safeCategory,
        description: parsed.description || '',
        reference: parsed.reference || '',
        netAmount: net,
        vatRate: vatRate,
        vatAmount: vat,
        grossAmount: gross,
        paymentMethod: (parsed.paymentMethod as PaymentMethod) || 'card',
        lineItems: Array.isArray(parsed.lineItems) ? parsed.lineItems : [],
        notes: parsed.notes || ''
      };
    } finally {
      // Memory Purge: aggressively dereference parts and raw payload
      parts.length = 0;
    }
  });
}

// ─── FIRESTORE CRUD OPERATIONS ──────────────────────────────────────────

/**
 * Subscribe to all transactions for the trade user, ordered by date descending.
 */
export function subscribeTransactions(
  tradeUserId: string,
  onUpdate: (transactions: Transaction[]) => void
) {
  const transRef = collection(db, 'trade_users', tradeUserId, 'transactions');
  const q = query(transRef, orderBy('date', 'desc'));

  return onSnapshot(
    q,
    (snap) => {
      const list: Transaction[] = [];
      snap.forEach((docSnap) => {
        const data = docSnap.data();
        const matchedCategory = TRANSACTION_CATEGORIES.find(c => c.key === data.category);
        list.push({
          id: docSnap.id,
          type: data.type || 'expense',
          date: data.date || new Date().toISOString().split('T')[0],
          vendor: data.vendor || '',
          category: (data.category as TransactionCategoryKey) || 'materials_goods',
          categoryLabel: matchedCategory ? matchedCategory.label : 'Materials & Goods for Resale',
          hmrcBox: matchedCategory ? matchedCategory.hmrcBox : 'Box 11: Cost of goods',
          description: data.description || '',
          reference: data.reference || '',
          netAmount: Number(data.netAmount) || 0,
          vatRate: Number(data.vatRate) || 0,
          vatAmount: Number(data.vatAmount) || 0,
          grossAmount: Number(data.grossAmount) || 0,
          paymentMethod: (data.paymentMethod as PaymentMethod) || 'card',
          lineItems: data.lineItems || [],
          notes: data.notes || '',
          source: data.source || 'manual',
          authorId: data.authorId || '',
          createdAt: data.createdAt || new Date().toISOString(),
          updatedAt: data.updatedAt
        });
      });
      onUpdate(list);
    },
    (err) => {
      logger.error('Failed to subscribe to transactions', err);
      onUpdate([]);
    }
  );
}

/**
 * Save (create or update) a transaction document in Firestore.
 */
export async function saveTransaction(
  tradeUserId: string,
  transaction: Partial<Transaction> & { authorId: string }
): Promise<string> {
  const transRef = collection(db, 'trade_users', tradeUserId, 'transactions');
  const matchedCategory = TRANSACTION_CATEGORIES.find(c => c.key === transaction.category);

  const payload: any = {
    type: transaction.type || 'expense',
    date: transaction.date || new Date().toISOString().split('T')[0],
    vendor: transaction.vendor || '',
    category: transaction.category || 'materials_goods',
    categoryLabel: matchedCategory ? matchedCategory.label : 'Materials & Goods for Resale',
    hmrcBox: matchedCategory ? matchedCategory.hmrcBox : 'Box 11: Cost of goods',
    description: transaction.description || '',
    reference: transaction.reference || '',
    netAmount: Number(transaction.netAmount) || 0,
    vatRate: Number(transaction.vatRate) || 0,
    vatAmount: Number(transaction.vatAmount) || 0,
    grossAmount: Number(transaction.grossAmount) || 0,
    paymentMethod: transaction.paymentMethod || 'card',
    lineItems: transaction.lineItems || [],
    notes: transaction.notes || '',
    source: transaction.source || 'manual',
    authorId: transaction.authorId,
    updatedAt: new Date().toISOString()
  };

  if (transaction.id) {
    const docRef = doc(db, 'trade_users', tradeUserId, 'transactions', transaction.id);
    await updateDoc(docRef, payload);
    return transaction.id;
  } else {
    payload.createdAt = new Date().toISOString();
    const newDoc = await addDoc(transRef, payload);
    return newDoc.id;
  }
}

/**
 * Delete a transaction document from Firestore.
 */
export async function deleteTransaction(
  tradeUserId: string,
  transactionId: string
): Promise<void> {
  const docRef = doc(db, 'trade_users', tradeUserId, 'transactions', transactionId);
  await deleteDoc(docRef);
}
