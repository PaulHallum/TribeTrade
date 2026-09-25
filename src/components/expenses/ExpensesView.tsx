import { useState, useEffect } from 'react';
import {
  ReceiptPoundSterling,
  Camera,
  Plus,
  Download,
  Search,
  Filter,
  Trash2,
  Edit3,
  TrendingUp,
  TrendingDown,
  Scale,
  Percent,
  Calendar,
  Building2,
  FileSpreadsheet,
  ShieldCheck,
  Sparkles,
  Info,
  ChevronDown,
  Calculator,
  PenLine
} from 'lucide-react';
import SelfAssessmentModal from './SelfAssessmentModal';
import {
  Transaction,
  TRANSACTION_CATEGORIES,
  TransactionCategoryKey
} from '../../types/transaction';
import { BusinessDetails, DEFAULT_BUSINESS_DETAILS } from '../../types/quote';
import { subscribeBusinessDetails } from '../../services/quoteService';
import {
  subscribeTransactions,
  saveTransaction,
  deleteTransaction,
  ExtractedReceiptData
} from '../../services/receiptService';
import {
  filterTransactionsByPeriod,
  generateMtdCsv,
  downloadMtdCsv,
  TaxPeriodFilter
} from '../../services/mtdExportService';
import PageHeader from '../common/PageHeader';
import ConfirmModal from '../common/ConfirmModal';
import ReceiptScannerModal from './ReceiptScannerModal';
import TransactionEditorModal from './TransactionEditorModal';
import { useAuth } from '../../App';
import { useToast } from '../../contexts/ToastContext';

