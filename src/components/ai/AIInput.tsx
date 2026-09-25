import { useState, useRef, useEffect } from 'react';
import { Mic, Send, Loader2, Volume2, Camera, Plus, X, User as UserIcon, Sparkles } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { processNaturalLanguage } from '../../services/gemini';
import { useSettings } from '../../contexts/SettingsContext';
import SmartCaptureModal from '../smart/SmartCaptureModal';
import QuickAddModal from '../smart/QuickAddModal';
import { logger } from '../../services/logger';
import { speakText, stopSpeaking } from '../../services/voiceService';
import { incrementAiUsage } from '../../services/usageService';
import { useToast } from '../../contexts/ToastContext';

import { useAuth } from '../../App';
import { db } from '../../lib/firebase';
import { collection, addDoc, onSnapshot, updateDoc, doc, getCountFromServer, getDoc, getDocs } from 'firebase/firestore';
import { useSubscriptionTier } from '../../hooks/useSubscriptionTier';
import { syncToGoogleCalendar } from '../../services/googleCalendar';
import CameraChoiceModal from '../common/CameraChoiceModal';
import { combineDateTimeToISO, combineDateTimeToDate } from '../../lib/dateUtils';
import { detectCategory, normalizeIngredient, splitBulkItems } from '../../lib/shoppingUtils';


interface Message {
  id: string;
  text: string;
  role: 'user' | 'assistant';
  timestamp: Date;
}

