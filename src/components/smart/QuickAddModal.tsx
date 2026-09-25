import { useState, useEffect, useRef } from 'react';
import { X, Calendar, CheckSquare, Package, ShoppingCart, Clock, MapPin, Tag, Plus, User, ShieldCheck, Camera, Loader2, Navigation, StickyNote, Circle, FileText, ReceiptPoundSterling, PoundSterling, Building } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { db } from '../../lib/firebase';
import { collection, addDoc, onSnapshot, serverTimestamp, updateDoc, getCountFromServer, doc, getDoc } from 'firebase/firestore';
import { useAuth } from '../../App';
import { useSettings } from '../../contexts/SettingsContext';
import { processSmartCapture } from '../../services/smartCaptureService';
import { useSubscriptionTier } from '../../hooks/useSubscriptionTier';
import { useToast } from '../../contexts/ToastContext';
import { logger } from '../../services/logger';
import { syncToGoogleCalendar } from '../../services/googleCalendar';
import CameraChoiceModal from '../common/CameraChoiceModal';
import SmartCaptureModal from '../smart/SmartCaptureModal';
import { combineDateTimeToISO, combineDateTimeToDate, formatToLocalDate } from '../../lib/dateUtils';
import { saveQuote, generateNextQuoteNumber, subscribeQuotes } from '../../services/quoteService';
import { saveTransaction } from '../../services/receiptService';
import { TRANSACTION_CATEGORIES, TransactionCategoryKey, PaymentMethod } from '../../types/transaction';
import { Quote } from '../../types/quote';


interface QuickAddModalProps {
  onClose: () => void;
  initialDate?: Date;
  restrictToType?: AddType;
  initialType?: AddType;
}

type AddType = 'event' | 'quote' | 'expense' | 'task' | 'shopping' | 'note' | 'scan';

