import { useState, useEffect } from 'react';
import { 
  X, 
  Plus, 
  Trash2, 
  Calculator, 
  Save, 
  Eye, 
  FileSpreadsheet,
  Sparkles, 
  Clock, 
  Package, 
  User, 
  MapPin, 
  FileText,
  CreditCard,
  Loader2
} from 'lucide-react';
import { Invoice, QuoteItem, BusinessDetails } from '../../types/quote';
import { formatCurrency } from '../../services/quotePdfService';
import { useToast } from '../../contexts/ToastContext';

interface InvoiceEditorModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (invoiceData: Partial<Invoice>) => Promise<string | void>;
  onSaveAndPreview?: (savedInvoice: Invoice) => void;
  initialInvoice?: Partial<Invoice> | null;
  businessDetails: BusinessDetails;
  suggestedInvoiceNumber?: string;
}

export default function InvoiceEditorModal({
  isOpen,
  onClose,
  onSave,
  onSaveAndPreview,
  initialInvoice,
  businessDetails,
  suggestedInvoiceNumber = 'INV-1001'
}: InvoiceEditorModalProps) {
  const { showToast } = useToast();
  const [saving, setSaving] = useState(false);

  // Form State
  const [invoiceNumber, setInvoiceNumber] = useState(suggestedInvoiceNumber);
  const [dateIssued, setDateIssued] = useState(new Date().toISOString().split('T')[0]);
  const [dueDate, setDueDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 14);
    return d.toISOString().split('T')[0];
  });
  const [status, setStatus] = useState<Invoice['status']>('draft');

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
  const [paymentTerms, setPaymentTerms] = useState(businessDetails.defaultPaymentTerms || 'Payment due within 14 days of invoice date.');
  const [notes, setNotes] = useState('');

  // Quick line item draft
  const [newItemDesc, setNewItemDesc] = useState('');
  const [newItemType, setNewItemType] = useState<QuoteItem['type']>('labour');
  const [newItemQty, setNewItemQty] = useState<number | string>(1);
  const [newItemUnit, setNewItemUnit] = useState('hours');
  const [newItemRate, setNewItemRate] = useState<number | string>(businessDetails.defaultHourlyRate || 45);

  useEffect(() => {
    if (initialInvoice) {
      setInvoiceNumber(initialInvoice.invoiceNumber || suggestedInvoiceNumber);
      setDateIssued(initialInvoice.dateIssued || new Date().toISOString().split('T')[0]);
      setDueDate(initialInvoice.dueDate || (() => {
        const d = new Date();
        d.setDate(d.getDate() + 14);
        return d.toISOString().split('T')[0];
      })());
      setStatus(initialInvoice.status || 'draft');
      setCustomerName(initialInvoice.customerName || '');
      setCustomerPhone(initialInvoice.customerPhone || '');
      setCustomerEmail(initialInvoice.customerEmail || '');
      setCustomerAddress(initialInvoice.customerAddress || '');
      setJobTitle(initialInvoice.jobTitle || '');
      setJobDescription(initialInvoice.jobDescription || '');
      setItems(initialInvoice.items || []);
      setIsVatRegistered(initialInvoice.isVatRegistered ?? (businessDetails.isVatRegistered || false));
      setVatRate(initialInvoice.vatRate ?? (businessDetails.defaultVatRate || 20));
      setPaymentTerms(initialInvoice.paymentTerms || businessDetails.defaultPaymentTerms || 'Payment due within 14 days of invoice date.');
      setNotes(initialInvoice.notes || '');
    } else {
      setInvoiceNumber(suggestedInvoiceNumber);
      setDateIssued(new Date().toISOString().split('T')[0]);
      const d = new Date();
      d.setDate(d.getDate() + 14);
      setDueDate(d.toISOString().split('T')[0]);
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
      setPaymentTerms(businessDetails.defaultPaymentTerms || 'Payment due within 14 days of invoice date.');
      setNotes('');
    }
  }, [initialInvoice, suggestedInvoiceNumber, businessDetails, isOpen]);

  if (!isOpen) return null;

  // Subtotals
  const subtotalLabour = items
    .filter(i => i.type === 'labour')
    .reduce((acc, i) => acc + (i.total || 0), 0);

  const subtotalMaterials = items
    .filter(i => i.type !== 'labour')
    .reduce((acc, i) => acc + (i.total || 0), 0);

  const netTotal = subtotalLabour + subtotalMaterials;
  const vatAmount = isVatRegistered ? (netTotal * (vatRate / 100)) : 0;
  const grandTotal = netTotal + vatAmount;

  const handleAddItem = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newItemDesc.trim()) return;

    const qty = parseFloat(String(newItemQty)) || 1;
    const rate = parseFloat(String(newItemRate)) || 0;
    const total = qty * rate;

    const item: QuoteItem = {
      id: 'item_' + Date.now(),
      description: newItemDesc.trim(),
      type: newItemType,
      quantity: qty,
      unit: newItemUnit,
      unitPrice: rate,
      total
    };

    setItems([...items, item]);
    setNewItemDesc('');
    setNewItemQty(1);
    setNewItemRate(newItemType === 'labour' ? (businessDetails.defaultHourlyRate || 45) : 0);
  };

  const handleRemoveItem = (id: string) => {
    setItems(items.filter(i => i.id !== id));
  };

  const handleSave = async (andPreview = false) => {
    if (!customerName.trim()) {
      showToast('Please enter a customer name', 'error');
      return;
    }
    if (!jobTitle.trim()) {
      showToast('Please enter a job title', 'error');
      return;
    }

    setSaving(true);
    try {
      const invoiceData: Partial<Invoice> = {
        invoiceNumber,
        dateIssued,
        dueDate,
        status,
        customerName: customerName.trim(),
        customerPhone: customerPhone.trim(),
        customerEmail: customerEmail.trim(),
        customerAddress: customerAddress.trim(),
        jobTitle: jobTitle.trim(),
        jobDescription: jobDescription.trim(),
        items,
        subtotalLabour,
        subtotalMaterials,
        netTotal,
        isVatRegistered,
        vatRate: isVatRegistered ? vatRate : 0,
        vatAmount,
        grandTotal,
        paymentTerms,
        notes
      };

      if (initialInvoice?.id) {
        invoiceData.id = initialInvoice.id;
      }
      if (initialInvoice?.quoteId) {
        invoiceData.quoteId = initialInvoice.quoteId;
        invoiceData.quoteNumber = initialInvoice.quoteNumber;
      }

      const savedId = await onSave(invoiceData);
      showToast('Invoice saved successfully', 'success');

      if (andPreview && onSaveAndPreview) {
        onSaveAndPreview({
          ...invoiceData,
          id: (savedId as string) || initialInvoice?.id || 'temp',
          createdAt: initialInvoice?.createdAt || new Date().toISOString()
        } as Invoice);
      } else {
        onClose();
      }
    } catch (err: any) {
      showToast('Failed to save invoice: ' + err.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4 overflow-y-auto">
      <div className="bg-white dark:bg-zinc-900 w-full max-w-4xl rounded-3xl shadow-2xl border border-zinc-200 dark:border-zinc-800 overflow-hidden my-auto max-h-[95vh] flex flex-col">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-zinc-100 dark:border-zinc-800 flex items-center justify-between bg-zinc-50/50 dark:bg-zinc-800/40">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-emerald-500/10 dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base sm:text-lg font-black text-zinc-900 dark:text-white">
                {initialInvoice?.id ? `Edit Invoice ${invoiceNumber}` : 'Create Trade Invoice'}
              </h3>
              <p className="text-xs text-zinc-500">
                Itemised client billing & VAT payment terms
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 rounded-xl hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Form Body */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-6">
          {/* Metadata Row: Invoice #, Date Issued, Due Date, Status */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-zinc-50 dark:bg-zinc-800/40 p-4 rounded-2xl border border-zinc-100 dark:border-zinc-800">
            <div>
              <label className="text-[10px] font-bold uppercase text-zinc-400 block mb-1">
                Invoice Number
              </label>
              <input
                type="text"
                value={invoiceNumber}
                onChange={e => setInvoiceNumber(e.target.value)}
                className="w-full px-3 py-2 text-xs bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-xl font-bold text-emerald-600 dark:text-emerald-400 outline-none"
              />
            </div>
            <div>
              <label className="text-[10px] font-bold uppercase text-zinc-400 block mb-1">
                Date Issued
              </label>
              <input
                type="date"
                value={dateIssued}
                onChange={e => setDateIssued(e.target.value)}
                className="w-full px-3 py-2 text-xs bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-xl text-zinc-800 dark:text-zinc-200 outline-none"
              />
            </div>
            <div>
              <label className="text-[10px] font-bold uppercase text-zinc-400 block mb-1">
                Payment Due Date
              </label>
              <input
                type="date"
                value={dueDate}
                onChange={e => setDueDate(e.target.value)}
                className="w-full px-3 py-2 text-xs bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-xl text-zinc-800 dark:text-zinc-200 outline-none"
              />
            </div>
            <div>
              <label className="text-[10px] font-bold uppercase text-zinc-400 block mb-1">
                Status
              </label>
              <select
                value={status}
                onChange={e => setStatus(e.target.value as Invoice['status'])}
                className="w-full px-3 py-2 text-xs bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-xl font-bold text-zinc-800 dark:text-zinc-200 outline-none cursor-pointer"
              >
                <option value="draft">Draft</option>
                <option value="sent">Sent</option>
                <option value="paid">Paid</option>
                <option value="overdue">Overdue</option>
              </select>
            </div>
          </div>

          {/* Customer & Job Info */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-3 bg-zinc-50 dark:bg-zinc-800/40 p-4 rounded-2xl border border-zinc-100 dark:border-zinc-800">
              <span className="text-[10px] font-black uppercase text-zinc-400 block">
                Client Information
              </span>
              <div>
                <label className="text-xs text-zinc-500 block mb-1">Client Name *</label>
                <input
                  type="text"
                  placeholder="e.g. Sarah Jenkins"
                  value={customerName}
                  onChange={e => setCustomerName(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-xl text-zinc-900 dark:text-white outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs text-zinc-500 block mb-1">Phone</label>
                  <input
                    type="tel"
                    placeholder="07123 456789"
                    value={customerPhone}
                    onChange={e => setCustomerPhone(e.target.value)}
                    className="w-full px-3 py-2 text-xs bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-xl text-zinc-900 dark:text-white outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
                <div>
                  <label className="text-xs text-zinc-500 block mb-1">Email</label>
                  <input
                    type="email"
                    placeholder="client@gmail.com"
                    value={customerEmail}
                    onChange={e => setCustomerEmail(e.target.value)}
                    className="w-full px-3 py-2 text-xs bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-xl text-zinc-900 dark:text-white outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              </div>
              <div>
                <label className="text-xs text-zinc-500 block mb-1">Site / Job Address</label>
                <input
                  type="text"
                  placeholder="14 Primrose Way, Guildford GU1 4AB"
                  value={customerAddress}
                  onChange={e => setCustomerAddress(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-xl text-zinc-900 dark:text-white outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
            </div>

            <div className="space-y-3 bg-zinc-50 dark:bg-zinc-800/40 p-4 rounded-2xl border border-zinc-100 dark:border-zinc-800">
              <span className="text-[10px] font-black uppercase text-zinc-400 block">
                Job Overview & Scope
              </span>
              <div>
                <label className="text-xs text-zinc-500 block mb-1">Job Title *</label>
                <input
                  type="text"
                  placeholder="e.g. Bathroom Tiling & Plumbing Works"
                  value={jobTitle}
                  onChange={e => setJobTitle(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-xl text-zinc-900 dark:text-white font-bold outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
              <div>
                <label className="text-xs text-zinc-500 block mb-1">Description / Completed Works</label>
                <textarea
                  rows={4}
                  placeholder="Details of works carried out, materials supplied, or notes for the invoice..."
                  value={jobDescription}
                  onChange={e => setJobDescription(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-xl text-zinc-900 dark:text-white outline-none focus:ring-2 focus:ring-emerald-500 resize-none"
                />
              </div>
            </div>
          </div>

          {/* Line Items Section */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-black uppercase tracking-wider text-zinc-800 dark:text-zinc-200">
                Invoice Line Items ({items.length})
              </h4>
            </div>

            {/* Existing Items Table */}
            {items.length > 0 && (
              <div className="border border-zinc-200 dark:border-zinc-800 rounded-2xl overflow-hidden">
                <table className="w-full text-left text-xs">
                  <thead className="bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 font-bold uppercase text-[10px]">
                    <tr>
                      <th className="p-3">Description</th>
                      <th className="p-3">Type</th>
                      <th className="p-3 text-right">Qty</th>
                      <th className="p-3 text-right">Rate</th>
                      <th className="p-3 text-right">Total</th>
                      <th className="p-3 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                    {items.map(item => (
                      <tr key={item.id} className="hover:bg-zinc-50/50 dark:hover:bg-zinc-800/30">
                        <td className="p-3 font-medium text-zinc-900 dark:text-white">{item.description}</td>
                        <td className="p-3 text-zinc-500 capitalize">{item.type}</td>
                        <td className="p-3 text-right text-zinc-700 dark:text-zinc-300">
                          {item.quantity} {item.unit || ''}
                        </td>
                        <td className="p-3 text-right text-zinc-700 dark:text-zinc-300">
                          {formatCurrency(item.unitPrice)}
                        </td>
                        <td className="p-3 text-right font-bold text-zinc-900 dark:text-white">
                          {formatCurrency(item.total)}
                        </td>
                        <td className="p-3 text-right">
                          <button
                            type="button"
                            onClick={() => handleRemoveItem(item.id)}
                            className="p-1 hover:bg-red-50 dark:hover:bg-red-950/40 text-zinc-400 hover:text-red-500 rounded-lg transition-colors"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Quick Add Form */}
            <form onSubmit={handleAddItem} className="bg-zinc-50 dark:bg-zinc-800/40 p-3 rounded-2xl border border-zinc-100 dark:border-zinc-800 flex flex-wrap items-center gap-2">
              <input
                type="text"
                placeholder="Item / Task description..."
                value={newItemDesc}
                onChange={e => setNewItemDesc(e.target.value)}
                className="flex-1 min-w-[180px] px-3 py-2 text-xs bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-xl text-zinc-900 dark:text-white outline-none focus:ring-2 focus:ring-emerald-500"
              />
              <select
                value={newItemType}
                onChange={e => {
                  const t = e.target.value as QuoteItem['type'];
                  setNewItemType(t);
                  if (t === 'labour') {
                    setNewItemUnit('hours');
                    setNewItemRate(businessDetails.defaultHourlyRate || 45);
                  } else {
                    setNewItemUnit('units');
                    setNewItemRate(0);
                  }
                }}
                className="px-2.5 py-2 text-xs bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-xl font-bold text-zinc-700 dark:text-zinc-300 outline-none"
              >
                <option value="labour">Labour</option>
                <option value="material">Material / Supply</option>
                <option value="hire">Hire / Tool</option>
                <option value="other">Other</option>
              </select>
              <input
                type="number"
                step="any"
                min="0.1"
                placeholder="Qty"
                value={newItemQty}
                onChange={e => setNewItemQty(e.target.value)}
                className="w-16 px-2.5 py-2 text-xs bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-xl text-zinc-900 dark:text-white outline-none"
              />
              <input
                type="number"
                step="any"
                min="0"
                placeholder="Rate (£)"
                value={newItemRate}
                onChange={e => setNewItemRate(e.target.value)}
                className="w-20 px-2.5 py-2 text-xs bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-xl text-zinc-900 dark:text-white outline-none"
              />
              <button
                type="submit"
                disabled={!newItemDesc.trim()}
                className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold inline-flex items-center gap-1.5 transition-all shadow-sm disabled:opacity-50"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Item</span>
              </button>
            </form>
          </div>

          {/* Financial Totals & VAT Options */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-start">
            <div className="bg-zinc-50 dark:bg-zinc-800/40 p-4 rounded-2xl border border-zinc-100 dark:border-zinc-800 space-y-3">
              <span className="text-[10px] font-black uppercase text-zinc-400 block">
                VAT & Terms Configuration
              </span>
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-zinc-800 dark:text-zinc-200">
                  Charge UK VAT (20%)
                </label>
                <input
                  type="checkbox"
                  checked={isVatRegistered}
                  onChange={e => setIsVatRegistered(e.target.checked)}
                  className="rounded text-emerald-600 focus:ring-emerald-500 w-4 h-4 cursor-pointer"
                />
              </div>

              <div>
                <label className="text-xs text-zinc-500 block mb-1">Payment Terms</label>
                <input
                  type="text"
                  value={paymentTerms}
                  onChange={e => setPaymentTerms(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-xl text-zinc-800 dark:text-zinc-200 outline-none"
                />
              </div>

              <div>
                <label className="text-xs text-zinc-500 block mb-1">Invoice Notes / Instructions</label>
                <input
                  type="text"
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  placeholder="e.g. Please quote invoice reference on bank transfer."
                  className="w-full px-3 py-2 text-xs bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-xl text-zinc-800 dark:text-zinc-200 outline-none"
                />
              </div>
            </div>

            <div className="bg-zinc-50 dark:bg-zinc-800/40 p-4 rounded-2xl border border-zinc-100 dark:border-zinc-800 space-y-2">
              <span className="text-[10px] font-black uppercase text-zinc-400 block mb-1">
                Financial Summary
              </span>
              <div className="flex justify-between text-xs text-zinc-600 dark:text-zinc-300">
                <span>Labour Subtotal:</span>
                <span className="font-semibold">{formatCurrency(subtotalLabour)}</span>
              </div>
              <div className="flex justify-between text-xs text-zinc-600 dark:text-zinc-300">
                <span>Materials Subtotal:</span>
                <span className="font-semibold">{formatCurrency(subtotalMaterials)}</span>
              </div>
              <div className="flex justify-between text-xs text-zinc-700 dark:text-zinc-200 pt-1 border-t border-zinc-200 dark:border-zinc-700 font-bold">
                <span>Net Total:</span>
                <span>{formatCurrency(netTotal)}</span>
              </div>
              {isVatRegistered && (
                <div className="flex justify-between text-xs text-zinc-600 dark:text-zinc-300">
                  <span>VAT ({vatRate}%):</span>
                  <span className="font-semibold">{formatCurrency(vatAmount)}</span>
                </div>
              )}
              <div className="flex justify-between items-center text-sm font-black text-emerald-600 dark:text-emerald-400 pt-2 border-t border-zinc-200 dark:border-zinc-700">
                <span>Total Balance Due:</span>
                <span className="text-base">{formatCurrency(grandTotal)}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Footer Buttons */}
        <div className="p-4 border-t border-zinc-100 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-800/60 flex items-center justify-between shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 rounded-xl text-xs font-bold"
          >
            Cancel
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => handleSave(true)}
              disabled={saving}
              className="px-4 py-2 bg-zinc-200 hover:bg-zinc-300 dark:bg-zinc-700 dark:hover:bg-zinc-600 text-zinc-800 dark:text-zinc-100 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all"
            >
              <Eye className="w-3.5 h-3.5" />
              <span>Save & Preview</span>
            </button>

            <button
              type="button"
              onClick={() => handleSave(false)}
              disabled={saving}
              className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black uppercase tracking-wider flex items-center gap-1.5 transition-all shadow-md active:scale-95 disabled:opacity-50"
            >
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
              <span>Save Invoice</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
