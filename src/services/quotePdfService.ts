import { jsPDF } from 'jspdf';
import { Quote, Invoice, BusinessDetails } from '../types/quote';

/**
 * Formats currency amount in GBP (£) with 2 decimal places.
 */
export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: 'GBP',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(amount);
}

/**
 * Builds a clean, professional A4 PDF vector document for a Trade Quote or Invoice.
 */
export function buildDocumentPDF(
  item: (Quote | Invoice) & { docType?: 'quote' | 'invoice'; validUntil?: string; dueDate?: string; invoiceNumber?: string; quoteNumber?: string }, 
  business: BusinessDetails
): jsPDF {
  const isInvoice = item.docType === 'invoice' || Boolean(item.invoiceNumber);
  const docData = item;
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4'
  });

  const pageWidth = 210;
  const pageHeight = 297;
  const margin = 18;
  const contentWidth = pageWidth - margin * 2;

  let y = margin;

  // 1. Header Banner / Business Details (Left) & Reference (Right)
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.setTextColor(24, 24, 27); // zinc-900
  const companyName = business.businessName || business.tradingName || (isInvoice ? 'Trade Invoice' : 'Trade Quotation');
  doc.text(companyName, margin, y + 2);

  // Title & Reference (Right Aligned)
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(16, 185, 129); // emerald-500
  doc.text(isInvoice ? 'INVOICE' : 'QUOTATION', pageWidth - margin, y + 2, { align: 'right' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  doc.setTextColor(82, 82, 91); // zinc-600
  const refText = isInvoice 
    ? `Inv: ${item.invoiceNumber || 'Draft'}` 
    : `Ref: ${item.quoteNumber || 'Draft'}`;
  doc.text(refText, pageWidth - margin, y + 8, { align: 'right' });

  y += 10;

  // Business Address & Contact Info
  doc.setFontSize(9);
  doc.setTextColor(113, 113, 122); // zinc-500
  const businessLines: string[] = [];
  if (business.addressLine1) businessLines.push(business.addressLine1);
  if (business.addressLine2) businessLines.push(business.addressLine2);
  const townPostcode = [business.townCity, business.postcode].filter(Boolean).join(', ');
  if (townPostcode) businessLines.push(townPostcode);
  if (business.phone) businessLines.push(`Tel: ${business.phone}`);
  if (business.email) businessLines.push(`Email: ${business.email}`);

  businessLines.forEach(line => {
    doc.text(line, margin, y);
    y += 4.5;
  });

  // Business Reg & VAT info on the right
  let metaY = margin + 14;
  doc.setFontSize(8.5);
  doc.setTextColor(113, 113, 122);
  doc.text(`Date Issued: ${item.dateIssued || new Date().toISOString().split('T')[0]}`, pageWidth - margin, metaY, { align: 'right' });
  metaY += 4.5;
  if (isInvoice) {
    doc.text(`Payment Due: ${item.dueDate || '14 days'}`, pageWidth - margin, metaY, { align: 'right' });
    metaY += 4.5;
    if (item.quoteNumber) {
      doc.text(`Quote Ref: ${item.quoteNumber}`, pageWidth - margin, metaY, { align: 'right' });
      metaY += 4.5;
    }
  } else {
    doc.text(`Valid Until: ${item.validUntil || '30 days'}`, pageWidth - margin, metaY, { align: 'right' });
    metaY += 4.5;
  }
  if (business.companyNumber) {
    doc.text(`Company Reg: ${business.companyNumber}`, pageWidth - margin, metaY, { align: 'right' });
    metaY += 4.5;
  }
  if (business.isVatRegistered && business.vatNumber) {
    doc.text(`VAT Reg: ${business.vatNumber}`, pageWidth - margin, metaY, { align: 'right' });
    metaY += 4.5;
  }

  y = Math.max(y + 2, metaY + 2);

  // Subtle divider
  doc.setDrawColor(228, 228, 231); // zinc-200
  doc.setLineWidth(0.5);
  doc.line(margin, y, pageWidth - margin, y);
  y += 6;

  // 2. Client / Customer Block & Job Details Box
  const colWidth = (contentWidth / 2) - 10;
  const clientInfoParts = [docData.customerAddress, docData.customerPhone, docData.customerEmail].filter(Boolean);
  const clientInfoStr = clientInfoParts.join(' • ');
  const clientLines: string[] = clientInfoStr ? doc.splitTextToSize(clientInfoStr, colWidth) : [];
  const descLines: string[] = docData.jobDescription ? doc.splitTextToSize(docData.jobDescription, colWidth) : [];

  const maxLines = Math.max(descLines.length, clientLines.length, 1);
  const boxHeight = Math.max(24, 15 + (maxLines * 4.2));

  doc.setFillColor(250, 250, 250); // zinc-50
  doc.roundedRect(margin, y, contentWidth, boxHeight, 2, 2, 'F');
  doc.setDrawColor(244, 244, 245);
  doc.roundedRect(margin, y, contentWidth, boxHeight, 2, 2, 'S');

  // Customer column
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(161, 161, 170); // zinc-400
  doc.text('CLIENT DETAILS', margin + 5, y + 6);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(24, 24, 27);
  doc.text(docData.customerName || 'Customer', margin + 5, y + 11.5);

  if (clientLines.length > 0) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(82, 82, 91);
    doc.text(clientLines, margin + 5, y + 16.5, { lineHeightFactor: 1.25 });
  }

  // Job Title column
  const rightColX = margin + (contentWidth / 2) + 5;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(161, 161, 170);
  doc.text('JOB TITLE / WORKS', rightColX, y + 6);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(24, 24, 27);
  doc.text(docData.jobTitle || 'General Trade Works', rightColX, y + 11.5);

  if (descLines.length > 0) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(82, 82, 91);
    doc.text(descLines, rightColX, y + 16.5, { lineHeightFactor: 1.25 });
  }

  y += boxHeight + 6;

  // 3. Line Items Table Header
  doc.setFillColor(244, 244, 245); // zinc-100
  doc.rect(margin, y, contentWidth, 7.5, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(82, 82, 91);

  doc.text('ITEM / DESCRIPTION', margin + 4, y + 5);
  doc.text('CATEGORY', margin + 85, y + 5);
  doc.text('QTY', margin + 115, y + 5, { align: 'right' });
  doc.text('RATE (£)', margin + 140, y + 5, { align: 'right' });
  doc.text('TOTAL (£)', pageWidth - margin - 4, y + 5, { align: 'right' });

  y += 8;

  // 4. Line Items Rows
  const items = docData.items || [];
  if (items.length === 0) {
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(9);
    doc.setTextColor(161, 161, 170);
    doc.text('No line items added.', margin + 4, y + 7);
    y += 12;
  } else {
    items.forEach((lineItem, index) => {
      // Check for page break
      if (y > pageHeight - 65) {
        doc.addPage();
        y = margin;
      }

      const isEven = index % 2 === 0;
      if (isEven) {
        doc.setFillColor(253, 253, 253);
        doc.rect(margin, y, contentWidth, 7.5, 'F');
      }

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.5);
      doc.setTextColor(24, 24, 27);

      const truncatedDesc = lineItem.description.length > 45 ? lineItem.description.substring(0, 42) + '...' : lineItem.description;
      doc.text(truncatedDesc, margin + 4, y + 5);

      // Category / Type Badge Text
      doc.setFontSize(7.5);
      doc.setTextColor(113, 113, 122);
      const typeLabel = lineItem.type === 'labour' ? 'Labour' : lineItem.type === 'material' ? 'Material / Paint' : lineItem.type === 'hire' ? 'Equipment' : 'Other';
      doc.text(typeLabel, margin + 85, y + 5);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.5);
      doc.setTextColor(24, 24, 27);
      const qtyLabel = lineItem.unit?.includes('d') || lineItem.unit?.includes('h')
        ? lineItem.unit
        : (lineItem.unit ? `${lineItem.quantity} ${lineItem.unit}` : `${lineItem.quantity}`);
      doc.text(qtyLabel, margin + 115, y + 5, { align: 'right' });
      doc.text(formatCurrency(lineItem.unitPrice).replace('£', ''), margin + 140, y + 5, { align: 'right' });
      doc.setFont('helvetica', 'bold');
      doc.text(formatCurrency(lineItem.total), pageWidth - margin - 4, y + 5, { align: 'right' });

      y += 7.5;
    });
  }

  // Divider line after table
  doc.setDrawColor(228, 228, 231);
  doc.line(margin, y, pageWidth - margin, y);
  y += 6;

  // 5. Financial Summary & BACS Payment Details Section
  // Left: BACS Payment Details Box
  const leftBoxWidth = 95;
  doc.setFillColor(250, 250, 250);
  doc.roundedRect(margin, y, leftBoxWidth, 38, 2, 2, 'F');
  doc.setDrawColor(244, 244, 245);
  doc.roundedRect(margin, y, leftBoxWidth, 38, 2, 2, 'S');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(16, 185, 129); // emerald-500
  doc.text('BACS PAYMENT DETAILS', margin + 4, y + 6);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(63, 63, 70);
  let bacsY = y + 12;
  if (business.bankName) {
    doc.text(`Bank: ${business.bankName}`, margin + 4, bacsY);
    bacsY += 4.5;
  }
  if (business.accountName) {
    doc.text(`Account Name: ${business.accountName}`, margin + 4, bacsY);
    bacsY += 4.5;
  }
  if (business.sortCode) {
    doc.text(`Sort Code: ${business.sortCode}`, margin + 4, bacsY);
    bacsY += 4.5;
  }
  if (business.accountNumber) {
    doc.text(`Account No: ${business.accountNumber}`, margin + 4, bacsY);
    bacsY += 4.5;
  }
  const termsText = isInvoice
    ? (docData.paymentTerms || business.defaultPaymentTerms || (docData.dueDate ? `Payment due by ${docData.dueDate}.` : 'Payment due within 14 days of invoice.'))
    : (docData.paymentTerms || business.defaultQuoteTerms || 'Payment due within 14 days of completion.');
  doc.setFont('helvetica', 'italic');
  doc.setFontSize(7.5);
  doc.setTextColor(113, 113, 122);
  doc.text(termsText, margin + 4, bacsY, { maxWidth: leftBoxWidth - 8 });

  // Right: Totals Breakdown Box
  const totalsX = pageWidth - margin - 75;
  const totalsValX = pageWidth - margin - 4;
  let totalsY = y + 4;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(113, 113, 122);

  if (docData.subtotalLabour > 0) {
    doc.text('Labour Subtotal:', totalsX, totalsY);
    doc.text(formatCurrency(docData.subtotalLabour), totalsValX, totalsY, { align: 'right' });
    totalsY += 5.5;
  }

  if (docData.subtotalMaterials > 0) {
    doc.text('Materials & Consumables:', totalsX, totalsY);
    doc.text(formatCurrency(docData.subtotalMaterials), totalsValX, totalsY, { align: 'right' });
    totalsY += 5.5;
  }

  doc.text('Net Subtotal:', totalsX, totalsY);
  doc.text(formatCurrency(docData.netTotal), totalsValX, totalsY, { align: 'right' });
  totalsY += 5.5;

  if (docData.isVatRegistered) {
    doc.text(`VAT (${docData.vatRate || 20}%):`, totalsX, totalsY);
    doc.text(formatCurrency(docData.vatAmount), totalsValX, totalsY, { align: 'right' });
    totalsY += 6;
  }

  // Grand Total Highlight
  doc.setFillColor(16, 185, 129, 0.1); // emerald-50 tint
  doc.roundedRect(totalsX - 3, totalsY - 3, 78, 10, 1.5, 1.5, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(16, 185, 129);
  doc.text(isInvoice ? 'TOTAL DUE:' : 'QUOTE TOTAL:', totalsX, totalsY + 4);
  doc.text(formatCurrency(docData.grandTotal), totalsValX, totalsY + 4, { align: 'right' });

  y += 44;

  // 6. Notes & Terms
  const docNotes = docData.notes || (isInvoice ? '' : business.defaultQuoteTerms);
  if (docNotes) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(161, 161, 170);
    doc.text(isInvoice ? 'INVOICE NOTES' : 'TERMS & CONDITIONS', margin, y);
    y += 4;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(113, 113, 122);
    const notesSplit = doc.splitTextToSize(docNotes, contentWidth);
    doc.text(notesSplit, margin, y);
  }

  // Footer Tagline
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(161, 161, 170);
  doc.text('Generated with TribeTrade • Professional Trade Management', pageWidth / 2, pageHeight - 8, { align: 'center' });

  return doc;
}

