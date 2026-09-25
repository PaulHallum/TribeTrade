import { useState, useEffect } from 'react';
import { 
  FileText, 
  FileSpreadsheet,
  Plus, 
  Search, 
  Share2, 
  Edit3, 
  Trash2, 
  CheckCircle2, 
  Clock, 
  AlertTriangle,
  XCircle, 
  Building, 
  User, 
  MessageCircle, 
  Download,
  Loader2, 
  TrendingUp, 
  CreditCard, 
  SlidersHorizontal, 
  ChevronDown,
  Sparkles,
  ArrowRight
} from 'lucide-react';
import { Quote, Invoice, BusinessDetails, DEFAULT_BUSINESS_DETAILS } from '../../types/quote';
import { 
  subscribeQuotes, 
  subscribeBusinessDetails, 
  saveQuote, 
  deleteQuote, 
  updateQuoteStatus, 
  generateNextQuoteNumber 
} from '../../services/quoteService';
import { 
  subscribeInvoices, 
  saveInvoice, 
  deleteInvoice, 
  updateInvoiceStatus, 
  generateNextInvoiceNumber, 
  convertQuoteToInvoice 
} from '../../services/invoiceService';
import { 
  formatCurrency, 
  shareQuotePDF, 
  shareInvoicePDF 
} from '../../services/quotePdfService';
import QuoteEditorModal from './QuoteEditorModal';
import QuotePreviewModal from './QuotePreviewModal';
import InvoiceEditorModal from './InvoiceEditorModal';
import InvoicePreviewModal from './InvoicePreviewModal';
import QuoteAcceptanceModal from './QuoteAcceptanceModal';
import ConfirmModal from '../common/ConfirmModal';
import PageHeader from '../common/PageHeader';
import { useAuth } from '../../App';
import { useToast } from '../../contexts/ToastContext';

