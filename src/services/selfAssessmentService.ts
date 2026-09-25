import { Transaction } from '../types/transaction';
import { BusinessDetails } from '../types/quote';

export interface SA103BoxItem {
  boxNumber: string;
  boxTitle: string;
  description: string;
  amount: number;
  categoryKeys: string[];
}

export interface SelfAssessmentFigures {
  // Trading totals
  turnoverGross: number; // Gross income
  allowableExpenses: number; // Total allowable expenses (Box 28)
  netTradingProfit: number; // Net profit (Box 31)

  // Tax calculations
  personalAllowance: number; // £12,570
  taxableProfitAfterAllowance: number;
  incomeTaxBasic: number; // 20%
  incomeTaxHigher: number; // 40%
  incomeTaxAdditional: number; // 45%
  totalIncomeTax: number;

  // National Insurance (Class 4)
  class4NiBasic: number; // 6%
  class4NiHigher: number; // 2%
  totalClass4Ni: number;

  // Combined liability
  totalEstimatedLiability: number; // Income Tax + Class 4 NI
  cisDeductionsSuffered: number; // CIS deducted by contractors
  netEstimatedTaxDue: number; // Remaining balance due (or refund if negative)
  isRefundDue: boolean;

  // Payments on Account & Savings
  paymentsOnAccountRequired: boolean; // Triggered if liability > £1,000
  firstPaymentOnAccount: number; // 50%
  secondPaymentOnAccount: number; // 50%
  totalJanuaryDueEstimate: number; // Balancing payment + 1st payment on account
  recommendedMonthlySavings: number; // Monthly savings pot recommendation

  // Box-by-box breakdown
  boxBreakdown: SA103BoxItem[];
}

/**
 * Calculates estimated Self Assessment figures based on current UK sole trader tax thresholds.
 * DISCLAIMER: For planning and estimation purposes only. Not formal tax advice.
 */