/**
 * Builds a clean, professional A4 PDF vector document for a Trade Quote.
 */
export function buildQuotePDF(quote: Quote, business: BusinessDetails): jsPDF {
  return buildDocumentPDF({ ...quote, docType: 'quote' }, business);
}

/**
 * Builds a clean, professional A4 PDF vector document for an Invoice.
 */
export function buildInvoicePDF(invoice: Invoice, business: BusinessDetails): jsPDF {
  return buildDocumentPDF({ ...invoice, docType: 'invoice' }, business);
}

/**
 * Returns a PDF Blob for the quote.
 */
export function generateQuotePDFBlob(quote: Quote, business: BusinessDetails): Blob {
  const doc = buildQuotePDF(quote, business);
  return doc.output('blob');
}

/**
 * Returns a PDF Blob for the invoice.
 */
export function generateInvoicePDFBlob(invoice: Invoice, business: BusinessDetails): Blob {
  const doc = buildInvoicePDF(invoice, business);
  return doc.output('blob');
}

/**
 * Triggers a direct download of the quote PDF in the browser.
 */
export function downloadQuotePDF(quote: Quote, business: BusinessDetails): void {
  const doc = buildQuotePDF(quote, business);
  const fileName = `Quote-${quote.quoteNumber || 'Draft'}.pdf`;
  doc.save(fileName);
}

