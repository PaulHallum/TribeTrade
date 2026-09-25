export type QuoteStatus = 'draft' | 'pending' | 'accepted' | 'declined';

export type QuoteItemType = 'labour' | 'material' | 'hire' | 'other';

export interface QuoteItem {
  id: string;
  description: string;
  type: QuoteItemType;
  quantity: number;
  unit?: string; // e.g. 'hours', 'days', 'units', 'litres', 'metres', 'pack'
  unitPrice: number;
  total: number;
}

export interface BusinessDetails {
  businessName: string;
  tradingName?: string;
  addressLine1?: string;
  addressLine2?: string;
  townCity?: string;
  postcode?: string;
  phone?: string;
  email?: string;
  website?: string;
  companyNumber?: string;
  isVatRegistered?: boolean;
  vatNumber?: string;
  defaultVatRate?: number; // e.g. 20 for UK VAT
  defaultHourlyRate?: number; // e.g. 45
  defaultDayRate?: number; // e.g. 320
  bankName?: string;
  accountName?: string;
  sortCode?: string;
  accountNumber?: string;
  defaultPaymentTerms?: string; // e.g. "Payment due within 14 days of completion"
  defaultQuoteTerms?: string; // e.g. "Quote valid for 30 days. Materials subject to supplier price changes."
  highestQuoteNumber?: number; // Monotonically increasing sequence tracker
  highestInvoiceNumber?: number; // Monotonically increasing sequence tracker
}

export interface Quote {
  id: string;
  quoteNumber: string; // e.g. "Q-1001"
  dateIssued: string; // YYYY-MM-DD
  validUntil: string; // YYYY-MM-DD
  status: QuoteStatus;
  
  // Client details
  customerName: string;
  customerPhone?: string;
  customerEmail?: string;
  customerAddress?: string;
  
  // Job Scope
  jobTitle: string;
  jobDescription?: string;
  
  // Line items
  items: QuoteItem[];
  
  // Totals & Financials
  subtotalLabour: number;
  subtotalMaterials: number;
  netTotal: number;
  isVatRegistered: boolean;
  vatRate: number;
  vatAmount: number;
  grandTotal: number;
  
  // Terms & Payment
  paymentTerms?: string;
  notes?: string;
  
  // Metadata & Conversion
  invoiceId?: string;
  calendarEventId?: string;
  authorId?: string;
  createdAt: string;
  updatedAt?: string;
}

export type InvoiceStatus = 'draft' | 'sent' | 'paid' | 'overdue';

export interface Invoice {
  id: string;
  invoiceNumber: string; // e.g. "INV-1001"
  quoteId?: string; // Optional reference to source quote
  quoteNumber?: string;
  dateIssued: string; // YYYY-MM-DD
  dueDate: string; // YYYY-MM-DD
  status: InvoiceStatus;
  
  // Client details
  customerName: string;
  customerPhone?: string;
  customerEmail?: string;
  customerAddress?: string;
  
  // Job Scope
  jobTitle: string;
  jobDescription?: string;
  
  // Line items
  items: QuoteItem[];
  
  // Totals & Financials
  subtotalLabour: number;
  subtotalMaterials: number;
  netTotal: number;
  isVatRegistered: boolean;
  vatRate: number;
  vatAmount: number;
  grandTotal: number;
  
  // Terms & Payment
  paymentTerms?: string;
  notes?: string;
  
  // Metadata
  authorId?: string;
  createdAt: string;
  updatedAt?: string;
}

export const DEFAULT_BUSINESS_DETAILS: BusinessDetails = {
  businessName: '',
  tradingName: '',
  addressLine1: '',
  addressLine2: '',
  townCity: '',
  postcode: '',
  phone: '',
  email: '',
  website: '',
  companyNumber: '',
  isVatRegistered: false,
  vatNumber: '',
  defaultVatRate: 20,
  defaultHourlyRate: 45,
  defaultDayRate: 320,
  bankName: '',
  accountName: '',
  sortCode: '',
  accountNumber: '',
  defaultPaymentTerms: 'Payment due within 14 days of job completion.',
  defaultQuoteTerms: 'This quotation is valid for 30 days from date of issue. Materials subject to availability.'
};