export function calculateSelfAssessmentFigures(
  transactions: Transaction[],
  cisDeductionsSuffered: number = 0
): SelfAssessmentFigures {
  let turnoverGross = 0;

  // Categories map for SA103 boxes
  const boxAmounts: Record<string, number> = {
    box11: 0, // Cost of goods & subcontractors
    box12: 0, // Motor expenses
    box14: 0, // Tools & repairs / plant hire
    box15: 0, // Premises & rent
    box16: 0, // Phone, internet, office
    box17: 0, // Advertising & marketing
    box18: 0, // Interest & bank finance
    box19: 0, // Accountancy, legal & trade insurance
    box20: 0  // Other expenses
  };

  transactions.forEach(t => {
    const net = t.netAmount || 0;
    if (t.type === 'income') {
      turnoverGross += net;
    } else {
      switch (t.category) {
        case 'materials_goods':
        case 'subcontractors':
          boxAmounts.box11 += net;
          break;
        case 'motor_travel':
          boxAmounts.box12 += net;
          break;
        case 'tools_equipment':
        case 'repairs_maintenance':
          boxAmounts.box14 += net;
          break;
        case 'premises_rent':
          boxAmounts.box15 += net;
          break;
        case 'office_admin':
          boxAmounts.box16 += net;
          break;
        case 'advertising':
          boxAmounts.box17 += net;
          break;
        case 'insurance_bank':
          // Split bank vs insurance or group under professional
          boxAmounts.box19 += net;
          break;
        case 'professional_fees':
          boxAmounts.box19 += net;
          break;
        case 'other_expenses':
        case 'wages_staff':
        default:
          boxAmounts.box20 += net;
          break;
      }
    }
  });

  const allowableExpenses = Object.values(boxAmounts).reduce((acc, curr) => acc + curr, 0);
  const netTradingProfit = Math.max(0, turnoverGross - allowableExpenses);

  // UK Tax Thresholds (Standard UK Sole Trader)
  const PERSONAL_ALLOWANCE = 12570;
  const BASIC_RATE_LIMIT = 50270;
  const HIGHER_RATE_LIMIT = 125140;

  // Personal allowance tapering over £100k
  let effectiveAllowance = PERSONAL_ALLOWANCE;
  if (netTradingProfit > 100000) {
    const reduction = Math.floor((netTradingProfit - 100000) / 2);
    effectiveAllowance = Math.max(0, PERSONAL_ALLOWANCE - reduction);
  }

  const taxableProfitAfterAllowance = Math.max(0, netTradingProfit - effectiveAllowance);

  // 1. Income Tax Calculation
  let incomeTaxBasic = 0;
  let incomeTaxHigher = 0;
  let incomeTaxAdditional = 0;

  if (taxableProfitAfterAllowance > 0) {
    const basicBandCapacity = BASIC_RATE_LIMIT - effectiveAllowance;
    if (taxableProfitAfterAllowance <= basicBandCapacity) {
      incomeTaxBasic = taxableProfitAfterAllowance * 0.20;
    } else {
      incomeTaxBasic = basicBandCapacity * 0.20;
      const higherBandProfit = Math.min(
        taxableProfitAfterAllowance - basicBandCapacity,
        HIGHER_RATE_LIMIT - BASIC_RATE_LIMIT
      );
      incomeTaxHigher = higherBandProfit * 0.40;

      if (netTradingProfit > HIGHER_RATE_LIMIT) {
        const additionalBandProfit = netTradingProfit - HIGHER_RATE_LIMIT;
        incomeTaxAdditional = additionalBandProfit * 0.45;
      }
    }
  }

  const totalIncomeTax = incomeTaxBasic + incomeTaxHigher + incomeTaxAdditional;

  // 2. Class 4 National Insurance Calculation (6% between £12,570 and £50,270, 2% above)
  let class4NiBasic = 0;
  let class4NiHigher = 0;

  if (netTradingProfit > PERSONAL_ALLOWANCE) {
    const basicNiBandProfit = Math.min(netTradingProfit, BASIC_RATE_LIMIT) - PERSONAL_ALLOWANCE;
    class4NiBasic = basicNiBandProfit * 0.06;

    if (netTradingProfit > BASIC_RATE_LIMIT) {
      const higherNiBandProfit = netTradingProfit - BASIC_RATE_LIMIT;
      class4NiHigher = higherNiBandProfit * 0.02;
    }
  }

  const totalClass4Ni = class4NiBasic + class4NiHigher;
  const totalEstimatedLiability = totalIncomeTax + totalClass4Ni;

  // CIS Deductions & Net Position
  const cleanCis = Math.max(0, cisDeductionsSuffered || 0);
  const netEstimatedTaxDue = totalEstimatedLiability - cleanCis;
  const isRefundDue = netEstimatedTaxDue < 0;

  // Payments on Account (triggered if net liability > £1,000)
  const paymentsOnAccountRequired = netEstimatedTaxDue > 1000;
  const firstPaymentOnAccount = paymentsOnAccountRequired ? netEstimatedTaxDue * 0.5 : 0;
  const secondPaymentOnAccount = paymentsOnAccountRequired ? netEstimatedTaxDue * 0.5 : 0;
  const totalJanuaryDueEstimate = Math.max(0, netEstimatedTaxDue) + firstPaymentOnAccount;

  // Recommended monthly savings
  const recommendedMonthlySavings = Math.max(0, Math.ceil(totalEstimatedLiability / 12));

  // Build SA103 Box Items
  const boxBreakdown: SA103BoxItem[] = [
    {
      boxNumber: 'Box 10',
      boxTitle: 'Turnover / Gross Business Income',
      description: 'Total invoiced and received trade income before any deductions.',
      amount: turnoverGross,
      categoryKeys: ['trade_income', 'other_income']
    },
    {
      boxNumber: 'Box 11',
      boxTitle: 'Cost of Goods Bought & Subcontractor Labour',
      description: 'Job materials, raw supplies, tiles, timber, copper, and payments to CIS subcontractors.',
      amount: boxAmounts.box11,
      categoryKeys: ['materials_goods', 'subcontractors']
    },
    {
      boxNumber: 'Box 12',
      boxTitle: 'Car, Van & Travel Expenses',
      description: 'Diesel, petrol, van insurance, MOT, servicing, road tax, parking, and congestion charges.',
      amount: boxAmounts.box12,
      categoryKeys: ['motor_travel']
    },
    {
      boxNumber: 'Box 14',
      boxTitle: 'Repairs & Maintenance / Plant & Tool Hire',
      description: 'Power tools, equipment hire, machinery servicing, plant hire, skip hire.',
      amount: boxAmounts.box14,
      categoryKeys: ['tools_equipment', 'repairs_maintenance']
    },
    {
      boxNumber: 'Box 15',
      boxTitle: 'Rent, Rates, Power & Insurance',
      description: 'Lock-up rent, workshop rates, yard storage, lighting, and power.',
      amount: boxAmounts.box15,
      categoryKeys: ['premises_rent']
    },
    {
      boxNumber: 'Box 16',
      boxTitle: 'Phone, Broadband, Stationery & Office Costs',
      description: 'Mobile phone bills, job management apps, office stationery, postage.',
      amount: boxAmounts.box16,
      categoryKeys: ['office_admin']
    },
    {
      boxNumber: 'Box 17',
      boxTitle: 'Advertising & Marketing Costs',
      description: 'Van signwriting, directory subscriptions (Checkatrade), website hosting, flyers.',
      amount: boxAmounts.box17,
      categoryKeys: ['advertising']
    },
    {
      boxNumber: 'Box 19',
      boxTitle: 'Professional Fees & Trade Insurance',
      description: 'Public liability insurance, Gas Safe / NICEIC registration, accountancy fees.',
      amount: boxAmounts.box19,
      categoryKeys: ['professional_fees', 'insurance_bank']
    },
    {
      boxNumber: 'Box 20',
      boxTitle: 'Other Allowable Business Expenses',
      description: 'Protective workwear, PPE, training courses, sundry trade expenses.',
      amount: boxAmounts.box20,
      categoryKeys: ['other_expenses', 'wages_staff']
    },
    {
      boxNumber: 'Box 28',
      boxTitle: 'Total Allowable Business Expenses',
      description: 'Sum of all allowable expense boxes (Box 11 through Box 20).',
      amount: allowableExpenses,
      categoryKeys: []
    },
    {
      boxNumber: 'Box 31',
      boxTitle: 'Net Business Profit',
      description: 'Turnover (Box 10) minus Total Allowable Expenses (Box 28). Subject to Income Tax and NI.',
      amount: netTradingProfit,
      categoryKeys: []
    }
  ];

  if (cleanCis > 0) {
    boxBreakdown.push({
      boxNumber: 'Box 38',
      boxTitle: 'Total CIS Deductions Suffered',
      description: 'Total 20% CIS tax withheld by contractors from your payments during this tax year.',
      amount: cleanCis,
      categoryKeys: []
    });
  }

  return {
    turnoverGross,
    allowableExpenses,
    netTradingProfit,
    personalAllowance: effectiveAllowance,
    taxableProfitAfterAllowance,
    incomeTaxBasic,
    incomeTaxHigher,
    incomeTaxAdditional,
    totalIncomeTax,
    class4NiBasic,
    class4NiHigher,
    totalClass4Ni,
    totalEstimatedLiability,
    cisDeductionsSuffered: cleanCis,
    netEstimatedTaxDue,
    isRefundDue,
    paymentsOnAccountRequired,
    firstPaymentOnAccount,
    secondPaymentOnAccount,
    totalJanuaryDueEstimate,
    recommendedMonthlySavings,
    boxBreakdown
  };
}

