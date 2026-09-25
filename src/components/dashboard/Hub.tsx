import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useSettings } from '../../contexts/SettingsContext';
import { getFirstName } from '../../utils/nameUtils';
import { 
  CheckCircle2, 
  Circle,
  Calendar as CalendarIcon, 
  Mail, 
  StickyNote, 
  Cake,
  Clock,
  Trash2,
  CalendarDays,
  ChevronRight,
  Loader2,
  RefreshCw,
  Camera,
  Plus,
  Sparkles,
  ExternalLink,
  X,
  Navigation,
  ShoppingCart,
  Package,
  Edit2,
  Check,
  User as UserIcon,
  LayoutDashboard,
  Filter,
  MessageSquare,
  AlertTriangle,
  FileText,
  PoundSterling,
  Eye
} from 'lucide-react';
import { format, isToday, isTomorrow, isWithinInterval, addDays, startOfDay, endOfDay } from 'date-fns';
import { useDashboardItems, DashboardItem } from '../../hooks/useDashboardItems';
import { useToast } from '../../contexts/ToastContext';
import { useAuth } from '../../App';
import { logger } from '../../services/logger';
import AppSpecificPasswordModal from '../settings/AppSpecificPasswordModal';
import SmartCaptureModal from '../smart/SmartCaptureModal';
import CalendarEventModal from '../calendar/CalendarEventModal';
import TaskModal from '../tasks/TaskModal';
import NoteModal from '../tasks/NoteModal';
import QuotePreviewModal from '../quotes/QuotePreviewModal';
import { Quote, BusinessDetails, DEFAULT_BUSINESS_DETAILS } from '../../types/quote';
import { subscribeBusinessDetails, updateQuoteStatus } from '../../services/quoteService';
import { db, auth } from '../../lib/firebase';
import { collection, onSnapshot, doc, updateDoc, addDoc, deleteDoc } from 'firebase/firestore';
import ConfirmModal from '../common/ConfirmModal';
import PageHeader from '../common/PageHeader';
import GoogleIcon from '../layout/GoogleIcon';
import MicrosoftIcon from '../layout/MicrosoftIcon';
import YahooIcon from '../layout/YahooIcon';
import AppleIcon from '../layout/AppleIcon';
import { fetchConnectedAccountsMessages } from '../../services/emailAdapters';
import Whiteboard from './Whiteboard';

interface EmailMessage {
  id: string;
  accountId?: string;
  accountEmail?: string;
  provider?: 'google' | 'microsoft' | 'yahoo' | 'apple';
  subject: string;
  from: string;
  snippet: string;
  date: string;
  unread: boolean;
  body?: string;
}