export default function AIInput() {
  const { showToast } = useToast();
  const { tradeUserId, user, googleAccessToken } = useAuth();
  const { settings } = useSettings();
  const { subscriptionTier } = useSubscriptionTier();
  const [input, setInput] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [isThinking, setIsThinking] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [showChat, setShowChat] = useState(false);
  const [showSmartCapture, setShowSmartCapture] = useState(false);
  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const [showCaptureOptions, setShowCaptureOptions] = useState(false);
  const [smartCaptureMode, setSmartCaptureMode] = useState<'select' | 'camera' | 'file' | 'document'>('select');
  const [members, setMembers] = useState<any[]>([]);
  const [familyName, setFamilyName] = useState('');
  const [isLive, setIsLive] = useState(false);
  const [dailyUses, setDailyUses] = useState(0);
  
  const suggestions = [
    "Draft a quote for Dave for bathroom tiling, 2 days labour at 250 and 80 materials",
    "Book in a boiler service for Mrs Higgins on Friday at 10am at 14 High Street",
    "Add 15mm copper pipe and solder to The Shed materials list",
    "Remind me to call Travis Perkins tomorrow at 8am"
  ];

  const recognitionRef = useRef<any>(null);
  const isListeningRef = useRef(false);
  const silenceTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const latestTranscriptRef = useRef('');
  const handleSubmitRef = useRef<any>(null);

  useEffect(() => {
    // Initial STT cleanup
    return () => stopListening();
  }, []);

  useEffect(() => {
    if (!user) return;
    const today = new Date().toISOString().split('T')[0];
    const effectivetradeUserId = tradeUserId || `family_${user.uid}`;
    
    const unsub = onSnapshot(doc(db, 'trade_users', effectivetradeUserId, 'usage', today), (snap) => {
      if (snap.exists()) {
        setDailyUses(snap.data().aiUses || 0);
      } else {
        setDailyUses(0);
      }
    });
    return () => unsub();
  }, [user, tradeUserId]);

  // Update handleSubmit ref to avoid stale closures
  useEffect(() => {
    handleSubmitRef.current = handleSubmit;
  });

  const stopListening = () => {
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch (e) {}
      recognitionRef.current = null;
    }
    isListeningRef.current = false;
    latestTranscriptRef.current = '';
    setIsLive(false);
    
    if (silenceTimeoutRef.current) {
      clearTimeout(silenceTimeoutRef.current);
      silenceTimeoutRef.current = null;
    }

    stopSpeaking();
  };

  const handleToggleLive = () => {
    if (isLive) {
      const pendingText = latestTranscriptRef.current.trim();
      stopListening();
      if (pendingText && handleSubmitRef.current) {
        setInput('');
        latestTranscriptRef.current = '';
        handleSubmitRef.current(undefined, pendingText);
      }
      return;
    }

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      logger.error('Speech recognition not supported in this browser');
      showToast('Speech recognition is not supported in your browser.', 'error');
      return;
    }

    try {
      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = 'en-GB';

      recognition.onstart = () => {
        setIsLive(true);
        isListeningRef.current = true;
        setShowChat(true);
        logger.info('STT Listening started');
      };

      recognition.onresult = (event: any) => {
        let interimTranscript = '';
        let finalTranscript = '';

        for (let i = 0; i < event.results.length; ++i) {
          if (event.results[i].isFinal) {
            finalTranscript += event.results[i][0].transcript;
          } else {
            interimTranscript += event.results[i][0].transcript;
          }
        }

        const currentText = (finalTranscript + (interimTranscript ? ' ' + interimTranscript : '')).trim();
        latestTranscriptRef.current = currentText;
        if (currentText) {
          setInput(currentText);
          
          // Reset silence timer on any result
          if (silenceTimeoutRef.current) clearTimeout(silenceTimeoutRef.current);
          silenceTimeoutRef.current = setTimeout(() => {
            const inputIsFocused = document.activeElement?.tagName === 'INPUT';
            if (isListeningRef.current && currentText && !inputIsFocused) {
              logger.info('STT Silence timeout - auto-submitting');
              setInput(''); // Clear input box so it doesn't loop
              latestTranscriptRef.current = '';
              if (handleSubmitRef.current) handleSubmitRef.current(undefined, currentText);
            }
          }, 3500); // 3.5 seconds of natural pause before auto-submit
        }
      };

      recognition.onerror = (event: any) => {
        logger.error('STT Error', event.error);
        stopListening();
      };

      recognition.onend = () => {
        if (isListeningRef.current) {
          // If the mic ended (possibly due to browser silence detection)
          // and we have text, submit it before stopping.
          if (silenceTimeoutRef.current && latestTranscriptRef.current) {
            logger.info('STT onend fired with pending text - forcing submit');
            clearTimeout(silenceTimeoutRef.current);
            silenceTimeoutRef.current = null;
            setInput('');
            if (handleSubmitRef.current) handleSubmitRef.current(undefined, latestTranscriptRef.current);
            latestTranscriptRef.current = '';
          }
          stopListening();
        }
      };

      recognition.start();
      recognitionRef.current = recognition;
    } catch (err) {
      logger.error('Failed to start STT', err);
      stopListening();
    }
  };

  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    if (showChat) scrollToBottom();
  }, [messages, showChat]);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      stopListening();
    };
  }, []);

  // Auto-close chat after 30 seconds of inactivity
  useEffect(() => {
    let timeout: NodeJS.Timeout;
    if (showChat) {
      timeout = setTimeout(() => {
        logger.info('Chat auto-closing due to 30s inactivity');
        setShowChat(false);
        stopListening();
      }, 30000);
    }
    return () => {
      if (timeout) clearTimeout(timeout);
    };
  }, [showChat, input, messages]);
  
  const speak = (text: string) => {
    // Pause recognition while speaking to avoid feedback loops
    if (recognitionRef.current && isListeningRef.current) {
      try { recognitionRef.current.stop(); } catch (e) {}
    }
    speakText(text, 'en-GB-Neural2-A');
  };

  useEffect(() => {
    if (!tradeUserId) return;
    const membersRef = collection(db, 'trade_users', tradeUserId, 'members');
    const unsubMembers = onSnapshot(membersRef, (snap) => {
      setMembers(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });

    const familyRef = doc(db, 'trade_users', tradeUserId);
    const unsubFamily = onSnapshot(familyRef, (snap) => {
      if (snap.exists()) {
        setFamilyName(snap.data().familyName || '');
      }
    });

    return () => {
      unsubMembers();
      unsubFamily();
    };
  }, [tradeUserId]);

  const handleSubmit = async (e?: React.FormEvent, overrideInput?: string) => {
    e?.preventDefault();
    const userText = (overrideInput || input).trim();
    if (!userText || isProcessing || !tradeUserId || !user) return;

    setInput('');
    setIsProcessing(true);
    setShowChat(true);
    
    // Add user message
    const userMsg: Message = { id: Date.now().toString(), text: userText, role: 'user', timestamp: new Date() };
    setMessages(prev => [...prev, userMsg]);

    try {
      const history = messages.slice(-5).map(m => ({ role: m.role, text: m.text }));
      
      // Feature 3: Conflict Detection Context
      // Fetch a snapshot of existing tasks and events for the AI to check for clashes
      const upcomingTasks: any[] = [];
      const upcomingEvents: any[] = [];
      
      // Basic context gathering (in a real app, you might use a shared hook or state)
      // For now, we'll pass the most relevant items as context
      const existingSchedule = [
        ...upcomingTasks.map(t => ({ type: 'task', title: t.title, date: t.dueDate?.toDate?.()?.toISOString() || t.dueDate })),
        ...upcomingEvents.map(e => ({ type: 'event', title: e.title, date: e.startTime?.toDate?.()?.toISOString() || e.startTime }))
      ];

      try {
        await incrementAiUsage(user.uid);
      } catch (limitErr: any) {
        setIsProcessing(false);
        const limitMsg: Message = {
          id: (Date.now() + 1).toString(),
          text: "You've reached your daily limit of 5 AI uses. Click [here](/?view=settings) to upgrade to Premium for unlimited access!",
          role: 'assistant',
          timestamp: new Date()
        };
        setMessages(prev => [...prev, limitMsg]);
        speak("You've reached your daily limit of 5 AI uses. Please upgrade to Premium for unlimited access!");
        return;
      }

      const result = await processNaturalLanguage(userText, members, history, existingSchedule, familyName);
      const { actions, message } = result;
      
      for (const actionItem of actions) {
        const { action, data } = actionItem;

        if (action === 'CREATE_TASK') {
          if (!data.dueDate) {
            // If the AI didn't provide a date, ask the user
            const assistantMsg: Message = { 
              id: (Date.now() + 1).toString(), 
              text: message || "When would you like me to set that task for?", 
              role: 'assistant', 
              timestamp: new Date() 
            };
            setMessages(prev => [...prev, assistantMsg]);
            speak(assistantMsg.text);
            setIsProcessing(false);
            if (isLive) {
              try {
                recognitionRef.current?.start();
              } catch (e) {}
            }
            return;
          }

          const dueDate = new Date(data.dueDate);
          const isDueDateValid = !isNaN(dueDate.getTime());
          
          await addDoc(collection(db, 'trade_users', tradeUserId, 'tasks'), {
            title: data.title || userText.substring(0, 50),
            description: data.description || '',
            status: 'pending',
            authorId: user.uid,
            assignedTo: data.assignedTo || null,
            isShared: true,
            dueDate: isDueDateValid ? dueDate : null,
            reminderTime: isDueDateValid ? dueDate : null,
            notified: false,
            createdAt: new Date().toISOString()
          });
        } else if (action === 'CREATE_CALENDAR_EVENT') {
          if (!data.startTime) {
            // If the AI didn't provide a date, ask the user
            const assistantMsg: Message = { 
              id: (Date.now() + 1).toString(), 
              text: message || "What date and time should I put that in the calendar for?", 
              role: 'assistant', 
              timestamp: new Date() 
            };
            setMessages(prev => [...prev, assistantMsg]);
            speak(assistantMsg.text);
            setIsProcessing(false);
            if (isLive) {
              try {
                recognitionRef.current?.start();
              } catch (e) {}
            }
            return;
          }

          const startTime = new Date(data.startTime);
          const isStartTimeValid = !isNaN(startTime.getTime());
          let endTime = data.endTime ? new Date(data.endTime) : null;
          if ((!endTime || isNaN(endTime.getTime())) && isStartTimeValid) {
            endTime = new Date(startTime.getTime() + 3600000);
          }

          const eventData = {
            title: data.title || userText.substring(0, 50),
            description: data.description || '',
            startTime: isStartTimeValid ? startTime : null,
            endTime: endTime && !isNaN(endTime.getTime()) ? endTime : null,
            location: data.location || '',
            authorId: user.uid,
            isShared: true,
            reminderTime: isStartTimeValid ? startTime : null,
            notified: false,
            createdAt: new Date().toISOString()
          };
          const docRef = await addDoc(collection(db, 'trade_users', tradeUserId, 'calendarEvents'), eventData);

          // Auto-generate 7-day advance reminder task for birthdays/anniversaries if enabled
          const titleLower = eventData.title.toLowerCase();
          const isBirthdayOrAnniversary = titleLower.includes('birthday') || titleLower.includes('anniversary');
          if (isBirthdayOrAnniversary && isStartTimeValid) {
            const familyDoc = await getDoc(doc(db, 'trade_users', tradeUserId));
            const autoBirthday = familyDoc.exists() ? (familyDoc.data()?.autoBirthdayGiftReminders ?? true) : true;

            if (autoBirthday) {
              const sevenDaysBefore = new Date(startTime.getTime() - 7 * 24 * 60 * 60 * 1000);
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
                title: `Buy card/presents for ${eventData.title}`,
                status: 'pending',
                authorId: user.uid,
                assignedTo: data.assignedTo || null,
                isShared: true,
                dueDate: taskReminderTime,
                reminderTime: taskReminderTime,
                notified: false,
                createdAt: new Date().toISOString()
              });
            }
          }
          
          if (googleAccessToken && isStartTimeValid) {
            const gEvent = await syncToGoogleCalendar(googleAccessToken, {
              title: eventData.title,
              description: eventData.description,
              startTime: startTime.toISOString(),
              endTime: endTime && !isNaN(endTime.getTime()) ? endTime.toISOString() : undefined,
              location: eventData.location
            });
            
            if (gEvent && gEvent.id) {
              await updateDoc(docRef, { googleEventId: gEvent.id });
            }
          }
        } else if (action === 'CREATE_NOTE') {
          await addDoc(collection(db, 'trade_users', tradeUserId, 'notes'), {
            title: data.title || 'Tribe Note',
            content: data.content || data.title || userText,
            authorId: user.uid,
            isShared: true,
            createdAt: new Date().toISOString()
          });
        } else if (action === 'CREATE_SHOPPING_ITEM') {
          const rawName = data.name || data.title || userText.substring(0, 50);
          // Still support comma/and splitting as a secondary safety
          const items = splitBulkItems(rawName);
          
          if (subscriptionTier === 'free') {
            const countSnap = await getCountFromServer(collection(db, 'trade_users', tradeUserId, 'shoppingList'));
            const currentCount = countSnap.data().count;
            if (currentCount >= 50) {
              showToast('Shopping list limit reached! You are on the Free tier which is limited to 50 items. Upgrade to Premium for unlimited items.', 'error');
              continue;
            }
            if (currentCount + items.length > 50) {
              const remaining = 50 - currentCount;
              items.splice(remaining);
              showToast(`Only added ${remaining} items. Shopping list limit is 50 items on the Free tier. Upgrade to Premium for unlimited items!`, 'warning');
            }
          }

          for (const item of items) {
            const productName = normalizeIngredient(item);
            await addDoc(collection(db, 'trade_users', tradeUserId, 'shoppingList'), {
              name: productName,
              category: detectCategory(productName),
              checked: false,
              authorId: user.uid,
              createdAt: new Date().toISOString()
            });
          }
        } else if (action === 'SEARCH_NEARBY') {
          const query = data.query || data.title || userText;
          window.dispatchEvent(new CustomEvent('tribe_search_nearby', { detail: { query } }));
        } else if (action === 'CREATE_QUOTE') {
          // Fetch business defaults from Firestore
          const businessDoc = await getDoc(doc(db, 'trade_users', tradeUserId));
          const businessData = businessDoc.exists() ? businessDoc.data() : {};
          const isVat = businessData?.isVatRegistered || false;
          const vatRate = Number(businessData?.defaultVatRate) || 20;

          // Sequential reference number
          const quotesSnap = await getDocs(collection(db, 'trade_users', tradeUserId, 'quotes'));
          const nextNumber = `Q-${1001 + quotesSnap.size}`;

          // Format items into structured QuoteItems
          const rawItems = Array.isArray(data.items) ? data.items : [];
          const quoteItems = rawItems.map((it: any, idx: number) => {
            const qty = Number(it.quantity) || 1;
            const price = Number(it.unitPrice) || (it.type === 'labour' ? (businessData?.defaultDayRate || 320) : 0);
            return {
              id: `${Date.now()}_${idx}`,
              description: it.description || 'Trade Item',
              type: (it.type === 'material' || it.type === 'labour' || it.type === 'hire' || it.type === 'other') ? it.type : 'labour',
              quantity: qty,
              unit: it.unit || (it.type === 'labour' ? 'days' : 'units'),
              unitPrice: price,
              total: Number((qty * price).toFixed(2))
            };
          });

          const subLabour = quoteItems.filter((it: any) => it.type === 'labour').reduce((s: number, it: any) => s + it.total, 0);
          const subMat = quoteItems.filter((it: any) => it.type !== 'labour').reduce((s: number, it: any) => s + it.total, 0);
          const net = subLabour + subMat;
          const vat = isVat ? Number(((net * vatRate) / 100).toFixed(2)) : 0;
          const grand = Number((net + vat).toFixed(2));

          const quoteDraft = {
            quoteNumber: nextNumber,
            dateIssued: new Date().toISOString().split('T')[0],
            validUntil: (() => {
              const d = new Date();
              d.setDate(d.getDate() + 30);
              return d.toISOString().split('T')[0];
            })(),
            status: 'draft',
            customerName: data.customerName || 'Customer',
            customerPhone: data.customerPhone || '',
            customerEmail: data.customerEmail || '',
            customerAddress: data.customerAddress || '',
            jobTitle: data.jobTitle || 'Trade Works',
            jobDescription: data.notes || '',
            items: quoteItems,
            subtotalLabour: subLabour,
            subtotalMaterials: subMat,
            netTotal: net,
            isVatRegistered: isVat,
            vatRate,
            vatAmount: vat,
            grandTotal: grand,
            paymentTerms: businessData?.defaultPaymentTerms || 'Payment due within 14 days of completion.',
            notes: data.notes || businessData?.defaultQuoteTerms || 'Quotation valid for 30 days. Materials subject to supplier price changes.',
            authorId: user.uid,
            createdAt: new Date().toISOString()
          };

          // Save as draft to Firestore
          const newDocRef = await addDoc(collection(db, 'trade_users', tradeUserId, 'quotes'), quoteDraft);
          const fullDraft = { ...quoteDraft, id: newDocRef.id };

          // Open Quote View and trigger Review Modal (Never send automatically!)
          window.history.pushState({ view: 'quotes' }, '', '/quotes');
          window.dispatchEvent(new PopStateEvent('popstate', { state: { view: 'quotes' } }));
          setTimeout(() => {
            window.dispatchEvent(new CustomEvent('tribe_open_quote_draft', { detail: { quote: fullDraft } }));
          }, 200);

          showToast(`Draft quote ${nextNumber} created. Please review before sending.`, 'info');
        }
      }

      // Add assistant message
      const assistantMsg: Message = { 
        id: (Date.now() + 1).toString(), 
        text: message, 
        role: 'assistant', 
        timestamp: new Date() 
      };
      setMessages(prev => [...prev, assistantMsg]);
      speak(message);
      
      // We completed an action successfully!
      // If we were live (checking ref so it's not stale), we don't need to listen for an answer anymore.
      if (isListeningRef.current) {
        stopListening();
      }

    } catch (error) {
      logger.error('AI Processing Error', error);
      const errorMsg: Message = { 
        id: (Date.now() + 1).toString(), 
        text: 'AI had trouble parsing this response. Please retry.', 
        role: 'assistant', 
        timestamp: new Date() 
      };
      setMessages(prev => [...prev, errorMsg]);
      showToast('AI had trouble parsing this response. Please retry.', 'error');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleCameraChoice = (choice: 'camera' | 'file' | 'document' | 'receipt') => {
    if (choice === 'receipt') {
      setShowCaptureOptions(false);
      window.history.pushState({ view: 'expenses' }, '', '/expenses');
      window.dispatchEvent(new PopStateEvent('popstate', { state: { view: 'expenses' } }));
      setTimeout(() => {
        window.dispatchEvent(new CustomEvent('tribe_scan_receipt'));
      }, 150);
      return;
    }
    setSmartCaptureMode(choice);
    setShowCaptureOptions(false);
    setShowSmartCapture(true);
  };


  return (
    <div className="relative">
      <AnimatePresence>
        {showChat && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            className="absolute bottom-full mb-4 left-0 right-0 bg-white dark:bg-zinc-900 rounded-[2rem]  border border-zinc-100 dark:border-zinc-800 overflow-hidden flex flex-col max-h-[400px] mx-2 sm:mx-4"
          >
            <div className="p-4 border-b border-zinc-50 dark:border-zinc-800 flex items-center justify-between bg-zinc-50/50 dark:bg-zinc-800/50">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 bg-emerald-500 rounded-lg flex items-center justify-center">
                  <Sparkles className="w-3.5 h-3.5 text-white" />
                </div>
                <span className="text-xs font-black uppercase tracking-widest text-zinc-500">Tribe Chat</span>
                {subscriptionTier === 'free' && (
                  <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 border border-emerald-200/50">
                    {`${Math.max(0, 10 - dailyUses)}/10 Left`}
                  </span>
                )}
              </div>
              <button 
                onClick={() => {
                  stopListening();
                  setShowChat(false);
                }}
                className="p-1.5 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded-full transition-colors text-zinc-400"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-hide">
              {messages.length === 0 && (
                <div className="h-full flex flex-col items-center justify-center text-center py-10">
                  <div className="w-12 h-12 bg-zinc-50 dark:bg-zinc-800 rounded-2xl flex items-center justify-center mb-3">
                    <Volume2 className="w-6 h-6 text-zinc-300" />
                  </div>
                  <p className="text-sm text-zinc-400 font-medium">How can I help you today?</p>
                </div>
              )}
              {messages.map((msg) => (
                <div 
                  key={msg.id} 
                  className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div className={`max-w-[85%] flex gap-2 ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${msg.role === 'user' ? 'bg-zinc-100 dark:bg-zinc-800' : 'bg-emerald-500 text-white'}`}>
                      {msg.role === 'user' ? <UserIcon className="w-4 h-4 text-zinc-500" /> : <Sparkles className="w-4 h-4" />}
                    </div>
                    <div className={`p-3 rounded-2xl text-sm ${
                      msg.role === 'user' 
                        ? 'bg-zinc-900 text-white dark:bg-white dark:text-zinc-900 rounded-tr-none' 
                        : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-200 rounded-tl-none'
                    }`}>
                      {msg.text}
                    </div>
                  </div>
                </div>
              ))}
              {isLive && (
                <div className="flex justify-start">
                  <div className="max-w-[85%] flex gap-2">
                    <div className="w-8 h-8 rounded-full bg-emerald-500 text-white flex items-center justify-center shrink-0">
                      <Sparkles className="w-4 h-4" />
                    </div>
                    <div className="bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 text-sm p-3 rounded-2xl rounded-tl-none font-bold italic animate-pulse border border-emerald-100 dark:border-emerald-800">
                      Listening...
                    </div>
                  </div>
                </div>
              )}
              {(isProcessing || isThinking) && !isLive && (
                <div className="flex justify-start">
                  <div className="max-w-[85%] flex gap-2">
                    <div className="w-8 h-8 rounded-full bg-emerald-500 text-white flex items-center justify-center shrink-0">
                      <Sparkles className="w-4 h-4" />
                    </div>
                    <div className="bg-zinc-100 dark:bg-zinc-800 text-zinc-400 text-sm p-3 rounded-2xl rounded-tl-none italic animate-pulse">
                      Tribe is thinking...
                    </div>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex items-center gap-2 sm:gap-3 px-2 sm:px-4 pb-4">
        {/* Quick Add Button */}
        <button
          type="button"
          onClick={() => setShowQuickAdd(true)}
          className="w-11 h-11 sm:w-14 sm:h-14 text-white rounded-full flex items-center justify-center transition-all shrink-0 active:scale-95 shadow-lg"
          style={{ backgroundColor: settings.themeColor }}
          title="Quick Add"
        >
          <Plus className="w-5 h-5 sm:w-7 sm:h-7" />
        </button>

        {/* Main Input Pill */}
        <form 
          onSubmit={handleSubmit}
          className={`flex-1 bg-white dark:bg-zinc-900 border rounded-full p-1 sm:p-1.5 flex items-center gap-1 sm:gap-2 transition-all duration-500 min-w-0 ${
            isLive || isProcessing
              ? 'animate-gemini-glow border-transparent ring-4 ring-emerald-500/10' 
              : 'border-zinc-100 dark:border-zinc-800'
          }`}
        >
          <button
            type="button"
            onClick={() => {
              if (window.location.pathname.includes('expenses') || window.history.state?.view === 'expenses') {
                window.dispatchEvent(new CustomEvent('tribe_scan_receipt'));
              } else {
                setShowCaptureOptions(true);
              }
            }}
            className="p-1.5 sm:p-2.5 text-zinc-400 hover:text-emerald-500 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 rounded-full transition-all shrink-0"
            title="Scan Receipt / Capture"
          >
            <Camera className="w-4.5 h-4.5 sm:w-5 h-5" />
          </button>

          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={isLive ? "Listening..." : "Ask Tribe..."}
            className="flex-1 bg-transparent border-none focus:ring-0 outline-none text-zinc-900 dark:text-white placeholder:text-zinc-400 px-1 sm:px-4 text-[11px] sm:text-sm font-medium min-w-0"
          />

          <button
            type="submit"
            disabled={!input.trim() || isProcessing}
            className={`p-2 sm:p-3 rounded-full transition-all flex items-center justify-center shrink-0 ${
              input.trim() 
                ? 'bg-zinc-900 text-white hover:bg-black dark:bg-white dark:text-zinc-900' 
                : 'text-zinc-300'
            }`}
          >
            <Send className="w-4 h-4 sm:w-5 sm:h-5" />
          </button>
        </form>

        {/* Magic Mic Button */}
        <button
          type="button"
          onClick={handleToggleLive}
          className={`w-11 h-11 sm:w-14 sm:h-14 rounded-full flex items-center justify-center transition-all transform hover:scale-110 active:scale-95 shrink-0 relative shadow-lg ${
            isLive 
              ? 'bg-emerald-500 text-white ring-4 ring-emerald-500/30' 
              : 'text-white'
          }`}
          style={!isLive ? { backgroundColor: settings.themeColor } : {}}
        >
          {(isLive || isProcessing) && (
            <div className="absolute inset-0 rounded-full animate-ping bg-emerald-500/30 -z-10" />
          )}
          <Mic className="w-6 h-6 sm:w-7 sm:h-7" />
        </button>
      </div>

      <AnimatePresence>
        {showSmartCapture && (
          <SmartCaptureModal 
            onClose={() => setShowSmartCapture(false)} 
            initialMode={smartCaptureMode}
            members={members}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showCaptureOptions && (
          <CameraChoiceModal
            isOpen={showCaptureOptions}
            onClose={() => setShowCaptureOptions(false)}
            onChoice={handleCameraChoice}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showQuickAdd && (
          <QuickAddModal 
            onClose={() => setShowQuickAdd(false)} 
            initialType={
              (window.history.state?.view === 'notes' || window.history.state?.tab === 'notes') ? 'note' :
              window.history.state?.view === 'tasks' ? 'task' :
              window.history.state?.view === 'calendar' ? 'event' :
              window.history.state?.view === 'quotes' ? 'quote' :
              window.history.state?.view === 'expenses' ? 'expense' :
              (window.history.state?.view === 'supplies' || window.history.state?.view === 'meals') ? 'shopping' :
              'event'
            }
          />
        )}
      </AnimatePresence>
    </div>
  );
}
