import { useState } from 'react';
import { 
  X, 
  Share2, 
  Download, 
  MessageCircle, 
  Edit3, 
  CheckCircle2, 
  Clock, 
  XCircle, 
  FileText,
  Building,
  User,
  MapPin,
  Calendar,
  CreditCard,
  Sparkles,
  Loader2
} from 'lucide-react';
import { Quote, BusinessDetails } from '../../types/quote';
import { 
  formatCurrency, 
  shareQuotePDF, 
  downloadQuotePDF
} from '../../services/quotePdfService';
import { useToast } from '../../contexts/ToastContext';

interface QuotePreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  quote: Quote | null;
  businessDetails: BusinessDetails;
  onEdit?: (quote: Quote) => void;
  onStatusChange?: (quoteId: string, status: Quote['status']) => void;
  onConvertToInvoice?: (quote: Quote) => void;
  onOpenAcceptanceModal?: (quote: Quote) => void;
}

export default function QuotePreviewModal({
  isOpen,
  onClose,
  quote,
  businessDetails,
  onEdit,
  onStatusChange,
  onConvertToInvoice,
  onOpenAcceptanceModal
}: QuotePreviewModalProps) {
  const { showToast } = useToast();
  const [sharing, setSharing] = useState(false);

  if (!isOpen || !quote) return null;

  const handleNativeShare = async () => {
    setSharing(true);
    try {
      const result = await shareQuotePDF(quote, businessDetails);
      if (result.shared) {
        showToast('Quote shared successfully', 'success');
        if (onStatusChange && quote.status === 'draft') {
          onStatusChange(quote.id, 'pending');
        }
      } else if (result.method === 'download') {
        showToast('Downloaded PDF to your device', 'info');
      }
    } catch (err: any) {
      showToast('Sharing error: ' + (err.message || 'Could not share PDF'), 'error');
    } finally {
      setSharing(false);
    }
  };

  const handleDownload = () => {
    try {
      downloadQuotePDF(quote, businessDetails);
      showToast(`Downloaded Quote ${quote.quoteNumber}.pdf`, 'success');
    } catch (err: any) {
      showToast('Download failed: ' + err.message, 'error');
    }
  };

  const getStatusBadge = (status: Quote['status']) => {
    switch (status) {
      case 'accepted':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800">
            <CheckCircle2 className="w-3.5 h-3.5" /> Accepted
          </span>
        );
      case 'pending':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-400 border border-amber-200 dark:border-amber-800">
            <Clock className="w-3.5 h-3.5" /> Sent / Pending
          </span>
        );
      case 'declined':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-red-100 text-red-800 dark:bg-red-950/60 dark:text-red-400 border border-red-200 dark:border-red-800">
            <XCircle className="w-3.5 h-3.5" /> Declined
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-700">
            <FileText className="w-3.5 h-3.5" /> Draft
          </span>
        );
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-zinc-950/70 backdrop-blur-sm overflow-y-auto">
      <div className="relative w-full max-w-3xl bg-white dark:bg-zinc-900 rounded-3xl border border-zinc-200 dark:border-zinc-800 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header Bar */}
        <div className="px-6 py-4 border-b border-zinc-100 dark:border-zinc-800 flex items-center justify-between shrink-0 bg-zinc-50/50 dark:bg-zinc-800/30">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center font-black">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base sm:text-lg font-bold text-zinc-900 dark:text-white">
                  Quote {quote.quoteNumber}
                </h2>
                {getStatusBadge(quote.status)}
              </div>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                Issued {quote.dateIssued} • Valid until {quote.validUntil}
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

        {/* Scrollable Document Preview Body */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1 text-zinc-900 dark:text-white">
          {/* Business & Client Header Preview */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pb-6 border-b border-zinc-100 dark:border-zinc-800">
            {/* Business Info */}
            <div className="space-y-1">
              <span className="text-[10px] font-black uppercase tracking-wider text-zinc-400">From</span>
              <h3 className="text-sm font-bold text-zinc-900 dark:text-white flex items-center gap-1.5">
                <Building className="w-4 h-4 text-emerald-500" />
                {businessDetails.businessName || businessDetails.tradingName || 'Your Business'}
              </h3>
              <div className="text-xs text-zinc-500 dark:text-zinc-400 space-y-0.5">
                {businessDetails.addressLine1 && <p>{businessDetails.addressLine1}</p>}
                {(businessDetails.townCity || businessDetails.postcode) && (
                  <p>{[businessDetails.townCity, businessDetails.postcode].filter(Boolean).join(', ')}</p>
                )}
                {businessDetails.phone && <p>Tel: {businessDetails.phone}</p>}
                {businessDetails.email && <p>Email: {businessDetails.email}</p>}
                {businessDetails.isVatRegistered && businessDetails.vatNumber && (
                  <p className="font-semibold text-zinc-600 dark:text-zinc-300">VAT: {businessDetails.vatNumber}</p>
                )}
              </div>
            </div>

            {/* Client Info */}
            <div className="space-y-1 sm:text-right">
              <span className="text-[10px] font-black uppercase tracking-wider text-zinc-400">Quotation For</span>
              <h3 className="text-sm font-bold text-zinc-900 dark:text-white flex items-center gap-1.5 sm:justify-end">
                <User className="w-4 h-4 text-emerald-500" />
                {quote.customerName}
              </h3>
              <div className="text-xs text-zinc-500 dark:text-zinc-400 space-y-0.5">
                {quote.customerAddress && <p>{quote.customerAddress}</p>}
                {quote.customerPhone && <p>Tel: {quote.customerPhone}</p>}
                {quote.customerEmail && <p>Email: {quote.customerEmail}</p>}
              </div>
            </div>
          </div>

          {/* Job Title & Scope */}
          <div className="p-4 bg-zinc-50 dark:bg-zinc-800/40 rounded-2xl border border-zinc-100 dark:border-zinc-800">
            <span className="text-[10px] font-black uppercase tracking-wider text-zinc-400">Job Title / Scope of Work</span>
            <h4 className="text-sm font-bold text-zinc-900 dark:text-white mt-0.5">{quote.jobTitle}</h4>
            {quote.jobDescription && (
              <p className="text-xs text-zinc-600 dark:text-zinc-300 mt-1 leading-relaxed whitespace-pre-line">
                {quote.jobDescription}
              </p>
            )}
          </div>

          {/* Items Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-zinc-200 dark:border-zinc-700 text-zinc-400 font-bold uppercase text-[10px]">
                  <th className="py-2.5 px-3">Description</th>
                  <th className="py-2.5 px-2">Type</th>
                  <th className="py-2.5 px-2 text-right">Qty</th>
                  <th className="py-2.5 px-2 text-right">Rate</th>
                  <th className="py-2.5 px-3 text-right">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {quote.items.map((item, i) => (
                  <tr key={item.id || i} className="hover:bg-zinc-50 dark:hover:bg-zinc-800/30">
                    <td className="py-2.5 px-3 font-medium text-zinc-800 dark:text-zinc-200">{item.description}</td>
                    <td className="py-2.5 px-2 text-zinc-500 capitalize">{item.type}</td>
                    <td className="py-2.5 px-2 text-right text-zinc-600 dark:text-zinc-400 font-medium">
                      {item.unit?.includes('d') || item.unit?.includes('h')
                        ? item.unit
                        : (item.unit ? `${item.quantity} ${item.unit}` : item.quantity)}
                    </td>
                    <td className="py-2.5 px-2 text-right text-zinc-600 dark:text-zinc-400">
                      {formatCurrency(item.unitPrice)}
                    </td>
                    <td className="py-2.5 px-3 text-right font-bold text-zinc-900 dark:text-white">
                      {formatCurrency(item.total)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Bottom Financials & BACS summary */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-4 border-t border-zinc-100 dark:border-zinc-800">
            {/* BACS Details */}
            <div className="p-4 bg-zinc-50 dark:bg-zinc-800/40 rounded-2xl border border-zinc-100 dark:border-zinc-800 space-y-1">
              <span className="text-[10px] font-black uppercase tracking-wider text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                <CreditCard className="w-3.5 h-3.5" /> BACS Payment Details
              </span>
              <div className="text-xs text-zinc-600 dark:text-zinc-300 space-y-0.5 pt-1">
                {businessDetails.bankName && <p>Bank: <span className="font-semibold text-zinc-900 dark:text-white">{businessDetails.bankName}</span></p>}
                {businessDetails.accountName && <p>Account Name: <span className="font-semibold text-zinc-900 dark:text-white">{businessDetails.accountName}</span></p>}
                {businessDetails.sortCode && <p>Sort Code: <span className="font-semibold text-zinc-900 dark:text-white">{businessDetails.sortCode}</span></p>}
                {businessDetails.accountNumber && <p>Account Number: <span className="font-semibold text-zinc-900 dark:text-white">{businessDetails.accountNumber}</span></p>}
                <p className="text-[11px] text-zinc-400 italic pt-1">
                  {quote.paymentTerms || businessDetails.defaultPaymentTerms || 'Payment due within 14 days of completion.'}
                </p>
              </div>
            </div>

            {/* Financial Breakdown */}
            <div className="p-4 bg-zinc-50 dark:bg-zinc-800/40 rounded-2xl border border-zinc-100 dark:border-zinc-800 space-y-2">
              {quote.subtotalLabour > 0 && (
                <div className="flex justify-between text-xs text-zinc-500 dark:text-zinc-400">
                  <span>Labour Subtotal:</span>
                  <span className="font-semibold text-zinc-800 dark:text-zinc-200">{formatCurrency(quote.subtotalLabour)}</span>
                </div>
              )}
              {quote.subtotalMaterials > 0 && (
                <div className="flex justify-between text-xs text-zinc-500 dark:text-zinc-400">
                  <span>Materials & Consumables:</span>
                  <span className="font-semibold text-zinc-800 dark:text-zinc-200">{formatCurrency(quote.subtotalMaterials)}</span>
                </div>
              )}
              <div className="flex justify-between text-xs text-zinc-600 dark:text-zinc-300 pt-1 border-t border-zinc-200 dark:border-zinc-700">
                <span>Net Subtotal:</span>
                <span className="font-semibold text-zinc-900 dark:text-white">{formatCurrency(quote.netTotal)}</span>
              </div>
              {quote.isVatRegistered && (
                <div className="flex justify-between text-xs text-zinc-500 dark:text-zinc-400">
                  <span>VAT ({quote.vatRate || 20}%):</span>
                  <span className="font-semibold text-zinc-800 dark:text-zinc-200">{formatCurrency(quote.vatAmount)}</span>
                </div>
              )}
              <div className="flex justify-between items-center text-sm font-black text-emerald-600 dark:text-emerald-400 pt-2 border-t border-zinc-200 dark:border-zinc-700">
                <span>Total Due:</span>
                <span className="text-base">{formatCurrency(quote.grandTotal)}</span>
              </div>
            </div>
          </div>

          {/* Notes & Terms */}
          {(quote.notes || businessDetails.defaultQuoteTerms) && (
            <div className="text-[11px] text-zinc-500 dark:text-zinc-400 leading-relaxed border-t border-zinc-100 dark:border-zinc-800 pt-3">
              <span className="font-bold text-zinc-700 dark:text-zinc-300">Terms & Conditions: </span>
              {quote.notes || businessDetails.defaultQuoteTerms}
            </div>
          )}
        </div>

        {/* Footer Action Controls */}
        <div className="p-4 border-t border-zinc-100 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-800/60 flex flex-wrap items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-2 flex-wrap">
            {onEdit && (
              <button
                onClick={() => onEdit(quote)}
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

            {quote.status === 'accepted' ? (
              onOpenAcceptanceModal && (
                <button
                  onClick={() => onOpenAcceptanceModal(quote)}
                  className="px-3 py-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all shadow-sm active:scale-95"
                  title="Smart Convert: Book in Calendar, Check Shed Stock & Convert to Invoice"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Smart Convert</span>
                </button>
              )
            ) : (
              onStatusChange && (
                <button
                  onClick={() => {
                    onStatusChange(quote.id, 'accepted');
                    onOpenAcceptanceModal?.({ ...quote, status: 'accepted' });
                  }}
                  className="px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all shadow-sm active:scale-95"
                  title="Mark Quote as Accepted & Launch Smart Convert"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Accept Quote</span>
                </button>
              )
            )}
          </div>

          <div className="flex items-center gap-2 ml-auto">
            <button
              onClick={handleNativeShare}
              disabled={sharing}
              className="px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl text-xs font-black uppercase tracking-wider flex items-center gap-2 transition-all shadow-md active:scale-95 disabled:opacity-50"
            >
              {sharing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Share2 className="w-4 h-4" />}
              <span>Share PDF</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