export default function Hub({ onNavigate, onGenerateBriefing }: { onNavigate?: (view: string, tab?: string) => void, onGenerateBriefing?: () => void }) {
  const { showToast } = useToast();
  const { items, loading } = useDashboardItems();
  const { tradeUserId, user, googleAccessToken, refreshGoogleToken } = useAuth();
  const [emails, setEmails] = useState<EmailMessage[]>([]);
  const [loadingEmails, setLoadingEmails] = useState(false);
  const [selectedEmail, setSelectedEmail] = useState<EmailMessage | null>(null);
  const [selectedEventForModal, setSelectedEventForModal] = useState<any | null>(null);
  const [selectedTaskForModal, setSelectedTaskForModal] = useState<any | null>(null);
  const [selectedNoteForModal, setSelectedNoteForModal] = useState<any | null>(null);
  const [selectedQuoteForPreview, setSelectedQuoteForPreview] = useState<Quote | null>(null);
  const [businessDetails, setBusinessDetails] = useState<BusinessDetails>(DEFAULT_BUSINESS_DETAILS);
  const [showSmartCapture, setShowSmartCapture] = useState<EmailMessage | null>(null);
  const [fetchingBody, setFetchingBody] = useState(false);
  const [members, setMembers] = useState<any[]>([]);
  const [businessName, setBusinessName] = useState('');
  const [categories, setCategories] = useState<any[]>([]);
  const [isTrashing, setIsTrashing] = useState(false);
  const [connectedAccounts, setConnectedAccounts] = useState<any[]>([]);
  const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false);
  const [passwordModalProvider, setPasswordModalProvider] = useState<'apple' | 'google' | 'outlook' | 'yahoo' | 'sky'>('google');
  const [confirmConfig, setConfirmConfig] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    confirmLabel?: string;
    onConfirm: () => void;
  }>({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => {}
  });

  useEffect(() => {
    if (!tradeUserId) return;
    const membersRef = collection(db, 'trade_users', tradeUserId, 'members');
    const categoriesRef = collection(db, 'trade_users', tradeUserId, 'taskCategories');
    const accountsRef = collection(db, 'trade_users', tradeUserId, 'connectedAccounts');

    const unsubMembers = onSnapshot(membersRef, (snapshot) => {
      setMembers(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });

    const unsubCategories = onSnapshot(categoriesRef, (snapshot) => {
      setCategories(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });

    const unsubBusiness = subscribeBusinessDetails(tradeUserId, (details) => {
      setBusinessDetails(details);
    });

    const tradeUserRef = doc(db, 'trade_users', tradeUserId);
    const unsubTradeUser = onSnapshot(tradeUserRef, (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data();
        const bName = data.businessName || data.familyName || '';
        setBusinessName(bName);
      }
    });

    const unsubAccounts = onSnapshot(accountsRef, (snapshot) => {
      setConnectedAccounts(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (err) => {
      logger.warn('Hub: Failed to fetch connected accounts snapshot', err);
    });

    return () => {
      unsubMembers();
      unsubCategories();
      unsubBusiness();
      unsubTradeUser();
      unsubAccounts();
    };
  }, [tradeUserId]);

  useEffect(() => {
    if (!tradeUserId || !user) return;

    const prewarmBriefingAudio = async () => {
      try {
        const { doc, getDoc } = await import('firebase/firestore');
        const { db } = await import('../../lib/firebase');
        const { preCacheAudioUrl } = await import('../../services/voiceService');

        // Retrieve current cached daily briefing content from Firestore
        const cacheRef = doc(db, 'trade_users', tradeUserId, 'briefing', 'current');
        const snap = await getDoc(cacheRef);
        
        if (snap.exists()) {
          const briefingText = snap.data().content;
          if (briefingText) {
            // Ping getTribeAudioCached passively. It checks storage and TTS under the hood,
            // avoiding client-side CORS issues with Firebase Storage.
            const { httpsCallable } = await import('firebase/functions');
            const { functions } = await import('../../lib/firebase');
            const getTribeAudioCached = httpsCallable<{ tradeUserId: string; userId: string; briefingText: string }, { audioUrl: string }>(
              functions,
              'getTribeAudioCached'
            );
            const result = await getTribeAudioCached({ tradeUserId, userId: user.uid, briefingText });
            const url = result.data?.audioUrl;
            if (url) {
              preCacheAudioUrl(url);
              logger.info('Pre-warmed daily briefing audio passively via Cloud Function');
            }
          }
        }
      } catch {
        // Passive pre-warm skipped if Cloud Functions are not provisioned
      }
    };

    prewarmBriefingAudio();
  }, [tradeUserId, user]);

  const handleUpdateTask = async (taskId: string, updates: any) => {
    if (!tradeUserId) return;
    try {
      await updateDoc(doc(db, 'trade_users', tradeUserId, 'tasks', taskId), updates);
      if (selectedTaskForModal && selectedTaskForModal.isSupport && selectedTaskForModal.ticketId) {
        const ticketStatus = updates.status === 'completed' ? 'resolved' : 'open';
        await updateDoc(doc(db, 'support_tickets', selectedTaskForModal.ticketId), {
          status: ticketStatus,
          developerResponse: updates.developerResponse || ''
        });
      }
      setSelectedTaskForModal(null);
    } catch (err) {
      logger.error('Hub: Failed to update task', err);
    }
  };

  const toggleTask = async (task: any) => {
    if (!tradeUserId) return;
    const newStatus = task.status === 'pending' ? 'completed' : 'pending';

    try {
      const { ensureDate } = await import('../../lib/dateUtils');
      const isCompleted = newStatus === 'completed';
      const reminderDate = task.reminderTime ? ensureDate(task.reminderTime) : null;
      const shouldResetNotified = !isCompleted && reminderDate && reminderDate > new Date();

      await updateDoc(doc(db, 'trade_users', tradeUserId, 'tasks', task.id), { 
        status: newStatus,
        notified: isCompleted ? true : (shouldResetNotified ? false : (task.notified ?? false))
      });

      if (task.isSupport && task.ticketId) {
        await updateDoc(doc(db, 'support_tickets', task.ticketId), {
          status: newStatus === 'completed' ? 'resolved' : 'open'
        });
      }

      if (newStatus === 'completed' && task.recurrence && task.recurrence !== 'none') {
        const { ensureDate } = await import('../../lib/dateUtils');
        const { addWeeks, addMonths } = await import('date-fns');
        const { serverTimestamp } = await import('firebase/firestore');

        const currentDueDate = ensureDate(task.dueDate);
        const nextDueDate = task.recurrence === 'weekly' ? addWeeks(currentDueDate, 1) : addMonths(currentDueDate, 1);

        await addDoc(collection(db, 'trade_users', tradeUserId, 'tasks'), {
          ...task,
          id: undefined,
          status: 'pending',
          dueDate: nextDueDate,
          reminderTime: nextDueDate,
          notified: false,
          createdAt: serverTimestamp()
        });
      }
    } catch (error) {
      logger.error('Hub: Error toggling task', error);
    }
  };

  const handleUpdateNote = async (noteId: string, updates: any) => {
    if (!tradeUserId) return;
    try {
      await updateDoc(doc(db, 'trade_users', tradeUserId, 'notes', noteId), updates);
      setSelectedNoteForModal(null);
    } catch (err) {
      logger.error('Hub: Failed to update note', err);
    }
  };

  const handleDeleteNote = async (noteId: string) => {
    if (!tradeUserId) return;
    setConfirmConfig({
      isOpen: true,
      title: 'Delete Note',
      message: 'Are you sure you want to delete this note? This action cannot be undone.',
      confirmLabel: 'Delete Note',
      onConfirm: async () => {
        try {
          await deleteDoc(doc(db, 'trade_users', tradeUserId, 'notes', noteId));
          setSelectedNoteForModal(null);
        } catch (err) {
          logger.error('Hub: Failed to delete note', err);
        }
      }
    });
  };

  const handleDeleteTask = async (taskId: string) => {
    if (!tradeUserId) return;
    setConfirmConfig({
      isOpen: true,
      title: 'Delete Task',
      message: 'Are you sure you want to delete this task?',
      confirmLabel: 'Delete Task',
      onConfirm: async () => {
        try {
          await deleteDoc(doc(db, 'trade_users', tradeUserId, 'tasks', taskId));
          if (selectedTaskForModal && selectedTaskForModal.isSupport && selectedTaskForModal.ticketId) {
            await deleteDoc(doc(db, 'support_tickets', selectedTaskForModal.ticketId));
          }
          setSelectedTaskForModal(null);
        } catch (err) {
          logger.error('Hub: Failed to delete task', err);
        }
      }
    });
  };

  const trashEmail = async (emailId: string) => {
    setIsTrashing(true);
    try {
      setEmails(prev => prev.filter(e => e.id !== emailId));
      setSelectedEmail(null);
      showToast('Email dismissed from view', 'info');
    } catch (err) {
      logger.error('Hub: Failed to dismiss email', err);
    } finally {
      setIsTrashing(false);
    }
  };

  const fetchEmailBody = async (emailId: string) => {
    setSelectedEmail(prev => prev?.id === emailId ? { ...prev, body: prev.body || prev.snippet || '' } : prev);
  };

  const getServiceName = (provider?: string) => {
    switch (provider) {
      case 'microsoft': return 'Outlook';
      case 'yahoo': return 'Yahoo Mail';
      case 'apple': return 'iCloud Mail';
      case 'google':
      default: return 'Gmail';
    }
  };

  const getWebmailUrl = (email: EmailMessage) => {
    switch (email.provider) {
      case 'microsoft': return 'https://outlook.live.com/mail';
      case 'yahoo': return 'https://mail.yahoo.com';
      case 'apple': return 'https://www.icloud.com/mail';
      case 'google':
      default:
        return email.id ? `https://mail.google.com/mail/u/0/#inbox/${email.id}` : 'https://mail.google.com';
    }
  };

  useEffect(() => {
    if (selectedEmail && !selectedEmail.body && !fetchingBody && (!selectedEmail.provider || selectedEmail.provider === 'google')) {
      fetchEmailBody(selectedEmail.id);
    }
  }, [selectedEmail, fetchingBody]);

  const fetchEmails = useCallback(async () => {
    setLoadingEmails(true);
    try {
      const combinedMessages: EmailMessage[] = [];

      // Fetch connected OAuth accounts (Microsoft Graph, Yahoo, Apple, etc.)
      try {
        const idToken = await auth.currentUser?.getIdToken();
        if (idToken) {
          const connectedMsgs = await fetchConnectedAccountsMessages(idToken);
          combinedMessages.push(...connectedMsgs);
        }
      } catch (connErr) {
        logger.warn('Hub: Error fetching connected accounts messages:', connErr);
      }

      // Sort all combined emails by date descending
      combinedMessages.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

      // Store top 5 recent emails for Hub
      setEmails(combinedMessages.slice(0, 5));
    } catch (err) {
      logger.error('Hub email fetch error', err);
    } finally {
      setLoadingEmails(false);
    }
  }, []);

  useEffect(() => {
    fetchEmails();
  }, [googleAccessToken, connectedAccounts.length, fetchEmails]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const today = startOfDay(new Date());
  const isValidDate = (d: any) => d instanceof Date && !isNaN(d.getTime());

  const upcomingEvents = items.filter(item => 
    (item.type === 'event' || item.type === 'birthday') && 
    item.date && 
    isValidDate(item.date) &&
    item.date >= today
  ).sort((a, b) => {
    const aDate = a.date as Date;
    const bDate = b.date as Date;
    return aDate.getTime() - bDate.getTime();
  });

  const pendingTasks = items.filter(item => 
    item.type === 'task' && 
    item.data?.status !== 'completed'
  ).sort((a, b) => {
    // Sort by due date, tasks without dates go to the end
    if (!a.date && !b.date) return 0;
    if (!a.date) return 1;
    if (!b.date) return -1;
    return (a.date as Date).getTime() - (b.date as Date).getTime();
  });

  const quoteItems = items.filter(item => item.type === 'quote');
  const displayQuotes = quoteItems.slice(0, 6);
  const rawQuoteList = quoteItems.map(i => i.data as Quote);
  const pendingQuotes = rawQuoteList.filter(q => q.status === 'pending');
  const activeQuotes = rawQuoteList.filter(q => q.status === 'pending' || q.status === 'draft');
  const pendingQuotesTotal = pendingQuotes.reduce((acc, q) => acc + (Number(q.grandTotal) || 0), 0);

  const allNotes = items.filter(item => item.type === 'note');
  const displayNotes = allNotes.slice(0, 6);

  const shoppingItems = items.filter(item => item.type === 'shopping');
  const displayShopping = shoppingItems.slice(0, 6);

  const supportTasks = items.filter(item => 
    item.type === 'task' && 
    item.data?.isSupport === true && 
    item.data?.status !== 'completed'
  );

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 18) return 'Good afternoon';
    return 'Good evening';
  };

  return (
    <div className="max-w-6xl mx-auto pb-32">
      <PageHeader
        icon={LayoutDashboard}
        title={`${getGreeting()}, ${businessDetails.tradingName || businessDetails.businessName || businessName || 'Tradesperson'}`}
        subtitle="Here's your trade overview for today"
        extra={
          onGenerateBriefing && (
            <button
              onClick={onGenerateBriefing}
              className="relative overflow-hidden px-3 sm:px-4 h-12 sm:h-14 bg-emerald-50 dark:bg-emerald-900/30 rounded-2xl flex items-center gap-2 sm:gap-2.5 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-100 dark:hover:bg-emerald-900/50 transition-all shadow-sm group border border-emerald-200/50 dark:border-emerald-800/30 shrink-0"
              title="Morning Briefing"
            >
              <motion.div 
                className="absolute top-0 bottom-0 w-[150%] bg-gradient-to-r from-transparent via-emerald-200/80 dark:via-emerald-400/60 to-transparent -skew-x-12 opacity-90"
                animate={{ left: ['-150%', '150%'] }}
                transition={{ repeat: Infinity, duration: 2, ease: "linear", repeatDelay: 1.5 }}
              />
              <Sparkles size={20} className="sm:w-6 sm:h-6 group-hover:scale-110 transition-transform relative z-10 shrink-0" />
              <div className="flex flex-col items-start relative z-10 text-left">
                <span className="text-xs font-bold leading-tight">
                  <span className="hidden sm:inline">Morning </span>Briefing
                </span>
                <span className="text-[10px] font-medium opacity-80 leading-tight hidden sm:inline">AI Morning Brief</span>
              </div>
            </button>
          )
        }
      />

      {/* Trade Whiteboard */}
      <Whiteboard members={members} />

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
        {/* 1. Calendar / Events Section */}
        <section className="space-y-3">
        <div className="flex items-center justify-between px-1">
          <h3 className="text-[9px] font-black text-zinc-400 uppercase tracking-[0.2em]">
            Schedule & Jobs
          </h3>
          <span className="text-[9px] font-bold text-emerald-500 bg-emerald-50 dark:bg-emerald-900/20 px-2 py-0.5 rounded-full">
            {upcomingEvents.length} UPCOMING
          </span>
        </div>
        
        {upcomingEvents.length === 0 ? (
          <EmptyState icon={CalendarDays} message="No upcoming events" />
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-1 gap-2">
            {upcomingEvents.slice(0, 8).map(item => (
              <HubCard 
                key={item.id} 
                item={item} 
                compact 
                members={members}
                categories={categories}
                onClick={() => {
                  if (item.type === 'event' || item.type === 'birthday') {
                    setSelectedEventForModal({
                      ...item.data,
                      id: item.id,
                      title: item.title,
                      startTime: item.date?.toISOString() || new Date().toISOString(),
                      type: item.data?.type || (item.type === 'birthday' ? 'birthday' : 'event')
                    });
                  } else {
                    onNavigate?.(item.type === 'task' ? 'tasks' : 'calendar');
                  }
                }} 
              />
            ))}
          </div>
        )}
        </section>

        {/* 2. Quotes & Estimates Section */}
        <section className="space-y-3">
          <div className="flex items-center justify-between px-1">
            <h3 className="text-[9px] font-black text-zinc-400 uppercase tracking-[0.2em]">
              Quotes & Estimates
            </h3>
            <div className="flex items-center gap-1.5">
              {pendingQuotesTotal > 0 && (
                <span className="text-[9px] font-bold text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 px-2 py-0.5 rounded-full">
                  £{Math.round(pendingQuotesTotal).toLocaleString('en-GB')} PENDING
                </span>
              )}
              <span className="text-[9px] font-bold text-emerald-500 bg-emerald-50 dark:bg-emerald-900/20 px-2 py-0.5 rounded-full">
                {activeQuotes.length} ACTIVE
              </span>
            </div>
          </div>
          
          {displayQuotes.length === 0 ? (
            <EmptyState icon={FileText} message="No quotes yet" />
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-1 gap-2">
              {displayQuotes.map(item => (
                <HubCard 
                  key={item.id} 
                  item={item} 
                  compact 
                  members={members}
                  categories={categories}
                  onClick={() => {
                    setSelectedQuoteForPreview(item.data as Quote);
                  }} 
                />
              ))}
              <button 
                onClick={() => onNavigate?.('quotes')}
                className="col-span-2 sm:col-span-1 w-full py-2.5 text-[9px] font-black uppercase tracking-[0.2em] text-zinc-400 hover:text-emerald-500 hover:bg-emerald-50 dark:hover:bg-emerald-900/10 rounded-xl border border-dashed border-zinc-200 dark:border-zinc-800 transition-all flex items-center justify-center gap-1.5 group"
              >
                <span>View all quotes</span>
                <ChevronRight className="w-3 h-3 group-hover:translate-x-0.5 transition-transform" />
              </button>
            </div>
          )}
        </section>

        {/* 2. Tasks Section */}
        <section className="space-y-3">
          <div className="flex items-center justify-between px-1">
            <h3 className="text-[9px] font-black text-zinc-400 uppercase tracking-[0.2em]">
              Outstanding Tasks
            </h3>
            <span className="text-[9px] font-bold text-violet-500 bg-violet-50 dark:bg-violet-900/20 px-2 py-0.5 rounded-full">
              {pendingTasks.length} PENDING
            </span>
          </div>
          
          {pendingTasks.length === 0 ? (
            <EmptyState icon={CheckCircle2} message="All caught up!" />
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-1 gap-2">
              {pendingTasks.slice(0, 6).map(item => (
                <HubCard 
                  key={item.id} 
                  item={item} 
                  compact
                  members={members}
                  categories={categories}
                  onClick={() => {
                    setSelectedTaskForModal(item.data);
                  }}
                  onToggle={() => toggleTask(item.data)}
                />
              ))}
            </div>
          )}
        </section>

        {/* 3. Notes Overview */}
        <section className="space-y-3">
          <div className="flex items-center justify-between px-1">
            <h3 className="text-[9px] font-black text-zinc-400 uppercase tracking-[0.2em]">
              Recent Notes
            </h3>
            <span className="text-[9px] font-bold text-blue-500 bg-blue-50 dark:bg-blue-900/20 px-2 py-0.5 rounded-full">
              {allNotes.length} SAVED
            </span>
          </div>
          
          {displayNotes.length === 0 ? (
            <EmptyState icon={StickyNote} message="No notes yet" />
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-1 gap-2">
              {displayNotes.map(item => (
                <HubCard 
                  key={item.id} 
                  item={item} 
                  compact 
                  members={members}
                  categories={categories}
                  onClick={() => {
                    setSelectedNoteForModal(item.data);
                  }} 
                />
              ))}
            </div>
          )}
        </section>
      </div>

      {/* Secondary Section: Trade Supplies & Materials Pick List */}
      <div className="grid grid-cols-1 gap-6">
        <section className="space-y-3">
          <div className="flex items-center justify-between px-1">
            <h3 className="text-[9px] font-black text-zinc-400 uppercase tracking-[0.2em]">
              Trade Supplies & Materials
            </h3>
          </div>
          
          <motion.div
            layout
            onClick={() => onNavigate?.('supplies')}
            className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl relative overflow-hidden flex items-center justify-between p-4 sm:p-5 hover:shadow-sm transition-all cursor-pointer group"
          >
            <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-gradient-to-b from-emerald-500 to-teal-500" />
            
            <div className="flex items-center gap-3.5 min-w-0 pl-2">
              <div className="p-3 bg-emerald-50 dark:bg-emerald-950/40 rounded-xl text-emerald-600 dark:text-emerald-400 shrink-0">
                <Package className="w-5 h-5 sm:w-6 sm:h-6" />
              </div>
              <div className="min-w-0">
                <span className="block text-[10px] font-black uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
                  Materials Pick List
                </span>
                <span className="block font-bold text-sm sm:text-base text-zinc-900 dark:text-zinc-100 truncate">
                  {shoppingItems.length === 0 ? 'Materials pick list is clear' : `${shoppingItems.length} ${shoppingItems.length === 1 ? 'item' : 'items'} on pick list`}
                </span>
                <span className="block text-xs text-zinc-400 dark:text-zinc-500 truncate">
                  {shoppingItems.length === 0 ? 'Tap to add tools, paint, fixings or materials' : 'Check van stock or head to the trade counter'}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-1 text-[10px] font-black uppercase tracking-widest text-emerald-600 dark:text-emerald-400 group-hover:translate-x-0.5 transition-transform shrink-0">
              <span>View Supplies</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </div>
          </motion.div>
        </section>
      </div>

      {/* 4. Multi-Provider Email Integration at Bottom */}
      {(() => {
        const hasConnectedAccount = connectedAccounts.length > 0;
        const providersInList = Array.from(
          new Set(connectedAccounts.map(a => getServiceName(a.provider)))
        );

        const emailSectionTitle = providersInList.length === 1
          ? `Recent ${providersInList[0]}`
          : providersInList.length > 1
            ? 'Recent Connected Emails'
            : 'Recent Emails';

        return (
          <section className="space-y-3">
            <div className="flex items-center justify-between px-1">
              <h3 className="text-[9px] font-black text-zinc-400 uppercase tracking-[0.2em]">
                {emailSectionTitle}
              </h3>
              {hasConnectedAccount ? (
                <button onClick={() => fetchEmails()} className="p-1 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition-colors">
                  <RefreshCw className={`w-3 h-3 text-zinc-400 ${loadingEmails ? 'animate-spin' : ''}`} />
                </button>
              ) : (
                <span className="text-[8px] font-bold text-zinc-400">NOT CONNECTED</span>
              )}
            </div>

            {!hasConnectedAccount ? (
              <div className="p-5 sm:p-6 bg-zinc-50 dark:bg-zinc-900/50 rounded-2xl border border-zinc-200/80 dark:border-zinc-800 text-center">
                <div className="w-10 h-10 rounded-2xl bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center mx-auto mb-2.5 text-zinc-400">
                  <Mail className="w-5 h-5" />
                </div>
                <h4 className="text-xs font-bold text-zinc-900 dark:text-white mb-1">Connect Your Email Inbox</h4>
                <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mb-3.5 max-w-xs mx-auto leading-relaxed">
                  Connect your Gmail, Outlook, or Apple Mail to view customer inquiries, supplier invoices, and job updates here.
                </p>
                <div className="flex flex-col sm:flex-row items-center justify-center gap-2">
                  <button
                    onClick={() => {
                      setPasswordModalProvider('google');
                      setIsPasswordModalOpen(true);
                    }}
                    className="w-full sm:w-auto px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 transition-all shadow-xs active:scale-95 cursor-pointer"
                  >
                    <GoogleIcon className="w-3.5 h-3.5" isColoured={false} />
                    Connect Gmail
                  </button>
                  <button
                    onClick={() => onNavigate?.('settings')}
                    className="w-full sm:w-auto px-4 py-2 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-200 rounded-xl text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 transition-all active:scale-95 cursor-pointer"
                  >
                    Other Providers
                  </button>
                </div>
              </div>
            ) : loadingEmails && emails.length === 0 ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6 text-zinc-300 animate-spin" />
              </div>
            ) : (
              <div className="space-y-2">
                {emails.map(email => (
                  <EmailCard key={email.id} email={email} onClick={() => setSelectedEmail(email)} />
                ))}
                {emails.length === 0 && !loadingEmails && (
                  <p className="text-center py-4 text-xs text-zinc-500">No recent emails found</p>
                )}
                
                {emails.length > 0 && (
                  <button 
                    onClick={() => onNavigate?.('email')}
                    className="w-full py-4 mt-2 text-[9px] font-black uppercase tracking-[0.2em] text-zinc-400 hover:text-emerald-500 hover:bg-emerald-50 dark:hover:bg-emerald-900/10 rounded-2xl border border-dashed border-zinc-200 dark:border-zinc-800 transition-all flex items-center justify-center gap-2 group"
                  >
                    <span>View all emails</span>
                    <ChevronRight className="w-3 h-3 group-hover:translate-x-1 transition-transform" />
                  </button>
                )}
              </div>
            )}
          </section>
        );
      })()}

      {/* Email Body / Detail View Modal (Same as EmailView) */}
      <AnimatePresence>
        {selectedEmail && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-zinc-950/40 backdrop-blur-md" 
              onClick={() => setSelectedEmail(null)} 
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative bg-white dark:bg-zinc-900 rounded-[32px] w-full max-w-xl overflow-hidden flex flex-col max-h-[85vh] border border-zinc-200 dark:border-zinc-800"
            >
              {/* Top Action Bar */}
              <div className="p-4 border-b border-zinc-100 dark:border-zinc-800 flex items-center justify-between bg-zinc-50/50 dark:bg-zinc-900/50 shrink-0">
                <button
                   onClick={() => {
                     setShowSmartCapture(selectedEmail);
                     setSelectedEmail(null);
                   }}
                   className="flex items-center gap-2 px-5 py-2.5 bg-emerald-600 text-white font-black text-xs uppercase tracking-widest rounded-full hover:bg-emerald-700 transition-all active:scale-95"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  Smart Convert
                </button>
                
                <div className="flex items-center gap-2">
                  <button 
                    onClick={() => {
                      setConfirmConfig({
                        isOpen: true,
                        title: 'Delete Email',
                        message: `Are you sure you want to delete this email from your ${getServiceName(selectedEmail.provider)} inbox?`,
                        confirmLabel: 'Delete Email',
                        onConfirm: () => trashEmail(selectedEmail.id)
                      });
                    }}
                    disabled={isTrashing}
                    className="p-2.5 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded-full hover:bg-red-100 transition-colors disabled:opacity-50"
                  >
                    {isTrashing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                  </button>
                  <a 
                    href={getWebmailUrl(selectedEmail)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-2.5 bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 rounded-full hover:bg-zinc-200 transition-colors"
                  >
                    <ExternalLink className="w-4 h-4" />
                  </a>
                  <button onClick={() => setSelectedEmail(null)} className="p-2.5 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-full transition-colors">
                    <X className="w-5 h-5 text-zinc-400" />
                  </button>
                </div>
              </div>

              {/* Email Content Container */}
              <div className="flex-1 overflow-y-auto p-6 sm:p-10 space-y-8">
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-2xl bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center font-black text-emerald-600 dark:text-emerald-400 text-lg">
                        {selectedEmail.from && selectedEmail.from.length > 0 ? selectedEmail.from[0].toUpperCase() : '?'}
                      </div>
                      <div>
                        <h4 className="font-black text-zinc-900 dark:text-white leading-tight">{selectedEmail.from}</h4>
                        <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">{format(new Date(selectedEmail.date), 'MMMM d, yyyy • HH:mm')}</p>
                      </div>
                    </div>
                  </div>
                  
                  <h2 className="text-2xl font-black text-zinc-900 dark:text-white leading-tight">
                    {selectedEmail.subject}
                  </h2>
                </div>

                <div className="h-px bg-zinc-100 dark:bg-zinc-800" />

                <div className="prose dark:prose-invert max-w-none">
                  {fetchingBody ? (
                    <div className="flex flex-col items-center justify-center py-12 gap-3">
                      <Loader2 className="w-8 h-8 text-emerald-500 animate-spin" />
                      <p className="text-xs text-zinc-400">Loading full message...</p>
                    </div>
                  ) : selectedEmail.body ? (
                    <div className="bg-white rounded-2xl p-4 overflow-hidden border border-zinc-100">
                      <iframe 
                        title="Email Content"
                        srcDoc={`
                          <html>
                            <head>
                              <style>
                                body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; font-size: 14px; line-height: 1.5; color: #374151; margin: 0; padding: 0; }
                                img { max-width: 100%; height: auto; }
                                a { color: #10b981; }
                              </style>
                            </head>
                            <body>${selectedEmail.body}</body>
                          </html>
                        `}
                        className="w-full min-h-[400px] border-none"
                      />
                    </div>
                  ) : (
                    <p className="text-zinc-600 dark:text-zinc-300 leading-relaxed text-sm whitespace-pre-wrap">
                      {selectedEmail.snippet}...
                    </p>
                  )}
                  
                  <div className="py-8 text-center border-2 border-dashed border-zinc-100 dark:border-zinc-800 rounded-3xl mt-8">
                    <p className="text-xs font-bold text-zinc-400 uppercase tracking-widest mb-4">View Full Thread in {getServiceName(selectedEmail.provider)}</p>
                    <a 
                      href={getWebmailUrl(selectedEmail)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 px-6 py-3 bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 font-bold text-sm rounded-xl hover:bg-zinc-200 transition-all"
                    >
                      Open {getServiceName(selectedEmail.provider)}
                      <ExternalLink className="w-4 h-4" />
                    </a>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {selectedEventForModal && (
          <CalendarEventModal 
            event={selectedEventForModal}
            tradeUserId={tradeUserId!}
            members={members}
            onClose={() => setSelectedEventForModal(null)}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {selectedTaskForModal && (
          <TaskModal 
            task={selectedTaskForModal}
            members={members}
            categories={categories}
            onClose={() => setSelectedTaskForModal(null)}
            onSave={(updates) => handleUpdateTask(selectedTaskForModal.id, updates)}
            onDelete={() => handleDeleteTask(selectedTaskForModal.id)}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {selectedNoteForModal && (
          <NoteModal 
            note={selectedNoteForModal}
            onClose={() => setSelectedNoteForModal(null)}
            onSave={(updates) => handleUpdateNote(selectedNoteForModal.id, updates)}
            onDelete={() => handleDeleteNote(selectedNoteForModal.id)}
            members={members}
          />
        )}
      </AnimatePresence>

      {/* Quote Preview Modal */}
      {selectedQuoteForPreview && (
        <QuotePreviewModal
          isOpen={!!selectedQuoteForPreview}
          onClose={() => setSelectedQuoteForPreview(null)}
          quote={selectedQuoteForPreview}
          businessDetails={businessDetails}
          onEdit={(q) => {
            setSelectedQuoteForPreview(null);
            onNavigate?.('quotes');
          }}
          onStatusChange={async (quoteId, status) => {
            if (!tradeUserId) return;
            try {
              await updateQuoteStatus(tradeUserId, quoteId, status);
              setSelectedQuoteForPreview(prev => prev ? { ...prev, status } : null);
              showToast(`Quote status updated to ${status}`, 'success');
            } catch (err) {
              logger.error('Failed to update quote status', err);
            }
          }}
        />
      )}

      <AnimatePresence>
        {showSmartCapture && (
          <SmartCaptureModal 
            onClose={() => setShowSmartCapture(null)} 
            initialEmailText={`Subject: ${showSmartCapture.subject}\nFrom: ${showSmartCapture.from}\nDate: ${showSmartCapture.date}\n\nContent:\n${showSmartCapture.body || showSmartCapture.snippet}`}
            members={members}
          />
        )}
      </AnimatePresence>
      <ConfirmModal 
        isOpen={confirmConfig.isOpen}
        title={confirmConfig.title}
        message={confirmConfig.message}
        confirmLabel={confirmConfig.confirmLabel}
        onConfirm={confirmConfig.onConfirm}
        onClose={() => setConfirmConfig(prev => ({ ...prev, isOpen: false }))}
      />
      <AnimatePresence>
        {isPasswordModalOpen && (
          <AppSpecificPasswordModal
            onClose={() => setIsPasswordModalOpen(false)}
            onSuccess={() => {
              showToast('Connected email account successfully!', 'success');
              fetchEmails();
            }}
            initialProvider={passwordModalProvider}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function EmptyState({ icon: Icon, message }: { icon: any, message: string }) {
  const { settings } = useSettings();
  return (
    <div className="py-8 bg-zinc-50/50 dark:bg-zinc-900/30 rounded-2xl border border-zinc-100 dark:border-zinc-800 flex flex-col items-center justify-center gap-2">
      <Icon className="w-5 h-5" style={{ color: settings.themeColor }} />
      <span className="text-xs font-medium text-zinc-400 uppercase tracking-wider">{message}</span>
    </div>
  );
}

function getMemberColorHex(memberId: any) {
  if (!memberId || memberId === 'all') return '#94a3b8';
  const idStr = typeof memberId === 'string' ? memberId : (memberId?.id || memberId?.uid || String(memberId));
  if (typeof idStr !== 'string') return '#94a3b8';
  const colors = [
    '#fb7185', // rose-400
    '#60a5fa', // blue-400
    '#34d399', // emerald-400
    '#fbbf24', // amber-400
    '#818cf8', // indigo-400
    '#c084fc', // purple-400
    '#22d3ee', // cyan-400
    '#f472b6', // pink-400
  ];
  let hash = 0;
  for (let i = 0; i < idStr.length; i++) {
    hash = idStr.charCodeAt(i) + ((hash << 5) - hash);
  }
  const index = Math.abs(hash) % colors.length;
  return colors[index];
}

function HubCard({ item, compact, onClick, onToggle, members = [], categories = [] }: { item: DashboardItem, compact?: boolean, onClick?: () => void, onToggle?: () => void, members?: any[], categories?: any[] }) {
  const { settings } = useSettings();
  const icons = {
    task: CheckCircle2,
    event: CalendarIcon,
    email: Mail,
    note: StickyNote,
    birthday: Cake,
    shopping: ShoppingCart,
    quote: FileText
  };

  const getEventColors = () => {
    if (item.type === 'birthday') {
      return 'text-rose-700 dark:text-rose-400 bg-rose-50 dark:bg-rose-900/40 border-rose-200 dark:border-rose-800/50';
    }
    if (item.type === 'event') {
      const isExternal = item.data?.type === 'external';
      if (isExternal && item.color) {
        return ''; // Handle with custom color style
      }
      if (isExternal) {
        return 'text-blue-700 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/40 border-blue-200 dark:border-blue-800/50';
      }
    }
    return ''; // Will handle with style
  };

  const cardColors = getEventColors();
  const Icon = icons[item.type];
  const useTheme = ['task', 'event', 'shopping'].includes(item.type);
  const isNote = item.type === 'note';
  const assignedTo = item.type === 'task' ? item.data?.assignedTo : undefined;
  
  // Find assigned member to get their custom color
  const assignedMember = assignedTo ? members.find((m: any) => m.id === assignedTo) : undefined;
  const category = item.data?.listId ? categories.find((c: any) => c.id === item.data.listId) : undefined;

  const memberColor = assignedMember?.color 
    || category?.color
    || (assignedTo && assignedTo !== 'all' ? getMemberColorHex(assignedTo) : undefined);
  
  const baseColor = memberColor || settings.themeColor;

  const getBadgeLabel = () => {
    if (item.type === 'event' && item.data?.type === 'external') {
      const calName = item.data.calendarName || 'Calendar';
      const member = members.find(m => m.email?.toLowerCase() === calName.toLowerCase());
      if (member) {
        const name = member.displayName || member.name || member.email;
        return name.split(' ')[0];
      }
      if (calName.includes('@')) {
        const username = calName.split('@')[0];
        const namePart = username.includes('.') ? username.split('.')[0] : username;
        return namePart.charAt(0).toUpperCase() + namePart.slice(1);
      }
      return calName;
    }
    return item.type;
  };

  // Compute TaskCard-style variables for non-note items
  const isTask = item.type === 'task';
  const TaskIcon = isTask 
    ? (item.data?.status === 'completed' ? CheckCircle2 : Circle)
    : icons[item.type];
  const accentColor = memberColor 
    || (item.type === 'birthday' ? '#fb7185' : (item.color || settings.themeColor));
  let displayMemberName: string | undefined = assignedMember ? getFirstName(assignedMember.displayName || assignedMember.name || assignedMember.email) : undefined;

  if (!displayMemberName && item.type === 'event' && item.data?.type === 'external') {
    displayMemberName = getFirstName(getBadgeLabel());
  } else if (displayMemberName) {
    displayMemberName = getFirstName(displayMemberName);
  }

  const dateStr = item.date && !isNaN(item.date.getTime()) ? format(item.date, 'd MMM yyyy HH:mm') : null;
  const iconColor = isTask 
    ? (item.data?.status === 'completed' ? settings.themeColor : '#d4d4d8')
    : accentColor;

  return (
    <motion.div
      layout
      onClick={onClick}
      className={`bg-white dark:bg-zinc-900 border p-2.5 sm:p-4 rounded-xl sm:rounded-2xl transition-all group cursor-pointer relative overflow-hidden pl-3.5 sm:pl-5 active:scale-[0.98] ${
        item.hasConflict 
          ? 'border-amber-500/60 dark:border-amber-500/40 ring-1 ring-amber-500/40' 
          : 'border-zinc-200 dark:border-zinc-800'
      }`}
    >
      <div className="absolute left-0 top-0 bottom-0 w-1.5" style={{ backgroundColor: item.hasConflict ? '#f59e0b' : accentColor }} />
      
      <div className="flex items-start gap-2 sm:gap-3">
        <div className="mt-0.5 shrink-0">
          {isTask ? (
            <button 
              onClick={(e) => {
                e.stopPropagation();
                onToggle?.();
              }}
              className="p-1 -m-1 rounded-lg hover:bg-emerald-50 dark:hover:bg-emerald-950/40 hover:scale-110 active:scale-95 transition-all group/btn"
              title={item.data?.status === 'completed' ? "Mark task pending" : "Click to mark task completed"}
            >
              <TaskIcon className="w-4 h-4 sm:w-5 sm:h-5 transition-transform group-hover/btn:scale-110" style={{ color: iconColor }} />
            </button>
          ) : (
            <TaskIcon className="w-4 h-4 sm:w-5 sm:h-5" style={{ color: item.hasConflict ? '#f59e0b' : iconColor }} />
          )}
        </div>
        
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-1 sm:gap-2">
            <span className={`block font-bold text-xs sm:text-sm text-zinc-900 dark:text-zinc-100 ${compact ? 'line-clamp-1' : ''}`}>
              {item.title}
            </span>
            {item.type === 'event' && item.data?.location && (
              <button 
                onClick={(e) => {
                  e.stopPropagation();
                  const query = encodeURIComponent(item.data.location);
                  window.open(`https://www.google.com/maps/search/?api=1&query=${query}`, '_blank');
                }}
                className="p-1 text-zinc-400 hover:text-emerald-500 transition-colors shrink-0"
                title="Open in Maps"
              >
                <Navigation className="w-3 h-3" />
              </button>
            )}
          </div>

          {item.type === 'quote' && item.data?.jobTitle && (
            <span className="block text-xs text-zinc-500 dark:text-zinc-400 truncate mt-0.5">
              {item.data.jobTitle}
            </span>
          )}
          
          <div className="flex flex-wrap items-center gap-2 mt-2">
            {dateStr && (
              <div className="flex items-center gap-1.5 text-zinc-400 text-[10px] uppercase font-bold whitespace-nowrap overflow-visible">
                <CalendarIcon className="w-3 h-3 shrink-0" />
                {dateStr}
              </div>
            )}
            {item.type === 'quote' && item.data?.status && (
              <span 
                className={`px-1.5 py-0.5 rounded-md text-[9px] font-black uppercase tracking-wider ${
                  item.data.status === 'accepted' ? 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800' :
                  item.data.status === 'pending' ? 'bg-amber-50 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 border border-amber-200 dark:border-amber-800' :
                  item.data.status === 'declined' ? 'bg-rose-50 dark:bg-rose-900/30 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-800' :
                  'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 border border-zinc-200 dark:border-zinc-700'
                }`}
              >
                {item.data.status}
              </span>
            )}
            {item.type === 'quote' && item.data?.grandTotal !== undefined && (
              <span className="text-[10px] font-black text-zinc-900 dark:text-white ml-auto">
                £{Number(item.data.grandTotal).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            )}
            {displayMemberName && (
              <div 
                className="flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[9px] font-bold uppercase tracking-widest border"
                style={{
                  backgroundColor: accentColor + '15',
                  color: accentColor,
                  borderColor: accentColor + '30'
                }}
              >
                <UserIcon className="w-2.5 h-2.5" />
                {displayMemberName}
              </div>
            )}
            {item.hasConflict && (
              <div className="flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[9px] font-black uppercase tracking-wider bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/30">
                <AlertTriangle className="w-2.5 h-2.5 text-amber-500 shrink-0" />
                Conflict
              </div>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
}

function EmailCard({ email, onClick }: { email: EmailMessage, onClick?: () => void }) {
  const { settings } = useSettings();
  const date = new Date(email.date);
  const dateStr = isToday(date) ? format(date, 'HH:mm') : format(date, 'd MMM yyyy HH:mm');
  const accentColor = settings.themeColor;

  const renderProviderIcon = () => {
    switch (email.provider) {
      case 'microsoft': return <MicrosoftIcon className="w-4 h-4 shrink-0" isColoured={true} />;
      case 'yahoo': return <YahooIcon className="w-4 h-4 shrink-0" isColoured={true} />;
      case 'apple': return <AppleIcon className="w-4 h-4 shrink-0" isColoured={true} />;
      case 'google': return <GoogleIcon className="w-4 h-4 shrink-0" isColoured={true} />;
      default: return <Mail className="w-4 h-4 text-zinc-400 shrink-0" />;
    }
  };

  return (
    <div
      onClick={onClick}
      className={`bg-white dark:bg-zinc-900 border p-4 rounded-2xl transition-all group cursor-pointer relative overflow-hidden pl-5 active:scale-[0.98] ${
        email.unread ? 'border-emerald-200/60 dark:border-emerald-800/40' : 'border-zinc-200 dark:border-zinc-800'
      }`}
    >
      <div className="absolute left-0 top-0 bottom-0 w-1.5" style={{ backgroundColor: accentColor }} />
      
      <div className="flex items-start gap-3">
        <div className="mt-0.5 shrink-0 flex items-center justify-center">
          {renderProviderIcon()}
        </div>
        
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            {email.unread && (
              <div className="w-2 h-2 bg-emerald-500 rounded-full shrink-0" />
            )}
            <span className={`block font-bold text-sm text-zinc-900 dark:text-zinc-100 line-clamp-1 ${email.unread ? 'font-black' : ''}`}>
              {email.subject}
            </span>
          </div>
          
          <div className="flex flex-wrap items-center gap-2 mt-2">
            <div className="flex items-center gap-1.5 text-zinc-400 text-[10px] uppercase font-bold whitespace-nowrap overflow-visible">
              <CalendarIcon className="w-3 h-3 shrink-0" />
              {dateStr}
            </div>
            <div 
              className="flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[9px] font-bold uppercase tracking-widest border"
              style={{
                backgroundColor: accentColor + '15',
                color: accentColor,
                borderColor: accentColor + '30'
              }}
            >
              <UserIcon className="w-2.5 h-2.5" />
              {email.from}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
