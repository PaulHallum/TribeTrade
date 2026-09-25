export type TransactionType = 'expense' | 'income';

export type PaymentMethod = 'card' | 'cash' | 'bank_transfer' | 'direct_debit' | 'account' | 'other';

export type ExpenseCategoryKey =
  | 'materials_goods'
  | 'subcontractors'
  | 'tools_equipment'
  | 'motor_travel'
  | 'wages_staff'
  | 'premises_rent'
  | 'repairs_maintenance'
  | 'office_admin'
  | 'advertising'
  | 'professional_fees'
  | 'insurance_bank'
  | 'other_expenses';

export type IncomeCategoryKey =
  | 'trade_income'
  | 'other_income';

export type TransactionCategoryKey = ExpenseCategoryKey | IncomeCategoryKey;

export interface CategoryDefinition {
  key: TransactionCategoryKey;
  label: string;
  type: TransactionType;
  hmrcBox: string; // e.g. "Box 11: Cost of goods"
  description: string;
}

export const TRANSACTION_CATEGORIES: CategoryDefinition[] = [
  // Expenses (mapped to HMRC SA103F / SA103S Self Assessment boxes)
  {
    key: 'materials_goods',
    label: 'Materials & Goods for Resale',
    type: 'expense',
    hmrcBox: 'Box 11: Cost of goods bought for resale or goods used',
    description: 'Timber, pipes, bricks, tiles, paint, fittings, and job materials.'
  },
  {
    key: 'subcontractors',
    label: 'Subcontractors & Specialist Labour',
    type: 'expense',
    hmrcBox: 'Box 11: Cost of goods and subcontractor labour',
    description: 'Payments to CIS subcontractors, plasterers, electricians, scaffolders.'
  },
  {
    key: 'tools_equipment',
    label: 'Tools & Equipment Hire',
    type: 'expense',
    hmrcBox: 'Box 14: Repairs & equipment maintenance / Plant',
    description: 'Power tools, hand tools, plant hire, skip hire, generator hire.'
  },
  {
    key: 'motor_travel',
    label: 'Van, Fuel & Motor Expenses',
    type: 'expense',
    hmrcBox: 'Box 12: Car, van and travel expenses',
    description: 'Diesel, petrol, van servicing, MOT, parking, congestion charge, tolls.'
  },
  {
    key: 'wages_staff',
    label: 'Staff Salaries & Wages',
    type: 'expense',
    hmrcBox: 'Box 13: Wages, salaries and other staff costs',
    description: 'Direct employee payroll, employer pension, employer NI.'
  },
  {
    key: 'premises_rent',
    label: 'Workshop, Yard & Storage Rent',
    type: 'expense',
    hmrcBox: 'Box 15: Rent, rates, power and insurance',
    description: 'Lockup rent, storage unit, workshop utilities and business rates.'
  },
  {
    key: 'repairs_maintenance',
    label: 'Property & Plant Maintenance',
    type: 'expense',
    hmrcBox: 'Box 14: Repairs and maintenance of property and equipment',
    description: 'Repairs to machinery, workshop upkeep, equipment servicing.'
  },
  {
    key: 'office_admin',
    label: 'Phone, Broadband & Stationery',
    type: 'expense',
    hmrcBox: 'Box 16: Phone, stationery and other office costs',
    description: 'Mobile phone bills, job software, office supplies, postage.'
  },
  {
    key: 'advertising',
    label: 'Advertising & Marketing',
    type: 'expense',
    hmrcBox: 'Box 17: Advertising and business entertainment costs',
    description: 'Van signwriting, Checkatrade/Trustatrader fees, flyers, website hosting.'
  },
  {
    key: 'professional_fees',
    label: 'Accountancy & Legal Fees',
    type: 'expense',
    hmrcBox: 'Box 19: Accountancy, legal and other professional fees',
    description: 'Bookkeeping, accountant fees, legal advice, professional body dues.'
  },
  {
    key: 'insurance_bank',
    label: 'Public Liability & Bank Charges',
    type: 'expense',
    hmrcBox: 'Box 18: Interest and alternative finance charges / Insurance',
    description: 'Public liability insurance, van insurance, business bank charges.'
  },
  {
    key: 'other_expenses',
    label: 'Other Allowable Expenses',
    type: 'expense',
    hmrcBox: 'Box 20: Other allowable business expenses',
    description: 'PPE, protective boots, high-vis workwear, cleaning supplies.'
  },

  // Income categories
  {
    key: 'trade_income',
    label: 'Trade Sales & Invoiced Work',
    type: 'income',
    hmrcBox: 'Box 9: Turnover / Sales and fee income',
    description: 'Customer payments, completed contract work, deposits, day work.'
  },
  {
    key: 'other_income',
    label: 'Other Business Income',
    type: 'income',
    hmrcBox: 'Box 10: Other business receipts',
    description: 'Scrap metal sales, sub-letting yard space, miscellaneous receipts.'
  }
];

export interface TransactionLineItem {
  id: string;
  description: string;
  quantity?: number;
  amount: number;
}

export interface Transaction {
  id: string;
  type: TransactionType;
  date: string; // YYYY-MM-DD
  vendor: string; // Merchant, supplier or customer name
  category: TransactionCategoryKey;
  categoryLabel: string;
  hmrcBox: string;
  description: string;
  reference?: string; // Receipt number, invoice number, or ref
  netAmount: number;
  vatRate: number; // e.g. 20, 5, 0
  vatAmount: number;
  grossAmount: number;
  paymentMethod: PaymentMethod;
  lineItems?: TransactionLineItem[];
  notes?: string;
  source: 'receipt_scan' | 'manual' | 'magic_mic';
  authorId: string;
  createdAt: string;
  updatedAt?: string;
}

export const DEFAULT_TRANSACTION: Omit<Transaction, 'id' | 'authorId' | 'createdAt'> = {
  type: 'expense',
  date: new Date().toISOString().split('T')[0],
  vendor: '',
  category: 'materials_goods',
  categoryLabel: 'Materials & Goods for Resale',
  hmrcBox: 'Box 11: Cost of goods bought for resale or goods used',
  description: '',
  reference: '',
  netAmount: 0,
  vatRate: 20,
  vatAmount: 0,
  grossAmount: 0,
  paymentMethod: 'card',
  lineItems: [],
  notes: '',
  source: 'manual'
};
