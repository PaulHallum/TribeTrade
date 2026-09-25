import React, { useState, useMemo } from 'react';
import { motion } from 'motion/react';
import {
  X,
  Calculator,
  AlertTriangle,
  FileText,
  TrendingUp,
  TrendingDown,
  Scale,
  Calendar,
  Copy,
  Share2,
  Check,
  ChevronDown,
  ChevronUp,
  Info,
  ShieldCheck,
  PiggyBank,
  Truck
} from 'lucide-react';
import { Transaction } from '../../types/transaction';
import { BusinessDetails } from '../../types/quote';
import {
  calculateSelfAssessmentFigures,
  formatAccountantSummaryText,
  SelfAssessmentFigures
} from '../../services/selfAssessmentService';
import {
  filterTransactionsByPeriod,
  TaxPeriodFilter
} from '../../services/mtdExportService';
import { useToast } from '../../contexts/ToastContext';
import { shareToWhatsApp, shareViaWebShare, copyToClipboard } from '../../lib/shareUtils';

interface SelfAssessmentModalProps {
  transactions: Transaction[];
  businessDetails?: BusinessDetails;
  onClose: () => void;
}

export default function SelfAssessmentModal({
  transactions,
  businessDetails,
  onClose
}: SelfAssessmentModalProps) {
  const { showToast } = useToast();
  const [selectedPeriod, setSelectedPeriod] = useState<TaxPeriodFilter>('current_tax_year');
  const [cisInput, setCisInput] = useState<string>('');
  const [isCopied, setIsCopied] = useState(false);
  const [expandedBox, setExpandedBox] = useState<string | null>(null);

  // Filter transactions by selected tax period
  const { filtered, periodLabel } = useMemo(() => {
    return filterTransactionsByPeriod(transactions, selectedPeriod);
  }, [transactions, selectedPeriod]);

  const cisSuffered = parseFloat(cisInput) || 0;

  // Calculate figures
  const figures: SelfAssessmentFigures = useMemo(() => {
    return calculateSelfAssessmentFigures(filtered, cisSuffered);
  }, [filtered, cisSuffered]);

  const handleCopySummary = async () => {
    const text = formatAccountantSummaryText(figures, businessDetails, periodLabel);
    const success = await copyToClipboard(text);
    if (success) {
      setIsCopied(true);
      showToast('Summary copied to clipboard for your accountant!', 'success');
      setTimeout(() => setIsCopied(false), 3000);
    } else {
      showToast('Failed to copy to clipboard.', 'error');
    }
  };

  const handleShareSummary = async () => {
    const text = formatAccountantSummaryText(figures, businessDetails, periodLabel);
    const shared = await shareViaWebShare({
      title: 'Self Assessment Summary',
      text
    });
    if (!shared) {
      shareToWhatsApp(text);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4">
      {/* Backdrop */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="absolute inset-0 bg-zinc-950/50 backdrop-blur-md"
        onClick={onClose}
      />

      {/* Modal Container */}
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        className="relative bg-white dark:bg-zinc-900 rounded-[32px] w-full max-w-3xl overflow-hidden flex flex-col max-h-[90vh] shadow-2xl border border-zinc-200 dark:border-zinc-800"
      >
        {/* Header */}
        <div className="p-4 sm:p-6 border-b border-zinc-100 dark:border-zinc-800 flex items-center justify-between bg-zinc-50/50 dark:bg-zinc-900/50 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
              <Calculator className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-black text-sm sm:text-base text-zinc-900 dark:text-white uppercase tracking-tight">
                Self Assessment Preparation Assistant
              </h3>
              <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">
                Sole Trader Tax Estimation & SA103 Organiser
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="p-1.5 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 rounded-xl hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Scrollable Body */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-5">
          {/* MANDATORY LEGAL DISCLAIMER BANNER */}
          <div className="p-4 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/50 rounded-2xl flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
            <div className="space-y-1 text-xs">
              <span className="font-bold text-amber-900 dark:text-amber-200 block">
                Important Notice: For Planning & Preparation Only (Not Formal Tax Advice)
              </span>
              <p className="text-[11px] text-amber-800/90 dark:text-amber-300/90 leading-relaxed">
                This assistant is an organisational tool designed to help UK sole traders compile records for their accountant or annual Self Assessment return. It is <strong>NOT a tax calculation tool, chartered tax advice, or an HMRC filing portal</strong>. Final tax liabilities depend on individual circumstances, other employment income, student loans, and capital allowances. Always verify your return with a qualified accountant or official HMRC guidance.
              </p>
            </div>
          </div>

          {/* Period Filter Bar */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-3 bg-zinc-50 dark:bg-zinc-800/40 rounded-2xl border border-zinc-200/80 dark:border-zinc-800">
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              <span className="text-xs font-bold text-zinc-700 dark:text-zinc-300">
                Tax Period:
              </span>
              <select
                value={selectedPeriod}
                onChange={e => setSelectedPeriod(e.target.value as TaxPeriodFilter)}
                className="px-3 py-1.5 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-xl text-xs font-bold text-zinc-900 dark:text-white outline-none focus:ring-2 focus:ring-emerald-500"
              >
                <option value="current_tax_year">Current Tax Year (2025/26)</option>
                <option value="previous_tax_year">Previous Tax Year (2024/25)</option>
                <option value="all">All Recorded Transactions</option>
              </select>
            </div>

            <span className="text-[10px] font-semibold text-zinc-500">
              {filtered.length} transactions in this period
            </span>
          </div>

          {/* Core Financial Snapshot Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {/* Turnover (Box 10) */}
            <div className="p-4 bg-zinc-50 dark:bg-zinc-800/40 rounded-2xl border border-zinc-200/80 dark:border-zinc-800">
              <span className="text-[10px] font-black uppercase tracking-wider text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                <TrendingUp className="w-3.5 h-3.5" /> Turnover (Box 10)
              </span>
              <div className="text-xl font-black text-zinc-900 dark:text-white mt-1">
                £{figures.turnoverGross.toFixed(2)}
              </div>
              <p className="text-[10px] text-zinc-500 mt-0.5">
                Total recorded trade income
              </p>
            </div>

            {/* Total Expenses (Box 28) */}
            <div className="p-4 bg-zinc-50 dark:bg-zinc-800/40 rounded-2xl border border-zinc-200/80 dark:border-zinc-800">
              <span className="text-[10px] font-black uppercase tracking-wider text-rose-600 dark:text-rose-400 flex items-center gap-1">
                <TrendingDown className="w-3.5 h-3.5" /> Expenses (Box 28)
              </span>
              <div className="text-xl font-black text-zinc-900 dark:text-white mt-1">
                £{figures.allowableExpenses.toFixed(2)}
              </div>
              <p className="text-[10px] text-zinc-500 mt-0.5">
                Allowable business costs
              </p>
            </div>

            {/* Net Trading Profit (Box 31) */}
            <div className="p-4 bg-zinc-50 dark:bg-zinc-800/40 rounded-2xl border border-zinc-200/80 dark:border-zinc-800">
              <span className="text-[10px] font-black uppercase tracking-wider text-indigo-600 dark:text-indigo-400 flex items-center gap-1">
                <Scale className="w-3.5 h-3.5" /> Net Profit (Box 31)
              </span>
              <div className="text-xl font-black text-zinc-900 dark:text-white mt-1">
                £{figures.netTradingProfit.toFixed(2)}
              </div>
              <p className="text-[10px] text-zinc-500 mt-0.5">
                Taxable trading profit
              </p>
            </div>
          </div>

          {/* Estimated Tax & National Insurance Liability Block */}
          <div className="p-5 bg-gradient-to-br from-zinc-50 to-emerald-50/30 dark:from-zinc-800/60 dark:to-emerald-950/20 rounded-3xl border border-zinc-200 dark:border-zinc-800 space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div>
                <h4 className="text-sm font-bold text-zinc-900 dark:text-white flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-emerald-600" />
                  <span>Estimated Tax & NI Liability (UK 2025/26 Rates)</span>
                </h4>
                <p className="text-[10px] text-zinc-500 dark:text-zinc-400">
                  Calculated using standard £12,570 Personal Allowance, 20%/40% Income Tax, and 6% Class 4 NI.
                </p>
              </div>

              <div className="text-right">
                <span className="text-[10px] font-black uppercase tracking-wider text-zinc-400">
                  Total Estimated Liability
                </span>
                <div className="text-2xl font-black text-zinc-900 dark:text-white">
                  £{figures.totalEstimatedLiability.toFixed(2)}
                </div>
              </div>
            </div>

            {/* Detailed tax breakdown rows */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs pt-3 border-t border-zinc-200/60 dark:border-zinc-700/60">
              <div className="flex justify-between py-1 border-b border-zinc-100 dark:border-zinc-800">
                <span className="text-zinc-500">Tax-Free Personal Allowance:</span>
                <span className="font-semibold text-zinc-800 dark:text-zinc-200">£{figures.personalAllowance.toFixed(2)}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-zinc-100 dark:border-zinc-800">
                <span className="text-zinc-500">Taxable Profit (after allowance):</span>
                <span className="font-semibold text-zinc-800 dark:text-zinc-200">£{figures.taxableProfitAfterAllowance.toFixed(2)}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-zinc-100 dark:border-zinc-800">
                <span className="text-zinc-500">Estimated Income Tax:</span>
                <span className="font-semibold text-zinc-800 dark:text-zinc-200">£{figures.totalIncomeTax.toFixed(2)}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-zinc-100 dark:border-zinc-800">
                <span className="text-zinc-500">Estimated Class 4 National Insurance:</span>
                <span className="font-semibold text-zinc-800 dark:text-zinc-200">£{figures.totalClass4Ni.toFixed(2)}</span>
              </div>
            </div>

            {/* CIS Subcontractor Deductions Input */}
            <div className="p-3 bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-700/80 space-y-2">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div>
                  <span className="text-xs font-bold text-zinc-900 dark:text-white block">
                    CIS Deductions Suffered (Subcontractor Tax Withheld at Source)
                  </span>
                  <p className="text-[10px] text-zinc-500">
                    If main contractors deducted 20% CIS tax from your labour, enter your total CIS suffered from your payment deduction statements.
                  </p>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-bold text-zinc-400">£</span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={cisInput}
                    onChange={e => setCisInput(e.target.value)}
                    placeholder="0.00"
                    className="w-28 px-3 py-1.5 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl text-xs font-bold text-zinc-900 dark:text-white outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              </div>

              {cisSuffered > 0 && (
                <div className="pt-2 border-t border-zinc-100 dark:border-zinc-800 flex items-center justify-between text-xs">
                  <span className="font-bold text-zinc-700 dark:text-zinc-300">
                    {figures.isRefundDue ? 'Estimated HMRC Tax Refund Due:' : 'Remaining Balance Payable:'}
                  </span>
                  <span className={`font-black text-sm ${figures.isRefundDue ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}`}>
                    {figures.isRefundDue ? '+' : ''}£{Math.abs(figures.netEstimatedTaxDue).toFixed(2)}
                  </span>
                </div>
              )}
            </div>

            {/* Monthly Tax Pot Recommendation */}
            <div className="p-3 bg-emerald-50/80 dark:bg-emerald-950/40 rounded-2xl border border-emerald-200/80 dark:border-emerald-800/60 flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-2.5">
                <PiggyBank className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                <div>
                  <span className="text-xs font-bold text-emerald-900 dark:text-emerald-200 block">
                    Recommended Monthly Tax Savings Pot
                  </span>
                  <p className="text-[10px] text-emerald-700 dark:text-emerald-400">
                    Set aside this amount each month into a separate business savings account to prevent a January tax shock.
                  </p>
                </div>
              </div>
              <div className="text-lg font-black text-emerald-700 dark:text-emerald-300">
                ~£{figures.recommendedMonthlySavings} / mo
              </div>
            </div>

            {/* Payments on Account warning if applicable */}
            {figures.paymentsOnAccountRequired && (
              <div className="p-3 bg-amber-50/70 dark:bg-amber-950/30 rounded-xl border border-amber-200/70 dark:border-amber-900/40 text-[11px] text-amber-800 dark:text-amber-300 flex items-start gap-2">
                <Info className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <p>
                  <strong>Payments on Account Notice:</strong> Because your tax liability exceeds £1,000, HMRC will typically require two 50% advance instalments towards next year's tax (due 31 January and 31 July). Your estimated 31 Jan payment would be approximately <strong>£{figures.totalJanuaryDueEstimate.toFixed(2)}</strong> (Balancing payment £{figures.netEstimatedTaxDue.toFixed(2)} + 1st payment on account £{figures.firstPaymentOnAccount.toFixed(2)}).
                </p>
              </div>
            )}
          </div>

          {/* Box-by-Box HMRC SA103 Breakdown */}
          <div className="space-y-3">
            <h4 className="text-xs font-bold text-zinc-900 dark:text-white uppercase tracking-wider flex items-center justify-between">
              <span>HMRC SA103 Form Box-by-Box Breakdown</span>
              <span className="text-[10px] text-zinc-400 normal-case font-normal">
                Click box to view descriptions
              </span>
            </h4>

            <div className="space-y-2">
              {figures.boxBreakdown.map(box => {
                const isExpanded = expandedBox === box.boxNumber;

                return (
                  <div
                    key={box.boxNumber}
                    className="border border-zinc-200 dark:border-zinc-800 rounded-2xl overflow-hidden bg-white dark:bg-zinc-900"
                  >
                    <div
                      onClick={() => setExpandedBox(isExpanded ? null : box.boxNumber)}
                      className="p-3.5 flex items-center justify-between cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-800/40 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <span className="px-2 py-1 bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 font-mono font-bold text-xs rounded-lg shrink-0">
                          {box.boxNumber}
                        </span>
                        <div>
                          <span className="text-xs font-bold text-zinc-900 dark:text-white block">
                            {box.boxTitle}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <span className="text-xs font-mono font-bold text-zinc-900 dark:text-white">
                          £{box.amount.toFixed(2)}
                        </span>
                        {isExpanded ? (
                          <ChevronUp className="w-4 h-4 text-zinc-400" />
                        ) : (
                          <ChevronDown className="w-4 h-4 text-zinc-400" />
                        )}
                      </div>
                    </div>

                    {isExpanded && (
                      <div className="px-4 pb-3.5 pt-1 text-[11px] text-zinc-500 dark:text-zinc-400 border-t border-zinc-100 dark:border-zinc-800/80 bg-zinc-50/50 dark:bg-zinc-800/20">
                        {box.description}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Motor / Van Strategy Note */}
          <div className="p-4 bg-zinc-50 dark:bg-zinc-800/40 rounded-2xl border border-zinc-200/80 dark:border-zinc-800 flex items-start gap-3">
            <Truck className="w-5 h-5 text-zinc-500 shrink-0 mt-0.5" />
            <div className="space-y-1 text-xs">
              <span className="font-bold text-zinc-800 dark:text-zinc-200 block">
                Motor Expenses: Actual Van Costs vs. 45p Simplified Mileage
              </span>
              <p className="text-[11px] text-zinc-500 leading-relaxed">
                Your recorded motor expenses currently total <strong>£{figures.boxBreakdown.find(b => b.boxNumber === 'Box 12')?.amount.toFixed(2) || '0.00'}</strong> (actual fuel receipts, van insurance, servicing, MOT, and repairs). Under HMRC rules, you can choose between actual vehicle running costs OR simplified mileage allowance (45p/mile for the first 10,000 business miles, 25p thereafter). Ask your accountant which gives you the greater tax reduction!
              </p>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="p-4 sm:p-5 border-t border-zinc-100 dark:border-zinc-800 flex items-center justify-between gap-3 bg-zinc-50/50 dark:bg-zinc-900/50 shrink-0 flex-wrap">
          <p className="text-[10px] text-zinc-400 italic">
            Figures generated from your TribeTrade records.
          </p>

          <div className="flex items-center gap-2">
            <button
              onClick={handleShareSummary}
              className="px-3.5 py-2 bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-200 font-bold rounded-xl text-xs flex items-center gap-1.5 transition-all shadow-sm"
              title="Share summary via WhatsApp or email"
            >
              <Share2 className="w-3.5 h-3.5" />
              <span>Share</span>
            </button>

            <button
              onClick={handleCopySummary}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-xs flex items-center gap-1.5 transition-all shadow-sm active:scale-95"
            >
              {isCopied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{isCopied ? 'Copied!' : 'Copy for Accountant'}</span>
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
