import { Transaction } from '../types/transaction';
import { BusinessDetails } from '../types/quote';

export type TaxPeriodFilter =
  | 'current_tax_year'
  | 'previous_tax_year'
  | 'current_quarter'
  | 'previous_quarter'
  | 'all';

/**
 * Returns UK Tax Year boundaries (6 April to 5 April).
 */
export function getTaxYearDates(offsetYears: number = 0): { start: Date; end: Date; label: string } {
  const now = new Date();
  const currentYear = now.getFullYear();
  // If before April 6th, the current tax year started in April of the previous calendar year
  const taxYearStartYear = (now.getMonth() < 3 || (now.getMonth() === 3 && now.getDate() < 6))
    ? currentYear - 1
    : currentYear;

  const targetStartYear = taxYearStartYear + offsetYears;
  const start = new Date(targetStartYear, 3, 6); // 6 April
  const end = new Date(targetStartYear + 1, 3, 5, 23, 59, 59, 999); // 5 April next year
  const label = `${targetStartYear}/${(targetStartYear + 1).toString().slice(-2)}`;

  return { start, end, label };
}

/**
 * Filter transactions by selected tax period.
 */
export function filterTransactionsByPeriod(
  transactions: Transaction[],
  period: TaxPeriodFilter,
  customStart?: string,
  customEnd?: string
): { filtered: Transaction[]; periodLabel: string } {
  if (customStart && customEnd) {
    const start = new Date(customStart);
    const end = new Date(customEnd);
    end.setHours(23, 59, 59, 999);
    return {
      filtered: transactions.filter(t => {
        const d = new Date(t.date);
        return d >= start && d <= end;
      }),
      periodLabel: `${customStart} to ${customEnd}`
    };
  }

  const now = new Date();

  switch (period) {
    case 'current_tax_year': {
      const { start, end, label } = getTaxYearDates(0);
      return {
        filtered: transactions.filter(t => {
          const d = new Date(t.date);
          return d >= start && d <= end;
        }),
        periodLabel: `UK Tax Year ${label} (06/04/${start.getFullYear()} - 05/04/${end.getFullYear()})`
      };
    }
    case 'previous_tax_year': {
      const { start, end, label } = getTaxYearDates(-1);
      return {
        filtered: transactions.filter(t => {
          const d = new Date(t.date);
          return d >= start && d <= end;
        }),
        periodLabel: `UK Tax Year ${label} (06/04/${start.getFullYear()} - 05/04/${end.getFullYear()})`
      };
    }
    case 'current_quarter': {
      const quarter = Math.floor(now.getMonth() / 3);
      const start = new Date(now.getFullYear(), quarter * 3, 1);
      const end = new Date(now.getFullYear(), (quarter + 1) * 3, 0, 23, 59, 59, 999);
      return {
        filtered: transactions.filter(t => {
          const d = new Date(t.date);
          return d >= start && d <= end;
        }),
        periodLabel: `Q${quarter + 1} ${now.getFullYear()} (${start.toLocaleDateString('en-GB')} - ${end.toLocaleDateString('en-GB')})`
      };
    }
    case 'previous_quarter': {
      let quarter = Math.floor(now.getMonth() / 3) - 1;
      let year = now.getFullYear();
      if (quarter < 0) {
        quarter = 3;
        year -= 1;
      }
      const start = new Date(year, quarter * 3, 1);
      const end = new Date(year, (quarter + 1) * 3, 0, 23, 59, 59, 999);
      return {
        filtered: transactions.filter(t => {
          const d = new Date(t.date);
          return d >= start && d <= end;
        }),
        periodLabel: `Q${quarter + 1} ${year} (${start.toLocaleDateString('en-GB')} - ${end.toLocaleDateString('en-GB')})`
      };
    }
    case 'all':
    default:
      return {
        filtered: transactions,
        periodLabel: 'All Recorded Transactions'
      };
  }
}

/**
 * Escapes values for standard RFC 4180 CSV compliance.
 */
