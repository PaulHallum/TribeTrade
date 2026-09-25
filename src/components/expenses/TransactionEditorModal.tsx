import { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { 
  X, 
  Save, 
  Sparkles, 
  AlertTriangle, 
  ShieldAlert, 
  Building2, 
  Calendar, 
  Hash, 
  CreditCard,
  FileText
} from 'lucide-react';
import {
  Transaction,
  TRANSACTION_CATEGORIES,
  TransactionType,
  TransactionCategoryKey,
  PaymentMethod,
  DEFAULT_TRANSACTION
} from '../../types/transaction';
import { ExtractedReceiptData } from '../../services/receiptService';

interface TransactionEditorModalProps {
  isOpen: boolean;
  initialTransaction?: Transaction | null;
  initialExtracted?: ExtractedReceiptData | null;
  onClose: () => void;
  onSave: (transaction: Partial<Transaction>) => Promise<void>;
}

export default function TransactionEditorModal({
  isOpen,
  initialTransaction,
  initialExtracted,
  onClose,
  onSave
}: TransactionEditorModalProps) {
  const [formData, setFormData] = useState<Omit<Transaction, 'id' | 'authorId' | 'createdAt'>>({
    ...DEFAULT_TRANSACTION
  });
  const [isAiExtracted, setIsAiExtracted] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!isOpen) return;

    if (initialTransaction) {
      setFormData({
        type: initialTransaction.type,
        date: initialTransaction.date,
        vendor: initialTransaction.vendor,
        category: initialTransaction.category,
        categoryLabel: initialTransaction.categoryLabel,
        hmrcBox: initialTransaction.hmrcBox,
        description: initialTransaction.description,
        reference: initialTransaction.reference || '',
        netAmount: initialTransaction.netAmount,
        vatRate: initialTransaction.vatRate,
        vatAmount: initialTransaction.vatAmount,
        grossAmount: initialTransaction.grossAmount,
        paymentMethod: initialTransaction.paymentMethod,
        lineItems: initialTransaction.lineItems || [],
        notes: initialTransaction.notes || '',
        source: initialTransaction.source
      });
      setIsAiExtracted(initialTransaction.source === 'receipt_scan');
    } else if (initialExtracted) {
      const matchedCat = TRANSACTION_CATEGORIES.find(c => c.key === initialExtracted.category);
      setFormData({
        type: 'expense',
        date: initialExtracted.date || new Date().toISOString().split('T')[0],
        vendor: initialExtracted.vendor || '',
        category: initialExtracted.category || 'materials_goods',
        categoryLabel: matchedCat ? matchedCat.label : 'Materials & Goods for Resale',
        hmrcBox: matchedCat ? matchedCat.hmrcBox : 'Box 11: Cost of goods',
        description: initialExtracted.description || '',
        reference: initialExtracted.reference || '',
        netAmount: initialExtracted.netAmount || 0,
        vatRate: initialExtracted.vatRate ?? 20,
        vatAmount: initialExtracted.vatAmount || 0,
        grossAmount: initialExtracted.grossAmount || 0,
        paymentMethod: initialExtracted.paymentMethod || 'card',
        lineItems: initialExtracted.lineItems || [],
        notes: initialExtracted.notes || '',
        source: 'receipt_scan'
      });
      setIsAiExtracted(true);
    } else {
      setFormData({ ...DEFAULT_TRANSACTION });
      setIsAiExtracted(false);
    }
    setErrors({});
  }, [isOpen, initialTransaction, initialExtracted]);

  // Recalculate net & vat when gross or vatRate changes
  const handleGrossChange = (grossVal: number, vatRateVal: number) => {
    if (vatRateVal > 0) {
      const net = Math.round((grossVal / (1 + vatRateVal / 100)) * 100) / 100;
      const vat = Math.round((grossVal - net) * 100) / 100;
      setFormData(prev => ({
        ...prev,
        grossAmount: grossVal,
        vatRate: vatRateVal,
        netAmount: net,
        vatAmount: vat
      }));
    } else {
      setFormData(prev => ({
        ...prev,
        grossAmount: grossVal,
        vatRate: 0,
        netAmount: grossVal,
        vatAmount: 0
      }));
    }
  };

  const handleCategoryChange = (key: TransactionCategoryKey) => {
    const matched = TRANSACTION_CATEGORIES.find(c => c.key === key);
    if (matched) {
      setFormData(prev => ({
        ...prev,
        category: key,
        categoryLabel: matched.label,
        hmrcBox: matched.hmrcBox,
        type: matched.type
      }));
    }
  };

  const validate = (): boolean => {
    const errs: Record<string, string> = {};
    if (!formData.vendor.trim()) errs.vendor = 'Please specify supplier or customer name';
    if (!formData.date) errs.date = 'Date is required';
    if (formData.grossAmount <= 0) errs.grossAmount = 'Amount must be greater than £0.00';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    setIsSaving(true);
    try {
      await onSave({
        ...formData,
        id: initialTransaction?.id
      });
      onClose();
    } finally {
      setIsSaving(false);
    }
  };

  if (!isOpen) return null;

  const filteredCategories = TRANSACTION_CATEGORIES.filter(c => c.type === formData.type);

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-3 sm:p-4">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="absolute inset-0 bg-zinc-950/70 backdrop-blur-sm"
      />

      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 15 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 15 }}
        className="relative w-full max-w-xl bg-white dark:bg-zinc-900 rounded-[28px] overflow-hidden shadow-2xl border border-zinc-200 dark:border-zinc-800 max-h-[90vh] flex flex-col"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 sm:p-5 border-b border-zinc-100 dark:border-zinc-800">
          <div className="flex items-center gap-2.5">
            <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${
              formData.type === 'expense'
                ? 'bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400'
                : 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400'
            }`}>
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-zinc-900 dark:text-white">
                {initialTransaction ? 'Edit Transaction' : isAiExtracted ? 'Review Scanned Receipt' : 'Record Transaction'}
              </h3>
              <p className="text-xs text-zinc-500">HMRC Making Tax Digital record</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-full transition-colors text-zinc-400"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="overflow-y-auto p-4 sm:p-6 space-y-4 flex-1">
          {/* AI Extraction Banner */}
          {isAiExtracted && (
            <div className="p-3.5 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/40 rounded-2xl flex items-start gap-2.5">
              <Sparkles className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
              <div className="text-xs text-amber-800 dark:text-amber-300 space-y-0.5">
                <p className="font-bold">AI Scanned Entry — Verification Required</p>
                <p className="text-[11px] leading-relaxed">
                  Please check extracted amounts and supplier details against your paper receipt. Tribe Trade accepts no liability for AI extraction errors.
                </p>
              </div>
            </div>
          )}

          {/* Type Toggle: Expense vs Income */}
          <div className="flex p-1 bg-zinc-100 dark:bg-zinc-800 rounded-xl">
            <button
              type="button"
              onClick={() => {
                setFormData(prev => ({
                  ...prev,
                  type: 'expense',
                  category: 'materials_goods',
                  categoryLabel: 'Materials & Goods for Resale',
                  hmrcBox: 'Box 11: Cost of goods bought for resale or goods used'
                }));
              }}
              className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all ${
                formData.type === 'expense'
                  ? 'bg-white dark:bg-zinc-900 text-rose-600 dark:text-rose-400 shadow-sm'
                  : 'text-zinc-500 hover:text-zinc-900 dark:hover:text-white'
              }`}
            >
              Expense / Purchase
            </button>
            <button
              type="button"
              onClick={() => {
                setFormData(prev => ({
                  ...prev,
                  type: 'income',
                  category: 'trade_income',
                  categoryLabel: 'Trade Sales & Invoiced Work',
                  hmrcBox: 'Box 9: Turnover / Sales and fee income'
                }));
              }}
              className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all ${
                formData.type === 'income'
                  ? 'bg-white dark:bg-zinc-900 text-emerald-600 dark:text-emerald-400 shadow-sm'
                  : 'text-zinc-500 hover:text-zinc-900 dark:hover:text-white'
              }`}
            >
              Income / Sales
            </button>
          </div>

          {/* Supplier / Customer & Date Row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-zinc-500 mb-1">
                {formData.type === 'expense' ? 'Supplier / Merchant' : 'Customer / Payer'} *
              </label>
              <div className="relative">
                <Building2 className="w-4 h-4 text-zinc-400 absolute left-3 top-3 pointer-events-none" />
                <input
                  type="text"
                  value={formData.vendor}
                  onChange={e => setFormData({ ...formData, vendor: e.target.value })}
                  placeholder={formData.type === 'expense' ? 'e.g. Travis Perkins, Screwfix, Shell' : 'e.g. Mr J Smith (7 Oak Way)'}
                  className="w-full pl-9 pr-3 py-2 bg-zinc-50 dark:bg-zinc-800/80 border border-zinc-200 dark:border-zinc-700 rounded-xl text-sm font-medium text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                />
              </div>
              {errors.vendor && <p className="text-rose-500 text-[11px] mt-1">{errors.vendor}</p>}
            </div>

            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-zinc-500 mb-1">
                Date *
              </label>
              <div className="relative">
                <Calendar className="w-4 h-4 text-zinc-400 absolute left-3 top-3 pointer-events-none" />
                <input
                  type="date"
                  value={formData.date}
                  onChange={e => setFormData({ ...formData, date: e.target.value })}
                  className="w-full pl-9 pr-3 py-2 bg-zinc-50 dark:bg-zinc-800/80 border border-zinc-200 dark:border-zinc-700 rounded-xl text-sm font-medium text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                />
              </div>
              {errors.date && <p className="text-rose-500 text-[11px] mt-1">{errors.date}</p>}
            </div>
          </div>

          {/* Category Dropdown (HMRC SA103) */}
          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-zinc-500 mb-1">
              HMRC Tax Category *
            </label>
            <select
              value={formData.category}
              onChange={e => handleCategoryChange(e.target.value as TransactionCategoryKey)}
              className="w-full px-3 py-2 bg-zinc-50 dark:bg-zinc-800/80 border border-zinc-200 dark:border-zinc-700 rounded-xl text-sm font-medium text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
            >
              {filteredCategories.map(cat => (
                <option key={cat.key} value={cat.key}>
                  {cat.label} ({cat.hmrcBox.split(':')[0]})
                </option>
              ))}
            </select>
            <p className="text-[11px] text-zinc-400 mt-1 italic">
              {formData.hmrcBox}
            </p>
          </div>

          {/* Financial Breakdown (Gross, VAT Rate, VAT Amount, Net) */}
          <div className="p-4 bg-zinc-50 dark:bg-zinc-800/50 rounded-2xl border border-zinc-100 dark:border-zinc-800 space-y-3">
            <span className="text-[10px] font-black uppercase tracking-wider text-zinc-400">
              Amounts & VAT Breakdown (£)
            </span>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              {/* Gross Total */}
              <div className="col-span-2 sm:col-span-2">
                <label className="block text-[10px] font-bold uppercase text-zinc-500 mb-1">
                  Gross Total (Paid) *
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-2.5 text-zinc-400 font-bold text-sm">£</span>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={formData.grossAmount || ''}
                    onChange={e => handleGrossChange(parseFloat(e.target.value) || 0, formData.vatRate)}
                    placeholder="0.00"
                    className="w-full pl-7 pr-3 py-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-xl text-sm font-bold text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                  />
                </div>
                {errors.grossAmount && <p className="text-rose-500 text-[11px] mt-1">{errors.grossAmount}</p>}
              </div>

              {/* VAT Rate */}
              <div>
                <label className="block text-[10px] font-bold uppercase text-zinc-500 mb-1">
                  VAT Rate
                </label>
                <select
                  value={formData.vatRate}
                  onChange={e => handleGrossChange(formData.grossAmount, parseFloat(e.target.value) || 0)}
                  className="w-full px-2.5 py-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-xl text-xs font-semibold text-zinc-900 dark:text-white focus:outline-none"
                >
                  <option value={20}>20% (Standard)</option>
                  <option value={5}>5% (Reduced)</option>
                  <option value={0}>0% (Zero/Exempt)</option>
                </select>
              </div>

              {/* VAT Amount */}
              <div>
                <label className="block text-[10px] font-bold uppercase text-zinc-500 mb-1">
                  VAT Amount
                </label>
                <div className="relative">
                  <span className="absolute left-2.5 top-2.5 text-zinc-400 font-bold text-xs">£</span>
                  <input
                    type="number"
                    step="0.01"
                    value={formData.vatAmount || ''}
                    onChange={e => {
                      const vat = parseFloat(e.target.value) || 0;
                      setFormData(prev => ({
                        ...prev,
                        vatAmount: vat,
                        netAmount: Math.max(0, Math.round((prev.grossAmount - vat) * 100) / 100)
                      }));
                    }}
                    className="w-full pl-6 pr-2 py-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-xl text-xs font-semibold text-zinc-900 dark:text-white focus:outline-none"
                  />
                </div>
              </div>
            </div>

            {/* Calculated Net Line */}
            <div className="flex items-center justify-between pt-1 border-t border-zinc-200/60 dark:border-zinc-700/60 text-xs">
              <span className="text-zinc-500">Net Amount (Excl. VAT):</span>
              <span className="font-bold text-zinc-900 dark:text-white">
                £{formData.netAmount.toFixed(2)}
              </span>
            </div>
          </div>

          {/* Description & Reference Row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-zinc-500 mb-1">
                Receipt / Invoice Ref
              </label>
              <div className="relative">
                <Hash className="w-4 h-4 text-zinc-400 absolute left-3 top-3 pointer-events-none" />
                <input
                  type="text"
                  value={formData.reference}
                  onChange={e => setFormData({ ...formData, reference: e.target.value })}
                  placeholder="e.g. REC-98214 or INV-1002"
                  className="w-full pl-9 pr-3 py-2 bg-zinc-50 dark:bg-zinc-800/80 border border-zinc-200 dark:border-zinc-700 rounded-xl text-sm font-medium text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                />
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-zinc-500 mb-1">
                Payment Method
              </label>
              <div className="relative">
                <CreditCard className="w-4 h-4 text-zinc-400 absolute left-3 top-3 pointer-events-none" />
                <select
                  value={formData.paymentMethod}
                  onChange={e => setFormData({ ...formData, paymentMethod: e.target.value as PaymentMethod })}
                  className="w-full pl-9 pr-3 py-2 bg-zinc-50 dark:bg-zinc-800/80 border border-zinc-200 dark:border-zinc-700 rounded-xl text-sm font-medium text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                >
                  <option value="card">Debit / Credit Card</option>
                  <option value="bank_transfer">Bank Transfer / BACS</option>
                  <option value="cash">Cash</option>
                  <option value="direct_debit">Direct Debit</option>
                  <option value="account">Trade Account</option>
                  <option value="other">Other</option>
                </select>
              </div>
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-zinc-500 mb-1">
              Description / Items Purchased
            </label>
            <textarea
              rows={2}
              value={formData.description}
              onChange={e => setFormData({ ...formData, description: e.target.value })}
              placeholder="e.g. Copper pipes, solder fittings, gas canister for bathroom job"
              className="w-full px-3 py-2 bg-zinc-50 dark:bg-zinc-800/80 border border-zinc-200 dark:border-zinc-700 rounded-xl text-sm font-medium text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
            />
          </div>

          {/* HMRC 5-6 Year Record Keeping Rule Reminder */}
          <div className="p-3 bg-zinc-50 dark:bg-zinc-800/50 rounded-2xl border border-zinc-100 dark:border-zinc-800 flex items-start gap-2.5">
            <ShieldAlert className="w-4 h-4 text-zinc-500 shrink-0 mt-0.5" />
            <p className="text-[10px] leading-relaxed text-zinc-500 dark:text-zinc-400">
              <strong>HMRC Legal Duty:</strong> Sole traders must keep physical receipts for 5 years and limited companies for 6 years from 31 January. Tribe Trade does not store your receipt photos; please keep original paper or scanned copies safely archived.
            </p>
          </div>

          {/* Modal Actions */}
          <div className="flex items-center justify-end gap-3 pt-3 border-t border-zinc-100 dark:border-zinc-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl border border-zinc-200 dark:border-zinc-700 text-xs font-semibold text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold shadow-md transition-all active:scale-95 flex items-center gap-1.5"
            >
              <Save className="w-4 h-4" />
              {isSaving ? 'Saving...' : 'Save Record'}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}
