import { useState } from 'react';
import { 
  X, 
  Share2, 
  Download, 
  MessageCircle, 
  Edit3, 
  CheckCircle2, 
  Clock, 
  AlertTriangle,
  FileSpreadsheet,
  FileText,
  Building,
  User,
  MapPin,
  Calendar,
  CreditCard,
  Loader2
} from 'lucide-react';
import { Invoice, BusinessDetails } from '../../types/quote';
import { 
  formatCurrency, 
  shareInvoicePDF, 
  downloadInvoicePDF
} from '../../services/quotePdfService';
import { useToast } from '../../contexts/ToastContext';

interface InvoicePreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  invoice: Invoice | null;
  businessDetails: BusinessDetails;
  onEdit?: (invoice: Invoice) => void;
  onStatusChange?: (invoiceId: string, status: Invoice['status']) => void;
}

export default function InvoicePreviewModal({
  isOpen,
  onClose,
  invoice,
  businessDetails,
  onEdit,
  onStatusChange
}: InvoicePreviewModalProps) {
  const { showToast } = useToast();
  const [sharing, setSharing] = useState(false);

  if (!isOpen || !invoice) return null;

  const handleNativeShare = async () => {
    setSharing(true);
    try {
      const result = await shareInvoicePDF(invoice, businessDetails);
      if (result.shared) {
        showToast('Invoice shared successfully', 'success');
        if (onStatusChange && invoice.status === 'draft') {
          onStatusChange(invoice.id, 'sent');
        }
      } else if (result.method === 'download') {
        showToast('Downloaded invoice PDF to your device', 'info');
      }
    } catch (err: any) {
      showToast('Sharing error: ' + (err.message || 'Could not share PDF'), 'error');
    } finally {
      setSharing(false);
    }
  };

  const handleDownload = () => {
    try {
      downloadInvoicePDF(invoice, businessDetails);
      showToast(`Downloaded Invoice ${invoice.invoiceNumber}.pdf`, 'success');
    } catch (err: any) {
      showToast('Download failed: ' + err.message, 'error');
    }
  };

  const getStatusBadge = (status: Invoice['status']) => {
    switch (status) {
      case 'paid':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800">
            <CheckCircle2 className="w-3.5 h-3.5" /> Paid
          </span>
        );
      case 'sent':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-400 border border-blue-200 dark:border-blue-800">
            <Clock className="w-3.5 h-3.5" /> Sent / Awaiting Payment
          </span>
        );
      case 'overdue':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-red-100 text-red-800 dark:bg-red-950/60 dark:text-red-400 border border-red-200 dark:border-red-800">
            <AlertTriangle className="w-3.5 h-3.5" /> Overdue
          </span>
        );
      case 'draft':
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-700">
            <FileText className="w-3.5 h-3.5" /> Draft Invoice
          </span>
        );
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4 overflow-y-auto">
      <div className="bg-white dark:bg-zinc-900 w-full max-w-3xl rounded-3xl shadow-2xl border border-zinc-200 dark:border-zinc-800 overflow-hidden my-auto max-h-[95vh] flex flex-col">
        {/* Top Header Bar */}
        <div className="p-4 sm:p-5 border-b border-zinc-100 dark:border-zinc-800 flex items-center justify-between bg-zinc-50/50 dark:bg-zinc-800/40">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-emerald-500/10 dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base sm:text-lg font-black text-zinc-900 dark:text-white">
                  Invoice {invoice.invoiceNumber}
                </h3>
                {invoice.quoteNumber && (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400">
                    Quote {invoice.quoteNumber}
                  </span>
                )}
                {getStatusBadge(invoice.status)}
              </div>
              <p className="text-xs text-zinc-500 truncate max-w-xs sm:max-w-md">
                {invoice.customerName} • {invoice.jobTitle}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {onStatusChange && (
              <select
                value={invoice.status}
                onChange={e => onStatusChange(invoice.id, e.target.value as Invoice['status'])}
                className="text-xs font-bold px-3 py-1.5 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 outline-none cursor-pointer"
              >
                <option value="draft">Draft</option>
                <option value="sent">Sent</option>
                <option value="paid">Paid</option>
                <option value="overdue">Overdue</option>
              </select>
            )}

            <button
              onClick={onClose}
              className="p-2 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 rounded-xl hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Scrollable Printable Document Layout */}
        <div className="p-4 sm:p-8 overflow-y-auto space-y-6 text-zinc-900 dark:text-white">
          {/* Header Row */}
          <div className="flex flex-col sm:flex-row justify-between gap-4 pb-6 border-b border-zinc-100 dark:border-zinc-800">
            <div>
              <h2 className="text-xl sm:text-2xl font-black text-zinc-900 dark:text-white">
                {businessDetails.businessName || businessDetails.tradingName || 'Trade Invoice'}
              </h2>
              <div className="text-xs text-zinc-500 dark:text-zinc-400 mt-1 space-y-0.5">
                {businessDetails.addressLine1 && <p>{businessDetails.addressLine1}</p>}
                {businessDetails.addressLine2 && <p>{businessDetails.addressLine2}</p>}
                {(businessDetails.townCity || businessDetails.postcode) && (
                  <p>{[businessDetails.townCity, businessDetails.postcode].filter(Boolean).join(', ')}</p>
                )}
                {businessDetails.phone && <p>Tel: {businessDetails.phone}</p>}
                {businessDetails.email && <p>Email: {businessDetails.email}</p>}
              </div>
            </div>

            <div className="sm:text-right space-y-1">
              <span className="text-xs font-black uppercase tracking-widest text-emerald-600 dark:text-emerald-400">
                TAX INVOICE
              </span>
              <p className="text-sm font-bold text-zinc-800 dark:text-zinc-200">
                Ref: {invoice.invoiceNumber}
              </p>
              <p className="text-xs text-zinc-500">Date Issued: {invoice.dateIssued}</p>
              <p className="text-xs font-bold text-amber-600 dark:text-amber-400">
                Payment Due: {invoice.dueDate}
              </p>
              {businessDetails.companyNumber && (
                <p className="text-[11px] text-zinc-400">Company: {businessDetails.companyNumber}</p>
              )}
              {businessDetails.isVatRegistered && businessDetails.vatNumber && (
                <p className="text-[11px] text-zinc-400">VAT Reg: {businessDetails.vatNumber}</p>
              )}
            </div>
          </div>

          {/* Customer & Job Info Box */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-zinc-50 dark:bg-zinc-800/40 p-4 rounded-2xl border border-zinc-100 dark:border-zinc-800">
            <div>
              <span className="text-[10px] font-black uppercase text-zinc-400 block mb-1">
                Billed To
              </span>
              <p className="text-sm font-bold text-zinc-900 dark:text-white">
                {invoice.customerName}
              </p>
              {invoice.customerAddress && (
                <p className="text-xs text-zinc-600 dark:text-zinc-400 mt-0.5">
                  {invoice.customerAddress}
                </p>
              )}
              {invoice.customerPhone && (
                <p className="text-xs text-zinc-500 mt-0.5">Tel: {invoice.customerPhone}</p>
              )}
              {invoice.customerEmail && (
                <p className="text-xs text-zinc-500 mt-0.5">Email: {invoice.customerEmail}</p>
              )}
            </div>

            <div>
              <span className="text-[10px] font-black uppercase text-zinc-400 block mb-1">
                Job Description
              </span>
              <p className="text-sm font-bold text-zinc-900 dark:text-white">
                {invoice.jobTitle}
              </p>
              {invoice.jobDescription && (
                <p className="text-xs text-zinc-600 dark:text-zinc-400 mt-0.5 whitespace-pre-wrap">
                  {invoice.jobDescription}
                </p>
              )}
            </div>
          </div>

          {/* Line Items Table */}
          <div className="border border-zinc-200 dark:border-zinc-800 rounded-2xl overflow-hidden">
            <table className="w-full text-left text-xs">
              <thead className="bg-zinc-100 dark:bg-zinc-800/80 text-zinc-600 dark:text-zinc-400 font-bold uppercase text-[10px] tracking-wider">
                <tr>
                  <th className="p-3">Description</th>
                  <th className="p-3">Category</th>
                  <th className="p-3 text-right">Qty</th>
                  <th className="p-3 text-right">Rate</th>
                  <th className="p-3 text-right">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {(invoice.items || []).map((item, idx) => (
                  <tr key={item.id || idx} className="hover:bg-zinc-50/50 dark:hover:bg-zinc-800/30">
                    <td className="p-3 font-medium text-zinc-900 dark:text-white">
                      {item.description}
                    </td>
                    <td className="p-3 text-zinc-500 capitalize">
                      {item.type}
                    </td>
                    <td className="p-3 text-right text-zinc-700 dark:text-zinc-300">
                      {item.quantity} {item.unit || ''}
                    </td>
                    <td className="p-3 text-right text-zinc-700 dark:text-zinc-300">
                      {formatCurrency(item.unitPrice)}
                    </td>
                    <td className="p-3 text-right font-bold text-zinc-900 dark:text-white">
                      {formatCurrency(item.total)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Financial Breakdown & BACS */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-start">
            {/* BACS Details */}
            <div className="p-4 bg-zinc-50 dark:bg-zinc-800/40 rounded-2xl border border-zinc-100 dark:border-zinc-800 space-y-1.5">
              <span className="text-[10px] font-black uppercase text-emerald-600 dark:text-emerald-400 block mb-1">
                BACS Payment Details
              </span>
              {businessDetails.bankName && (
                <p className="text-xs text-zinc-700 dark:text-zinc-300">Bank: <strong className="font-bold">{businessDetails.bankName}</strong></p>
              )}
              {businessDetails.accountName && (
                <p className="text-xs text-zinc-700 dark:text-zinc-300">Account Name: <strong className="font-bold">{businessDetails.accountName}</strong></p>
              )}
              {businessDetails.sortCode && (
                <p className="text-xs text-zinc-700 dark:text-zinc-300">Sort Code: <strong className="font-bold">{businessDetails.sortCode}</strong></p>
              )}
              {businessDetails.accountNumber && (
                <p className="text-xs text-zinc-700 dark:text-zinc-300">Account Number: <strong className="font-bold">{businessDetails.accountNumber}</strong></p>
              )}
              <p className="text-[11px] text-zinc-500 italic pt-1">
                {invoice.paymentTerms || businessDetails.defaultPaymentTerms}
              </p>
            </div>

            {/* Totals */}
            <div className="p-4 bg-zinc-50 dark:bg-zinc-800/40 rounded-2xl border border-zinc-100 dark:border-zinc-800 space-y-2">
              {invoice.subtotalLabour > 0 && (
                <div className="flex justify-between text-xs text-zinc-500 dark:text-zinc-400">
                  <span>Labour Subtotal:</span>
                  <span className="font-semibold text-zinc-800 dark:text-zinc-200">{formatCurrency(invoice.subtotalLabour)}</span>
                </div>
              )}
              {invoice.subtotalMaterials > 0 && (
                <div className="flex justify-between text-xs text-zinc-500 dark:text-zinc-400">
                  <span>Materials & Consumables:</span>
                  <span className="font-semibold text-zinc-800 dark:text-zinc-200">{formatCurrency(invoice.subtotalMaterials)}</span>
                </div>
              )}
              <div className="flex justify-between text-xs text-zinc-600 dark:text-zinc-300 pt-1 border-t border-zinc-200 dark:border-zinc-700">
                <span>Net Subtotal:</span>
                <span className="font-semibold text-zinc-900 dark:text-white">{formatCurrency(invoice.netTotal)}</span>
              </div>
              {invoice.isVatRegistered && (
                <div className="flex justify-between text-xs text-zinc-500 dark:text-zinc-400">
                  <span>VAT ({invoice.vatRate || 20}%):</span>
                  <span className="font-semibold text-zinc-800 dark:text-zinc-200">{formatCurrency(invoice.vatAmount)}</span>
                </div>
              )}
              <div className="flex justify-between items-center text-sm font-black text-emerald-600 dark:text-emerald-400 pt-2 border-t border-zinc-200 dark:border-zinc-700">
                <span>Total Balance Due:</span>
                <span className="text-base">{formatCurrency(invoice.grandTotal)}</span>
              </div>
            </div>
          </div>

          {/* Notes & Terms */}
          {(invoice.notes || businessDetails.defaultPaymentTerms) && (
            <div className="text-[11px] text-zinc-500 dark:text-zinc-400 leading-relaxed border-t border-zinc-100 dark:border-zinc-800 pt-3">
              <span className="font-bold text-zinc-700 dark:text-zinc-300">Payment Terms: </span>
              {invoice.notes || businessDetails.defaultPaymentTerms}
            </div>
          )}
        </div>

        {/* Footer Action Controls */}
        <div className="p-4 border-t border-zinc-100 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-800/60 flex flex-wrap items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-2">
            {onEdit && (
              <button
                onClick={() => onEdit(invoice)}
                className="px-3 py-2 bg-zinc-200 hover:bg-zinc-300 dark:bg-zinc-700 dark:hover:bg-zinc-600 text-zinc-800 dark:text-zinc-100 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all"
              >
                <Edit3 className="w-3.5 h-3.5" /> Edit
              </button>
            )}
            <button
              onClick={handleDownload}
              className="px-3 py-2 bg-zinc-200 hover:bg-zinc-300 dark:bg-zinc-700 dark:hover:bg-zinc-600 text-zinc-800 dark:text-zinc-100 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all"
              title="Download PDF"
            >
              <Download className="w-3.5 h-3.5" /> Download
            </button>
          </div>

          <div className="flex items-center gap-2 ml-auto">
            <button
              onClick={handleNativeShare}
              disabled={sharing}
              className="px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl text-xs font-black uppercase tracking-wider flex items-center gap-2 transition-all shadow-md active:scale-95 disabled:opacity-50"
            >
              {sharing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Share2 className="w-4 h-4" />}
              <span>Share Invoice PDF</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
