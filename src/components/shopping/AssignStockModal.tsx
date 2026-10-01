import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  X,
  Briefcase,
  Loader2,
  Check,
  Warehouse,
  FileText,
  Receipt,
  PlusCircle,
  AlertCircle
} from 'lucide-react';
import { db } from '../../lib/firebase';
import { collection, getDocs, query, orderBy, limit } from 'firebase/firestore';
import { ShedStockItem, assignStockToJob } from '../../services/shedService';
import { useToast } from '../../contexts/ToastContext';
import { Quote, Invoice } from '../../types/quote';

interface AssignStockModalProps {
  isOpen: boolean;
  item: ShedStockItem | null;
  tradeUserId: string;
  onClose: () => void;
  onAssigned?: (quantity: number, jobName: string) => void;
}

export default function AssignStockModal({
  isOpen,
  item,
  tradeUserId,
  onClose,
  onAssigned
}: AssignStockModalProps) {
  const { showToast } = useToast();

  const [quantity, setQuantity] = useState<number>(1);
  const [unitPrice, setUnitPrice] = useState<number | string>(0);
  const [targetType, setTargetType] = useState<'invoice' | 'quote' | 'custom'>('invoice');
  const [targetId, setTargetId] = useState<string>('');
  const [customJobTitle, setCustomJobTitle] = useState<string>('');
  const [customCustomerName, setCustomCustomerName] = useState<string>('');
  const [jobDate, setJobDate] = useState<string>(new Date().toISOString().split('T')[0]);

  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [loadingJobs, setLoadingJobs] = useState<boolean>(true);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const availableStock = Math.max(0, (Number(item?.quantity) || 0) - (Number(item?.reservedQuantity) || 0));

  // Reset and fetch invoices and quotes on open
  useEffect(() => {
    if (!isOpen || !tradeUserId || !item) return;

    setQuantity(1);
    setUnitPrice(item.costPrice || 0);
    setError(null);
    setLoadingJobs(true);
    setJobDate(new Date().toISOString().split('T')[0]);

    const fetchJobs = async () => {
      try {
        const invRef = collection(db, 'trade_users', tradeUserId, 'invoices');
        const iSnap = await getDocs(query(invRef, orderBy('createdAt', 'desc'), limit(50)));
        const iList = iSnap.docs.map(d => ({ id: d.id, ...d.data() } as Invoice));
        setInvoices(iList);

        const quoteRef = collection(db, 'trade_users', tradeUserId, 'quotes');
        const qSnap = await getDocs(query(quoteRef, orderBy('createdAt', 'desc'), limit(50)));
        const qList = qSnap.docs
          .map(d => ({ id: d.id, ...d.data() } as Quote))
          .filter(q => q.status !== 'declined');
        setQuotes(qList);

        if (iList.length > 0) {
          setTargetType('invoice');
          setTargetId(iList[0].id);
          if (iList[0].dateIssued) setJobDate(iList[0].dateIssued);
        } else if (qList.length > 0) {
          setTargetType('quote');
          setTargetId(qList[0].id);
          if (qList[0].dateIssued) setJobDate(qList[0].dateIssued);
        } else {
          setTargetType('custom');
          setTargetId('');
        }
      } catch (err) {
        console.error('Failed to load trade jobs:', err);
      } finally {
        setLoadingJobs(false);
      }
    };

    fetchJobs();
  }, [isOpen, tradeUserId, item]);

  if (!isOpen || !item) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tradeUserId || !item) return;

    const assignQty = Math.max(0.1, Number(quantity));
    if (assignQty > availableStock) {
      setError(`Cannot assign more than available stock (${availableStock} ${item.unit || 'units'}).`);
      return;
    }

    let jobTitle = '';
    let customerName = '';

    if (targetType === 'invoice') {
      const selectedId = targetId || invoices[0]?.id;
      const inv = invoices.find(invoice => invoice.id === selectedId);
      if (!inv) {
        setError('Please select an Invoice for this assignment.');
        return;
      }
      jobTitle = `${inv.invoiceNumber}: ${inv.jobTitle || 'Invoiced Works'}`;
      customerName = inv.customerName;
    } else if (targetType === 'quote') {
      const selectedId = targetId || quotes[0]?.id;
      const q = quotes.find(quote => quote.id === selectedId);
      if (!q) {
        setError('Please select a Quote for this assignment.');
        return;
      }
      jobTitle = `${q.quoteNumber}: ${q.jobTitle || 'Quoted Works'}`;
      customerName = q.customerName;
    } else {
      if (!customJobTitle.trim()) {
        setError('Please enter a job title or client site reference.');
        return;
      }
      jobTitle = customJobTitle.trim();
      customerName = customCustomerName.trim() || 'Direct Job';
    }

    setSubmitting(true);
    setError(null);

    try {
      await assignStockToJob({
        tradeUserId,
        stockItemId: item.id,
        stockItemName: item.name,
        quantityToAssign: assignQty,
        unit: item.unit || 'units',
        unitPrice: Math.max(0, parseFloat(String(unitPrice)) || 0),
        targetType,
        targetId: targetType !== 'custom' ? targetId : undefined,
        jobTitle,
        customerName,
        jobDate
      });

      showToast(`Assigned ${assignQty}x ${item.name} to "${jobTitle}"`, 'success');
      onAssigned?.(assignQty, jobTitle);
      onClose();
    } catch (err: any) {
      console.error('Failed to assign stock:', err);
      setError(err.message || 'Failed to assign stock to job.');
    } finally {
      setSubmitting(false);
    }
  };

  const parsedUnitPrice = Math.max(0, parseFloat(String(unitPrice)) || 0);
  const totalCost = Number((Number(quantity) * parsedUnitPrice).toFixed(2));

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-3 sm:p-4">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={!submitting ? onClose : undefined}
        className="absolute inset-0 bg-zinc-950/70 backdrop-blur-sm"
      />

      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 15 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 15 }}
        className="relative w-full max-w-lg bg-white dark:bg-zinc-900 rounded-[28px] overflow-hidden shadow-2xl border border-zinc-200 dark:border-zinc-800 flex flex-col"
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between p-4 sm:p-5 border-b border-zinc-100 dark:border-zinc-800">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-950/50 flex items-center justify-center text-blue-600 dark:text-blue-400">
              <Briefcase className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-zinc-900 dark:text-white">Assign Stock to Job</h3>
              <p className="text-xs text-zinc-500">Allocate materials from The Shed to a client job</p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={submitting}
            className="p-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-full transition-colors text-zinc-400 disabled:opacity-50"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <form onSubmit={handleSubmit} className="p-4 sm:p-5 space-y-4 max-h-[75vh] overflow-y-auto">
          {error && (
            <div className="p-3 bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-900/40 rounded-xl flex items-center gap-2 text-xs font-semibold">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Current Stock Banner */}
          <div className="p-3.5 bg-zinc-50 dark:bg-zinc-800/60 rounded-2xl border border-zinc-200/80 dark:border-zinc-700/60 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <span className="text-[10px] font-black uppercase tracking-wider text-zinc-400">Item from The Shed</span>
              <p className="text-sm font-bold text-zinc-900 dark:text-white truncate">{item.name}</p>
              {item.category && (
                <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400">
                  {item.category}
                </span>
              )}
            </div>
            <div className="text-right shrink-0">
              <span className="text-[10px] font-black uppercase tracking-wider text-zinc-400">In Stock</span>
              <p className="text-sm font-black text-zinc-900 dark:text-white">
                {availableStock} <span className="text-xs font-normal text-zinc-500">{item.unit || 'units'}</span>
              </p>
            </div>
          </div>

          {/* Quantity Selector */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-zinc-700 dark:text-zinc-300">
                Quantity to Assign
              </label>
              <span className="text-xs text-zinc-400">Max: {availableStock}</span>
            </div>

            <div className="flex items-center gap-2">
              <input
                type="number"
                min="0.1"
                max={availableStock}
                step="any"
                value={quantity}
                onChange={(e) => setQuantity(Math.min(availableStock, Math.max(0, parseFloat(e.target.value) || 0)))}
                className="flex-1 px-4 py-2.5 bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200 dark:border-zinc-700 rounded-xl text-sm font-black text-zinc-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
                required
              />
              <div className="flex items-center gap-1">
                {[1, 2, 5].filter(q => q <= availableStock).map(q => (
                  <button
                    key={q}
                    type="button"
                    onClick={() => setQuantity(q)}
                    className="px-2.5 py-2 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-xs font-bold text-zinc-700 dark:text-zinc-300 rounded-lg transition-colors"
                  >
                    {q}
                  </button>
                ))}
                {availableStock > 0 && (
                  <button
                    type="button"
                    onClick={() => setQuantity(availableStock)}
                    className="px-2.5 py-2 bg-blue-50 dark:bg-blue-950/50 hover:bg-blue-100 text-xs font-bold text-blue-600 dark:text-blue-400 rounded-lg transition-colors"
                  >
                    All
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Target Job Type Tabs */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-zinc-700 dark:text-zinc-300">
              Assign To:
            </label>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => {
                  setTargetType('invoice');
                  if (invoices.length > 0) {
                    setTargetId(invoices[0].id);
                    if (invoices[0].dateIssued) setJobDate(invoices[0].dateIssued);
                  }
                }}
                className={`py-2 px-2.5 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                  targetType === 'invoice'
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200'
                }`}
              >
                <Receipt className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate">Invoice</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setTargetType('quote');
                  if (quotes.length > 0) {
                    setTargetId(quotes[0].id);
                    if (quotes[0].dateIssued) setJobDate(quotes[0].dateIssued);
                  }
                }}
                className={`py-2 px-2.5 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                  targetType === 'quote'
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200'
                }`}
              >
                <FileText className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate">Quote</span>
              </button>
              <button
                type="button"
                onClick={() => setTargetType('custom')}
                className={`py-2 px-2.5 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                  targetType === 'custom'
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200'
                }`}
              >
                <PlusCircle className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate">Direct Job</span>
              </button>
            </div>
          </div>

          {targetType === 'invoice' && (
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-zinc-700 dark:text-zinc-300">
                Select Invoice
              </label>
              {loadingJobs ? (
                <div className="flex items-center gap-2 py-3 text-xs text-zinc-400">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Loading invoices...</span>
                </div>
              ) : invoices.length === 0 ? (
                <p className="text-xs text-zinc-400 italic py-2">
                  No invoices found. Select "Quote" or "Direct Job" instead.
                </p>
              ) : (
                <select
                  value={targetId || invoices[0]?.id || ''}
                  onChange={(e) => {
                    const id = e.target.value;
                    setTargetId(id);
                    const inv = invoices.find(i => i.id === id);
                    if (inv?.dateIssued) setJobDate(inv.dateIssued);
                  }}
                  className="w-full px-3.5 py-2.5 bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200 dark:border-zinc-700 rounded-xl text-xs font-bold text-zinc-900 dark:text-white outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {invoices.map(inv => (
                    <option key={inv.id} value={inv.id}>
                      {inv.invoiceNumber}: {inv.jobTitle || 'Works'} — {inv.customerName} (£{inv.grandTotal.toFixed(2)})
                    </option>
                  ))}
                </select>
              )}
            </div>
          )}

          {targetType === 'quote' && (
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-zinc-700 dark:text-zinc-300">
                Select Quote
              </label>
              {loadingJobs ? (
                <div className="flex items-center gap-2 py-3 text-xs text-zinc-400">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Loading quotes...</span>
                </div>
              ) : quotes.length === 0 ? (
                <p className="text-xs text-zinc-400 italic py-2">
                  No active quotes found. Select "Direct Job" instead.
                </p>
              ) : (
                <select
                  value={targetId || quotes[0]?.id || ''}
                  onChange={(e) => {
                    const id = e.target.value;
                    setTargetId(id);
                    const q = quotes.find(item => item.id === id);
                    if (q?.dateIssued) setJobDate(q.dateIssued);
                  }}
                  className="w-full px-3.5 py-2.5 bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200 dark:border-zinc-700 rounded-xl text-xs font-bold text-zinc-900 dark:text-white outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {quotes.map(q => (
                    <option key={q.id} value={q.id}>
                      {q.quoteNumber}: {q.jobTitle || 'Works'} — {q.customerName} (£{q.grandTotal.toFixed(2)})
                    </option>
                  ))}
                </select>
              )}
            </div>
          )}

          {targetType === 'custom' && (
            <div className="space-y-3">
              <div className="space-y-1">
                <label className="text-xs font-bold text-zinc-700 dark:text-zinc-300">
                  Job Reference / Site Name *
                </label>
                <input
                  type="text"
                  value={customJobTitle}
                  onChange={(e) => setCustomJobTitle(e.target.value)}
                  placeholder="e.g. 42 High Street Bathroom Fitting"
                  className="w-full px-3.5 py-2.5 bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200 dark:border-zinc-700 rounded-xl text-xs text-zinc-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
                  required
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-bold text-zinc-700 dark:text-zinc-300">
                  Client / Customer Name (Optional)
                </label>
                <input
                  type="text"
                  value={customCustomerName}
                  onChange={(e) => setCustomCustomerName(e.target.value)}
                  placeholder="e.g. Mr D Smith"
                  className="w-full px-3.5 py-2.5 bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200 dark:border-zinc-700 rounded-xl text-xs text-zinc-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>
            </div>
          )}

          {/* Job Date */}
          <div className="space-y-1">
            <label className="text-xs font-bold text-zinc-700 dark:text-zinc-300">
              Job Date / Scheduled Date
            </label>
            <input
              type="date"
              value={jobDate}
              onChange={(e) => setJobDate(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200 dark:border-zinc-700 rounded-xl text-xs font-medium text-zinc-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
            />
          </div>

          {/* Unit Price to Charge */}
          <div className="space-y-1.5 pt-1">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-zinc-700 dark:text-zinc-300">
                Unit Price to Bill Client (£)
              </label>
              <span className="text-[11px] text-zinc-400">Total: £{totalCost.toFixed(2)}</span>
            </div>
            <div className="relative">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-xs font-bold text-zinc-400">£</span>
              <input
                type="number"
                min="0"
                step="0.01"
                value={unitPrice}
                onChange={(e) => setUnitPrice(e.target.value)}
                placeholder="0.00"
                className="w-full pl-8 pr-4 py-2.5 bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200 dark:border-zinc-700 rounded-xl text-xs font-bold text-zinc-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>
            <p className="text-[10px] text-zinc-400">
              {targetType !== 'custom'
                ? 'Appends as an itemised material line item to the quote/invoice.'
                : 'Recorded in stock allocation history.'}
            </p>
          </div>

          {/* Footer Actions */}
          <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-zinc-100 dark:border-zinc-800">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="px-4 py-2.5 text-xs font-bold text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-xl transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || availableStock <= 0}
              className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-bold rounded-xl shadow-sm transition-all active:scale-95 flex items-center gap-1.5"
            >
              {submitting ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Assigning...</span>
                </>
              ) : (
                <>
                  <Check className="w-3.5 h-3.5" />
                  <span>Confirm Assignment</span>
                </>
              )}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}
