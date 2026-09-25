import React, { useState, useEffect } from 'react';
import { 
  X, 
  Calendar as CalendarIcon, 
  Clock, 
  MapPin, 
  Warehouse, 
  ShoppingCart, 
  CheckCircle2, 
  AlertCircle, 
  ArrowRight, 
  FileText, 
  FileSpreadsheet, 
  Loader2, 
  Plus, 
  Check, 
  ExternalLink,
  Sparkles,
  Wrench,
  Hammer
} from 'lucide-react';
import { Quote, BusinessDetails, Invoice } from '../../types/quote';
import { formatCurrency } from '../../services/quotePdfService';
import { db } from '../../lib/firebase';
import { collection, addDoc, getDocs, updateDoc, doc, serverTimestamp } from 'firebase/firestore';
import { useAuth } from '../../App';
import { useToast } from '../../contexts/ToastContext';
import { detectCategory } from '../../lib/shoppingUtils';
import { convertQuoteToInvoice } from '../../services/invoiceService';

interface ShedStockItem {
  id: string;
  name: string;
  quantity: number;
  category?: string;
  unit?: string;
}

interface NeededItem {
  id: string;
  name: string;
  quantity: number | string;
  unit?: string;
  type: 'material' | 'hire' | 'tool' | 'other';
  inShed: boolean;
  shedQuantity?: number;
  shedUnit?: string;
  selectedForShopping: boolean;
}

interface QuoteAcceptanceModalProps {
  isOpen: boolean;
  onClose: () => void;
  quote: Quote | null;
  businessDetails: BusinessDetails;
  existingInvoices?: Invoice[];
  onInvoiceCreated?: (invoice: Invoice) => void;
}