function escapeCsvValue(val: string | number | undefined | null): string {
  if (val === undefined || val === null) return '""';
  const str = String(val).replace(/"/g, '""');
  return `"${str}"`;
}

/**
 * Converts transactions into an HMRC Making Tax Digital (MTD) / SA103 compatible CSV string.
 */
export function generateMtdCsv(
  transactions: Transaction[],
  periodLabel: string,
  businessDetails?: BusinessDetails
): string {
  // Financial aggregations
  let totalIncomeNet = 0;
  let totalIncomeVat = 0;
  let totalIncomeGross = 0;

  let totalExpenseNet = 0;
  let totalExpenseVat = 0;
  let totalExpenseGross = 0;

  transactions.forEach(t => {
    if (t.type === 'income') {
      totalIncomeNet += t.netAmount || 0;
      totalIncomeVat += t.vatAmount || 0;
      totalIncomeGross += t.grossAmount || 0;
    } else {
      totalExpenseNet += t.netAmount || 0;
      totalExpenseVat += t.vatAmount || 0;
      totalExpenseGross += t.grossAmount || 0;
    }
  });

  const netTaxableProfit = totalIncomeNet - totalExpenseNet;
  const netVatPosition = totalIncomeVat - totalExpenseVat; // Positive = owe HMRC, Negative = refund due

  const lines: string[] = [];

  // Header metadata block
  lines.push(`"TRIBE TRADE - HMRC MAKING TAX DIGITAL & SELF ASSESSMENT EXPORT"`);
  lines.push(`"Business Name:",${escapeCsvValue(businessDetails?.businessName || 'Trade Business')}`);
  if (businessDetails?.tradingName) {
    lines.push(`"Trading Name:",${escapeCsvValue(businessDetails.tradingName)}`);
  }
  if (businessDetails?.vatNumber) {
    lines.push(`"VAT Number:",${escapeCsvValue(businessDetails.vatNumber)}`);
  }
  if (businessDetails?.companyNumber) {
    lines.push(`"Company Number:",${escapeCsvValue(businessDetails.companyNumber)}`);
  }
  lines.push(`"Accounting Period:",${escapeCsvValue(periodLabel)}`);
  lines.push(`"Export Generated At:",${escapeCsvValue(new Date().toLocaleString('en-GB'))}`);
  lines.push(
    `"HMRC Record Keeping Notice:","UK tax law requires retaining original paper/digital receipts for 5-6 years. Tribe Trade processes receipts ephemerally and does not store images."`
  );
  lines.push('');

  // Executive summary block
  lines.push(`"--- FINANCIAL SUMMARY ---"`);
  lines.push(`"Total Turnover / Income (Net)",${totalIncomeNet.toFixed(2)}`);
  lines.push(`"Total Allowable Expenses (Net)",${totalExpenseNet.toFixed(2)}`);
  lines.push(`"Net Taxable Profit / (Loss)",${netTaxableProfit.toFixed(2)}`);
  lines.push(`"Output VAT (Charged to Clients)",${totalIncomeVat.toFixed(2)}`);
  lines.push(`"Input VAT (Paid on Purchases)",${totalExpenseVat.toFixed(2)}`);
  lines.push(
    `"Net VAT Position (${netVatPosition >= 0 ? 'Due to HMRC' : 'HMRC Refund Due'})",${Math.abs(netVatPosition).toFixed(2)}`
  );
  lines.push('');

  // Detailed transactional ledger table
  lines.push(`"--- DETAILED TRANSACTION LEDGER ---"`);
  const headers = [
    'Date (DD/MM/YYYY)',
    'Type',
    'HMRC Box',
    'Category',
    'Vendor / Customer',
    'Description',
    'Reference / Receipt No',
    'Payment Method',
    'Net Amount (£)',
    'VAT Rate (%)',
    'VAT Amount (£)',
    'Gross Total (£)',
    'Source'
  ];
  lines.push(headers.map(h => `"${h}"`).join(','));

  transactions.forEach(t => {
    // Format date as DD/MM/YYYY for UK accountants
    const [y, m, d] = (t.date || '').split('-');
    const ukDate = y && m && d ? `${d}/${m}/${y}` : t.date;

    const row = [
      escapeCsvValue(ukDate),
      escapeCsvValue(t.type === 'income' ? 'Income' : 'Expense'),
      escapeCsvValue(t.hmrcBox || ''),
      escapeCsvValue(t.categoryLabel || t.category),
      escapeCsvValue(t.vendor),
      escapeCsvValue(t.description),
      escapeCsvValue(t.reference || ''),
      escapeCsvValue(t.paymentMethod.toUpperCase()),
      (t.netAmount || 0).toFixed(2),
      (t.vatRate || 0).toString(),
      (t.vatAmount || 0).toFixed(2),
      (t.grossAmount || 0).toFixed(2),
      escapeCsvValue(t.source === 'receipt_scan' ? 'AI Receipt Scan' : 'Manual Entry')
    ];
    lines.push(row.join(','));
  });

  return lines.join('\r\n');
}

/**
 * Triggers a browser file download of the generated MTD CSV.
 */
export function downloadMtdCsv(csvContent: string, filename: string): void {
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