/**
 * Triggers a direct download of the invoice PDF in the browser.
 */
export function downloadInvoicePDF(invoice: Invoice, business: BusinessDetails): void {
  const doc = buildInvoicePDF(invoice, business);
  const fileName = `Invoice-${invoice.invoiceNumber || 'Draft'}.pdf`;
  doc.save(fileName);
}

/**
 * Shares the Quote PDF using the device's native Web Share API with files.
 */
export async function shareQuotePDF(
  quote: Quote,
  business: BusinessDetails
): Promise<{ shared: boolean; method: 'native' | 'download' }> {
  const blob = generateQuotePDFBlob(quote, business);
  const fileName = `Quote-${quote.quoteNumber || 'Draft'}.pdf`;
  const file = new File([blob], fileName, { type: 'application/pdf' });

  const shareTitle = `Quote ${quote.quoteNumber} - ${business.businessName || business.tradingName || 'Trade Quotation'}`;
  const shareText = `Please find attached quotation ${quote.quoteNumber} for ${quote.customerName || 'your project'} from ${business.businessName || business.tradingName || 'our business'}. Total: ${formatCurrency(quote.grandTotal)}.`;

  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({
        files: [file],
        title: shareTitle,
        text: shareText
      });
      return { shared: true, method: 'native' };
    } catch (err: any) {
      if (err.name === 'AbortError') {
        return { shared: false, method: 'native' };
      }
      console.warn('Native file share failed, falling back to download', err);
    }
  }

  downloadQuotePDF(quote, business);
  return { shared: true, method: 'download' };
}