/**
 * Formats a clean, professional summary text suitable for emailing or copying to an accountant.
 */
export function formatAccountantSummaryText(
  figures: SelfAssessmentFigures,
  businessDetails?: BusinessDetails,
  periodLabel: string = 'Current UK Tax Year'
): string {
  const bizName = businessDetails?.businessName || businessDetails?.tradingName || 'Trade Business';

  const lines: string[] = [
    `========================================`,
    `TRIBE TRADE - SOLE TRADER SELF ASSESSMENT SUMMARY`,
    `========================================`,
    `Business: ${bizName}`,
    `Period: ${periodLabel}`,
    `Date Generated: ${new Date().toLocaleDateString('en-GB')}`,
    ``,
    `IMPORTANT NOTICE: This summary is generated from recorded trade transactions for preparation and planning purposes. It is not formal tax advice.`,
    ``,
    `--- 1. TRADING SUMMARY ---`,
    `Total Turnover (Gross Sales): £${figures.turnoverGross.toFixed(2)}`,
    `Total Allowable Expenses: £${figures.allowableExpenses.toFixed(2)}`,
    `Net Trading Profit: £${figures.netTradingProfit.toFixed(2)}`,
    ``,
    `--- 2. HMRC SA103 BOX BREAKDOWN ---`
  ];

  figures.boxBreakdown.forEach(b => {
    lines.push(`${b.boxNumber.padEnd(8)} ${b.boxTitle.padEnd(45)}: £${b.amount.toFixed(2)}`);
  });

  lines.push(``);
  lines.push(`--- 3. ESTIMATED TAX & NI LIABILITY (ESTIMATE ONLY) ---`);
  lines.push(`Personal Allowance: £${figures.personalAllowance.toFixed(2)}`);
  lines.push(`Estimated Income Tax (Basic 20% & Higher 40%): £${figures.totalIncomeTax.toFixed(2)}`);
  lines.push(`Estimated Class 4 National Insurance (6% & 2%): £${figures.totalClass4Ni.toFixed(2)}`);
  lines.push(`Total Combined Liability: £${figures.totalEstimatedLiability.toFixed(2)}`);

  if (figures.cisDeductionsSuffered > 0) {
    lines.push(`Less CIS Deductions Suffered (at source): -£${figures.cisDeductionsSuffered.toFixed(2)}`);
    if (figures.isRefundDue) {
      lines.push(`ESTIMATED HMRC REFUND DUE: £${Math.abs(figures.netEstimatedTaxDue).toFixed(2)}`);
    } else {
      lines.push(`ESTIMATED REMAINING TAX BALANCE: £${figures.netEstimatedTaxDue.toFixed(2)}`);
    }
  }

  if (figures.paymentsOnAccountRequired) {
    lines.push(``);
    lines.push(`--- 4. PAYMENTS ON ACCOUNT PREVIEW ---`);
    lines.push(`Liability exceeds £1,000 threshold for HMRC Payments on Account.`);
    lines.push(`Estimated 1st Payment on Account (due 31 Jan): £${figures.firstPaymentOnAccount.toFixed(2)}`);
    lines.push(`Estimated 2nd Payment on Account (due 31 Jul): £${figures.secondPaymentOnAccount.toFixed(2)}`);
    lines.push(`Estimated Total Jan Payment (Balance + 1st POA): £${figures.totalJanuaryDueEstimate.toFixed(2)}`);
  }

  lines.push(``);
  lines.push(`Recommended Monthly Tax Savings Pot: ~£${figures.recommendedMonthlySavings}/month`);
  lines.push(`========================================`);

  return lines.join('\n');
}