export default function QuoteAcceptanceModal({
  isOpen,
  onClose,
  quote,
  businessDetails,
  existingInvoices = [],
  onInvoiceCreated
}: QuoteAcceptanceModalProps) {
  const { tradeUserId, user } = useAuth();
  const { showToast } = useToast();

  const [loadingShed, setLoadingShed] = useState(true);
  const [shedItems, setShedItems] = useState<ShedStockItem[]>([]);
  const [neededItems, setNeededItems] = useState<NeededItem[]>([]);
  const [customItemName, setCustomItemName] = useState('');

  // Calendar Booking State
  const [isBookingCalendar, setIsBookingCalendar] = useState(false);
  const [isCalendarBooked, setIsCalendarBooked] = useState(false);
  const [eventTitle, setEventTitle] = useState('');
  const [startDate, setStartDate] = useState('');
  const [startTime, setStartTime] = useState('08:30');
  const [endDate, setEndDate] = useState('');
  const [endTime, setEndTime] = useState('16:30');
  const [jobLocation, setJobLocation] = useState('');

  // Shopping List state
  const [isAddingToShopping, setIsAddingToShopping] = useState(false);
  const [shoppingAdded, setShoppingAdded] = useState(false);

  // Invoice creation state
  const [isCreatingInvoice, setIsCreatingInvoice] = useState(false);
  const [createdInvoiceNumber, setCreatedInvoiceNumber] = useState<string | null>(null);

  const activeTradeUserId = tradeUserId || (user ? `trade_${user.uid}` : '');

  // 1. Initialise Booking Details & Fetch Shed Inventory
  useEffect(() => {
    if (!isOpen || !quote) return;

    // Reset status flags
    setIsCalendarBooked(Boolean(quote.calendarEventId));
    setShoppingAdded(false);
    setCreatedInvoiceNumber(quote.invoiceId ? 'Converted' : null);

    // Initialise calendar fields
    setEventTitle(`${quote.jobTitle} - ${quote.customerName}`);
    setJobLocation(quote.customerAddress || '');

    // Estimate suggested booking date (defaults to next working day)
    const nextDay = new Date();
    nextDay.setDate(nextDay.getDate() + 1);
    // If weekend, push to Monday
    if (nextDay.getDay() === 6) nextDay.setDate(nextDay.getDate() + 2);
    if (nextDay.getDay() === 0) nextDay.setDate(nextDay.getDate() + 1);

    const nextDayIso = nextDay.toISOString().split('T')[0];
    setStartDate(nextDayIso);

    // Calculate duration based on labour
    const totalLabourDays = (quote.items || [])
      .filter(it => it.type === 'labour')
      .reduce((sum, it) => sum + (it.unit?.includes('d') ? it.quantity : it.quantity / 8), 0);

    const endD = new Date(nextDay);
    if (totalLabourDays > 1) {
      endD.setDate(endD.getDate() + Math.ceil(totalLabourDays) - 1);
    }
    setEndDate(endD.toISOString().split('T')[0]);

    // Fetch Shed inventory
    const fetchShed = async () => {
      if (!activeTradeUserId) {
        setLoadingShed(false);
        return;
      }
      try {
        setLoadingShed(true);
        const shedRef = collection(db, 'trade_users', activeTradeUserId, 'shedInventory');
        const snap = await getDocs(shedRef);
        const shedList = snap.docs.map(d => ({ id: d.id, ...d.data() } as ShedStockItem));
        setShedItems(shedList);

        // Extract materials & items from quote
        const extracted: NeededItem[] = [];

        (quote.items || []).forEach(it => {
          if (it.type === 'material' || it.type === 'hire' || it.type === 'other') {
            const cleanDesc = it.description.trim();
            const lowerDesc = cleanDesc.toLowerCase();

            // Match against shed items
            const matchedShed = shedList.find(s => {
              const shedName = s.name.toLowerCase();
              return lowerDesc.includes(shedName) || shedName.includes(lowerDesc);
            });

            const inShed = Boolean(matchedShed && matchedShed.quantity > 0);

            extracted.push({
              id: it.id,
              name: cleanDesc,
              quantity: it.quantity,
              unit: it.unit || '',
              type: it.type,
              inShed,
              shedQuantity: matchedShed?.quantity,
              shedUnit: matchedShed?.unit,
              selectedForShopping: !inShed
            });
          }
        });

        setNeededItems(extracted);
      } catch (err) {
        console.error('Failed to load shed inventory', err);
      } finally {
        setLoadingShed(false);
      }
    };

    fetchShed();
  }, [isOpen, quote, activeTradeUserId]);

  if (!isOpen || !quote) return null;

  // Toggle selection for shopping list
  const handleToggleShoppingItem = (id: string) => {
    setNeededItems(prev => prev.map(it => 
      it.id === id ? { ...it, selectedForShopping: !it.selectedForShopping } : it
    ));
  };

  // Add custom tool or material
  const handleAddCustomItem = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customItemName.trim()) return;

    const lowerName = customItemName.toLowerCase().trim();
    const matchedShed = shedItems.find(s => {
      const shedName = s.name.toLowerCase();
      return lowerName.includes(shedName) || shedName.includes(lowerName);
    });

    const inShed = Boolean(matchedShed && matchedShed.quantity > 0);

    const newItem: NeededItem = {
      id: 'custom_' + Date.now(),
      name: customItemName.trim(),
      quantity: 1,
      type: 'material',
      inShed,
      shedQuantity: matchedShed?.quantity,
      shedUnit: matchedShed?.unit,
      selectedForShopping: !inShed
    };

    setNeededItems(prev => [...prev, newItem]);
    setCustomItemName('');
  };

  // 2. Book into Calendar
  const handleBookCalendar = async () => {
    if (!activeTradeUserId) return;
    setIsBookingCalendar(true);

    try {
      const startDateTime = new Date(`${startDate}T${startTime}:00`).toISOString();
      const endDateTime = new Date(`${endDate}T${endTime}:00`).toISOString();

      const eventsRef = collection(db, 'trade_users', activeTradeUserId, 'calendarEvents');
      const docRef = await addDoc(eventsRef, {
        title: eventTitle,
        description: `Client: ${quote.customerName}\nTel: ${quote.customerPhone || 'N/A'}\nQuote Ref: ${quote.quoteNumber}\nTotal: ${formatCurrency(quote.grandTotal)}\n\nScope:\n${quote.jobDescription || quote.jobTitle}`,
        startTime: startDateTime,
        endTime: endDateTime,
        location: jobLocation,
        type: 'event',
        isShared: true,
        authorId: user?.uid || activeTradeUserId,
        assignedTo: user?.uid ? [user.uid] : [],
        quoteId: quote.id,
        quoteNumber: quote.quoteNumber,
        color: '#10b981', // emerald
        createdAt: new Date().toISOString()
      });

      // Update quote with event ID
      const quoteDoc = doc(db, 'trade_users', activeTradeUserId, 'quotes', quote.id);
      await updateDoc(quoteDoc, {
        calendarEventId: docRef.id,
        bookingStartDate: startDate,
        bookingEndDate: endDate,
        updatedAt: new Date().toISOString()
      });

      setIsCalendarBooked(true);
      showToast('Job booked into your calendar successfully', 'success');
    } catch (err: any) {
      showToast('Failed to book into calendar: ' + err.message, 'error');
    } finally {
      setIsBookingCalendar(false);
    }
  };

  // 3. Add to Trade Supplies / Shopping Pick List
  const handleAddToShoppingList = async () => {
    if (!activeTradeUserId) return;
    const toAdd = neededItems.filter(it => it.selectedForShopping);
    if (toAdd.length === 0) {
      showToast('No items selected to add to shopping list', 'info');
      return;
    }

    setIsAddingToShopping(true);
    try {
      const shoppingRef = collection(db, 'trade_users', activeTradeUserId, 'shoppingList');
      for (const item of toAdd) {
        const qtyLabel = item.unit ? `${item.quantity} ${item.unit}` : `${item.quantity}`;
        await addDoc(shoppingRef, {
          name: item.name,
          quantity: qtyLabel,
          category: detectCategory(item.name),
          checked: false,
          createdAt: serverTimestamp(),
          source: `Quote ${quote.quoteNumber}`
        });
      }

      setShoppingAdded(true);
      showToast(`Added ${toAdd.length} material${toAdd.length === 1 ? '' : 's'} to your pick list`, 'success');
    } catch (err: any) {
      showToast('Failed to add to shopping list: ' + err.message, 'error');
    } finally {
      setIsAddingToShopping(false);
    }
  };

  // 4. Convert to Invoice
  const handleConvertToInvoice = async () => {
    if (!activeTradeUserId) return;
    setIsCreatingInvoice(true);
    try {
      const invoice = await convertQuoteToInvoice(activeTradeUserId, quote, existingInvoices);
      setCreatedInvoiceNumber(invoice.invoiceNumber);
      showToast(`Created Invoice ${invoice.invoiceNumber}`, 'success');
      onInvoiceCreated?.(invoice);
    } catch (err: any) {
      showToast('Failed to convert to invoice: ' + err.message, 'error');
    } finally {
      setIsCreatingInvoice(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      <div className="bg-white dark:bg-zinc-900 w-full max-w-2xl rounded-3xl shadow-2xl border border-zinc-200 dark:border-zinc-800 overflow-hidden my-auto max-h-[92vh] flex flex-col">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-zinc-100 dark:border-zinc-800 flex items-center justify-between bg-gradient-to-r from-emerald-500/10 via-transparent to-blue-500/10">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-emerald-500 text-white flex items-center justify-center shadow-md">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base sm:text-lg font-black text-zinc-900 dark:text-white">
                  Job Won & Accepted!
                </h3>
                <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950/70 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800">
                  {quote.quoteNumber}
                </span>
              </div>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 truncate max-w-xs sm:max-w-md">
                Smart Convert: Book the job, check your shed stock, and prep materials
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

        {/* Content Body */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-6">
          {/* Section 1: Calendar Booking */}
          <div className="bg-zinc-50 dark:bg-zinc-800/40 rounded-2xl p-4 border border-zinc-100 dark:border-zinc-800 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CalendarIcon className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                <h4 className="text-xs font-black uppercase tracking-wider text-zinc-800 dark:text-zinc-200">
                  1. Schedule Job in Calendar
                </h4>
              </div>
              {isCalendarBooked ? (
                <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/60 px-2.5 py-0.5 rounded-full border border-emerald-200 dark:border-emerald-800">
                  <CheckCircle2 className="w-3.5 h-3.5" /> Booked
                </span>
              ) : null}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] font-bold uppercase text-zinc-400 block mb-1">
                  Calendar Event Title
                </label>
                <input
                  type="text"
                  value={eventTitle}
                  onChange={e => setEventTitle(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-xl text-zinc-800 dark:text-zinc-200 focus:ring-2 focus:ring-emerald-500 outline-none"
                />
              </div>

              <div>
                <label className="text-[10px] font-bold uppercase text-zinc-400 block mb-1">
                  Site / Customer Location
                </label>
                <div className="relative">
                  <MapPin className="w-3.5 h-3.5 text-zinc-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    value={jobLocation}
                    onChange={e => setJobLocation(e.target.value)}
                    placeholder="Enter job address..."
                    className="w-full pl-8 pr-3 py-2 text-xs bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-xl text-zinc-800 dark:text-zinc-200 focus:ring-2 focus:ring-emerald-500 outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="text-[10px] font-bold uppercase text-zinc-400 block mb-1">
                  Start Date & Time
                </label>
                <div className="flex gap-2">
                  <input
                    type="date"
                    value={startDate}
                    onChange={e => setStartDate(e.target.value)}
                    className="flex-1 px-2.5 py-2 text-xs bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-xl text-zinc-800 dark:text-zinc-200 outline-none"
                  />
                  <input
                    type="time"
                    value={startTime}
                    onChange={e => setStartTime(e.target.value)}
                    className="w-24 px-2 py-2 text-xs bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-xl text-zinc-800 dark:text-zinc-200 outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="text-[10px] font-bold uppercase text-zinc-400 block mb-1">
                  End Date & Time
                </label>
                <div className="flex gap-2">
                  <input
                    type="date"
                    value={endDate}
                    onChange={e => setEndDate(e.target.value)}
                    className="flex-1 px-2.5 py-2 text-xs bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-xl text-zinc-800 dark:text-zinc-200 outline-none"
                  />
                  <input
                    type="time"
                    value={endTime}
                    onChange={e => setEndTime(e.target.value)}
                    className="w-24 px-2 py-2 text-xs bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-xl text-zinc-800 dark:text-zinc-200 outline-none"
                  />
                </div>
              </div>
            </div>

            <div className="pt-2 flex justify-end">
              <button
                onClick={handleBookCalendar}
                disabled={isBookingCalendar || isCalendarBooked}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white rounded-xl text-xs font-bold inline-flex items-center gap-1.5 transition-all shadow-sm"
              >
                {isBookingCalendar ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : isCalendarBooked ? (
                  <Check className="w-3.5 h-3.5" />
                ) : (
                  <CalendarIcon className="w-3.5 h-3.5" />
                )}
                <span>{isCalendarBooked ? 'Job Booked in Calendar' : 'Confirm & Book into Calendar'}</span>
              </button>
            </div>
          </div>

          {/* Section 2: Materials & Shed Inventory Cross-Reference */}
          <div className="bg-zinc-50 dark:bg-zinc-800/40 rounded-2xl p-4 border border-zinc-100 dark:border-zinc-800 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Warehouse className="w-4 h-4 text-blue-500" />
                <h4 className="text-xs font-black uppercase tracking-wider text-zinc-800 dark:text-zinc-200">
                  2. Materials & Shed Inventory Check
                </h4>
              </div>
              <span className="text-[11px] text-zinc-400">
                {shedItems.length} items logged in The Shed
              </span>
            </div>

            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              We compared the required materials against what is currently stocked in your Shed. Select any items you need to order to add them to your shopping pick list.
            </p>

            {loadingShed ? (
              <div className="py-6 flex items-center justify-center gap-2 text-zinc-400 text-xs">
                <Loader2 className="w-4 h-4 animate-spin text-emerald-500" />
                <span>Checking Shed inventory...</span>
              </div>
            ) : neededItems.length === 0 ? (
              <div className="p-4 text-center text-xs text-zinc-400 bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800">
                No specific material line items found on this quote. You can manually add any below.
              </div>
            ) : (
              <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                {neededItems.map(item => (
                  <div
                    key={item.id}
                    onClick={() => handleToggleShoppingItem(item.id)}
                    className={`p-2.5 rounded-xl border flex items-center justify-between gap-3 cursor-pointer transition-all ${
                      item.selectedForShopping 
                        ? 'bg-emerald-50/50 dark:bg-emerald-950/20 border-emerald-300 dark:border-emerald-800' 
                        : 'bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <input
                        type="checkbox"
                        checked={item.selectedForShopping}
                        onChange={() => {}} // Handled by parent div
                        className="rounded text-emerald-600 focus:ring-emerald-500 w-4 h-4 cursor-pointer"
                      />
                      <div className="truncate">
                        <span className="text-xs font-bold text-zinc-900 dark:text-white block truncate">
                          {item.name}
                        </span>
                        <span className="text-[10px] text-zinc-400">
                          Required: {item.quantity} {item.unit || ''}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {item.inShed ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                          <Warehouse className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                          <span>In Shed ({item.shedQuantity} {item.shedUnit || 'in stock'})</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
                          <ShoppingCart className="w-3 h-3 text-amber-600 dark:text-amber-400" />
                          <span>Needs Ordering</span>
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Quick add custom material/tool */}
            <form onSubmit={handleAddCustomItem} className="flex gap-2 pt-1">
              <input
                type="text"
                value={customItemName}
                onChange={e => setCustomItemName(e.target.value)}
                placeholder="Add other required tool or material (e.g. Tile adhesive)..."
                className="flex-1 px-3 py-2 text-xs bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-xl text-zinc-800 dark:text-zinc-200 outline-none focus:ring-2 focus:ring-emerald-500"
              />
              <button
                type="submit"
                disabled={!customItemName.trim()}
                className="px-3 py-2 bg-zinc-200 hover:bg-zinc-300 dark:bg-zinc-700 dark:hover:bg-zinc-600 disabled:opacity-50 text-zinc-800 dark:text-zinc-100 rounded-xl text-xs font-bold flex items-center gap-1"
              >
                <Plus className="w-3.5 h-3.5" /> Add
              </button>
            </form>

            <div className="pt-2 flex justify-between items-center">
              <span className="text-[11px] text-zinc-500">
                {neededItems.filter(it => it.selectedForShopping).length} item(s) selected for pick list
              </span>
              <button
                onClick={handleAddToShoppingList}
                disabled={isAddingToShopping || shoppingAdded || neededItems.filter(it => it.selectedForShopping).length === 0}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white rounded-xl text-xs font-bold inline-flex items-center gap-1.5 transition-all shadow-sm"
              >
                {isAddingToShopping ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : shoppingAdded ? (
                  <Check className="w-3.5 h-3.5" />
                ) : (
                  <ShoppingCart className="w-3.5 h-3.5" />
                )}
                <span>{shoppingAdded ? 'Added to Pick List' : 'Add to Trade Shopping List'}</span>
              </button>
            </div>
          </div>

          {/* Section 3: Convert to Invoice Prompt */}
          <div className="bg-gradient-to-r from-emerald-500/10 via-teal-500/10 to-transparent dark:from-emerald-950/30 dark:via-teal-950/20 dark:to-transparent rounded-2xl p-4 border border-emerald-500/30 dark:border-emerald-500/20 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileSpreadsheet className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                <h4 className="text-xs font-black uppercase tracking-wider text-zinc-900 dark:text-white">
                  3. Convert to Invoice
                </h4>
              </div>
              {createdInvoiceNumber ? (
                <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/80 px-2 py-0.5 rounded-full border border-emerald-300 dark:border-emerald-700 flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3" /> Invoiced ({createdInvoiceNumber})
                </span>
              ) : (
                <span className="text-[10px] font-bold text-emerald-700 dark:text-emerald-300 bg-emerald-100 dark:bg-emerald-950 px-2 py-0.5 rounded-full border border-emerald-300 dark:border-emerald-800">
                  Recommended
                </span>
              )}
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="space-y-0.5">
                <p className="text-xs font-bold text-zinc-800 dark:text-zinc-200">
                  {createdInvoiceNumber 
                    ? `Invoice ${createdInvoiceNumber} has been generated and is ready for dispatch`
                    : 'Convert this quotation into a formal Tax Invoice now?'}
                </p>
                <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                  {createdInvoiceNumber
                    ? 'All items, labour, and materials have been ported across. You can view or share the PDF under the Invoices tab.'
                    : 'Automatically generates sequential invoice numbering, payment due date (+14 days), client billing details, and BACS bank transfer info.'}
                </p>
              </div>

              <div className="shrink-0">
                {createdInvoiceNumber ? (
                  <button
                    onClick={onClose}
                    className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold inline-flex items-center gap-1.5 transition-all shadow-sm"
                  >
                    <span>View Invoices</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                ) : (
                  <button
                    onClick={handleConvertToInvoice}
                    disabled={isCreatingInvoice}
                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black uppercase tracking-wider inline-flex items-center gap-2 transition-all shadow-md active:scale-95 disabled:opacity-60"
                  >
                    {isCreatingInvoice ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileSpreadsheet className="w-4 h-4" />}
                    <span>Convert to Invoice</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-zinc-100 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-800/60 flex items-center justify-between shrink-0">
          <span className="text-xs text-zinc-400">
            Quote Value: <strong className="text-zinc-800 dark:text-zinc-200">{formatCurrency(quote.grandTotal)}</strong>
          </span>
          <div className="flex items-center gap-2">
            {!createdInvoiceNumber && (
              <button
                onClick={async () => {
                  if (!isCalendarBooked) await handleBookCalendar();
                  const toAdd = neededItems.filter(it => it.selectedForShopping);
                  if (!shoppingAdded && toAdd.length > 0) await handleAddToShoppingList();
                  await handleConvertToInvoice();
                }}
                disabled={isCreatingInvoice}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all shadow-md inline-flex items-center gap-1.5 active:scale-95 disabled:opacity-60"
              >
                {isCreatingInvoice ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileSpreadsheet className="w-3.5 h-3.5" />}
                <span>Convert to Invoice & Finish</span>
              </button>
            )}
            <button
              onClick={onClose}
              className="px-4 py-2 bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 hover:bg-zinc-800 rounded-xl text-xs font-bold transition-all shadow-sm"
            >
              {createdInvoiceNumber ? 'Done' : 'Done / Skip Invoice'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