/**
 * Shares the Invoice PDF using the device's native Web Share API with files.
 */
export async function shareInvoicePDF(
  invoice: Invoice,
  business: BusinessDetails
): Promise<{ shared: boolean; method: 'native' | 'download' }> {
  const blob = generateInvoicePDFBlob(invoice, business);
  const fileName = `Invoice-${invoice.invoiceNumber || 'Draft'}.pdf`;
  const file = new File([blob], fileName, { type: 'application/pdf' });

  const shareTitle = `Invoice ${invoice.invoiceNumber} - ${business.businessName || business.tradingName || 'Trade Invoice'}`;
  const shareText = `Please find attached invoice ${invoice.invoiceNumber} for ${invoice.customerName || 'your project'} from ${business.businessName || business.tradingName || 'our business'}. Total: ${formatCurrency(invoice.grandTotal)}. Payment due: ${invoice.dueDate}.`;

  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({
        files: [file],
        title: shareTitle,
        text: shareText
      });
      return { shared: true, method: 'native' };
    } catch (err: any) {
      if (err.name === 'AbortError') {
        return { shared: false, method: 'native' };
      }
      console.warn('Native file share failed, falling back to download', err);
    }
  }

  downloadInvoicePDF(invoice, business);
  return { shared: true, method: 'download' };
}

/**
 * Shares formatted quote details directly to WhatsApp.
 */
