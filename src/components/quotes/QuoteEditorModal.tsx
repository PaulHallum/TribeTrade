import { useState, useEffect } from 'react';
import { 
  X, 
  Plus, 
  Trash2, 
  Calculator, 
  Save, 
  Eye, 
  Sparkles, 
  Clock, 
  Package, 
  User, 
  MapPin, 
  FileText,
  CreditCard,
  Loader2
} from 'lucide-react';
import { Quote, QuoteItem, BusinessDetails } from '../../types/quote';
import { formatCurrency } from '../../services/quotePdfService';
import { useToast } from '../../contexts/ToastContext';

interface QuoteEditorModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (quoteData: Partial<Quote>) => Promise<string | void>;
  onSaveAndPreview?: (savedQuote: Quote) => void;
  initialQuote?: Partial<Quote> | null;
  businessDetails: BusinessDetails;
  suggestedQuoteNumber?: string;
}

export default function QuoteEditorModal({
  isOpen,
  onClose,
  onSave,
  onSaveAndPreview,
  initialQuote,
  businessDetails,
  suggestedQuoteNumber = 'Q-1001'
}: QuoteEditorModalProps) {
  const { showToast } = useToast();
  const [saving, setSaving] = useState(false);

  // Form State
  const [quoteNumber, setQuoteNumber] = useState(suggestedQuoteNumber);
  const [dateIssued, setDateIssued] = useState(new Date().toISOString().split('T')[0]);
  const [validUntil, setValidUntil] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 30);
    return d.toISOString().split('T')[0];
  });
  const [status, setStatus] = useState<Quote['status']>('draft');

  // Customer State
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [customerAddress, setCustomerAddress] = useState('');

  // Job Scope
  const [jobTitle, setJobTitle] = useState('');
  const [jobDescription, setJobDescription] = useState('');

  // Items State
  const [items, setItems] = useState<QuoteItem[]>([]);

  // Financial Settings
  const [isVatRegistered, setIsVatRegistered] = useState(businessDetails.isVatRegistered || false);
  const [vatRate, setVatRate] = useState(businessDetails.defaultVatRate || 20);
  const [paymentTerms, setPaymentTerms] = useState(businessDetails.defaultPaymentTerms || 'Payment due within 14 days of completion.');
  const [notes, setNotes] = useState(businessDetails.defaultQuoteTerms || 'Quotation valid for 30 days. Materials subject to supplier price changes.');

  // Pre-fill on open or edit
  useEffect(() => {
    if (initialQuote) {
      setQuoteNumber(initialQuote.quoteNumber || suggestedQuoteNumber);
      setDateIssued(initialQuote.dateIssued || new Date().toISOString().split('T')[0]);
      setValidUntil(initialQuote.validUntil || (() => {
        const d = new Date();
        d.setDate(d.getDate() + 30);
        return d.toISOString().split('T')[0];
      })());
      setStatus(initialQuote.status || 'draft');
      setCustomerName(initialQuote.customerName || '');
      setCustomerPhone(initialQuote.customerPhone || '');
      setCustomerEmail(initialQuote.customerEmail || '');
      setCustomerAddress(initialQuote.customerAddress || '');
      setJobTitle(initialQuote.jobTitle || '');
      setJobDescription(initialQuote.jobDescription || '');
      const mappedItems = (initialQuote.items || []).map(it => {
        if (it.type === 'labour') {
          const qty = it.quantity || 1;
          const d = Math.floor(qty);
          const h = Math.round((qty % 1) * 8);
          return { ...it, days: (it as any).days ?? d, hours: (it as any).hours ?? h };
        }
        return it;
      });
      setItems(mappedItems);
      setIsVatRegistered(initialQuote.isVatRegistered ?? (businessDetails.isVatRegistered || false));
      setVatRate(initialQuote.vatRate ?? (businessDetails.defaultVatRate || 20));
      setPaymentTerms(initialQuote.paymentTerms || businessDetails.defaultPaymentTerms || 'Payment due within 14 days of completion.');
      setNotes(initialQuote.notes || businessDetails.defaultQuoteTerms || 'Quotation valid for 30 days.');
    } else {
      // Defaults for brand new quote
      setQuoteNumber(suggestedQuoteNumber);
      setDateIssued(new Date().toISOString().split('T')[0]);
      const d = new Date();
      d.setDate(d.getDate() + 30);
      setValidUntil(d.toISOString().split('T')[0]);
      setStatus('draft');
      setCustomerName('');
      setCustomerPhone('');
      setCustomerEmail('');
      setCustomerAddress('');
      setJobTitle('');
      setJobDescription('');
      setItems([]);
      setIsVatRegistered(businessDetails.isVatRegistered || false);
      setVatRate(businessDetails.defaultVatRate || 20);
      setPaymentTerms(businessDetails.defaultPaymentTerms || 'Payment due within 14 days of completion.');
      setNotes(businessDetails.defaultQuoteTerms || 'Quotation valid for 30 days.');
    }
  }, [initialQuote, suggestedQuoteNumber, businessDetails, isOpen]);

  // Derived Totals
  const subtotalLabour = items
    .filter(it => it.type === 'labour')
    .reduce((sum, it) => sum + (it.total || 0), 0);

  const subtotalMaterials = items
    .filter(it => it.type !== 'labour')
    .reduce((sum, it) => sum + (it.total || 0), 0);

  const netTotal = subtotalLabour + subtotalMaterials;
  const vatAmount = isVatRegistered ? Number(((netTotal * vatRate) / 100).toFixed(2)) : 0;
  const grandTotal = Number((netTotal + vatAmount).toFixed(2));

  // Item helpers
  const handleAddItem = (type: QuoteItem['type'] = 'labour') => {
    const isLabour = type === 'labour';
    const rate = isLabour ? (businessDetails.defaultDayRate || 320) : 0;
    const newItem: QuoteItem & { days?: number; hours?: number } = {
      id: Date.now().toString(),
      description: isLabour ? 'Trade Labour' : '',
      type,
      days: isLabour ? 1 : undefined,
      hours: isLabour ? 0 : undefined,
      quantity: 1,
      unit: isLabour ? '1 day' : 'units',
      unitPrice: rate,
      total: rate
    };
    setItems([...items, newItem]);
  };

  const handleUpdateLabour = (id: string, daysVal: number, hoursVal: number, rateVal?: number) => {
    setItems(items.map(item => {
      if (item.id !== id) return item;
      const days = Math.max(0, daysVal);
      const hours = Math.max(0, hoursVal);
      const rate = rateVal !== undefined ? rateVal : (item.unitPrice || 0);

      // Standard trade calculation: 8-hour day
      const totalDays = Number((days + (hours / 8)).toFixed(3));
      const total = Number((totalDays * rate).toFixed(2));

      let unitLabel = 'days';
      if (days > 0 && hours > 0) {
        unitLabel = `${days}d ${hours}h`;
      } else if (days > 0) {
        unitLabel = days === 1 ? '1 day' : `${days} days`;
      } else if (hours > 0) {
        unitLabel = hours === 1 ? '1 hr' : `${hours} hrs`;
      }

      return {
        ...item,
        days,
        hours,
        quantity: totalDays,
        unit: unitLabel,
        unitPrice: rate,
        total
      };
    }));
  };

  const handleUpdateItem = (id: string, updates: Partial<QuoteItem>) => {
    setItems(items.map(item => {
      if (item.id !== id) return item;
      const updated = { ...item, ...updates };
      const qty = Number(updated.quantity) || 0;
      const rate = Number(updated.unitPrice) || 0;
      updated.total = Number((qty * rate).toFixed(2));
      return updated;
    }));
  };

  const handleDeleteItem = (id: string) => {
    setItems(items.filter(it => it.id !== id));
  };

  const buildPayload = (): Partial<Quote> => {
    return {
      ...(initialQuote?.id ? { id: initialQuote.id } : {}),
      quoteNumber,
      dateIssued,
      validUntil,
      status,
      customerName: customerName.trim() || 'Valued Customer',
      customerPhone: customerPhone.trim(),
      customerEmail: customerEmail.trim(),
      customerAddress: customerAddress.trim(),
      jobTitle: jobTitle.trim() || 'General Works',
      jobDescription: jobDescription.trim(),
      items,
      subtotalLabour,
      subtotalMaterials,
      netTotal,
      isVatRegistered,
      vatRate,
      vatAmount,
      grandTotal,
      paymentTerms,
      notes
    };
  };

  const handleSaveDraft = async () => {
    if (!customerName.trim()) {
      showToast('Please enter customer name', 'warning');
      return;
    }
    setSaving(true);
    try {
      const payload = buildPayload();
      await onSave(payload);
      showToast('Quote saved successfully', 'success');
      onClose();
    } catch (err: any) {
      showToast('Error saving quote: ' + err.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveAndReview = async () => {
    if (!customerName.trim()) {
      showToast('Please enter customer name', 'warning');
      return;
    }
    setSaving(true);
    try {
      const payload = buildPayload();
      const savedId = await onSave(payload);
      const fullQuote: Quote = {
        ...payload,
        id: (savedId as string) || payload.id || 'draft-quote',
        createdAt: initialQuote?.createdAt || new Date().toISOString()
      } as Quote;

      showToast('Quote saved. Opening preview for sharing...', 'success');
      onClose();
      if (onSaveAndPreview) {
        onSaveAndPreview(fullQuote);
      }
    } catch (err: any) {
      showToast('Error saving quote: ' + err.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-zinc-950/70 backdrop-blur-sm overflow-y-auto">
      <div className="relative w-full max-w-4xl bg-white dark:bg-zinc-900 rounded-3xl border border-zinc-200 dark:border-zinc-800 shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header Bar */}
        <div className="px-6 py-4 border-b border-zinc-100 dark:border-zinc-800 flex items-center justify-between shrink-0 bg-zinc-50/50 dark:bg-zinc-800/30">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center font-black">
              <Calculator className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-zinc-900 dark:text-white">
                {initialQuote?.id ? `Edit Quote ${quoteNumber}` : `New Quote (${quoteNumber})`}
              </h2>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                Itemise labour, materials, and consumables before sharing with your customer.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-xl transition-colors text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Form Body */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1 text-zinc-900 dark:text-white">
          {/* Top Row: Reference, Dates, Status */}
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 bg-zinc-50 dark:bg-zinc-800/40 p-4 rounded-2xl border border-zinc-100 dark:border-zinc-800">
            <div>
              <label className="block text-[10px] font-black uppercase tracking-wider text-zinc-400 mb-1">Quote Ref</label>
              <input
                type="text"
                value={quoteNumber}
                onChange={e => setQuoteNumber(e.target.value)}
                className="w-full px-3 py-1.5 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-xl text-xs font-bold text-zinc-900 dark:text-white outline-none focus:ring-2 focus:ring-emerald-500"
                placeholder="e.g. Q-1001"
              />
            </div>
            <div>
              <label className="block text-[10px] font-black uppercase tracking-wider text-zinc-400 mb-1">Date Issued</label>
              <input
                type="date"
                value={dateIssued}
                onChange={e => setDateIssued(e.target.value)}
                className="w-full px-3 py-1.5 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-xl text-xs font-medium text-zinc-900 dark:text-white outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
            <div>
              <label className="block text-[10px] font-black uppercase tracking-wider text-zinc-400 mb-1">Valid Until</label>
              <input
                type="date"
                value={validUntil}
                onChange={e => setValidUntil(e.target.value)}
                className="w-full px-3 py-1.5 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-xl text-xs font-medium text-zinc-900 dark:text-white outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
            <div>
              <label className="block text-[10px] font-black uppercase tracking-wider text-zinc-400 mb-1">Status</label>
              <select
                value={status}
                onChange={e => setStatus(e.target.value as Quote['status'])}
                className="w-full px-3 py-1.5 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-xl text-xs font-bold text-zinc-900 dark:text-white outline-none focus:ring-2 focus:ring-emerald-500"
              >
                <option value="draft">Draft</option>
                <option value="pending">Sent / Pending</option>
                <option value="accepted">Accepted</option>
                <option value="declined">Declined</option>
              </select>
            </div>
          </div>

          {/* Customer Details */}
          <div className="space-y-3">
            <h3 className="text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider flex items-center gap-1.5">
              <User className="w-3.5 h-3.5 text-emerald-500" /> Customer / Client Details
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-[10px] font-semibold text-zinc-500 dark:text-zinc-400 mb-1">Customer Name *</label>
                <input
                  type="text"
                  value={customerName}
                  onChange={e => setCustomerName(e.target.value)}
                  placeholder="e.g. Sarah Jenkins"
                  className="w-full px-3 py-2 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl text-xs font-medium text-zinc-900 dark:text-white outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
              <div>
                <label className="block text-[10px] font-semibold text-zinc-500 dark:text-zinc-400 mb-1">Phone Number</label>
                <input
                  type="tel"
                  value={customerPhone}
                  onChange={e => setCustomerPhone(e.target.value)}
                  placeholder="e.g. 07700 900123"
                  className="w-full px-3 py-2 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl text-xs font-medium text-zinc-900 dark:text-white outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
              <div>
                <label className="block text-[10px] font-semibold text-zinc-500 dark:text-zinc-400 mb-1">Email Address</label>
                <input
                  type="email"
                  value={customerEmail}
                  onChange={e => setCustomerEmail(e.target.value)}
                  placeholder="e.g. sarah@example.co.uk"
                  className="w-full px-3 py-2 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl text-xs font-medium text-zinc-900 dark:text-white outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
            </div>
            <div>
              <label className="block text-[10px] font-semibold text-zinc-500 dark:text-zinc-400 mb-1">Job Site / Client Address</label>
              <input
                type="text"
                value={customerAddress}
                onChange={e => setCustomerAddress(e.target.value)}
                placeholder="e.g. 14 Mayflower Close, Southampton, SO15 2NP"
                className="w-full px-3 py-2 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl text-xs font-medium text-zinc-900 dark:text-white outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
          </div>

          {/* Job Title & Scope */}
          <div className="space-y-3">
            <h3 className="text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider flex items-center gap-1.5">
              <FileText className="w-3.5 h-3.5 text-emerald-500" /> Job Description & Scope of Works
            </h3>
            <div>
              <label className="block text-[10px] font-semibold text-zinc-500 dark:text-zinc-400 mb-1">Job Title</label>
              <input
                type="text"
                value={jobTitle}
                onChange={e => setJobTitle(e.target.value)}
                placeholder="e.g. Full Bathroom Renovation & Tiling, Kitchen Electrical Works..."
                className="w-full px-3 py-2 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl text-xs font-bold text-zinc-900 dark:text-white outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
            <div>
              <label className="block text-[10px] font-semibold text-zinc-500 dark:text-zinc-400 mb-1">Detailed Description of Works</label>
              <textarea
                value={jobDescription}
                onChange={e => setJobDescription(e.target.value)}
                rows={2}
                placeholder="Brief summary of works, site preparation, clean-up, or inclusions..."
                className="w-full px-3 py-2 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl text-xs text-zinc-900 dark:text-white outline-none focus:ring-2 focus:ring-emerald-500 resize-none"
              />
            </div>
          </div>

          {/* Line Items Section */}
          <div className="space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <h3 className="text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider flex items-center gap-1.5">
                <Calculator className="w-3.5 h-3.5 text-emerald-500" /> Itemised Quote (Labour & Materials)
              </h3>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleAddItem('labour')}
                  className="px-3 py-1.5 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-100 rounded-xl text-xs font-bold flex items-center gap-1 border border-emerald-200 dark:border-emerald-800 transition-all"
                >
                  <Clock className="w-3 h-3" /> + Add Labour
                </button>
                <button
                  type="button"
                  onClick={() => handleAddItem('material')}
                  className="px-3 py-1.5 bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-400 hover:bg-blue-100 rounded-xl text-xs font-bold flex items-center gap-1 border border-blue-200 dark:border-blue-800 transition-all"
                >
                  <Package className="w-3 h-3" /> + Add Material / Consumable
                </button>
              </div>
            </div>

            {items.length === 0 ? (
              <div className="p-8 text-center bg-zinc-50 dark:bg-zinc-800/30 rounded-2xl border border-dashed border-zinc-200 dark:border-zinc-800">
                <p className="text-xs text-zinc-400">No items added to this quote yet.</p>
                <div className="flex items-center justify-center gap-2 mt-3">
                  <button
                    type="button"
                    onClick={() => handleAddItem('labour')}
                    className="px-3 py-1.5 bg-emerald-600 text-white rounded-xl text-xs font-bold"
                  >
                    Add Labour Line
                  </button>
                  <button
                    type="button"
                    onClick={() => handleAddItem('material')}
                    className="px-3 py-1.5 bg-zinc-800 dark:bg-zinc-700 text-white rounded-xl text-xs font-bold"
                  >
                    Add Paint / Material Line
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                {items.map((item, index) => (
                  <div 
                    key={item.id} 
                    className="p-3 bg-zinc-50 dark:bg-zinc-800/50 rounded-2xl border border-zinc-100 dark:border-zinc-800 flex flex-wrap sm:flex-nowrap items-center gap-2"
                  >
                    {/* Item Type Badge */}
                    <div className="w-24 shrink-0">
                      <select
                        value={item.type}
                        onChange={e => handleUpdateItem(item.id, { type: e.target.value as QuoteItem['type'] })}
                        className="w-full px-2 py-1.5 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg text-[11px] font-bold text-zinc-700 dark:text-zinc-300"
                      >
                        <option value="labour">Labour</option>
                        <option value="material">Material</option>
                        <option value="hire">Hire/Tool</option>
                        <option value="other">Other</option>
                      </select>
                    </div>

                    {/* Description */}
                    <div className="flex-1 min-w-[180px]">
                      <input
                        type="text"
                        value={item.description}
                        onChange={e => handleUpdateItem(item.id, { description: e.target.value })}
                        placeholder={item.type === 'labour' ? 'Labour description (e.g. 2 coats emulsion walls & ceilings)' : 'Material item (e.g. Dulux Vinyl Matt 10L)'}
                        className="w-full px-3 py-1.5 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg text-xs text-zinc-900 dark:text-white outline-none focus:ring-2 focus:ring-emerald-500"
                      />
                    </div>

                    {/* Duration / Qty & Unit */}
                    {item.type === 'labour' ? (
                      <div className="flex items-center gap-1.5 shrink-0">
                        {/* Days input */}
                        <div className="flex items-center bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg px-2 py-1" title="Days">
                          <input
                            type="number"
                            min="0"
                            step="1"
                            value={(item as any).days ?? Math.floor(item.quantity || 0)}
                            onChange={e => {
                              const d = Math.max(0, parseInt(e.target.value, 10) || 0);
                              const h = (item as any).hours ?? Math.round(((item.quantity || 0) % 1) * 8);
                              handleUpdateLabour(item.id, d, h);
                            }}
                            className="w-8 text-xs font-semibold text-right outline-none bg-transparent text-zinc-900 dark:text-white"
                            placeholder="0"
                          />
                          <span className="text-[10px] text-zinc-400 font-bold ml-1">d</span>
                        </div>
                        {/* Hours input */}
                        <div className="flex items-center bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg px-2 py-1" title="Hours">
                          <input
                            type="number"
                            min="0"
                            max="23"
                            step="0.5"
                            value={(item as any).hours ?? Math.round(((item.quantity || 0) % 1) * 8)}
                            onChange={e => {
                              const h = Math.max(0, parseFloat(e.target.value) || 0);
                              const d = (item as any).days ?? Math.floor(item.quantity || 0);
                              handleUpdateLabour(item.id, d, h);
                            }}
                            className="w-8 text-xs font-semibold text-right outline-none bg-transparent text-zinc-900 dark:text-white"
                            placeholder="0"
                          />
                          <span className="text-[10px] text-zinc-400 font-bold ml-1">h</span>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5 shrink-0">
                        <div className="w-16">
                          <input
                            type="number"
                            min="0"
                            step="any"
                            value={item.quantity}
                            onChange={e => handleUpdateItem(item.id, { quantity: parseFloat(e.target.value) || 0 })}
                            className="w-full px-2 py-1.5 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg text-xs font-semibold text-right outline-none text-zinc-900 dark:text-white"
                            placeholder="Qty"
                          />
                        </div>
                        <div className="w-20">
                          <select
                            value={['units', 'pack', 'bags', 'litres', 'tins', 'metres', 'sq m', 'rolls'].includes(item.unit || '') ? item.unit : 'custom'}
                            onChange={e => {
                              if (e.target.value === 'custom') {
                                handleUpdateItem(item.id, { unit: '' });
                              } else {
                                handleUpdateItem(item.id, { unit: e.target.value });
                              }
                            }}
                            className="w-full px-1.5 py-1.5 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg text-[11px] text-zinc-700 dark:text-zinc-300"
                          >
                            <option value="units">units</option>
                            <option value="pack">pack</option>
                            <option value="bags">bags</option>
                            <option value="litres">litres</option>
                            <option value="tins">tins</option>
                            <option value="metres">metres</option>
                            <option value="sq m">sq m</option>
                            <option value="rolls">rolls</option>
                            <option value="custom">other...</option>
                          </select>
                        </div>
                      </div>
                    )}

                    {/* Unit Price */}
                    <div className="w-24 shrink-0 flex items-center gap-1">
                      <span className="text-xs text-zinc-400">£</span>
                      <input
                        type="number"
                        min="0"
                        step="0.50"
                        value={item.unitPrice}
                        onChange={e => {
                          const newRate = parseFloat(e.target.value) || 0;
                          if (item.type === 'labour') {
                            const d = (item as any).days ?? Math.floor(item.quantity || 0);
                            const h = (item as any).hours ?? Math.round(((item.quantity || 0) % 1) * 8);
                            handleUpdateLabour(item.id, d, h, newRate);
                          } else {
                            handleUpdateItem(item.id, { unitPrice: newRate });
                          }
                        }}
                        className="w-full px-2 py-1.5 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg text-xs font-semibold text-right outline-none text-zinc-900 dark:text-white"
                        placeholder="Rate"
                        title={item.type === 'labour' ? 'Day Rate (£)' : 'Unit Rate (£)'}
                      />
                    </div>

                    {/* Total Line Amount */}
                    <div className="w-24 text-right font-bold text-xs text-zinc-900 dark:text-white shrink-0">
                      {formatCurrency(item.total)}
                    </div>

                    {/* Delete Item */}
                    <button
                      type="button"
                      onClick={() => handleDeleteItem(item.id)}
                      className="p-1.5 text-zinc-400 hover:text-red-500 rounded-lg transition-colors shrink-0"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Financial Calculation Bar */}
          <div className="p-4 bg-zinc-50 dark:bg-zinc-800/40 rounded-2xl border border-zinc-100 dark:border-zinc-800 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            {/* VAT Toggle */}
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={isVatRegistered}
                  onChange={e => setIsVatRegistered(e.target.checked)}
                  className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500"
                />
                <span className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                  Charge VAT ({vatRate}%)
                </span>
              </label>
              {isVatRegistered && (
                <span className="text-[10px] text-zinc-400">
                  ({formatCurrency(vatAmount)})
                </span>
              )}
            </div>

            {/* Subtotals & Total Due */}
            <div className="flex items-center gap-4 text-xs ml-auto flex-wrap">
              <div className="text-zinc-500 dark:text-zinc-400">
                Labour: <span className="font-semibold text-zinc-800 dark:text-zinc-200">{formatCurrency(subtotalLabour)}</span>
              </div>
              <div className="text-zinc-500 dark:text-zinc-400">
                Materials: <span className="font-semibold text-zinc-800 dark:text-zinc-200">{formatCurrency(subtotalMaterials)}</span>
              </div>
              <div className="text-sm font-black text-emerald-600 dark:text-emerald-400 pl-2 border-l border-zinc-200 dark:border-zinc-700">
                Total: <span className="text-base">{formatCurrency(grandTotal)}</span>
              </div>
            </div>
          </div>

          {/* Payment Terms & Notes */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] font-black uppercase tracking-wider text-zinc-400 mb-1">Payment Terms</label>
              <input
                type="text"
                value={paymentTerms}
                onChange={e => setPaymentTerms(e.target.value)}
                placeholder="e.g. Payment due within 14 days of completion"
                className="w-full px-3 py-2 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl text-xs text-zinc-900 dark:text-white outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
            <div>
              <label className="block text-[10px] font-black uppercase tracking-wider text-zinc-400 mb-1">Quote Terms / Validity Notes</label>
              <input
                type="text"
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="e.g. Quote valid for 30 days. Materials subject to availability."
                className="w-full px-3 py-2 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl text-xs text-zinc-900 dark:text-white outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
          </div>
        </div>

        {/* Modal Bottom Controls */}
        <div className="p-4 border-t border-zinc-100 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-800/60 flex items-center justify-between gap-2 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-bold text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 transition-colors"
          >
            Cancel
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleSaveDraft}
              disabled={saving}
              className="px-4 py-2 bg-zinc-200 hover:bg-zinc-300 dark:bg-zinc-700 dark:hover:bg-zinc-600 text-zinc-800 dark:text-zinc-100 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all disabled:opacity-50"
            >
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
              <span>Save Draft</span>
            </button>

            <button
              type="button"
              onClick={handleSaveAndReview}
              disabled={saving}
              className="px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl text-xs font-black uppercase tracking-wider flex items-center gap-1.5 transition-all shadow-md active:scale-95 disabled:opacity-50"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Eye className="w-4 h-4" />}
              <span>Preview & Share</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