export default function QuickAddModal({ onClose, initialDate, restrictToType, initialType }: QuickAddModalProps) {
  const { tradeUserId, user, googleAccessToken, currentUserMemberId } = useAuth();
  const { settings } = useSettings();
  const { showToast } = useToast();
  const { subscriptionTier } = useSubscriptionTier();
  const [type, setType] = useState<AddType>(restrictToType || initialType || 'event');
  const [loading, setLoading] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [members, setMembers] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [existingQuotes, setExistingQuotes] = useState<Quote[]>([]);

  // Form states
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [date, setDate] = useState(formatToLocalDate(initialDate || new Date()));
  const [time, setTime] = useState('12:00');
  const [endTime, setEndTime] = useState('13:00');
  const [hasUserChangedEndTime, setHasUserChangedEndTime] = useState(false);

  // Quote-specific form states
  const [quoteCustomerName, setQuoteCustomerName] = useState('');
  const [quoteAmount, setQuoteAmount] = useState('');
  const [quoteValidUntil, setQuoteValidUntil] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 30);
    return formatToLocalDate(d);
  });

  // Expense-specific form states
  const [expenseVendor, setExpenseVendor] = useState('');
  const [expenseAmount, setExpenseAmount] = useState('');
  const [expenseCategory, setExpenseCategory] = useState<TransactionCategoryKey>('materials_goods');
  const [expensePaymentMethod, setExpensePaymentMethod] = useState<PaymentMethod>('card');

  const handleStartTimeChange = (newStart: string) => {
    setTime(newStart);
    if (!hasUserChangedEndTime && newStart) {
      const parts = newStart.split(':').map(Number);
      if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
        const endHour = (parts[0] + 1) % 24;
        const formattedEnd = `${String(endHour).padStart(2, '0')}:${String(parts[1]).padStart(2, '0')}`;
        setEndTime(formattedEnd);
      }
    }
  };
  const [location, setLocation] = useState('');
  const [isShared, setisShared] = useState(true);
  const [assignedTo, setAssignedTo] = useState(currentUserMemberId || 'all');
  const [color, setColor] = useState('#f4f4f5'); // Default to light zinc
  const [mealType, setMealType] = useState<'lunch' | 'dinner'>('dinner');
  const [recurrence, setRecurrence] = useState<'none' | 'weekly' | 'monthly'>('none');
  const [listId, setListId] = useState('');
  const [noSchedule, setNoSchedule] = useState(false);
  const [subtasks, setSubtasks] = useState<any[]>([]);
  const [newSubtask, setNewSubtask] = useState('');
  const [showCaptureOptions, setShowCaptureOptions] = useState(false);
  const [showSmartCapture, setShowSmartCapture] = useState(false);
  const [smartCaptureMode, setSmartCaptureMode] = useState<'select' | 'camera' | 'file' | 'document'>('select');

  useEffect(() => {
    if (!tradeUserId) return;
    const membersRef = collection(db, 'trade_users', tradeUserId, 'members');
    const categoriesRef = collection(db, 'trade_users', tradeUserId, 'taskCategories');
    
    const unsubMembers = onSnapshot(membersRef, (snap) => {
      setMembers(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });
    const unsubCats = onSnapshot(categoriesRef, (snap) => {
      setCategories(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });
    const unsubQuotes = subscribeQuotes(tradeUserId, (quotes) => {
      setExistingQuotes(quotes);
    });

    return () => { unsubMembers(); unsubCats(); unsubQuotes(); };
  }, [tradeUserId]);

  const handleAddSubtaskManual = () => {
    if (!newSubtask.trim()) return;
    setSubtasks([...subtasks, {
      id: Math.random().toString(36).substr(2, 9),
      title: newSubtask.trim(),
      status: 'pending'
    }]);
    setNewSubtask('');
  };
  const toggleSubtask = (id: string) => {
    setSubtasks(subtasks.map(st => st.id === id ? { ...st, status: st.status === 'pending' ? 'completed' : 'pending' } : st));
  };
  const removeSubtask = (id: string) => {
    setSubtasks(subtasks.filter(st => st.id !== id));
  };

  const handleCameraClick = () => {
    setShowCaptureOptions(true);
  };

  const handleChoice = (choice: 'camera' | 'file' | 'document') => {
    setSmartCaptureMode(choice);
    setShowCaptureOptions(false);
    setShowSmartCapture(true);
  };

  const colors = [
    { id: '#f4f4f5', bg: 'bg-[#f4f4f5]', border: 'border-zinc-200' },
    { id: '#fef3c7', bg: 'bg-[#fef3c7]', border: 'border-amber-200' },
    { id: '#dbeafe', bg: 'bg-[#dbeafe]', border: 'border-blue-200' },
    { id: '#d1fae5', bg: 'bg-[#d1fae5]', border: 'border-emerald-200' },
    { id: '#ffe4e6', bg: 'bg-[#ffe4e6]', border: 'border-rose-200' },
    { id: '#ede9fe', bg: 'bg-[#ede9fe]', border: 'border-purple-200' },
  ];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tradeUserId || !user || !title.trim()) return;

    setLoading(true);
    try {
      if (type === 'event') {
        const reminderTime = combineDateTimeToDate(date, time);
        const endDateTime = combineDateTimeToDate(date, endTime);
        const isTimeValid = reminderTime !== null;
        const finalEndTime = endDateTime && !isNaN(endDateTime.getTime()) 
          ? endDateTime 
          : (isTimeValid ? new Date(reminderTime.getTime() + 3600000) : null);
        
        const eventData = {
          title,
          description,
          startTime: reminderTime,
          endTime: finalEndTime,
          reminderTime, // Mapping for background notifier
          notified: false,
          location,
          isShared,
          assignedTo,
          authorId: user.uid,
          type: 'event',
          createdAt: new Date().toISOString()
        };
        const docRef = await addDoc(collection(db, 'trade_users', tradeUserId, 'calendarEvents'), eventData);

        // Auto-generate 7-day advance reminder task for birthdays/anniversaries if enabled
        const titleLower = title.toLowerCase();
        const isBirthdayOrAnniversary = titleLower.includes('birthday') || titleLower.includes('anniversary');
        if (isBirthdayOrAnniversary && isTimeValid) {
          const familyDoc = await getDoc(doc(db, 'trade_users', tradeUserId));
          const autoBirthday = familyDoc.exists() ? (familyDoc.data()?.autoBirthdayGiftReminders ?? true) : true;

          if (autoBirthday) {
            const sevenDaysBefore = new Date(reminderTime.getTime() - 7 * 24 * 60 * 60 * 1000);
            sevenDaysBefore.setHours(9, 0, 0, 0); // Always set to 09:00 AM daytime
            const now = new Date();
            let taskReminderTime = sevenDaysBefore;
            if (sevenDaysBefore < now) {
              const nextMorning = new Date(now);
              if (now.getHours() >= 9) {
                nextMorning.setDate(nextMorning.getDate() + 1);
              }
              nextMorning.setHours(9, 0, 0, 0);
              taskReminderTime = nextMorning;
            }

            await addDoc(collection(db, 'trade_users', tradeUserId, 'tasks'), {
              title: `Buy card/presents for ${title}`,
              status: 'pending',
              authorId: user.uid,
              assignedTo,
              isShared,
              dueDate: taskReminderTime,
              reminderTime: taskReminderTime,
              notified: false,
              createdAt: new Date().toISOString()
            });
          }
        }
        
        if (googleAccessToken && isTimeValid) {
          const gEvent = await syncToGoogleCalendar(googleAccessToken, {
            title: eventData.title,
            description: eventData.description,
            startTime: reminderTime.toISOString(),
            endTime: finalEndTime ? finalEndTime.toISOString() : undefined,
            location: eventData.location
          });
          
          if (gEvent && gEvent.id) {
            await updateDoc(docRef, { googleEventId: gEvent.id });
          }
        }
      } else if (type === 'task') {
        const reminderTime = !noSchedule ? combineDateTimeToDate(date, time) : null;
        await addDoc(collection(db, 'trade_users', tradeUserId, 'tasks'), {
          title,
          description,
          status: 'pending',
          isShared,
          assignedTo,
          listId: listId || null,
          authorId: user.uid,
          dueDate: reminderTime,
          reminderTime, // Mapping for background notifier
          notified: false,
          recurrence,
          subtasks,
          createdAt: new Date().toISOString()
        });
      } else if (type === 'quote') {
        const nextNum = generateNextQuoteNumber(existingQuotes);
        const amountNum = parseFloat(quoteAmount) || 0;
        await saveQuote(tradeUserId, {
          quoteNumber: nextNum,
          customerName: quoteCustomerName.trim() || 'Client',
          jobTitle: title.trim(),
          dateIssued: formatToLocalDate(new Date()),
          validUntil: quoteValidUntil || formatToLocalDate(new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)),
          status: 'draft',
          subtotalLabour: amountNum,
          subtotalMaterials: 0,
          netTotal: amountNum,
          vatAmount: 0,
          vatRate: 20,
          isVatRegistered: false,
          grandTotal: amountNum,
          notes: description.trim(),
          authorId: user.uid,
          items: [
            {
              id: Math.random().toString(36).substr(2, 9),
              description: title.trim() || 'Trade Services',
              type: 'labour',
              quantity: 1,
              unitPrice: amountNum,
              total: amountNum
            }
          ]
        });
        showToast(`Quote ${nextNum} draft created`, 'success');
      } else if (type === 'expense') {
        const grossAmount = parseFloat(expenseAmount) || 0;
        await saveTransaction(tradeUserId, {
          vendor: expenseVendor.trim() || 'Trade Merchant',
          description: title.trim(),
          grossAmount,
          netAmount: grossAmount,
          vatRate: 0,
          vatAmount: 0,
          category: expenseCategory as any,
          paymentMethod: expensePaymentMethod,
          date,
          authorId: user.uid,
          source: 'manual'
        });
        showToast(`Expense of £${grossAmount.toFixed(2)} recorded`, 'success');
      } else if (type === 'shopping') {
        await addDoc(collection(db, 'trade_users', tradeUserId, 'shoppingList'), {
          name: title,
          checked: false,
          category: 'Materials',
          authorId: user.uid,
          createdAt: new Date().toISOString()
        });
        showToast('Added to Materials Pick List', 'success');
      } else if (type === 'note') {
        await addDoc(collection(db, 'trade_users', tradeUserId, 'notes'), {
          content: title + (description ? '\n\n' + description : ''),
          color,
          isShared,
          authorId: user.uid,
          createdAt: new Date().toISOString()
        });
      }

      onClose();
    } catch (error) {
      logger.error('Quick Add failed', error);
      showToast('Failed to save item', 'error');
    } finally {
      setLoading(false);
    }
  };

  const types: { id: AddType; label: string; icon: any; color: string }[] = [
    { id: 'event', label: 'Job/Event', icon: Calendar, color: 'text-blue-500 bg-blue-50 dark:bg-blue-900/20' },
    { id: 'quote', label: 'Quote', icon: FileText, color: 'text-amber-500 bg-amber-50 dark:bg-amber-900/20' },
    { id: 'expense', label: 'Expense', icon: ReceiptPoundSterling, color: 'text-rose-500 bg-rose-50 dark:bg-rose-900/20' },
    { id: 'task', label: 'Task', icon: CheckSquare, color: 'text-emerald-500 bg-emerald-50 dark:bg-emerald-900/20' },
    { id: 'shopping', label: 'Materials', icon: Package, color: 'text-purple-500 bg-purple-50 dark:bg-purple-900/20' },
    { id: 'note', label: 'Note', icon: StickyNote, color: 'text-cyan-500 bg-cyan-50 dark:bg-cyan-900/20' },
    { id: 'scan', label: 'Scan', icon: Camera, color: 'text-zinc-600 bg-zinc-100 dark:bg-zinc-800' },
  ];

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-zinc-950/40 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        className="bg-white dark:bg-zinc-900 w-full max-w-xl rounded-[32px] overflow-hidden border border-zinc-200 dark:border-zinc-800"
      >
        <div className="p-6 border-b border-zinc-100 dark:border-zinc-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-zinc-900 dark:bg-zinc-800 rounded-xl flex items-center justify-center">
              <Plus className="w-6 h-6 text-white" />
            </div>
            <h3 className="text-xl font-black text-zinc-900 dark:text-white uppercase tracking-tight">Quick Add</h3>
          </div>
          <button 
            onClick={onClose}
            className="p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-full transition-colors"
          >
            <X className="w-5 h-5 text-zinc-500" />
          </button>
        </div>

        <div className="p-4 sm:p-6 overflow-y-auto max-h-[80vh]">
          {!restrictToType && (
            <div className="grid grid-cols-4 sm:grid-cols-7 gap-1.5 sm:gap-2 mb-6 sm:mb-8">
              {types.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => {
                    if (t.id === 'scan') {
                      handleCameraClick();
                    } else {
                      setType(t.id);
                    }
                  }}
                  className={`flex flex-col items-center gap-1.5 sm:gap-2 p-2 sm:p-2.5 rounded-2xl transition-all ${
                    type === t.id && t.id !== 'scan'
                      ? 'ring-2 ring-zinc-900 dark:ring-white bg-zinc-50 dark:bg-zinc-800' 
                      : 'hover:bg-zinc-50 dark:hover:bg-zinc-800/50'
                  }`}
                >
                  <div className={`w-8 h-8 sm:w-9 sm:h-9 rounded-xl flex items-center justify-center ${t.color}`}>
                    <t.icon className="w-4 h-4 sm:w-4.5 sm:h-4.5" />
                  </div>
                  <span className="text-[9px] sm:text-[10px] font-bold text-zinc-600 dark:text-zinc-400 uppercase tracking-wider">{t.label}</span>
                </button>
              ))}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {type === 'quote' ? (
              <>
                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase tracking-wider text-zinc-500">Customer / Client Name</label>
                  <div className="relative">
                    <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
                    <input 
                      type="text"
                      required
                      placeholder="e.g. Dave Miller, Mrs Jenkins..."
                      value={quoteCustomerName}
                      onChange={(e) => setQuoteCustomerName(e.target.value)}
                      className="w-full p-3.5 pl-10 bg-zinc-50 dark:bg-zinc-800 border-none rounded-2xl focus:ring-2 focus:ring-zinc-900 dark:focus:ring-white outline-none transition-all text-zinc-900 dark:text-white text-sm font-medium"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase tracking-wider text-zinc-500">Job Scope / Title</label>
                  <input 
                    type="text"
                    required
                    placeholder="e.g. Bathroom Tiling & Plumbing, Boiler Replacement..."
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    className="w-full p-3.5 bg-zinc-50 dark:bg-zinc-800 border-none rounded-2xl focus:ring-2 focus:ring-zinc-900 dark:focus:ring-white outline-none transition-all text-zinc-900 dark:text-white text-sm font-medium"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">Estimated Total (£)</label>
                    <div className="relative">
                      <span className="absolute left-3.5 top-1/2 -translate-y-1/2 font-bold text-zinc-400 text-sm">£</span>
                      <input 
                        type="number"
                        step="0.01"
                        min="0"
                        placeholder="0.00"
                        value={quoteAmount}
                        onChange={(e) => setQuoteAmount(e.target.value)}
                        className="w-full p-3 pl-8 bg-zinc-50 dark:bg-zinc-800 border-none rounded-xl focus:ring-2 focus:ring-zinc-900 dark:focus:ring-white outline-none transition-all text-zinc-900 dark:text-white text-xs font-bold"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">Valid Until</label>
                    <div className="relative">
                      <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
                      <input 
                        type="date"
                        value={quoteValidUntil}
                        onChange={(e) => setQuoteValidUntil(e.target.value)}
                        className="w-full p-3 pl-9 bg-zinc-50 dark:bg-zinc-800 border-none rounded-xl focus:ring-2 focus:ring-zinc-900 dark:focus:ring-white outline-none transition-all text-zinc-900 dark:text-white text-xs"
                      />
                    </div>
                  </div>
                </div>
              </>
            ) : type === 'expense' ? (
              <>
                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase tracking-wider text-zinc-500">Merchant / Supplier</label>
                  <div className="relative">
                    <Building className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
                    <input 
                      type="text"
                      required
                      placeholder="e.g. Screwfix, Toolstation, Shell, Travis Perkins..."
                      value={expenseVendor}
                      onChange={(e) => setExpenseVendor(e.target.value)}
                      className="w-full p-3.5 pl-10 bg-zinc-50 dark:bg-zinc-800 border-none rounded-2xl focus:ring-2 focus:ring-zinc-900 dark:focus:ring-white outline-none transition-all text-zinc-900 dark:text-white text-sm font-medium"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase tracking-wider text-zinc-500">Purchase Description</label>
                  <input 
                    type="text"
                    required
                    placeholder="e.g. Screws, sealant, pipe fittings, fuel..."
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    className="w-full p-3.5 bg-zinc-50 dark:bg-zinc-800 border-none rounded-2xl focus:ring-2 focus:ring-zinc-900 dark:focus:ring-white outline-none transition-all text-zinc-900 dark:text-white text-sm font-medium"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">Total Amount (£)</label>
                    <div className="relative">
                      <span className="absolute left-3.5 top-1/2 -translate-y-1/2 font-bold text-zinc-400 text-sm">£</span>
                      <input 
                        type="number"
                        step="0.01"
                        min="0"
                        required
                        placeholder="0.00"
                        value={expenseAmount}
                        onChange={(e) => setExpenseAmount(e.target.value)}
                        className="w-full p-3 pl-8 bg-zinc-50 dark:bg-zinc-800 border-none rounded-xl focus:ring-2 focus:ring-zinc-900 dark:focus:ring-white outline-none transition-all text-zinc-900 dark:text-white text-xs font-bold"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">Purchase Date</label>
                    <div className="relative">
                      <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
                      <input 
                        type="date"
                        value={date}
                        onChange={(e) => setDate(e.target.value)}
                        className="w-full p-3 pl-9 bg-zinc-50 dark:bg-zinc-800 border-none rounded-xl focus:ring-2 focus:ring-zinc-900 dark:focus:ring-white outline-none transition-all text-zinc-900 dark:text-white text-xs"
                      />
                    </div>
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase tracking-wider text-zinc-500">HMRC SA103 Category</label>
                  <select 
                    value={expenseCategory}
                    onChange={(e) => setExpenseCategory(e.target.value as any)}
                    className="w-full p-3 bg-zinc-50 dark:bg-zinc-800 border-none rounded-xl focus:ring-2 focus:ring-zinc-900 dark:focus:ring-white outline-none transition-all text-zinc-900 dark:text-white text-xs font-medium cursor-pointer"
                  >
                    {TRANSACTION_CATEGORIES.map(cat => (
                      <option key={cat.key} value={cat.key}>
                        {cat.label} ({cat.hmrcBox})
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase tracking-wider text-zinc-500">Payment Method</label>
                  <div className="flex gap-2">
                    {[
                      { id: 'card', label: 'Card' },
                      { id: 'cash', label: 'Cash' },
                      { id: 'transfer', label: 'Bank Transfer' }
                    ].map(m => (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => setExpensePaymentMethod(m.id as any)}
                        className={`flex-1 py-2 rounded-xl text-xs font-bold transition-all ${
                          expensePaymentMethod === m.id 
                            ? 'bg-zinc-900 text-white dark:bg-white dark:text-zinc-900' 
                            : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500 hover:bg-zinc-200 dark:hover:bg-zinc-700'
                        }`}
                      >
                        {m.label}
                      </button>
                    ))}
                  </div>
                </div>
              </>
            ) : (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold uppercase tracking-wider text-zinc-500">
                    {type === 'shopping' ? 'Material / Item Name' : 'Title / Content'}
                  </label>
                </div>
                <input 
                  type="text"
                  required
                  placeholder={
                    type === 'event' ? "What's happening? / Job appointment" :
                    type === 'task' ? "What needs doing?" :
                    type === 'shopping' ? "e.g. 22mm copper pipe, 5L white emulsion..." :
                    "Write a note..."
                  }
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full p-4 bg-zinc-50 dark:bg-zinc-800 border-none rounded-2xl focus:ring-2 focus:ring-zinc-900 dark:focus:ring-white outline-none transition-all text-zinc-900 dark:text-white"
                />
              </div>
            )}

            {(type === 'event' || type === 'task') && (
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2 col-span-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold uppercase tracking-wider text-zinc-500">Date & Time</label>
                    {type === 'task' && (
                      <label className="flex items-center gap-1.5 cursor-pointer select-none">
                        <input 
                          type="checkbox"
                          checked={noSchedule}
                          onChange={(e) => {
                            setNoSchedule(e.target.checked);
                          }}
                          className="w-3.5 h-3.5 text-emerald-600 border-zinc-300 rounded focus:ring-emerald-500"
                        />
                        <span className="text-[10px] font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">No schedule needed</span>
                      </label>
                    )}
                  </div>
                </div>
                {!noSchedule && (
                  <>
                    <div className={`space-y-2 ${type === 'event' ? 'col-span-2' : ''}`}>
                      <div className="relative">
                        <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
                        <input 
                          type="date"
                          required={!noSchedule}
                          value={date}
                          onChange={(e) => setDate(e.target.value)}
                          className="w-full p-3 pl-10 bg-zinc-50 dark:bg-zinc-800 border-none rounded-xl focus:ring-2 focus:ring-zinc-900 dark:focus:ring-white outline-none transition-all text-zinc-900 dark:text-white text-xs"
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">Start Time</label>
                      <div className="relative">
                        <Clock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
                        <input 
                          type="time"
                          required={!noSchedule}
                          value={time}
                          onChange={(e) => handleStartTimeChange(e.target.value)}
                          className="w-full p-3 pl-10 bg-zinc-50 dark:bg-zinc-800 border-none rounded-xl focus:ring-2 focus:ring-zinc-900 dark:focus:ring-white outline-none transition-all text-zinc-900 dark:text-white text-xs"
                        />
                      </div>
                    </div>
                    {type === 'event' && (
                      <div className="space-y-2">
                        <label className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">End Time</label>
                        <div className="relative">
                          <Clock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
                          <input 
                            type="time"
                            required
                            value={endTime}
                            onChange={(e) => {
                              setHasUserChangedEndTime(true);
                              setEndTime(e.target.value);
                            }}
                            className="w-full p-3 pl-10 bg-zinc-50 dark:bg-zinc-800 border-none rounded-xl focus:ring-2 focus:ring-zinc-900 dark:focus:ring-white outline-none transition-all text-zinc-900 dark:text-white text-xs"
                          />
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

            {type === 'event' && (
              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-wider text-zinc-500">Location</label>
                <div className="relative group/loc">
                  <MapPin className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
                  <input 
                    type="text"
                    placeholder="Where is it?"
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                    className="w-full p-4 pl-12 pr-12 bg-zinc-50 dark:bg-zinc-800 border-none rounded-2xl focus:ring-2 focus:ring-zinc-900 dark:focus:ring-white transition-all text-zinc-900 dark:text-white"
                  />
                  {location && (
                    <button 
                      type="button"
                      onClick={() => {
                        const query = encodeURIComponent(location);
                        window.open(`https://www.google.com/maps/search/?api=1&query=${query}`, '_blank');
                      }}
                      className="absolute right-3 top-1/2 -translate-y-1/2 p-2 text-zinc-400 hover:text-emerald-500 transition-colors"
                      title="Open in Maps"
                    >
                      <Navigation className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            )}

            {type === 'note' && (
              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-wider text-zinc-500">Note Color</label>
                <div className="flex gap-3">
                  {colors.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => setColor(c.id)}
                      className={`w-10 h-10 rounded-full border-2 transition-all ${c.bg} ${color === c.id ? 'border-zinc-900 scale-110' : 'border-transparent'}`}
                    />
                  ))}
                </div>
              </div>
            )}

            {type === 'task' && categories.length > 0 && (
              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-wider text-zinc-500">Category</label>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setListId('')}
                    className={`flex-1 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all border-none ${!listId ? 'bg-zinc-900 text-white ' : 'bg-zinc-50 dark:bg-zinc-800 text-zinc-400 hover:bg-zinc-100'}`}
                  >
                    None
                  </button>
                  {categories.map(cat => (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => setListId(cat.id)}
                      className={`flex-1 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all border-none ${listId === cat.id ? 'text-white ' : 'bg-zinc-50 dark:bg-zinc-800 text-zinc-500 hover:bg-zinc-100'}`}
                      style={listId === cat.id ? { backgroundColor: cat.color || settings.themeColor } : { borderBottom: `3px solid ${cat.color || 'transparent'}` }}
                    >
                      {cat.name}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {type === 'task' && (
              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-wider text-zinc-500">Repeat</label>
                <div className="flex gap-2">
                  {['none', 'weekly', 'monthly'].map((freq) => (
                    <button
                      key={freq}
                      type="button"
                      onClick={() => setRecurrence(freq as any)}
                      className={`flex-1 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all border-none ${recurrence === freq ? 'text-white' : 'bg-zinc-50 dark:bg-zinc-800 text-zinc-400 hover:bg-zinc-100'}`}
                      style={recurrence === freq ? { backgroundColor: settings.themeColor } : {}}
                    >
                      {freq}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="space-y-2">
              <label className="text-xs font-bold uppercase tracking-wider text-zinc-500">Notes / Description</label>
              <textarea 
                placeholder="Any extra details?"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
                className="w-full p-4 bg-zinc-50 dark:bg-zinc-800 border-none rounded-2xl focus:ring-2 focus:ring-zinc-900 dark:focus:ring-white transition-all resize-none text-zinc-900 dark:text-white"
              />
            </div>

            {type === 'task' && (
              <div className="space-y-3">
                <label className="text-xs font-bold uppercase tracking-wider text-zinc-500">Subtasks</label>
                <div className="space-y-2">
                  {subtasks.map(st => (
                    <div key={st.id} className="flex items-center gap-3 group/st">
                      <button 
                        type="button"
                        onClick={() => toggleSubtask(st.id)} 
                        className="shrink-0 transition-colors"
                        style={{ color: st.status === 'completed' ? settings.themeColor : undefined }}
                      >
                        {st.status === 'completed' ? <CheckSquare className="w-5 h-5" /> : <Circle className="w-5 h-5" />}
                      </button>
                      <span className={`text-sm flex-1 ${st.status === 'completed' ? 'line-through text-zinc-400' : 'text-zinc-700 dark:text-zinc-300'}`}>
                        {st.title}
                      </span>
                      <button type="button" onClick={() => removeSubtask(st.id)} className="opacity-0 group-hover/st:opacity-100 p-1 text-zinc-300 hover:text-red-500 transition-all">
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                  <div className="flex items-center gap-3 pt-2">
                    <button type="button" onClick={handleAddSubtaskManual}>
                      <Plus className="w-5 h-5 text-zinc-300" />
                    </button>
                    <input 
                      type="text"
                      value={newSubtask}
                      onChange={(e) => setNewSubtask(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleAddSubtaskManual();
                        }
                      }}
                      placeholder="Add a step..."
                      className="flex-1 bg-transparent border-none text-sm text-zinc-600 dark:text-zinc-400 placeholder-zinc-300 focus:ring-0 outline-none p-0"
                    />
                  </div>
                </div>
              </div>
            )}

            <button 
              type="submit"
              disabled={loading || isScanning}
              className="w-full py-4 text-white font-bold rounded-2xl transition-all flex items-center justify-center gap-2 disabled:opacity-50"
              style={{ backgroundColor: settings.themeColor }}
            >
              {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : null}
              {loading ? 'Saving...' : 
                type === 'quote' ? 'Create Quote Draft' :
                type === 'expense' ? 'Record Expense' :
                type === 'shopping' ? 'Add Material to Pick List' :
                `Add ${type.charAt(0).toUpperCase() + type.slice(1)}`
              }
            </button>
          </form>
        </div>
      </motion.div>
      <CameraChoiceModal 
        isOpen={showCaptureOptions}
        onClose={() => setShowCaptureOptions(false)}
        onChoice={handleChoice}
        title="Scan from Camera"
      />

      <AnimatePresence>
        {showSmartCapture && (
          <SmartCaptureModal 
            onClose={() => {
              setShowSmartCapture(false);
              onClose(); // Close QuickAdd as well
            }} 
            initialMode={smartCaptureMode}
            members={members}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
