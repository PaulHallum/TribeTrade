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
  PenLine,
  Truck,
  Package,
  ShieldAlert
} from 'lucide-react';
import SelfAssessmentModal from './SelfAssessmentModal';
import MileageLogModal from './MileageLogModal';
import {
  Transaction,
  TRANSACTION_CATEGORIES,
  TransactionCategoryKey
} from '../../types/transaction';
import { MileageEntry, HMRC_STANDARD_MILEAGE_RATE } from '../../types/vehicle';
import { subscribeMileageEntries, generateMileageCsv } from '../../services/mileageService';
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
import { addOrUpdateShedStock } from '../../services/shedService';
import PageHeader from '../common/PageHeader';
import ConfirmModal from '../common/ConfirmModal';
import ReceiptScannerModal from './ReceiptScannerModal';
import TransactionEditorModal from './TransactionEditorModal';
import { useAuth } from '../../App';
import { useToast } from '../../contexts/ToastContext';

export default function ExpensesView() {
  const { user, tradeUserId } = useAuth();
  const { showToast } = useToast();

  const [activeTab, setActiveTab] = useState<'expenses' | 'mileage'>('expenses');
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [businessDetails, setBusinessDetails] = useState<BusinessDetails>(DEFAULT_BUSINESS_DETAILS);
  const [loading, setLoading] = useState(true);
  const [mileageEntries, setMileageEntries] = useState<MileageEntry[]>([]);

  // Filters
  const [periodFilter, setPeriodFilter] = useState<TaxPeriodFilter>('current_tax_year');
  const [typeFilter, setTypeFilter] = useState<'all' | 'expense' | 'income'>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Modals
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [isSelfAssessmentOpen, setIsSelfAssessmentOpen] = useState(false);
  const [isMileageLogOpen, setIsMileageLogOpen] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);
  const [extractedReceipt, setExtractedReceipt] = useState<ExtractedReceiptData | null>(null);
  const [shedPrompt, setShedPrompt] = useState<{ isOpen: boolean; data: ExtractedReceiptData | null }>({
    isOpen: false,
    data: null
  });
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

  // 1. Subscribe to transactions, mileage entries & business details
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

    const unsubMileage = subscribeMileageEntries(activeTradeUserId, (list) => {
      setMileageEntries(list);
    });

    return () => {
      unsubTrans();
      unsubBiz();
      unsubMileage();
    };
  }, [activeTradeUserId]);

  // Mileage summary for current tax year (6 April – 5 April)
  const currentYear = new Date().getMonth() >= 3 ? new Date().getFullYear() : new Date().getFullYear() - 1;
  const taxYearStart = new Date(`${currentYear}-04-06`);
  const taxYearEnd = new Date(`${currentYear + 1}-04-05`);
  const currentYearMileage = mileageEntries.filter(e => {
    const d = new Date(e.date);
    return d >= taxYearStart && d <= taxYearEnd;
  });
  const totalMiles = currentYearMileage.reduce((acc, e) => acc + (Number(e.miles) || 0), 0);
  const totalMileageClaim = currentYearMileage.reduce((acc, e) => acc + (Number(e.totalClaim) || 0), 0);
  const recentMileageEntries = currentYearMileage.slice(0, 5);

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
    // Ask whether to add items to The Shed before opening the transaction editor
    setShedPrompt({ isOpen: true, data });
  };

  const handleShedPromptConfirm = async (addToShed: boolean) => {
    const data = shedPrompt.data;
    setShedPrompt({ isOpen: false, data: null });
    if (!data) return;

    if (addToShed && activeTradeUserId && data.lineItems && data.lineItems.length > 0) {
      try {
        const items = data.lineItems.map(li => ({
          name: li.description,
          quantity: li.quantity || 1,
          supplier: data.vendor
        }));
        const { addedCount, updatedCount } = await addOrUpdateShedStock(activeTradeUserId, items);
        showToast(`Added ${addedCount + updatedCount} item(s) to The Shed from this receipt.`, 'success');
      } catch (err: any) {
        showToast('Could not add items to The Shed: ' + err.message, 'error');
      }
    } else if (addToShed) {
      // No line items — add vendor as a generic item
      if (activeTradeUserId) {
        try {
          await addOrUpdateShedStock(activeTradeUserId, [{ name: data.vendor, quantity: 1, supplier: data.vendor }]);
          showToast(`Added "${data.vendor}" to The Shed.`, 'success');
        } catch (err: any) {
          showToast('Could not add to The Shed: ' + err.message, 'error');
        }
      }
    }

    // Open transaction editor
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
      {/* Page Header with Segmented Toggle for Expenses & Van Mileage */}
      <PageHeader
        icon={activeTab === 'expenses' ? ReceiptPoundSterling : Truck}
        title={activeTab === 'expenses' ? 'Expenses & Bookkeeping' : 'Van Mileage'}
        subtitle={activeTab === 'expenses' ? 'Track income, scan trade receipts, and export HMRC Making Tax Digital (MTD) records' : 'HMRC-compliant 45p/mile vehicle log & tax deduction calculator'}
        extra={
          <div className="bg-gradient-to-r from-emerald-500/10 to-amber-500/10 border border-emerald-500/20 dark:border-emerald-400/10 p-1 rounded-2xl flex gap-1 shadow-sm">
            <button 
              onClick={() => setActiveTab('expenses')}
              className={`px-3 sm:px-4 py-1.5 rounded-xl text-xs font-bold transition-all ${
                activeTab === 'expenses' 
                  ? 'bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white shadow-sm' 
                  : 'text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200'
              }`}
            >
              Expenses
            </button>
            <button 
              onClick={() => setActiveTab('mileage')}
              className={`px-3 sm:px-4 py-1.5 rounded-xl text-xs font-bold transition-all ${
                activeTab === 'mileage' 
                  ? 'bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white shadow-sm' 
                  : 'text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200'
              }`}
            >
              Van Mileage
            </button>
          </div>
        }
      />

      {activeTab === 'expenses' ? (
        <>
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

      {/* Main Action Bar */}
      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        {/* Scan Receipt Button */}
        <button
          onClick={handleOpenScanner}
          className="flex items-center justify-center gap-1.5 sm:gap-2 px-2.5 sm:px-4 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white rounded-xl sm:rounded-2xl text-[11px] sm:text-xs font-bold shadow-sm transition-all active:scale-95"
        >
          <Camera className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
          <span className="truncate">Scan Receipt</span>
        </button>

        {/* Manual Entry Button */}
        <button
          onClick={handleOpenManual}
          className="flex items-center justify-center gap-1.5 sm:gap-2 px-2.5 sm:px-4 py-2.5 bg-white dark:bg-zinc-900 hover:bg-zinc-50 dark:hover:bg-zinc-800 text-zinc-900 dark:text-white border border-zinc-200 dark:border-zinc-700/80 rounded-xl sm:rounded-2xl text-[11px] sm:text-xs font-bold shadow-sm transition-all active:scale-95"
        >
          <PenLine className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
          <span className="truncate">Manual Entry</span>
        </button>

        {/* Self Assessment / Tax Return Button */}
        <button
          onClick={() => setIsSelfAssessmentOpen(true)}
          className="flex items-center justify-center gap-1.5 sm:gap-2 px-2.5 sm:px-4 py-2.5 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-800 dark:text-zinc-200 border border-zinc-200 dark:border-zinc-700/80 rounded-xl sm:rounded-2xl text-[11px] sm:text-xs font-bold shadow-sm transition-all active:scale-95"
          title="Self Assessment Tax Return Estimator"
        >
          <Calculator className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-zinc-600 dark:text-zinc-400 shrink-0" />
          <span className="truncate">Self Assessment</span>
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

      {/* Year-End & Tax Tools Section - Below Entries Ledger, Above Disclaimers */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 p-3.5 sm:p-4 bg-white dark:bg-zinc-900 rounded-2xl sm:rounded-3xl border border-zinc-200 dark:border-zinc-800 shadow-sm">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-9 h-9 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 flex items-center justify-center text-emerald-600 dark:text-emerald-400 shrink-0">
            <FileSpreadsheet className="w-4 h-4 sm:w-5 sm:h-5" />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-bold text-zinc-900 dark:text-white truncate">
              Tax Year & Accounting Tools
            </p>
            <p className="text-[11px] text-zinc-500 truncate">
              Sole Trader Self Assessment preparation & accountant-ready MTD CSV export
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:flex sm:items-center gap-2 shrink-0">
          {/* Self Assessment Preparation Assistant Button */}
          <button
            onClick={() => setIsSelfAssessmentOpen(true)}
            className="flex items-center justify-center gap-1.5 sm:gap-2 px-3 py-2.5 bg-indigo-50 dark:bg-indigo-950/40 hover:bg-indigo-100 dark:hover:bg-indigo-900/40 text-indigo-800 dark:text-indigo-300 border border-indigo-200/80 dark:border-indigo-800/60 rounded-xl text-xs font-bold shadow-sm transition-all active:scale-95"
            title="Open Sole Trader Self Assessment Preparation Assistant"
          >
            <Calculator className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-indigo-600 dark:text-indigo-400 shrink-0" />
            <span className="truncate">Self Assessment</span>
          </button>

          {/* Export MTD CSV Button */}
          <button
            onClick={handleExportMtdCsv}
            className="flex items-center justify-center gap-1.5 sm:gap-2 px-3.5 sm:px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-sm transition-all active:scale-95"
            title="Download HMRC Making Tax Digital compliant CSV for your accountant"
          >
            <Download className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
            <span className="truncate">Export MTD CSV</span>
          </button>
        </div>
      </div>

      {/* Footer Disclaimers: Financial Notice & HMRC Compliance */}
      <div className="pt-6 mt-8 border-t border-zinc-200/80 dark:border-zinc-800/80">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {/* Important Financial Notice */}
          <div className="p-3.5 sm:p-4 bg-zinc-50 dark:bg-zinc-900/60 rounded-2xl border border-zinc-200 dark:border-zinc-800/80 flex items-start gap-3">
            <ShieldAlert className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
            <div className="space-y-0.5 text-xs text-zinc-600 dark:text-zinc-400">
              <p className="font-semibold text-zinc-900 dark:text-zinc-200">
                Important Financial Notice
              </p>
              <p className="text-[11px] leading-relaxed">
                TribeTrade is an AI trade assistant and digital bookkeeping tool, not a certified accountant or registered tax adviser. All figures, VAT calculations, expenses, and MTD exports must be reviewed and verified by you or your accountant before submission to HMRC.
              </p>
            </div>
          </div>

          {/* HMRC Compliance Notice */}
          <div className="p-3.5 sm:p-4 bg-zinc-50 dark:bg-zinc-900/60 rounded-2xl border border-zinc-200 dark:border-zinc-800/80 flex items-start gap-3">
            <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
            <div className="space-y-0.5 text-xs text-zinc-600 dark:text-zinc-400">
              <p className="font-semibold text-zinc-900 dark:text-zinc-200">
                HMRC Compliance & Record Keeping
              </p>
              <p className="text-[11px] leading-relaxed">
                Under UK tax legislation (TMA 1970 s12B), sole traders must retain records for at least 5 years and limited companies for 6 years from the 31 January tax return deadline. Tribe Trade processes receipts in volatile memory for privacy and does not permanently store receipt images. You must retain original paper receipts or digital copies for HMRC inspection.
              </p>
            </div>
          </div>
        </div>
      </div>
      </>
      ) : (
        /* Van Mileage Tab Content */
        <div className="space-y-6">
          {/* Top Mileage Metric Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3">
            {/* Total Miles */}
            <div className="p-3 sm:p-4 bg-white dark:bg-zinc-900 rounded-2xl sm:rounded-3xl border border-zinc-200 dark:border-zinc-800 shadow-sm flex items-center justify-between">
              <div className="min-w-0">
                <span className="text-[9px] sm:text-[10px] font-black uppercase tracking-wider text-amber-600 dark:text-amber-400 block truncate">
                  Business Miles
                </span>
                <div className="text-base sm:text-xl font-bold text-zinc-900 dark:text-white mt-0.5 truncate">
                  {totalMiles.toFixed(1)} mi
                </div>
                <p className="text-[10px] sm:text-[11px] text-zinc-500 mt-0.5 truncate">
                  Tax Year {currentYear}/{(currentYear + 1).toString().slice(2)}
                </p>
              </div>
              <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl sm:rounded-2xl bg-amber-50 dark:bg-amber-950/50 flex-shrink-0 flex items-center justify-center text-amber-600 dark:text-amber-400">
                <Truck className="w-4 h-4 sm:w-5 sm:h-5" />
              </div>
            </div>

            {/* Total Tax Deduction Claim */}
            <div className="p-3 sm:p-4 bg-white dark:bg-zinc-900 rounded-2xl sm:rounded-3xl border border-zinc-200 dark:border-zinc-800 shadow-sm flex items-center justify-between">
              <div className="min-w-0">
                <span className="text-[9px] sm:text-[10px] font-black uppercase tracking-wider text-emerald-600 dark:text-emerald-400 block truncate">
                  HMRC Tax Relief
                </span>
                <div className="text-base sm:text-xl font-bold text-emerald-600 dark:text-emerald-400 mt-0.5 truncate">
                  £{totalMileageClaim.toFixed(2)}
                </div>
                <p className="text-[10px] sm:text-[11px] text-zinc-500 mt-0.5 truncate">
                  Allowable deduction
                </p>
              </div>
              <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl sm:rounded-2xl bg-emerald-50 dark:bg-emerald-950/50 flex-shrink-0 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
                <TrendingDown className="w-4 h-4 sm:w-5 sm:h-5" />
              </div>
            </div>

            {/* Total Journeys */}
            <div className="p-3 sm:p-4 bg-white dark:bg-zinc-900 rounded-2xl sm:rounded-3xl border border-zinc-200 dark:border-zinc-800 shadow-sm flex items-center justify-between">
              <div className="min-w-0">
                <span className="text-[9px] sm:text-[10px] font-black uppercase tracking-wider text-zinc-500 block truncate">
                  Journeys Logged
                </span>
                <div className="text-base sm:text-xl font-bold text-zinc-900 dark:text-white mt-0.5 truncate">
                  {currentYearMileage.length} trips
                </div>
                <p className="text-[10px] sm:text-[11px] text-zinc-500 mt-0.5 truncate">
                  Recorded in log
                </p>
              </div>
              <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl sm:rounded-2xl bg-zinc-100 dark:bg-zinc-800 flex-shrink-0 flex items-center justify-center text-zinc-600 dark:text-zinc-300">
                <Calendar className="w-4 h-4 sm:w-5 sm:h-5" />
              </div>
            </div>

            {/* Standard HMRC Rate */}
            <div className="p-3 sm:p-4 bg-white dark:bg-zinc-900 rounded-2xl sm:rounded-3xl border border-zinc-200 dark:border-zinc-800 shadow-sm flex items-center justify-between">
              <div className="min-w-0">
                <span className="text-[9px] sm:text-[10px] font-black uppercase tracking-wider text-zinc-500 block truncate">
                  Approved Rate
                </span>
                <div className="text-base sm:text-xl font-bold text-zinc-900 dark:text-white mt-0.5 truncate">
                  {(HMRC_STANDARD_MILEAGE_RATE * 100).toFixed(0)}p / mile
                </div>
                <p className="text-[10px] sm:text-[11px] text-zinc-500 mt-0.5 truncate">
                  First 10k miles (vans/cars)
                </p>
              </div>
              <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl sm:rounded-2xl bg-zinc-100 dark:bg-zinc-800 flex-shrink-0 flex items-center justify-center text-zinc-600 dark:text-zinc-300">
                <ShieldCheck className="w-4 h-4 sm:w-5 sm:h-5" />
              </div>
            </div>
          </div>

          {/* Action Row */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <button
              onClick={() => setIsMileageLogOpen(true)}
              className="flex items-center gap-2 px-4 py-2.5 bg-amber-600 hover:bg-amber-700 text-white rounded-xl sm:rounded-2xl text-xs font-bold shadow-sm transition-all active:scale-95"
            >
              <Plus className="w-4 h-4" />
              <span>Log New Journey</span>
            </button>

            <button
              onClick={() => {
                if (currentYearMileage.length === 0) {
                  showToast('No mileage entries to export.', 'warning');
                  return;
                }
                generateMileageCsv(currentYearMileage);
                showToast(`Exported ${currentYearMileage.length} mileage records`, 'success');
              }}
              className="flex items-center gap-2 px-4 py-2.5 bg-white dark:bg-zinc-900 hover:bg-zinc-50 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-700/80 rounded-xl sm:rounded-2xl text-xs font-bold shadow-sm transition-all active:scale-95"
            >
              <Download className="w-4 h-4" />
              <span>Export HMRC Mileage CSV</span>
            </button>
          </div>

          {/* Van Mileage Trips Table / List */}
          <div className="bg-white dark:bg-zinc-900 rounded-3xl border border-zinc-200 dark:border-zinc-800 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-zinc-100 dark:border-zinc-800 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-zinc-900 dark:text-white">Tax Year Mileage Records</h3>
                <p className="text-xs text-zinc-500">All business journeys logged for {currentYear}/{(currentYear + 1).toString().slice(2)}</p>
              </div>
              <button
                onClick={() => setIsMileageLogOpen(true)}
                className="text-xs font-bold text-amber-600 hover:text-amber-700 dark:text-amber-400 flex items-center gap-1"
              >
                <span>Full Log & Vehicles</span>
                <span>→</span>
              </button>
            </div>

            {currentYearMileage.length === 0 ? (
              <div className="py-12 px-4 text-center">
                <div className="w-12 h-12 rounded-2xl bg-amber-50 dark:bg-amber-950/40 flex items-center justify-center mx-auto mb-3 text-amber-600 dark:text-amber-400">
                  <Truck className="w-6 h-6" />
                </div>
                <h4 className="text-sm font-bold text-zinc-900 dark:text-white">No mileage recorded yet</h4>
                <p className="text-xs text-zinc-500 max-w-sm mx-auto mt-1 mb-4">
                  Log trade journeys to claim 45p per mile in tax relief against your self-assessment.
                </p>
                <button
                  onClick={() => setIsMileageLogOpen(true)}
                  className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold shadow-sm transition-all"
                >
                  Log Your First Journey
                </button>
              </div>
            ) : (
              <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {currentYearMileage.map((entry) => {
                  const [y, m, d] = (entry.date || '').split('-');
                  const ukDate = y && m && d ? `${d}/${m}/${y}` : entry.date;
                  return (
                    <div key={entry.id} className="p-4 hover:bg-zinc-50/60 dark:hover:bg-zinc-800/40 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-zinc-900 dark:text-white">
                            {entry.destination || entry.purpose || 'Journey'}
                          </span>
                          {entry.vehicleName && (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300 border border-amber-200/60 dark:border-amber-800/40">
                              {entry.vehicleName}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-zinc-500 mt-1">
                          <span className="font-semibold text-zinc-700 dark:text-zinc-300">{ukDate}</span>
                          {entry.startLocation ? ` · ${entry.startLocation} → ${entry.destination}` : ''}
                        </p>
                        {entry.notes && (
                          <p className="text-[11px] text-zinc-400 italic mt-0.5">{entry.notes}</p>
                        )}
                      </div>
                      <div className="flex items-center justify-between sm:justify-end gap-4 shrink-0 pt-2 sm:pt-0 border-t sm:border-0 border-zinc-100 dark:border-zinc-800">
                        <div className="text-left sm:text-right">
                          <p className="text-sm font-black text-zinc-900 dark:text-white">{Number(entry.miles).toFixed(1)} miles</p>
                          <p className="text-xs font-bold text-emerald-600 dark:text-emerald-400">£{Number(entry.totalClaim).toFixed(2)} relief</p>
                        </div>
                        <button
                          onClick={() => setIsMileageLogOpen(true)}
                          className="px-2.5 py-1.5 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded-lg text-xs font-semibold text-zinc-700 dark:text-zinc-300 transition-all"
                        >
                          Edit
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modals */}
      <ReceiptScannerModal
        isOpen={isScannerOpen}
        onClose={() => setIsScannerOpen(false)}
        onExtracted={handleReceiptExtracted}
      />

      {/* Shed Prompt: Add scanned items to The Shed? */}
      {shedPrompt.isOpen && shedPrompt.data && (
        <div className="fixed inset-0 z-[130] flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-zinc-950/60 backdrop-blur-sm"
            onClick={() => handleShedPromptConfirm(false)}
          />
          <div className="relative w-full max-w-sm bg-white dark:bg-zinc-900 rounded-[24px] shadow-2xl border border-zinc-200 dark:border-zinc-800 p-5 space-y-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 flex items-center justify-center text-emerald-600 dark:text-emerald-400 shrink-0">
                <Package className="w-5 h-5" />
              </div>
              <div>
                <p className="text-sm font-black text-zinc-900 dark:text-white">Add to The Shed?</p>
                <p className="text-xs text-zinc-500 mt-0.5">
                  Receipt from <strong className="text-zinc-700 dark:text-zinc-300">{shedPrompt.data.vendor}</strong> scanned.
                  {shedPrompt.data.lineItems && shedPrompt.data.lineItems.length > 0
                    ? ` Add ${shedPrompt.data.lineItems.length} item(s) to your stock inventory?`
                    : ' Add this supplier to your stock inventory?'}
                </p>
              </div>
            </div>
            {shedPrompt.data.lineItems && shedPrompt.data.lineItems.length > 0 && (
              <div className="rounded-xl bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200 dark:border-zinc-700 divide-y divide-zinc-100 dark:divide-zinc-700 max-h-32 overflow-y-auto">
                {shedPrompt.data.lineItems.slice(0, 6).map((li, i) => (
                  <div key={i} className="flex items-center justify-between px-3 py-1.5 text-xs">
                    <span className="text-zinc-700 dark:text-zinc-300 truncate">{li.description}</span>
                    <span className="text-zinc-400 shrink-0 ml-2">×{li.quantity || 1}</span>
                  </div>
                ))}
              </div>
            )}
            <div className="flex gap-2.5 pt-1">
              <button
                onClick={() => handleShedPromptConfirm(false)}
                className="flex-1 py-2.5 bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 rounded-xl text-xs font-bold hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-all"
              >
                No, skip
              </button>
              <button
                onClick={() => handleShedPromptConfirm(true)}
                className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-sm transition-all active:scale-95"
              >
                Yes, add to Shed
              </button>
            </div>
          </div>
        </div>
      )}


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

      <MileageLogModal
        isOpen={isMileageLogOpen}
        onClose={() => setIsMileageLogOpen(false)}
        tradeUserId={activeTradeUserId}
        vehicles={(businessDetails as any)?.vehicles || []}
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