export default function QuotesView() {
  const { user, tradeUserId } = useAuth();
  const { showToast } = useToast();

  const [activeTab, setActiveTab] = useState<'quotes' | 'invoices'>('quotes');

  // Quotes state
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [filterQuoteStatus, setFilterQuoteStatus] = useState<'all' | Quote['status']>('all');

  // Invoices state
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [filterInvoiceStatus, setFilterInvoiceStatus] = useState<'all' | Invoice['status']>('all');

  // Common Business Details
  const [businessDetails, setBusinessDetails] = useState<BusinessDetails>(DEFAULT_BUSINESS_DETAILS);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  // Quote Modals
  const [isQuoteEditorOpen, setIsQuoteEditorOpen] = useState(false);
  const [editingQuote, setEditingQuote] = useState<Quote | null>(null);
  const [isQuotePreviewOpen, setIsQuotePreviewOpen] = useState(false);
  const [previewingQuote, setPreviewingQuote] = useState<Quote | null>(null);

  // Invoice Modals
  const [isInvoiceEditorOpen, setIsInvoiceEditorOpen] = useState(false);
  const [editingInvoice, setEditingInvoice] = useState<Invoice | null>(null);
  const [isInvoicePreviewOpen, setIsInvoicePreviewOpen] = useState(false);
  const [previewingInvoice, setPreviewingInvoice] = useState<Invoice | null>(null);

  // Accepted Quote Smart Convert Modal
  const [isAcceptanceModalOpen, setIsAcceptanceModalOpen] = useState(false);
  const [acceptedQuoteForModal, setAcceptedQuoteForModal] = useState<Quote | null>(null);

  // Delete Confirmation Modal
  const [confirmDeleteConfig, setConfirmDeleteConfig] = useState<{
    isOpen: boolean;
    type: 'quote' | 'invoice';
    id: string;
    number: string;
  }>({
    isOpen: false,
    type: 'quote',
    id: '',
    number: ''
  });

  const activeTradeUserId = tradeUserId || (user ? `trade_${user.uid}` : '');

  // 1. Subscribe to Quotes, Invoices & Business Details
  useEffect(() => {
    if (!activeTradeUserId) {
      setLoading(false);
      return;
    }

    const unsubQuotes = subscribeQuotes(activeTradeUserId, (list) => {
      setQuotes(list);
      setLoading(false);
    });

    const unsubInvoices = subscribeInvoices(activeTradeUserId, (list) => {
      setInvoices(list);
    });

    const unsubBusiness = subscribeBusinessDetails(activeTradeUserId, (details) => {
      setBusinessDetails(details);
    });

    return () => {
      unsubQuotes();
      unsubInvoices();
      unsubBusiness();
    };
  }, [activeTradeUserId]);

  // 2. Listen for custom event from Magic Mic
  useEffect(() => {
    const handleOpenDraftEvent = (e: CustomEvent) => {
      if (e.detail?.quote) {
        setEditingQuote(e.detail.quote);
        setIsQuoteEditorOpen(true);
        setActiveTab('quotes');
      }
    };

    window.addEventListener('tribe_open_quote_draft' as any, handleOpenDraftEvent);
    return () => {
      window.removeEventListener('tribe_open_quote_draft' as any, handleOpenDraftEvent);
    };
  }, []);

  // Filtered lists
  const query = searchQuery.toLowerCase().trim();

  const filteredQuotes = quotes.filter(q => {
    const matchesStatus = filterQuoteStatus === 'all' || q.status === filterQuoteStatus;
    const matchesSearch = !query || 
      q.quoteNumber?.toLowerCase().includes(query) ||
      q.customerName?.toLowerCase().includes(query) ||
      q.jobTitle?.toLowerCase().includes(query) ||
      q.customerAddress?.toLowerCase().includes(query);

    return matchesStatus && matchesSearch;
  });

  const filteredInvoices = invoices.filter(inv => {
    const matchesStatus = filterInvoiceStatus === 'all' || inv.status === filterInvoiceStatus;
    const matchesSearch = !query || 
      inv.invoiceNumber?.toLowerCase().includes(query) ||
      inv.quoteNumber?.toLowerCase().includes(query) ||
      inv.customerName?.toLowerCase().includes(query) ||
      inv.jobTitle?.toLowerCase().includes(query) ||
      inv.customerAddress?.toLowerCase().includes(query);

    return matchesStatus && matchesSearch;
  });

  // Financial Metrics: Quotes
  const totalQuoted = quotes.reduce((acc, q) => acc + (q.grandTotal || 0), 0);
  const acceptedValue = quotes
    .filter(q => q.status === 'accepted')
    .reduce((acc, q) => acc + (q.grandTotal || 0), 0);
  const pendingValue = quotes
    .filter(q => q.status === 'pending')
    .reduce((acc, q) => acc + (q.grandTotal || 0), 0);

  // Financial Metrics: Invoices
  const totalInvoiced = invoices.reduce((acc, i) => acc + (i.grandTotal || 0), 0);
  const paidValue = invoices
    .filter(i => i.status === 'paid')
    .reduce((acc, i) => acc + (i.grandTotal || 0), 0);
  const dueValue = invoices
    .filter(i => i.status !== 'paid')
    .reduce((acc, i) => acc + (i.grandTotal || 0), 0);

  // Quote Actions
  const handleCreateNewQuote = () => {
    setEditingQuote(null);
    setIsQuoteEditorOpen(true);
  };

  const handleEditQuote = (quote: Quote) => {
    setEditingQuote(quote);
    setIsQuotePreviewOpen(false);
    setIsQuoteEditorOpen(true);
  };

  const handlePreviewQuote = (quote: Quote) => {
    setPreviewingQuote(quote);
    setIsQuotePreviewOpen(true);
  };

  const handleSaveQuote = async (data: Partial<Quote>) => {
    if (!activeTradeUserId) return;
    return await saveQuote(activeTradeUserId, data);
  };

  const handleSaveAndPreviewQuote = (savedQuote: Quote) => {
    setPreviewingQuote(savedQuote);
    setIsQuotePreviewOpen(true);
  };

  const handleQuoteStatusChange = async (quoteId: string, newStatus: Quote['status']) => {
    if (!activeTradeUserId) return;
    try {
      await updateQuoteStatus(activeTradeUserId, quoteId, newStatus);
      showToast(`Quote updated to ${newStatus}`, 'success');
      
      const foundQuote = quotes.find(q => q.id === quoteId);
      if (previewingQuote && previewingQuote.id === quoteId) {
        setPreviewingQuote({ ...previewingQuote, status: newStatus });
      }

      // If accepted, immediately prompt the tradesperson with the Smart Convert modal!
      if (newStatus === 'accepted' && foundQuote) {
        setAcceptedQuoteForModal({ ...foundQuote, status: 'accepted' });
        setIsAcceptanceModalOpen(true);
      }
    } catch (err: any) {
      showToast('Status update failed: ' + err.message, 'error');
    }
  };

  const handleQuickShareQuote = async (quote: Quote) => {
    try {
      const res = await shareQuotePDF(quote, businessDetails);
      if (res.shared) {
        showToast('Quote shared successfully', 'success');
        if (quote.status === 'draft') {
          handleQuoteStatusChange(quote.id, 'pending');
        }
      } else if (res.method === 'download') {
        showToast(`Downloaded Quote ${quote.quoteNumber}.pdf`, 'info');
      }
    } catch (err: any) {
      showToast('Share failed: ' + err.message, 'error');
    }
  };

  // Convert Quote to Invoice Action
  const handleConvertToInvoice = async (quote: Quote) => {
    if (!activeTradeUserId) return;
    try {
      const newInvoice = await convertQuoteToInvoice(activeTradeUserId, quote, invoices, businessDetails.highestInvoiceNumber);
      showToast(`Converted quote ${quote.quoteNumber} to Invoice ${newInvoice.invoiceNumber}`, 'success');
      setActiveTab('invoices');
      setPreviewingInvoice(newInvoice);
      setIsInvoicePreviewOpen(true);
    } catch (err: any) {
      showToast('Failed to convert quote to invoice: ' + err.message, 'error');
    }
  };

  // Invoice Actions
  const handleCreateNewInvoice = () => {
    setEditingInvoice(null);
    setIsInvoiceEditorOpen(true);
  };

  const handleEditInvoice = (invoice: Invoice) => {
    setEditingInvoice(invoice);
    setIsInvoicePreviewOpen(false);
    setIsInvoiceEditorOpen(true);
  };

  const handlePreviewInvoice = (invoice: Invoice) => {
    setPreviewingInvoice(invoice);
    setIsInvoicePreviewOpen(true);
  };

  const handleSaveInvoice = async (data: Partial<Invoice>) => {
    if (!activeTradeUserId) return;
    return await saveInvoice(activeTradeUserId, data);
  };

  const handleSaveAndPreviewInvoice = (savedInvoice: Invoice) => {
    setPreviewingInvoice(savedInvoice);
    setIsInvoicePreviewOpen(true);
  };

  const handleInvoiceStatusChange = async (invoiceId: string, newStatus: Invoice['status']) => {
    if (!activeTradeUserId) return;
    try {
      await updateInvoiceStatus(activeTradeUserId, invoiceId, newStatus);
      showToast(`Invoice updated to ${newStatus}`, 'success');
      if (previewingInvoice && previewingInvoice.id === invoiceId) {
        setPreviewingInvoice({ ...previewingInvoice, status: newStatus });
      }
    } catch (err: any) {
      showToast('Status update failed: ' + err.message, 'error');
    }
  };

  const handleQuickShareInvoice = async (invoice: Invoice) => {
    try {
      const res = await shareInvoicePDF(invoice, businessDetails);
      if (res.shared) {
        showToast('Invoice shared successfully', 'success');
        if (invoice.status === 'draft') {
          handleInvoiceStatusChange(invoice.id, 'sent');
        }
      } else if (res.method === 'download') {
        showToast(`Downloaded Invoice ${invoice.invoiceNumber}.pdf`, 'info');
      }
    } catch (err: any) {
      showToast('Share failed: ' + err.message, 'error');
    }
  };

  // Delete Action (Both Quotes and Invoices)
  const handleDeleteConfirm = async () => {
    if (!activeTradeUserId || !confirmDeleteConfig.id) return;
    try {
      if (confirmDeleteConfig.type === 'quote') {
        await deleteQuote(activeTradeUserId, confirmDeleteConfig.id);
        showToast(`Deleted quote ${confirmDeleteConfig.number}`, 'info');
      } else {
        await deleteInvoice(activeTradeUserId, confirmDeleteConfig.id);
        showToast(`Deleted invoice ${confirmDeleteConfig.number}`, 'info');
      }
    } catch (err: any) {
      showToast(`Failed to delete: ${err.message}`, 'error');
    } finally {
      setConfirmDeleteConfig({ isOpen: false, type: 'quote', id: '', number: '' });
    }
  };

  return (
    <div className="max-w-7xl mx-auto pb-32 px-2 sm:px-4 space-y-4 sm:space-y-6">
      {/* Page Header with Segmented Toggle for Quotes & Invoices */}
      <PageHeader
        icon={activeTab === 'quotes' ? FileText : FileSpreadsheet}
        title={activeTab === 'quotes' ? 'Quotes' : 'Invoices'}
        subtitle={activeTab === 'quotes' ? 'Itemised trade quotations & client estimates' : 'Billed trade invoices & client payment tracking'}
        extra={
          <div className="bg-gradient-to-r from-emerald-500/10 to-blue-500/10 border border-emerald-500/20 dark:border-emerald-400/10 p-1 rounded-2xl flex gap-1 shadow-sm">
            <button 
              onClick={() => setActiveTab('quotes')}
              className={`px-3 sm:px-4 py-1.5 rounded-xl text-xs font-bold transition-all ${
                activeTab === 'quotes' 
                  ? 'bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white shadow-sm' 
                  : 'text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200'
              }`}
            >
              Quotes
            </button>
            <button 
              onClick={() => setActiveTab('invoices')}
              className={`px-3 sm:px-4 py-1.5 rounded-xl text-xs font-bold transition-all ${
                activeTab === 'invoices' 
                  ? 'bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white shadow-sm' 
                  : 'text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200'
              }`}
            >
              Invoices
            </button>
          </div>
        }
      />

      {/* Top Financial Metric Cards - Compact on mobile */}
      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        {/* Metric 1 */}
        <div className="p-2.5 sm:p-4 bg-white dark:bg-zinc-900 rounded-2xl sm:rounded-3xl border border-zinc-200 dark:border-zinc-800 shadow-sm flex items-center justify-between">
          <div className="min-w-0">
            <span className="text-[9px] sm:text-[10px] font-black uppercase tracking-wider text-zinc-400 block truncate">
              <span className="sm:hidden">{activeTab === 'quotes' ? 'Quoted' : 'Invoiced'}</span>
              <span className="hidden sm:inline">{activeTab === 'quotes' ? 'Total Quoted' : 'Total Invoiced'}</span>
            </span>
            <div className="text-xs sm:text-xl font-bold text-zinc-900 dark:text-white mt-0.5 truncate">
              {formatCurrency(activeTab === 'quotes' ? totalQuoted : totalInvoiced)}
            </div>
            <p className="text-[10px] sm:text-[11px] text-zinc-500 mt-0.5 truncate">
              {activeTab === 'quotes' ? `${quotes.length} total quotes` : `${invoices.length} invoices`}
            </p>
          </div>
          <div className="hidden sm:flex w-10 h-10 rounded-2xl bg-zinc-100 dark:bg-zinc-800 items-center justify-center text-zinc-600 dark:text-zinc-300 shrink-0">
            <TrendingUp className="w-5 h-5" />
          </div>
        </div>

        {/* Metric 2 */}
        <div className="p-2.5 sm:p-4 bg-white dark:bg-zinc-900 rounded-2xl sm:rounded-3xl border border-zinc-200 dark:border-zinc-800 shadow-sm flex items-center justify-between">
          <div className="min-w-0">
            <span className="text-[9px] sm:text-[10px] font-black uppercase tracking-wider text-emerald-600 dark:text-emerald-400 block truncate">
              <span className="sm:hidden">{activeTab === 'quotes' ? 'Won' : 'Paid'}</span>
              <span className="hidden sm:inline">{activeTab === 'quotes' ? 'Won / Accepted' : 'Paid Invoices'}</span>
            </span>
            <div className="text-xs sm:text-xl font-bold text-emerald-600 dark:text-emerald-400 mt-0.5 truncate">
              {formatCurrency(activeTab === 'quotes' ? acceptedValue : paidValue)}
            </div>
            <p className="text-[10px] sm:text-[11px] text-zinc-500 mt-0.5 truncate">
              {activeTab === 'quotes' 
                ? `${quotes.filter(q => q.status === 'accepted').length} accepted`
                : `${invoices.filter(i => i.status === 'paid').length} paid`}
            </p>
          </div>
          <div className="hidden sm:flex w-10 h-10 rounded-2xl bg-emerald-50 dark:bg-emerald-950/50 items-center justify-center text-emerald-600 dark:text-emerald-400 shrink-0">
            <CheckCircle2 className="w-5 h-5" />
          </div>
        </div>

        {/* Metric 3 */}
        <div className="p-2.5 sm:p-4 bg-white dark:bg-zinc-900 rounded-2xl sm:rounded-3xl border border-zinc-200 dark:border-zinc-800 shadow-sm flex items-center justify-between">
          <div className="min-w-0">
            <span className="text-[9px] sm:text-[10px] font-black uppercase tracking-wider text-amber-600 dark:text-amber-400 block truncate">
              <span className="sm:hidden">{activeTab === 'quotes' ? 'Pending' : 'Due'}</span>
              <span className="hidden sm:inline">{activeTab === 'quotes' ? 'Awaiting Decision' : 'Outstanding'}</span>
            </span>
            <div className="text-xs sm:text-xl font-bold text-amber-600 dark:text-amber-400 mt-0.5 truncate">
              {formatCurrency(activeTab === 'quotes' ? pendingValue : dueValue)}
            </div>
            <p className="text-[10px] sm:text-[11px] text-zinc-500 mt-0.5 truncate">
              {activeTab === 'quotes'
                ? `${quotes.filter(q => q.status === 'pending').length} pending`
                : `${invoices.filter(i => i.status !== 'paid').length} unpaid`}
            </p>
          </div>
          <div className="hidden sm:flex w-10 h-10 rounded-2xl bg-amber-50 dark:bg-amber-950/50 items-center justify-center text-amber-600 dark:text-amber-400 shrink-0">
            <Clock className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* Controls: Search, Status Filter Pills & New Document Action */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 bg-white dark:bg-zinc-900 p-2.5 sm:p-3 rounded-2xl border border-zinc-200 dark:border-zinc-800">
        {/* Search */}
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder={activeTab === 'quotes' ? "Search quotes by customer, ref, or job..." : "Search invoices by customer, inv number, or job..."}
            className="w-full pl-9 pr-4 py-1.5 sm:py-2 bg-zinc-50 dark:bg-zinc-800 border-none rounded-xl text-xs text-zinc-900 dark:text-white outline-none focus:ring-2 focus:ring-emerald-500"
          />
        </div>

        {/* Status Filter Tabs - Compact on mobile */}
        <div className="flex items-center gap-1 overflow-x-auto no-scrollbar py-0.5">
          {activeTab === 'quotes' ? (
            (['all', 'draft', 'pending', 'accepted', 'declined'] as const).map(tab => (
              <button
                key={tab}
                onClick={() => setFilterQuoteStatus(tab)}
                className={`px-2.5 py-1 sm:px-3 sm:py-1.5 rounded-lg sm:rounded-xl text-[11px] sm:text-xs font-bold whitespace-nowrap transition-all capitalize ${
                  filterQuoteStatus === tab
                    ? 'bg-emerald-500 text-white shadow-sm'
                    : 'text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800'
                }`}
              >
                {tab === 'pending' ? 'Pending' : tab}
              </button>
            ))
          ) : (
            (['all', 'draft', 'sent', 'paid', 'overdue'] as const).map(tab => (
              <button
                key={tab}
                onClick={() => setFilterInvoiceStatus(tab)}
                className={`px-2.5 py-1 sm:px-3 sm:py-1.5 rounded-lg sm:rounded-xl text-[11px] sm:text-xs font-bold whitespace-nowrap transition-all capitalize ${
                  filterInvoiceStatus === tab
                    ? 'bg-emerald-500 text-white shadow-sm'
                    : 'text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800'
                }`}
              >
                {tab}
              </button>
            ))
          )}
        </div>

        {/* New Item Button */}
        <button
          onClick={activeTab === 'quotes' ? handleCreateNewQuote : handleCreateNewInvoice}
          className="px-3.5 py-1.5 sm:py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black uppercase tracking-wider flex items-center justify-center gap-1.5 transition-all shadow-md active:scale-95 shrink-0"
        >
          <Plus className="w-4 h-4" />
          <span>{activeTab === 'quotes' ? 'New Quote' : 'New Invoice'}</span>
        </button>
      </div>

      {/* Main List: Quotes or Invoices */}
      {loading ? (
        <div className="py-20 flex flex-col items-center justify-center gap-3 text-zinc-400">
          <Loader2 className="w-8 h-8 animate-spin text-emerald-500" />
          <p className="text-xs">Loading {activeTab}...</p>
        </div>
      ) : activeTab === 'quotes' ? (
        /* QUOTES LIST */
        filteredQuotes.length === 0 ? (
          <div className="py-16 text-center bg-white dark:bg-zinc-900 rounded-3xl border border-dashed border-zinc-200 dark:border-zinc-800 p-6 space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-zinc-100 dark:bg-zinc-800 text-zinc-400 mx-auto flex items-center justify-center">
              <FileText className="w-6 h-6" />
            </div>
            <h3 className="text-sm font-bold text-zinc-800 dark:text-zinc-200">No quotes found</h3>
            <p className="text-xs text-zinc-500 max-w-sm mx-auto">
              {searchQuery || filterQuoteStatus !== 'all' 
                ? 'No quotations match your current search or filter criteria.' 
                : 'Create your first trade quote or dictate one with the Magic Mic!'}
            </p>
            <button
              onClick={handleCreateNewQuote}
              className="px-4 py-2 bg-emerald-600 text-white rounded-xl text-xs font-bold inline-flex items-center gap-1.5 mt-2"
            >
              <Plus className="w-4 h-4" /> Create Quote
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5 sm:gap-3">
            {filteredQuotes.map(quote => {
              const isAccepted = quote.status === 'accepted';
              const isPending = quote.status === 'pending';
              const isDeclined = quote.status === 'declined';

              return (
                <div
                  key={quote.id}
                  className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 p-3 sm:p-3.5 shadow-sm hover:shadow-md transition-all flex flex-col justify-between gap-2.5"
                >
                  {/* Top Row: Left details (Customer & Job), Right details (Total & Status) */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 mb-0.5">
                        <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400 tracking-wider shrink-0">
                          {quote.quoteNumber}
                        </span>
                        {quote.invoiceId && (
                          <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 shrink-0">
                            Invoiced
                          </span>
                        )}
                        <h4 className="text-xs sm:text-sm font-bold text-zinc-900 dark:text-white truncate">
                          {quote.customerName}
                        </h4>
                      </div>

                      <p className="text-[11px] font-medium text-zinc-600 dark:text-zinc-300 truncate">
                        {quote.jobTitle}
                      </p>

                      {quote.customerAddress && (
                        <p className="text-[10px] text-zinc-400 truncate mt-0.5">
                          {quote.customerAddress}
                        </p>
                      )}
                    </div>

                    {/* Right side: Total and Status dropdown */}
                    <div className="text-right shrink-0 space-y-1">
                      <div className="text-xs sm:text-sm font-black text-zinc-900 dark:text-white">
                        {formatCurrency(quote.grandTotal)}
                      </div>

                      <div className="relative inline-block">
                        <select
                          value={quote.status}
                          onChange={e => handleQuoteStatusChange(quote.id, e.target.value as Quote['status'])}
                          className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full border outline-none cursor-pointer appearance-none pr-4 capitalize ${
                            isAccepted
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-400 dark:border-emerald-800'
                              : isPending
                              ? 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/60 dark:text-amber-400 dark:border-amber-800'
                              : isDeclined
                              ? 'bg-red-50 text-red-700 border-red-200 dark:bg-red-950/60 dark:text-red-400 dark:border-red-800'
                              : 'bg-zinc-100 text-zinc-700 border-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:border-zinc-700'
                          }`}
                        >
                          <option value="draft">Draft</option>
                          <option value="pending">Pending</option>
                          <option value="accepted">Accepted</option>
                          <option value="declined">Declined</option>
                        </select>
                        <ChevronDown className="w-2.5 h-2.5 absolute right-1 top-1/2 -translate-y-1/2 pointer-events-none text-zinc-400" />
                      </div>
                    </div>
                  </div>

                  {/* Bottom Row: Metadata Left & Action Buttons Right */}
                  <div className="pt-2 border-t border-zinc-100 dark:border-zinc-800 flex items-center justify-between gap-1.5">
                    <div className="flex items-center gap-1.5 text-[10px] text-zinc-400">
                      <span>{quote.dateIssued}</span>
                      <span>•</span>
                      <span>{quote.items?.length || 0} item{(quote.items?.length || 0) === 1 ? '' : 's'}</span>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      {/* Accepted Smart Convert button */}
                      {isAccepted && (
                        <button
                          onClick={() => {
                            setAcceptedQuoteForModal(quote);
                            setIsAcceptanceModalOpen(true);
                          }}
                          className="px-2 py-1 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 text-white rounded-lg text-[10px] font-bold flex items-center gap-1 shadow-sm active:scale-95 transition-all"
                          title="Smart Convert: Book Calendar, Check Shed Stock & Convert to Invoice"
                        >
                          <Sparkles className="w-3 h-3" />
                          <span>Smart Convert</span>
                        </button>
                      )}

                      <button
                        onClick={() => handlePreviewQuote(quote)}
                        className="p-1.5 bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-200 rounded-lg transition-all"
                        title="Preview Quote PDF"
                      >
                        <FileText className="w-3.5 h-3.5" />
                      </button>

                      <button
                        onClick={() => handleQuickShareQuote(quote)}
                        className="p-1.5 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg transition-all shadow-sm active:scale-95"
                        title="Share Quote PDF"
                      >
                        <Share2 className="w-3.5 h-3.5" />
                      </button>

                      <button
                        onClick={() => handleEditQuote(quote)}
                        className="p-1.5 bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-200 rounded-lg transition-all"
                        title="Edit Quote"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>

                      <button
                        onClick={() => setConfirmDeleteConfig({
                          isOpen: true,
                          type: 'quote',
                          id: quote.id,
                          number: quote.quoteNumber
                        })}
                        className="p-1.5 bg-red-50 hover:bg-red-100 dark:bg-red-950/40 dark:hover:bg-red-900/50 text-red-600 dark:text-red-400 border border-red-200/60 dark:border-red-900/40 rounded-lg transition-all active:scale-95"
                        title="Delete Quote"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )
      ) : (
        /* INVOICES LIST */
        filteredInvoices.length === 0 ? (
          <div className="py-16 text-center bg-white dark:bg-zinc-900 rounded-3xl border border-dashed border-zinc-200 dark:border-zinc-800 p-6 space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-zinc-100 dark:bg-zinc-800 text-zinc-400 mx-auto flex items-center justify-center">
              <FileSpreadsheet className="w-6 h-6" />
            </div>
            <h3 className="text-sm font-bold text-zinc-800 dark:text-zinc-200">No invoices found</h3>
            <p className="text-xs text-zinc-500 max-w-sm mx-auto">
              {searchQuery || filterInvoiceStatus !== 'all' 
                ? 'No invoices match your current search or filter criteria.' 
                : 'Convert an accepted quote or create your first trade invoice!'}
            </p>
            <button
              onClick={handleCreateNewInvoice}
              className="px-4 py-2 bg-emerald-600 text-white rounded-xl text-xs font-bold inline-flex items-center gap-1.5 mt-2"
            >
              <Plus className="w-4 h-4" /> Create Invoice
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5 sm:gap-3">
            {filteredInvoices.map(invoice => {
              const isPaid = invoice.status === 'paid';
              const isSent = invoice.status === 'sent';
              const isOverdue = invoice.status === 'overdue';

              return (
                <div
                  key={invoice.id}
                  className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 p-3 sm:p-3.5 shadow-sm hover:shadow-md transition-all flex flex-col justify-between gap-2.5"
                >
                  {/* Top Row: Left details, Right details */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 mb-0.5">
                        <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400 tracking-wider shrink-0">
                          {invoice.invoiceNumber}
                        </span>
                        {invoice.quoteNumber && (
                          <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-500 shrink-0">
                            Quote {invoice.quoteNumber}
                          </span>
                        )}
                        <h4 className="text-xs sm:text-sm font-bold text-zinc-900 dark:text-white truncate">
                          {invoice.customerName}
                        </h4>
                      </div>

                      <p className="text-[11px] font-medium text-zinc-600 dark:text-zinc-300 truncate">
                        {invoice.jobTitle}
                      </p>

                      {invoice.customerAddress && (
                        <p className="text-[10px] text-zinc-400 truncate mt-0.5">
                          {invoice.customerAddress}
                        </p>
                      )}
                    </div>

                    {/* Right side: Total and Status dropdown */}
                    <div className="text-right shrink-0 space-y-1">
                      <div className="text-xs sm:text-sm font-black text-zinc-900 dark:text-white">
                        {formatCurrency(invoice.grandTotal)}
                      </div>

                      <div className="relative inline-block">
                        <select
                          value={invoice.status}
                          onChange={e => handleInvoiceStatusChange(invoice.id, e.target.value as Invoice['status'])}
                          className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full border outline-none cursor-pointer appearance-none pr-4 capitalize ${
                            isPaid
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-400 dark:border-emerald-800'
                              : isSent
                              ? 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/60 dark:text-blue-400 dark:border-blue-800'
                              : isOverdue
                              ? 'bg-red-50 text-red-700 border-red-200 dark:bg-red-950/60 dark:text-red-400 dark:border-red-800'
                              : 'bg-zinc-100 text-zinc-700 border-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:border-zinc-700'
                          }`}
                        >
                          <option value="draft">Draft</option>
                          <option value="sent">Sent</option>
                          <option value="paid">Paid</option>
                          <option value="overdue">Overdue</option>
                        </select>
                        <ChevronDown className="w-2.5 h-2.5 absolute right-1 top-1/2 -translate-y-1/2 pointer-events-none text-zinc-400" />
                      </div>
                    </div>
                  </div>

                  {/* Bottom Row: Metadata & Actions */}
                  <div className="pt-2 border-t border-zinc-100 dark:border-zinc-800 flex items-center justify-between gap-1.5">
                    <div className="flex items-center gap-1.5 text-[10px] text-zinc-400">
                      <span>{invoice.dateIssued}</span>
                      <span>•</span>
                      <span className={isOverdue ? 'text-red-500 font-bold' : ''}>Due: {invoice.dueDate}</span>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={() => handlePreviewInvoice(invoice)}
                        className="p-1.5 bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-200 rounded-lg transition-all"
                        title="Preview Invoice PDF"
                      >
                        <FileSpreadsheet className="w-3.5 h-3.5" />
                      </button>

                      <button
                        onClick={() => handleQuickShareInvoice(invoice)}
                        className="p-1.5 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg transition-all shadow-sm active:scale-95"
                        title="Share Invoice PDF"
                      >
                        <Share2 className="w-3.5 h-3.5" />
                      </button>

                      <button
                        onClick={() => handleEditInvoice(invoice)}
                        className="p-1.5 bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-200 rounded-lg transition-all"
                        title="Edit Invoice"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>

                      <button
                        onClick={() => setConfirmDeleteConfig({
                          isOpen: true,
                          type: 'invoice',
                          id: invoice.id,
                          number: invoice.invoiceNumber
                        })}
                        className="p-1.5 bg-red-50 hover:bg-red-100 dark:bg-red-950/40 dark:hover:bg-red-900/50 text-red-600 dark:text-red-400 border border-red-200/60 dark:border-red-900/40 rounded-lg transition-all active:scale-95"
                        title="Delete Invoice"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )
      )}

      {/* Quote Editor Modal */}
      <QuoteEditorModal
        isOpen={isQuoteEditorOpen}
        onClose={() => {
          setIsQuoteEditorOpen(false);
          setEditingQuote(null);
        }}
        onSave={handleSaveQuote}
        onSaveAndPreview={handleSaveAndPreviewQuote}
        initialQuote={editingQuote}
        businessDetails={businessDetails}
        suggestedQuoteNumber={generateNextQuoteNumber(quotes, businessDetails.highestQuoteNumber)}
      />

      {/* Quote Preview Modal */}
      <QuotePreviewModal
        isOpen={isQuotePreviewOpen}
        onClose={() => {
          setIsQuotePreviewOpen(false);
          setPreviewingQuote(null);
        }}
        quote={previewingQuote}
        businessDetails={businessDetails}
        onEdit={handleEditQuote}
        onStatusChange={handleQuoteStatusChange}
        onOpenAcceptanceModal={(q) => {
          setIsQuotePreviewOpen(false);
          setAcceptedQuoteForModal(q);
          setIsAcceptanceModalOpen(true);
        }}
      />

      {/* Invoice Editor Modal */}
      <InvoiceEditorModal
        isOpen={isInvoiceEditorOpen}
        onClose={() => {
          setIsInvoiceEditorOpen(false);
          setEditingInvoice(null);
        }}
        onSave={handleSaveInvoice}
        onSaveAndPreview={handleSaveAndPreviewInvoice}
        initialInvoice={editingInvoice}
        businessDetails={businessDetails}
        suggestedInvoiceNumber={generateNextInvoiceNumber(invoices, businessDetails.highestInvoiceNumber)}
      />

      {/* Invoice Preview Modal */}
      <InvoicePreviewModal
        isOpen={isInvoicePreviewOpen}
        onClose={() => {
          setIsInvoicePreviewOpen(false);
          setPreviewingInvoice(null);
        }}
        invoice={previewingInvoice}
        businessDetails={businessDetails}
        onEdit={handleEditInvoice}
        onStatusChange={handleInvoiceStatusChange}
      />

      {/* Quote Acceptance Smart Convert Modal */}
      <QuoteAcceptanceModal
        isOpen={isAcceptanceModalOpen}
        onClose={() => {
          setIsAcceptanceModalOpen(false);
          setAcceptedQuoteForModal(null);
        }}
        quote={acceptedQuoteForModal}
        businessDetails={businessDetails}
        existingInvoices={invoices}
        onInvoiceCreated={(newInv) => {
          setActiveTab('invoices');
          setPreviewingInvoice(newInv);
          setIsInvoicePreviewOpen(true);
        }}
      />

      {/* Confirm Delete Modal */}
      <ConfirmModal
        isOpen={confirmDeleteConfig.isOpen}
        title={confirmDeleteConfig.type === 'quote' ? 'Delete Quote' : 'Delete Invoice'}
        message={`Are you sure you want to delete ${confirmDeleteConfig.type === 'quote' ? 'quotation' : 'invoice'} ${confirmDeleteConfig.number}? This cannot be undone.`}
        confirmLabel="Delete"
        variant="danger"
        onConfirm={handleDeleteConfirm}
        onClose={() => setConfirmDeleteConfig({ isOpen: false, type: 'quote', id: '', number: '' })}
      />
    </div>
  );
}