export function shareQuoteViaWhatsApp(quote: Quote, business: BusinessDetails): void {
  const companyName = business.businessName || business.tradingName || 'TribeTrade';
  const lines: string[] = [];

  lines.push(`📄 *QUOTATION: ${quote.quoteNumber}*`);
  lines.push(`From: *${companyName}*`);
  if (quote.jobTitle) lines.push(`Job: *${quote.jobTitle}*`);
  lines.push(`For: ${quote.customerName}`);
  lines.push(`Date: ${quote.dateIssued}`);
  lines.push('────────────────────────');

  if (quote.items && quote.items.length > 0) {
    lines.push('*Items & Scope:*');
    quote.items.forEach(item => {
      const qtyStr = item.unit ? `${item.quantity} ${item.unit}` : `${item.quantity}`;
      lines.push(`• ${item.description} (${qtyStr} @ ${formatCurrency(item.unitPrice)}) = ${formatCurrency(item.total)}`);
    });
    lines.push('────────────────────────');
  }

  if (quote.subtotalLabour > 0) {
    lines.push(`Labour Subtotal: ${formatCurrency(quote.subtotalLabour)}`);
  }
  if (quote.subtotalMaterials > 0) {
    lines.push(`Materials Subtotal: ${formatCurrency(quote.subtotalMaterials)}`);
  }
  if (quote.isVatRegistered) {
    lines.push(`Net Total: ${formatCurrency(quote.netTotal)}`);
    lines.push(`VAT (${quote.vatRate}%): ${formatCurrency(quote.vatAmount)}`);
  }
  lines.push(`*Total Due: ${formatCurrency(quote.grandTotal)}*`);

  if (business.bankName && business.sortCode && business.accountNumber) {
    lines.push('');
    lines.push('*BACS Payment Details:*');
    lines.push(`Bank: ${business.bankName}`);
    if (business.accountName) lines.push(`Account: ${business.accountName}`);
    lines.push(`Sort Code: ${business.sortCode}`);
    lines.push(`Account No: ${business.accountNumber}`);
  }

  const terms = quote.paymentTerms || business.defaultPaymentTerms;
  if (terms) {
    lines.push('');
    lines.push(`_Terms: ${terms}_`);
  }

  const encoded = encodeURIComponent(lines.join('\n'));
  const phone = quote.customerPhone ? quote.customerPhone.replace(/[^0-9+]/g, '') : '';
  const url = phone ? `https://wa.me/${phone}?text=${encoded}` : `https://wa.me/?text=${encoded}`;
  window.open(url, '_blank', 'noopener,noreferrer');
}

/**
 * Shares formatted invoice details directly to WhatsApp.
 */
export function shareInvoiceViaWhatsApp(invoice: Invoice, business: BusinessDetails): void {
  const companyName = business.businessName || business.tradingName || 'TribeTrade';
  const lines: string[] = [];

  lines.push(`🧾 *INVOICE: ${invoice.invoiceNumber}*`);
  lines.push(`From: *${companyName}*`);
  if (invoice.jobTitle) lines.push(`Job: *${invoice.jobTitle}*`);
  lines.push(`For: ${invoice.customerName}`);
  lines.push(`Issued: ${invoice.dateIssued}`);
  lines.push(`*Payment Due: ${invoice.dueDate}*`);
  if (invoice.quoteNumber) lines.push(`Quote Ref: ${invoice.quoteNumber}`);
  lines.push('────────────────────────');

  if (invoice.items && invoice.items.length > 0) {
    lines.push('*Completed Works & Items:*');
    invoice.items.forEach(item => {
      const qtyStr = item.unit ? `${item.quantity} ${item.unit}` : `${item.quantity}`;
      lines.push(`• ${item.description} (${qtyStr} @ ${formatCurrency(item.unitPrice)}) = ${formatCurrency(item.total)}`);
    });
    lines.push('────────────────────────');
  }

  if (invoice.subtotalLabour > 0) {
    lines.push(`Labour Subtotal: ${formatCurrency(invoice.subtotalLabour)}`);
  }
  if (invoice.subtotalMaterials > 0) {
    lines.push(`Materials Subtotal: ${formatCurrency(invoice.subtotalMaterials)}`);
  }
  if (invoice.isVatRegistered) {
    lines.push(`Net Total: ${formatCurrency(invoice.netTotal)}`);
    lines.push(`VAT (${invoice.vatRate}%): ${formatCurrency(invoice.vatAmount)}`);
  }
  lines.push(`*Total Balance Due: ${formatCurrency(invoice.grandTotal)}*`);

  if (business.bankName && business.sortCode && business.accountNumber) {
    lines.push('');
    lines.push('*BACS Payment Details:*');
    lines.push(`Bank: ${business.bankName}`);
    if (business.accountName) lines.push(`Account: ${business.accountName}`);
    lines.push(`Sort Code: ${business.sortCode}`);
    lines.push(`Account No: ${business.accountNumber}`);
  }

  const terms = invoice.paymentTerms || business.defaultPaymentTerms;
  if (terms) {
    lines.push('');
    lines.push(`_Terms: ${terms}_`);
  }

  const encoded = encodeURIComponent(lines.join('\n'));
  const phone = invoice.customerPhone ? invoice.customerPhone.replace(/[^0-9+]/g, '') : '';
  const url = phone ? `https://wa.me/${phone}?text=${encoded}` : `https://wa.me/?text=${encoded}`;
  window.open(url, '_blank', 'noopener,noreferrer');
}