export default function ExpensesView() {
  const { user, tradeUserId } = useAuth();
  const { showToast } = useToast();

  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [businessDetails, setBusinessDetails] = useState<BusinessDetails>(DEFAULT_BUSINESS_DETAILS);
  const [loading, setLoading] = useState(true);

  // Filters
  const [periodFilter, setPeriodFilter] = useState<TaxPeriodFilter>('current_tax_year');
  const [typeFilter, setTypeFilter] = useState<'all' | 'expense' | 'income'>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Modals
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [isSelfAssessmentOpen, setIsSelfAssessmentOpen] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);
  const [extractedReceipt, setExtractedReceipt] = useState<ExtractedReceiptData | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<{
    isOpen: boolean;
    id: string;
    vendor: string;
  }>({
    isOpen: false,
    id: '',
    vendor: ''
  });

  const activeTradeUserId = tradeUserId || (user ? `trade_${user.uid}` : '');

  // 1. Subscribe to transactions & business details
  useEffect(() => {
    if (!activeTradeUserId) {
      setLoading(false);
      return;
    }

    const unsubTrans = subscribeTransactions(activeTradeUserId, (list) => {
      setTransactions(list);
      setLoading(false);
    });

    const unsubBiz = subscribeBusinessDetails(activeTradeUserId, (biz) => {
      setBusinessDetails(biz);
    });

    return () => {
      unsubTrans();
      unsubBiz();
    };
  }, [activeTradeUserId]);

  // 2. Listen for custom event triggered from camera icon / Magic Mic
  useEffect(() => {
    const handleOpenScan = () => {
      setIsScannerOpen(true);
    };

    window.addEventListener('tribe_scan_receipt' as any, handleOpenScan);
    return () => {
      window.removeEventListener('tribe_scan_receipt' as any, handleOpenScan);
    };
  }, []);

  // Filter pipeline
  const { filtered: periodTransactions, periodLabel } = filterTransactionsByPeriod(
    transactions,
    periodFilter
  );

  const displayedTransactions = periodTransactions.filter(t => {
    const matchesType = typeFilter === 'all' || t.type === typeFilter;
    const matchesCategory = categoryFilter === 'all' || t.category === categoryFilter;
    const q = searchQuery.toLowerCase().trim();
    const matchesQuery = !q ||
      t.vendor.toLowerCase().includes(q) ||
      t.description.toLowerCase().includes(q) ||
      (t.reference && t.reference.toLowerCase().includes(q));

    return matchesType && matchesCategory && matchesQuery;
  });

  // Financial summary metrics
  const totalIncome = periodTransactions
    .filter(t => t.type === 'income')
    .reduce((acc, t) => acc + (t.netAmount || 0), 0);

  const totalExpenses = periodTransactions
    .filter(t => t.type === 'expense')
    .reduce((acc, t) => acc + (t.netAmount || 0), 0);

  const netTaxableProfit = totalIncome - totalExpenses;

  const totalVatPaid = periodTransactions
    .filter(t => t.type === 'expense')
    .reduce((acc, t) => acc + (t.vatAmount || 0), 0);

  const totalVatCharged = periodTransactions
    .filter(t => t.type === 'income')
    .reduce((acc, t) => acc + (t.vatAmount || 0), 0);

  // Actions
  const handleOpenScanner = () => {
    setIsScannerOpen(true);
  };

  const handleOpenManual = () => {
    setEditingTransaction(null);
    setExtractedReceipt(null);
    setIsEditorOpen(true);
  };

  const handleReceiptExtracted = (data: ExtractedReceiptData) => {
    setEditingTransaction(null);
    setExtractedReceipt(data);
    setIsEditorOpen(true);
    showToast(`Receipt scanned from ${data.vendor}. Please verify figures.`, 'info');
  };

  const handleEdit = (transaction: Transaction) => {
    setExtractedReceipt(null);
    setEditingTransaction(transaction);
    setIsEditorOpen(true);
  };

  const handleSave = async (data: Partial<Transaction>) => {
    if (!activeTradeUserId || !user) return;
    try {
      await saveTransaction(activeTradeUserId, {
        ...data,
        authorId: user.uid
      });
      showToast(data.id ? 'Transaction updated' : 'Transaction recorded', 'success');
    } catch (err: any) {
      showToast('Failed to save transaction: ' + err.message, 'error');
    }
  };

  const handleDelete = async () => {
    if (!activeTradeUserId || !confirmDelete.id) return;
    try {
      await deleteTransaction(activeTradeUserId, confirmDelete.id);
      showToast(`Deleted transaction for ${confirmDelete.vendor}`, 'info');
    } catch (err: any) {
      showToast('Failed to delete: ' + err.message, 'error');
    } finally {
      setConfirmDelete({ isOpen: false, id: '', vendor: '' });
    }
  };

  const handleExportMtdCsv = () => {
    if (periodTransactions.length === 0) {
      showToast('No transactions to export for the selected period.', 'warning');
      return;
    }

    try {
      const csv = generateMtdCsv(periodTransactions, periodLabel, businessDetails);
      const filename = `TribeTrade_MTD_${periodFilter}_${new Date().toISOString().split('T')[0]}.csv`;
      downloadMtdCsv(csv, filename);
      showToast(`Exported ${periodTransactions.length} records for MTD (${filename})`, 'success');
    } catch (err: any) {
      showToast('Failed to export CSV: ' + err.message, 'error');
    }
  };

  return (
    <div className="max-w-7xl mx-auto pb-32 px-2 sm:px-4 space-y-6">
      <PageHeader
        icon={ReceiptPoundSterling}
        title="Expenses & Bookkeeping"
        subtitle="Track income, scan trade receipts, and export HMRC Making Tax Digital (MTD) records"
      />

      {/* Top Financial Snapshot Cards - 2x2 on mobile, 4-across on desktop */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3">
        {/* Total Income */}
        <div className="p-3 sm:p-4 bg-white dark:bg-zinc-900 rounded-2xl sm:rounded-3xl border border-zinc-200 dark:border-zinc-800 shadow-sm flex items-center justify-between">
          <div className="min-w-0">
            <span className="text-[9px] sm:text-[10px] font-black uppercase tracking-wider text-emerald-600 dark:text-emerald-400 block truncate">
              Turnover (Net)
            </span>
            <div className="text-base sm:text-xl font-bold text-zinc-900 dark:text-white mt-0.5 truncate">
              £{totalIncome.toFixed(2)}
            </div>
            <p className="text-[10px] sm:text-[11px] text-zinc-500 mt-0.5 truncate">
              {periodTransactions.filter(t => t.type === 'income').length} invoices/receipts
            </p>
          </div>
          <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl sm:rounded-2xl bg-emerald-50 dark:bg-emerald-950/50 flex-shrink-0 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
            <TrendingUp className="w-4 h-4 sm:w-5 sm:h-5" />
          </div>
        </div>

        {/* Total Expenses */}
        <div className="p-3 sm:p-4 bg-white dark:bg-zinc-900 rounded-2xl sm:rounded-3xl border border-zinc-200 dark:border-zinc-800 shadow-sm flex items-center justify-between">
          <div className="min-w-0">
            <span className="text-[9px] sm:text-[10px] font-black uppercase tracking-wider text-rose-600 dark:text-rose-400 block truncate">
              Expenses (Net)
            </span>
            <div className="text-base sm:text-xl font-bold text-zinc-900 dark:text-white mt-0.5 truncate">
              £{totalExpenses.toFixed(2)}
            </div>
            <p className="text-[10px] sm:text-[11px] text-zinc-500 mt-0.5 truncate">
              {periodTransactions.filter(t => t.type === 'expense').length} purchases
            </p>
          </div>
          <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl sm:rounded-2xl bg-rose-50 dark:bg-rose-950/50 flex-shrink-0 flex items-center justify-center text-rose-600 dark:text-rose-400">
            <TrendingDown className="w-4 h-4 sm:w-5 sm:h-5" />
          </div>
        </div>

        {/* Net Taxable Profit */}
        <div className="p-3 sm:p-4 bg-white dark:bg-zinc-900 rounded-2xl sm:rounded-3xl border border-zinc-200 dark:border-zinc-800 shadow-sm flex items-center justify-between">
          <div className="min-w-0">
            <span className="text-[9px] sm:text-[10px] font-black uppercase tracking-wider text-zinc-500 block truncate">
              Taxable Profit
            </span>
            <div className={`text-base sm:text-xl font-bold mt-0.5 truncate ${
              netTaxableProfit >= 0 ? 'text-zinc-900 dark:text-white' : 'text-rose-600 dark:text-rose-400'
            }`}>
              £{netTaxableProfit.toFixed(2)}
            </div>
            <p className="text-[10px] sm:text-[11px] text-zinc-500 mt-0.5 truncate">
              Before allowances
            </p>
          </div>
          <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl sm:rounded-2xl bg-zinc-100 dark:bg-zinc-800 flex-shrink-0 flex items-center justify-center text-zinc-600 dark:text-zinc-300">
            <Scale className="w-4 h-4 sm:w-5 sm:h-5" />
          </div>
        </div>

        {/* VAT Position */}
        <div className="p-3 sm:p-4 bg-white dark:bg-zinc-900 rounded-2xl sm:rounded-3xl border border-zinc-200 dark:border-zinc-800 shadow-sm flex items-center justify-between">
          <div className="min-w-0">
            <span className="text-[9px] sm:text-[10px] font-black uppercase tracking-wider text-zinc-500 block truncate">
              VAT Reclaimable
            </span>
            <div className="text-base sm:text-xl font-bold text-zinc-900 dark:text-white mt-0.5 truncate">
              £{totalVatPaid.toFixed(2)}
            </div>
            <p className="text-[10px] sm:text-[11px] text-zinc-500 mt-0.5 truncate">
              Charged: £{totalVatCharged.toFixed(2)}
            </p>
          </div>
          <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl sm:rounded-2xl bg-zinc-100 dark:bg-zinc-800 flex-shrink-0 flex items-center justify-center text-zinc-600 dark:text-zinc-300">
            <Percent className="w-4 h-4 sm:w-5 sm:h-5" />
          </div>
        </div>
      </div>

      {/* Main Action Bar - 2x2 grid on mobile, 4-across on desktop, equal size */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-2.5">
        {/* Scan Receipt Button */}
        <button
          onClick={handleOpenScanner}
          className="flex items-center justify-center gap-1.5 sm:gap-2 px-3 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white rounded-xl sm:rounded-2xl text-xs font-bold shadow-sm transition-all active:scale-95"
        >
          <Camera className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
          <span className="truncate">Scan Receipt</span>
        </button>

        {/* Manual Entry Button */}
        <button
          onClick={handleOpenManual}
          className="flex items-center justify-center gap-1.5 sm:gap-2 px-3 py-2.5 bg-white dark:bg-zinc-900 hover:bg-zinc-50 dark:hover:bg-zinc-800 text-zinc-900 dark:text-white border border-zinc-200 dark:border-zinc-700/80 rounded-xl sm:rounded-2xl text-xs font-bold shadow-sm transition-all active:scale-95"
        >
          <PenLine className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
          <span className="truncate">Manual Entry</span>
        </button>

        {/* Self Assessment Preparation Assistant Button */}
        <button
          onClick={() => setIsSelfAssessmentOpen(true)}
          className="flex items-center justify-center gap-1.5 sm:gap-2 px-3 py-2.5 bg-indigo-50 dark:bg-indigo-950/40 hover:bg-indigo-100 dark:hover:bg-indigo-900/40 text-indigo-800 dark:text-indigo-300 border border-indigo-200/80 dark:border-indigo-800/60 rounded-xl sm:rounded-2xl text-xs font-bold shadow-sm transition-all active:scale-95"
          title="Open Sole Trader Self Assessment Preparation Assistant"
        >
          <Calculator className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-indigo-600 dark:text-indigo-400 shrink-0" />
          <span className="truncate">Self Assessment</span>
        </button>

        {/* Export for MTD CSV Button */}
        <button
          onClick={handleExportMtdCsv}
          className="flex items-center justify-center gap-1.5 sm:gap-2 px-3 py-2.5 bg-emerald-50 dark:bg-emerald-950/40 hover:bg-emerald-100 dark:hover:bg-emerald-900/40 text-emerald-800 dark:text-emerald-300 border border-emerald-200/80 dark:border-emerald-800/60 rounded-xl sm:rounded-2xl text-xs font-bold shadow-sm transition-all active:scale-95"
          title="Download HMRC Making Tax Digital compliant CSV for your accountant"
        >
          <FileSpreadsheet className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
          <span className="truncate">Export MTD CSV</span>
        </button>
      </div>

      {/* Search & Filter Toolbar */}
      <div className="p-3 bg-white dark:bg-zinc-900 rounded-3xl border border-zinc-200 dark:border-zinc-800 shadow-sm space-y-3">
        <div className="flex flex-col md:flex-row items-stretch md:items-center gap-2.5">
          {/* Search Input */}
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-zinc-400 absolute left-3 top-3 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search by supplier, reference, or description..."
              className="w-full pl-9 pr-3 py-2 bg-zinc-50 dark:bg-zinc-800/80 border border-zinc-200 dark:border-zinc-700 rounded-xl text-xs font-medium text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
            />
          </div>

          {/* Tax Period Filter */}
          <div className="flex items-center gap-1.5 shrink-0">
            <Calendar className="w-4 h-4 text-zinc-400 shrink-0 hidden sm:block" />
            <select
              value={periodFilter}
              onChange={e => setPeriodFilter(e.target.value as TaxPeriodFilter)}
              className="px-3 py-2 bg-zinc-50 dark:bg-zinc-800/80 border border-zinc-200 dark:border-zinc-700 rounded-xl text-xs font-bold text-zinc-900 dark:text-white focus:outline-none"
            >
              <option value="current_tax_year">Current Tax Year (2025/26)</option>
              <option value="previous_tax_year">Previous Tax Year (2024/25)</option>
              <option value="current_quarter">Current Quarter</option>
              <option value="previous_quarter">Previous Quarter</option>
              <option value="all">All Time</option>
            </select>
          </div>

          {/* Type Filter */}
          <div className="flex items-center gap-1.5 shrink-0">
            <select
              value={typeFilter}
              onChange={e => setTypeFilter(e.target.value as any)}
              className="px-3 py-2 bg-zinc-50 dark:bg-zinc-800/80 border border-zinc-200 dark:border-zinc-700 rounded-xl text-xs font-bold text-zinc-900 dark:text-white focus:outline-none"
            >
              <option value="all">All Types</option>
              <option value="expense">Expenses Only</option>
              <option value="income">Income Only</option>
            </select>
          </div>

          {/* Category Filter */}
          <div className="flex items-center gap-1.5 shrink-0">
            <select
              value={categoryFilter}
              onChange={e => setCategoryFilter(e.target.value)}
              className="px-3 py-2 bg-zinc-50 dark:bg-zinc-800/80 border border-zinc-200 dark:border-zinc-700 rounded-xl text-xs font-bold text-zinc-900 dark:text-white focus:outline-none max-w-[200px] truncate"
            >
              <option value="all">All Categories</option>
              {TRANSACTION_CATEGORIES.map(c => (
                <option key={c.key} value={c.key}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Active Period Display Sub-bar */}
        <div className="flex items-center justify-between text-[11px] text-zinc-500 pt-1 border-t border-zinc-100 dark:border-zinc-800 px-1">
          <span>Active Period: <strong className="text-zinc-800 dark:text-zinc-200">{periodLabel}</strong></span>
          <span>Showing {displayedTransactions.length} of {periodTransactions.length} records</span>
        </div>
      </div>

      {/* Transactions Ledger Table / Cards */}
      <div className="bg-white dark:bg-zinc-900 rounded-3xl border border-zinc-200 dark:border-zinc-800 shadow-sm overflow-hidden">
        {loading ? (
          <div className="py-20 flex flex-col items-center justify-center text-center">
            <div className="w-8 h-8 rounded-full border-2 border-emerald-500 border-t-transparent animate-spin mb-3" />
            <p className="text-xs text-zinc-400 font-medium">Loading transactions...</p>
          </div>
        ) : displayedTransactions.length === 0 ? (
          <div className="py-16 px-4 flex flex-col items-center justify-center text-center">
            <div className="w-14 h-14 bg-zinc-50 dark:bg-zinc-800/60 rounded-3xl flex items-center justify-center text-zinc-400 mb-3.5">
              <ReceiptPoundSterling className="w-7 h-7 stroke-[1.5]" />
            </div>
            <h4 className="text-base font-bold text-zinc-900 dark:text-white">No transactions found</h4>
            <p className="text-xs text-zinc-500 max-w-sm mt-1">
              Snap a photo of your paper receipt or enter an invoice manually to begin tracking income and expenditure.
            </p>
            <div className="flex items-center gap-2 mt-5">
              <button
                onClick={handleOpenScanner}
                className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 text-white rounded-xl text-xs font-bold shadow-sm hover:bg-emerald-700 transition-all active:scale-95"
              >
                <Camera className="w-3.5 h-3.5" />
                Scan First Receipt
              </button>
              <button
                onClick={handleOpenManual}
                className="flex items-center gap-1.5 px-4 py-2 bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-200 rounded-xl text-xs font-bold hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-all active:scale-95"
              >
                <Plus className="w-3.5 h-3.5" />
                Manual Entry
              </button>
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-zinc-50 dark:bg-zinc-800/50 border-b border-zinc-100 dark:border-zinc-800 text-[10px] font-black uppercase tracking-wider text-zinc-400">
                <tr>
                  <th className="py-3 px-4">Date</th>
                  <th className="py-3 px-4">Type</th>
                  <th className="py-3 px-4">Supplier / Customer</th>
                  <th className="py-3 px-4 hidden md:table-cell">Category & HMRC Box</th>
                  <th className="py-3 px-4 hidden lg:table-cell">Description</th>
                  <th className="py-3 px-4 text-right">Net (£)</th>
                  <th className="py-3 px-4 text-right hidden sm:table-cell">VAT (£)</th>
                  <th className="py-3 px-4 text-right">Gross (£)</th>
                  <th className="py-3 px-4 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {displayedTransactions.map((t) => {
                  const [y, m, d] = (t.date || '').split('-');
                  const ukDate = y && m && d ? `${d}/${m}/${y}` : t.date;

                  return (
                    <tr
                      key={t.id}
                      className="hover:bg-zinc-50/70 dark:hover:bg-zinc-800/40 transition-colors group"
                    >
                      {/* Date */}
                      <td className="py-3 px-4 font-mono font-medium text-zinc-600 dark:text-zinc-400 whitespace-nowrap">
                        {ukDate}
                      </td>

                      {/* Type Badge */}
                      <td className="py-3 px-4 whitespace-nowrap">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider ${
                          t.type === 'expense'
                            ? 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-400 border border-rose-200/50'
                            : 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border border-emerald-200/50'
                        }`}>
                          {t.type}
                        </span>
                      </td>

                      {/* Vendor */}
                      <td className="py-3 px-4 font-bold text-zinc-900 dark:text-white whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          <span>{t.vendor}</span>
                          {t.source === 'receipt_scan' && (
                            <span title="Scanned by AI">
                              <Sparkles className="w-3 h-3 text-amber-500 shrink-0" />
                            </span>
                          )}
                        </div>
                        {t.reference && (
                          <span className="block text-[10px] font-normal text-zinc-400 font-mono">
                            Ref: {t.reference}
                          </span>
                        )}
                      </td>

                      {/* Category & HMRC Box */}
                      <td className="py-3 px-4 hidden md:table-cell">
                        <span className="font-semibold text-zinc-800 dark:text-zinc-200 block truncate max-w-[200px]">
                          {t.categoryLabel}
                        </span>
                        <span className="text-[10px] text-zinc-400 block truncate max-w-[200px]">
                          {t.hmrcBox.split(':')[0]}
                        </span>
                      </td>

                      {/* Description */}
                      <td className="py-3 px-4 hidden lg:table-cell text-zinc-500 max-w-[220px] truncate">
                        {t.description || '—'}
                      </td>

                      {/* Net Amount */}
                      <td className="py-3 px-4 text-right font-medium text-zinc-600 dark:text-zinc-400 whitespace-nowrap">
                        £{(t.netAmount || 0).toFixed(2)}
                      </td>

                      {/* VAT Amount */}
                      <td className="py-3 px-4 text-right hidden sm:table-cell text-zinc-500 whitespace-nowrap">
                        £{(t.vatAmount || 0).toFixed(2)}
                        {t.vatRate > 0 && (
                          <span className="text-[10px] text-zinc-400 ml-1">({t.vatRate}%)</span>
                        )}
                      </td>

                      {/* Gross Amount */}
                      <td className="py-3 px-4 text-right font-bold text-zinc-900 dark:text-white whitespace-nowrap">
                        £{(t.grossAmount || 0).toFixed(2)}
                      </td>

                      {/* Actions */}
                      <td className="py-3 px-4 text-center whitespace-nowrap">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            onClick={() => handleEdit(t)}
                            className="p-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 transition-colors"
                            title="Edit"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => setConfirmDelete({ isOpen: true, id: t.id, vendor: t.vendor })}
                            className="p-1.5 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-lg text-zinc-400 hover:text-rose-600 transition-colors"
                            title="Delete"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* HMRC & Legal Disclaimer Card */}
      <div className="p-4 bg-zinc-50 dark:bg-zinc-800/40 rounded-3xl border border-zinc-200 dark:border-zinc-800 flex items-start gap-3">
        <ShieldCheck className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
        <div className="space-y-1 text-xs text-zinc-600 dark:text-zinc-400">
          <p className="font-bold text-zinc-900 dark:text-zinc-200">
            HMRC Compliance & AI Accuracy Notice
          </p>
          <p className="text-[11px] leading-relaxed">
            <strong>1. Keep Physical Receipts:</strong> Under UK tax legislation (TMA 1970 s12B), sole traders must keep records for at least 5 years and limited companies for 6 years from the 31 January tax return deadline. Tribe Trade processes receipts in volatile memory for privacy and does NOT store receipt images. You must retain original paper receipts or your own digital copies for HMRC inspection.
          </p>
          <p className="text-[11px] leading-relaxed">
            <strong>2. AI Extraction Verification:</strong> While our OCR models are trained on UK merchant receipts, AI can misread faded print or complex till slips. Always check and confirm extracted figures. Tribe Trade provides digital bookkeeping assistance and MTD CSV exports, but is not a regulated tax advisor.
          </p>
        </div>
      </div>

      {/* Modals */}
      <ReceiptScannerModal
        isOpen={isScannerOpen}
        onClose={() => setIsScannerOpen(false)}
        onExtracted={handleReceiptExtracted}
      />

      <TransactionEditorModal
        isOpen={isEditorOpen}
        initialTransaction={editingTransaction}
        initialExtracted={extractedReceipt}
        onClose={() => {
          setIsEditorOpen(false);
          setEditingTransaction(null);
          setExtractedReceipt(null);
        }}
        onSave={handleSave}
      />

      <ConfirmModal
        isOpen={confirmDelete.isOpen}
        title="Delete Transaction"
        message={`Are you sure you want to delete the transaction record for "${confirmDelete.vendor}"? This cannot be undone.`}
        confirmText="Delete Record"
        onConfirm={handleDelete}
        onClose={() => setConfirmDelete({ isOpen: false, id: '', vendor: '' })}
      />

      {isSelfAssessmentOpen && (
        <SelfAssessmentModal
          transactions={transactions}
          businessDetails={businessDetails}
          onClose={() => setIsSelfAssessmentOpen(false)}
        />
      )}
    </div>
  );
}
