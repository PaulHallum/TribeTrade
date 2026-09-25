import { useState, useEffect, Suspense, useRef } from 'react';
import { lazyWithRetry } from '../../utils/lazyWithRetry';
import { 
  LayoutDashboard, 
  Calendar, 
  CheckSquare, 
  Utensils, 
  MapPin, 
  Users,
  Sparkles,
  Loader2,
  X,
  RefreshCw,
  Check,
  Cloud,
  Mail,
  Volume2,
  WifiOff,
  HelpCircle,
  Shield,
  KeyRound,
  ChevronRight,
  ChevronLeft,
  Package,
  FileText,
  ReceiptPoundSterling
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { ErrorBoundary } from '../common/ErrorBoundary';

const Hub = lazyWithRetry(() => import('../dashboard/Hub'));
const CalendarView = lazyWithRetry(() => import('../calendar/CalendarView'));
const QuotesView = lazyWithRetry(() => import('../quotes/QuotesView'));
const ExpensesView = lazyWithRetry(() => import('../expenses/ExpensesView'));
const TasksView = lazyWithRetry(() => import('../tasks/TasksView'));
const ShoppingListView = lazyWithRetry(() => import('../shopping/ShoppingListView'));
const SettingsView = lazyWithRetry(() => import('../settings/SettingsView'));
const EmailView = lazyWithRetry(() => import('../email/EmailView'));
const GuideView = lazyWithRetry(() => import('../guide/GuideView'));
import PWAInstallBanner from '../common/PWAInstallBanner';
import OfflineBanner from '../common/OfflineBanner';
const PinSetupModal = lazyWithRetry(() => import('../settings/PinSetupModal'));

import AIInput from '../ai/AIInput';
import SmartCaptureModal from '../smart/SmartCaptureModal';
import DashboardTour from '../dashboard/DashboardTour';
import { SAMPLE_SCHOOL_CIRCULAR } from '../../data/sampleTemplates';
import Weather from './Weather';
import GoogleIcon from './GoogleIcon';
import AuthScreen from '../auth/AuthScreen';
import GoogleReauthModal from '../auth/GoogleReauthModal';
import { generateDailyBriefing } from '../../services/gemini';
import { speakText, stopSpeaking, preWarmVoice, preCacheAudio } from '../../services/voiceService';
import { useDashboardItems } from '../../hooks/useDashboardItems';
import { useAuth } from '../../App';
import { useToast } from '../../contexts/ToastContext';
import { useSettings } from '../../contexts/SettingsContext';
import { logger } from '../../services/logger';
import { requestNotificationPermission } from '../../services/notificationService';
import { db } from '../../lib/firebase';
import { doc, onSnapshot, updateDoc, getDoc } from 'firebase/firestore';


import { useSubscriptionTier } from '../../hooks/useSubscriptionTier';

type View = 'hub' | 'calendar' | 'quotes' | 'expenses' | 'tasks' | 'supplies' | 'email' | 'settings' | 'guide' | 'support';

export default function Shell() {
  const { user, tradeUserId, signIn } = useAuth();
  const { showToast } = useToast();
  const { settings, updateSettings } = useSettings();
  const { subscriptionTier, isTrial, trialDaysRemaining, trialHasEnded } = useSubscriptionTier();
  const [dailyUses, setDailyUses] = useState(0);
  const [resetTime, setResetTime] = useState('');
  const [isOnboarding, setIsOnboarding] = useState(false);
  const [showFamilyPrompt, setShowFamilyPrompt] = useState(false);
  const [showFamilyManagement, setShowFamilyManagement] = useState(false);
  const [showPinSetupModal, setShowPinSetupModal] = useState(false);
  const [showNotificationPrompt, setShowNotificationPrompt] = useState(false);
  const [showDashboardTour, setShowDashboardTour] = useState(false);
  const [smartCaptureSampleText, setSmartCaptureSampleText] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;

    const userRef = doc(db, 'users', user.uid);
    let unsubFamily: (() => void) | null = null;
    let unsubUsage: (() => void) | null = null;

    const unsubUser = onSnapshot(userRef, (snap) => {
      if (snap.exists()) {
        const userData = snap.data();
        const fid = userData.tradeUserId;
        const today = new Date().toISOString().split('T')[0];
        const effectivetradeUserId = fid || `family_${user.uid}`;
        if (unsubUsage) unsubUsage();
        unsubUsage = onSnapshot(doc(db, 'trade_users', effectivetradeUserId, 'usage', today), (usageSnap) => {
          if (usageSnap.exists()) {
            setDailyUses(usageSnap.data().aiUses || 0);
          } else {
            setDailyUses(0);
          }
        }, (err) => {
          logger.warn('Family daily usage listener error in Shell', err);
        });
      }
    }, (err) => {
      logger.warn('User document listener error in Shell', err);
    });

    const updateResetTime = () => {
      const now = new Date();
      const nextReset = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
      const diffMs = nextReset.getTime() - now.getTime();
      const diffHrs = Math.floor(diffMs / (1000 * 60 * 60));
      const diffMins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
      setResetTime(`${diffHrs}h ${diffMins}m`);
    };
    updateResetTime();
    const interval = setInterval(updateResetTime, 60000);

    return () => {
      unsubUser();
      if (unsubFamily) unsubFamily();
      if (unsubUsage) unsubUsage();
      clearInterval(interval);
    };
  }, [user]);

  const maxUses = 50;
  const leftUses = Math.max(0, maxUses - dailyUses);

  useEffect(() => {
    if ((subscriptionTier === 'premium' || isTrial) && dailyUses > 0) {
      if (leftUses === 5 || leftUses === 2) {
        showToast(`AI Limit Warning: You have ${leftUses} AI ${(leftUses as number) === 1 ? 'use' : 'uses'} remaining today.`, 'warning');
      }
    }
  }, [dailyUses, leftUses, subscriptionTier, isTrial, showToast]);

  const [activeView, setActiveView] = useState<View>('hub');
  const [activeTab, setActiveTab] = useState<string | null>(null);
  const [initialItemId, setInitialItemId] = useState<string | null>(null);
  const [canScrollRight, setCanScrollRight] = useState(true);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const checkScroll = () => {
    if (scrollContainerRef.current) {
      const { scrollLeft, scrollWidth, clientWidth } = scrollContainerRef.current;
      setCanScrollRight(scrollLeft + clientWidth < scrollWidth - 5);
      setCanScrollLeft(scrollLeft > 5);
    }
  };

  useEffect(() => {
    checkScroll();
    window.addEventListener('resize', checkScroll);
    return () => window.removeEventListener('resize', checkScroll);
  }, [user]);
  
  // Handle Android/Browser back button and Deep Links
  useEffect(() => {
    const parseUrlParams = () => {
      const params = new URLSearchParams(window.location.search);
      let view = params.get('view') as View;
      const id = params.get('id');

      const pathname = window.location.pathname.replace('/', '').toLowerCase();
      if (!view && ['hub', 'calendar', 'quotes', 'expenses', 'tasks', 'supplies', 'email', 'settings', 'support'].includes(pathname)) {
        view = pathname as View;
      }
      if (params.get('payment') === 'success' || params.get('payment') === 'cancelled') {
        view = 'settings';
      }

      if (params.get('tour') === 'true' || params.get('demo') === 'true') {
        setShowDashboardTour(true);
      }

      if (view && ['hub', 'calendar', 'quotes', 'expenses', 'tasks', 'supplies', 'email', 'settings', 'support'].includes(view)) {
        setActiveView(view);
        if (id) {
          const cleanId = id.includes('/') ? id.split('/').pop() || id : id;
          setInitialItemId(cleanId);
        }
      } else if (window.history.state?.view) {
        setActiveView(window.history.state.view);
      }
    };

    const handlePopState = (event: PopStateEvent) => {
      if (event.state && event.state.view) {
        setActiveView(event.state.view);
      } else {
        parseUrlParams();
      }
    };

    window.addEventListener('popstate', handlePopState);
    
    // Initial load parse
    parseUrlParams();

    // Initial state
    if (!window.history.state) {
      window.history.replaceState({ view: 'hub' }, '');
    }

    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // Sync state to history when changed manually (e.g. via nav buttons)
  const navigateToView = (view: View, tab: string | null = null) => {
    if (activeView === view && activeTab === tab) return;
    
    // Clear search params and update the URL path to match the view
    const url = new URL(window.location.href);
    url.search = '';
    url.pathname = view === 'hub' ? '/' : `/${view}`;
    window.history.pushState({ view, tab }, '', url.toString());
    
    setActiveView(view);
    setActiveTab(tab);
    setInitialItemId(null);
  };

  useEffect(() => {
    const handleStartTour = () => {
      navigateToView('hub');
      setShowDashboardTour(true);
    };

    window.addEventListener('tribe_start_tour', handleStartTour);
    return () => {
      window.removeEventListener('tribe_start_tour', handleStartTour);
    };
  }, []);

  const { items } = useDashboardItems();
  const [briefingData, setBriefingData] = useState<any | null>(null);
  const [briefingLastUpdated, setBriefingLastUpdated] = useState<Date | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isConverting, setIsConverting] = useState(false);
  const [showSmartConvertModal, setShowSmartConvertModal] = useState(false);
  const [showBriefing, setShowBriefing] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSynced, setLastSynced] = useState<Date>(new Date());
  const [showSyncSuccess, setShowSyncSuccess] = useState(false);
  const [lastBriefingAt, setLastBriefingAt] = useState<Date | null>(null);
  const [timeRemaining, setTimeRemaining] = useState(0);

  useEffect(() => {
    if (!user) {
      setLastBriefingAt(null);
      return;
    }
    let unsubscribe = () => {};
    const initListener = async () => {
      const { doc, onSnapshot } = await import('firebase/firestore');
      const { db } = await import('../../lib/firebase');
      unsubscribe = onSnapshot(doc(db, 'users', user.uid), (snapshot) => {
        if (snapshot.exists()) {
          const data = snapshot.data();
          if (data.lastBriefingAt) {
            setLastBriefingAt(data.lastBriefingAt.toDate());
          } else {
            setLastBriefingAt(null);
          }
        }
      }, (err) => {
        logger.warn('Failed to listen to lastBriefingAt', err);
      });
    };
    initListener();
    return () => unsubscribe();
  }, [user]);

  useEffect(() => {
    if (!lastBriefingAt) {
      setTimeRemaining(0);
      return;
    }
    const checkLimit = () => {
      const now = new Date().getTime();
      const last = lastBriefingAt.getTime();
      const diff = now - last;
      const threeHours = 3 * 60 * 60 * 1000;
      if (diff < threeHours) {
        setTimeRemaining(Math.ceil((threeHours - diff) / 1000));
      } else {
        setTimeRemaining(0);
      }
    };
    checkLimit();
    const interval = setInterval(checkLimit, 1000);
    return () => clearInterval(interval);
  }, [lastBriefingAt, subscriptionTier]);

  useEffect(() => {
    if (user && settings.notifications) {
      requestNotificationPermission(user.uid).catch(() => {});
    }
  }, [user, settings.notifications]);


  useEffect(() => {
    if (!user) return;
    const guideKey = `ng_guide_shown_${user.uid}`;
    const hasShownLocal = localStorage.getItem(guideKey);

    const userRef = doc(db, 'users', user.uid);
    getDoc(userRef).then((snap) => {
      if (snap.exists()) {
        const userData = snap.data();
        if (!userData.hasSeenGuide && !hasShownLocal) {
          setActiveView('hub');
          setShowDashboardTour(true);
        } else if (userData.hasSeenGuide && !hasShownLocal) {
          localStorage.setItem(guideKey, 'true');
        }
      } else if (!hasShownLocal) {
        setActiveView('hub');
        setShowDashboardTour(true);
      }
    }).catch((err) => {
      logger.warn('Failed to check hasSeenGuide status', err);
      if (!hasShownLocal) {
        setActiveView('hub');
        setShowDashboardTour(true);
      }
    });
  }, [user]);

  const handleFinishOnboarding = async () => {
    if (user) {
      const guideKey = `ng_guide_shown_${user.uid}`;
      localStorage.setItem(guideKey, 'true');
      setIsOnboarding(false);
      setActiveView('hub');

      try {
        await updateDoc(doc(db, 'users', user.uid), {
          hasSeenGuide: true
        });
      } catch (err) {
        logger.warn('Failed to save hasSeenGuide to Firestore', err);
      }

      // Automatically launch Interactive Dashboard Tour for value realization
      setShowDashboardTour(true);
    }
  };

  const [tourReturnStep, setTourReturnStep] = useState<number | undefined>(undefined);

  const handleClosePinSetupModal = () => {
    setShowPinSetupModal(false);
    if (tourReturnStep !== undefined) {
      setShowDashboardTour(true);
    }
  };

  const handleFinishDashboardTour = async () => {
    setShowDashboardTour(false);
    setTourReturnStep(undefined);
    if (user) {
      const guideKey = `ng_guide_shown_${user.uid}`;
      localStorage.setItem(guideKey, 'true');
      try {
        await updateDoc(doc(db, 'users', user.uid), {
          hasSeenGuide: true
        });
      } catch (err) {
        logger.warn('Failed to save hasSeenGuide status', err);
      }
    }
  };

  const handleTourSelectAction = (view: 'smart' | 'supplies' | 'family' | 'settings' | 'pin' | 'quotes' | 'expenses', payload?: any) => {
    if (view === 'smart') {
      setActiveView('hub');
      if (payload?.sample === 'trade_job_note' || payload?.sample === 'school_circular') {
        setSmartCaptureSampleText(SAMPLE_TRADE_JOB_NOTE);
      }
    } else if (view === 'quotes') {
      setActiveView('quotes');
    } else if (view === 'expenses') {
      setActiveView('expenses');
    } else if (view === 'supplies') {
      setActiveView('supplies');
    } else if (view === 'pin') {
      setTourReturnStep(5);
      setShowPinSetupModal(true);
    } else if (view === 'settings') {
      navigateToView('settings', payload?.tab || null);
    }
  };

  useEffect(() => {
    preWarmVoice();
  }, []);

  useEffect(() => {
    if (briefingData?.content) {
      preCacheAudio(briefingData.content);
    }
  }, [briefingData?.content]);

  const handleSync = async () => {
    setIsSyncing(true);
    // Simulate a manual sync process
    // In a real app, this might involve re-fetching data or checking for updates from external APIs
    await new Promise(resolve => setTimeout(resolve, 1500));
    setLastSynced(new Date());
    setIsSyncing(false);
    showToast('Dashboard synced with Google', 'success');
  };

  const navItems = [
    { id: 'hub', label: 'Hub', icon: LayoutDashboard },
    { id: 'calendar', label: 'Calendar', icon: Calendar },
    { id: 'quotes', label: 'Quotes', icon: FileText },
    { id: 'expenses', label: 'Expenses', icon: ReceiptPoundSterling },
    { id: 'tasks', label: 'Tasks', icon: CheckSquare },
    { id: 'supplies', label: 'Supplies', icon: Package },
    { id: 'email', label: 'Email', icon: Mail },
  ];

  const isAdmin = user?.email === 'paulhallum@gmail.com' || user?.email === 'paulhallum@googlemail.com';
  if (isAdmin) {
    navItems.push({ id: 'support', label: 'Support', icon: Shield });
  }

  const handleGenerateBriefing = async (forceRefresh: boolean | any = false) => {
    if (!user) return;
    setShowBriefing(true);
    
    const isForced = forceRefresh === true;
    
    // If user is on free tier (and not in reverse trial), state that AI features are not available without a subscription
    if (subscriptionTier === 'free') {
      setIsGenerating(false);
      setBriefingData({
        content: "AI features are not available without a subscription. Please upgrade to Premium to access Daily Briefings, Voice Readout, and Magic Mic AI."
      });
      return;
    }

    setIsGenerating(true);
    try {
      const { doc, getDoc, setDoc, serverTimestamp } = await import('firebase/firestore');
      const { db } = await import('../../lib/firebase');
      
      let cachedContent = '';
      let cachedDate: Date | null = null;

      if (!isForced && tradeUserId) {
        try {
          const cacheRef = doc(db, 'trade_users', tradeUserId, 'briefing', 'current');
          const snap = await getDoc(cacheRef);
          if (snap.exists()) {
            const data = snap.data();
            cachedContent = data.content || '';
            cachedDate = data.updatedAt?.toDate() || null;
            
            if (cachedDate) {
              const now = new Date();
              const isSameDay = 
                cachedDate.getFullYear() === now.getFullYear() &&
                cachedDate.getMonth() === now.getMonth() &&
                cachedDate.getDate() === now.getDate();
                
              if (isSameDay) {
                setBriefingData({ content: cachedContent });
                setBriefingLastUpdated(cachedDate);
                setIsGenerating(false);
                return;
              }
            }
          }
        } catch (e) {
          logger.warn('Could not read briefing cache', e);
        }
      }

      // Filter items to only include those in the next 7 days for the briefing
      const now = new Date();
      now.setHours(0, 0, 0, 0);
      const weekFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
      
      const seenItems = new Set();
      const briefingItems = items.filter(item => {
        if (!item.date) return true; // Include items without dates (notes, shopping)
        const itemDate = new Date(item.date);
        if (itemDate < now || itemDate > weekFromNow) return false;
        
        // Basic deduplication
        const uniqueKey = `${item.title}-${itemDate.toISOString().split('T')[0]}`;
        if (seenItems.has(uniqueKey)) return false;
        seenItems.add(uniqueKey);
        
        return true;
      });

      // 1. Double check client-side rate limit time remaining
      if (timeRemaining > 0) {
        showToast("Check back later", "warning");
        setIsGenerating(false);
        return;
      }

      // 2. Save lastBriefingAt timestamp to the user's Firestore profile first
      try {
        const { updateDoc } = await import('firebase/firestore');
        const userRef = doc(db, 'users', user.uid);
        await updateDoc(userRef, {
          lastBriefingAt: serverTimestamp()
        });
      } catch (e: any) {
        logger.error('Failed to update briefing timestamp (rate limit)', e);
        showToast("Check back later", "warning");
        setIsGenerating(false);
        return;
      }

      const content = await generateDailyBriefing(
        briefingItems, 
        'Trade Business',
        user.displayName || 'Trade Partner'
      );
      
      const updatedTime = new Date();
      setBriefingData({ content });
      setBriefingLastUpdated(updatedTime);

      // Save to cache
      if (tradeUserId) {
        try {
          const cacheRef = doc(db, 'trade_users', tradeUserId, 'briefing', 'current');
          await setDoc(cacheRef, {
            content,
            updatedAt: serverTimestamp()
          });
        } catch (e) {
          logger.warn('Could not save briefing cache', e);
        }
      }
    } catch (error: any) {
      logger.error('Daily briefing retrieval failed', error);
      if (error.message === 'LIMIT_EXCEEDED') {
        showToast?.("Daily AI limit reached (50 uses/day). Resets at midnight.", "error");
        setBriefingData({ 
          content: "You've reached your daily limit of 50 AI uses. Your limit will reset at midnight."
        });
      } else if (!briefingData) {
        setBriefingData({ 
          content: "I couldn't load your briefing right now. Please try again in a moment."
        });
      }
    } finally {
      setIsGenerating(false);
    }
  };

  const speakBriefing = async () => {
    if (!briefingData?.content) return;
    
    if (isSpeaking) {
      stopSpeaking();
      setIsSpeaking(false);
      return;
    }

    setIsSpeaking(true);
    await speakText(
      briefingData.content,
      'en-GB-Neural2-A',
      () => setIsSpeaking(false),
      () => setIsSpeaking(false),
      tradeUserId || undefined,
      user?.uid || undefined
    );
  };

  const handleCloseBriefing = () => {
    stopSpeaking();
    setIsSpeaking(false);
    setShowBriefing(false);
  };

  const handleSmartConvert = async () => {
    if (!briefingData?.content || !tradeUserId) return;
    setShowSmartConvertModal(true);
  };

  return (
    <div className="h-screen w-screen flex flex-col bg-[var(--bg-primary)] text-[var(--text-primary)] overflow-hidden transition-all duration-300">
      {/* Top Navigation */}
      {!isOnboarding && (
        <header className="h-14 bg-[var(--bg-secondary)] border-b border-[var(--border-color)] flex items-center pl-4 pr-2 sm:pr-3 z-30 shrink-0 transition-all justify-between w-full">
        <div className="flex items-center gap-1.5 min-w-0 shrink-0">
          <div className="w-9 h-9 flex items-center justify-center shrink-0">
            <img src="/logo.png" alt="Tribe Logo" className="w-full h-full object-contain" />
          </div>
          {!navigator.onLine && (
            <div className="flex items-center gap-1.5 px-2 py-0.5 bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400 text-[9px] font-black uppercase tracking-widest rounded-full border border-amber-100 dark:border-amber-800/20 ml-2">
              <WifiOff className="w-3 h-3" />
              Offline
            </div>
          )}
        </div>

        <div className="flex items-center justify-center flex-1 mx-2 sm:mx-4 overflow-hidden gap-2">
          <Weather />
          {user && !isTrial && subscriptionTier === 'free' && (
            <button
              onClick={() => navigateToView('settings')}
              className="flex items-center gap-1 sm:gap-1.5 px-1.5 sm:px-2.5 py-0 sm:py-0.5 bg-gradient-to-r from-emerald-500/10 to-blue-500/10 hover:from-emerald-500/20 hover:to-blue-500/20 text-emerald-700 dark:text-emerald-400 text-[7px] sm:text-[9px] font-extrabold uppercase tracking-wider rounded-full border border-emerald-500/20 dark:border-emerald-400/10 transition-all shrink-0 hover:scale-105 active:scale-95 shadow-sm h-5 sm:h-6"
              title="Click to Upgrade to Premium"
            >
               <span>Free</span>
               <div className="h-2 sm:h-2.5 w-px bg-emerald-300 dark:bg-emerald-800/30" />
               <span className="text-blue-600 dark:text-blue-400 font-black">Upgrade</span>
            </button>
          )}
        </div>
        
        <div className="flex items-center justify-end gap-1 shrink-0">
          <button
            onClick={() => {
              if (user) {
                navigateToView(activeView === 'settings' ? 'hub' : 'settings');
              } else {
                signIn();
              }
            }}
            className={`p-2 rounded-xl transition-all flex items-center justify-center shrink-0 ${
              activeView === 'settings' && user
                ? 'bg-emerald-500 text-white' 
                : 'hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-600 dark:text-zinc-400'
            }`}
            title={user ? "Menu" : "Sign In"}
          >
            {user ? (
              <div className="flex flex-col justify-center items-end w-5 h-5 relative">
                <span className={`block absolute h-[2px] rounded-full transition-all duration-300 ease-in-out ${activeView === 'settings' ? 'w-5 bg-white rotate-45' : 'w-5 bg-current -translate-y-[5px]'}`}></span>
                <span className={`block absolute h-[2px] rounded-full transition-all duration-300 ease-in-out ${activeView === 'settings' ? 'w-5 bg-white opacity-0 translate-x-2' : 'w-5 bg-current'}`}></span>
                <span className={`block absolute h-[2px] rounded-full transition-all duration-300 ease-in-out ${activeView === 'settings' ? 'w-5 bg-white -rotate-45' : 'w-3 bg-current translate-y-[5px]'}`}></span>
              </div>
            ) : (
              <GoogleIcon className="w-5 h-5" isColoured={true} />
            )}
          </button>
        </div>
      </header>
      )}

      {/* Top Banner Notifications */}
      {user && !isOnboarding && (
        <>
          {/* Family Setup Prompt Bar */}
          {showFamilyPrompt && (
            <div className="bg-gradient-to-r from-emerald-600 to-teal-700 text-white px-4 py-2 flex items-center justify-between text-xs font-semibold shadow-inner shrink-0 z-20">
              <div className="flex items-center gap-2 min-w-0">
                <Users className="w-4 h-4 shrink-0 text-emerald-200" />
                <span className="truncate">Set up your Family to collaborate on tasks, meal plans, and calendars!</span>
              </div>
              <div className="flex items-center gap-2 shrink-0 ml-3">
                <button
                  onClick={() => {
                    setActiveView('hub');
                  }}
                  className="px-3 py-1 bg-white text-emerald-800 rounded-lg text-[11px] font-black uppercase tracking-wider hover:bg-emerald-50 transition-all shadow-sm active:scale-95"
                >
                  Manage Family
                </button>
                <button
                  onClick={() => setShowFamilyPrompt(false)}
                  className="p-1 hover:bg-white/20 rounded-md transition-all text-white/80 hover:text-white"
                  title="Dismiss notification"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}


          {/* Trial Ended Notification Bar */}
          {trialHasEnded && (
            <div className="bg-gradient-to-r from-amber-600 via-rose-600 to-purple-700 text-white px-4 py-2 flex items-center justify-between text-xs font-semibold shrink-0 z-20 shadow-sm">
              <div className="flex items-center gap-2 min-w-0">
                <Sparkles className="w-4 h-4 text-amber-200 shrink-0" />
                <span className="truncate">
                  Your 21-day free trial has ended. Subscribe now to continue full use.
                </span>
              </div>
              <button
                onClick={() => navigateToView('settings')}
                className="px-3 py-1 bg-amber-300 text-zinc-950 rounded-lg text-[10px] font-black uppercase tracking-wider hover:bg-white transition-all shrink-0 ml-3 shadow-md active:scale-95 flex items-center gap-1"
              >
                Subscribe Here (£7.95/mo)
              </button>
            </div>
          )}
        </>
      )}

      {/* Sub-navigation */}
      {user && !isOnboarding && (
        <div className="relative bg-[var(--bg-secondary)] border-b border-[var(--border-color)]">
          <div 
            ref={scrollContainerRef}
            onScroll={checkScroll}
            className="px-4 py-1.5 overflow-x-auto no-scrollbar transition-all relative z-10"
          >
            <nav className="max-w-7xl mx-auto flex items-center gap-1">
              {navItems.map((item) => (
                <button
                  key={item.id}
                  onClick={() => navigateToView(item.id as View)}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-lg transition-all whitespace-nowrap ${
                    activeView === item.id 
                      ? 'bg-emerald-50 dark:bg-emerald-900/20 font-semibold' 
                      : 'text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800'
                  }`}
                  style={activeView === item.id ? { color: 'var(--icon-color)' } : {}}
                >
                  <item.icon className="w-3.5 h-3.5 shrink-0" />
                  <span className="text-xs">{item.label}</span>
                </button>
              ))}
            </nav>
          </div>
          {canScrollLeft && (
            <div className="absolute left-0 top-0 bottom-0 w-12 bg-gradient-to-r from-[var(--bg-secondary)] via-[var(--bg-secondary)]/80 to-transparent pointer-events-none z-20 flex items-center justify-start pl-1 sm:hidden">
              <motion.div
                animate={{ x: [0, -5, 0] }}
                transition={{ repeat: Infinity, duration: 1.2, ease: "easeInOut" }}
              >
                <ChevronLeft className="w-5 h-5 text-emerald-500 dark:text-emerald-400 stroke-[3]" />
              </motion.div>
            </div>
          )}
          {canScrollRight && (
            <div className="absolute right-0 top-0 bottom-0 w-12 bg-gradient-to-l from-[var(--bg-secondary)] via-[var(--bg-secondary)]/80 to-transparent pointer-events-none z-20 flex items-center justify-end pr-1 sm:hidden">
              <motion.div
                animate={{ x: [0, 5, 0] }}
                transition={{ repeat: Infinity, duration: 1.2, ease: "easeInOut" }}
              >
                <ChevronRight className="w-5 h-5 text-emerald-500 dark:text-emerald-400 stroke-[3]" />
              </motion.div>
            </div>
          )}
        </div>
      )}

      {/* Main Content */}
      <main className="flex-1 relative overflow-hidden flex flex-col">
        <div className="flex-1 overflow-y-auto p-1 sm:p-3 pb-40">
          <div className="max-w-7xl mx-auto h-full">
            {!user ? (
              <AuthScreen />
            ) : (
              <>
                {activeView === 'hub' && (
                  <ErrorBoundary name="Dashboard">
                    <Suspense fallback={<div className="flex justify-center p-12"><Loader2 className="w-8 h-8 animate-spin text-emerald-500" /></div>}>
                      <Hub onNavigate={(view, tab) => navigateToView(view as any, tab)} onGenerateBriefing={handleGenerateBriefing} />
                    </Suspense>
                  </ErrorBoundary>
                )}
                {activeView === 'calendar' && (
                  <ErrorBoundary name="Calendar">
                    <Suspense fallback={<div className="flex justify-center p-12"><Loader2 className="w-8 h-8 animate-spin text-emerald-500" /></div>}>
                      <CalendarView initialEventId={initialItemId} onInitialItemHandled={() => setInitialItemId(null)} />
                    </Suspense>
                  </ErrorBoundary>
                )}
                {activeView === 'quotes' && (
                  <ErrorBoundary name="Quotes">
                    <Suspense fallback={<div className="flex justify-center p-12"><Loader2 className="w-8 h-8 animate-spin text-emerald-500" /></div>}>
                      <QuotesView />
                    </Suspense>
                  </ErrorBoundary>
                )}
                {activeView === 'expenses' && (
                  <ErrorBoundary name="Expenses">
                    <Suspense fallback={<div className="flex justify-center p-12"><Loader2 className="w-8 h-8 animate-spin text-emerald-500" /></div>}>
                      <ExpensesView />
                    </Suspense>
                  </ErrorBoundary>
                )}
                {activeView === 'tasks' && (
                  <ErrorBoundary name="Tasks">
                    <Suspense fallback={<div className="flex justify-center p-12"><Loader2 className="w-8 h-8 animate-spin text-emerald-500" /></div>}>
                      <TasksView initialItemId={initialItemId} onInitialItemHandled={() => setInitialItemId(null)} />
                    </Suspense>
                  </ErrorBoundary>
                )}
                {activeView === 'supplies' && (
                  <ErrorBoundary name="Supplies">
                    <Suspense fallback={<div className="flex justify-center p-12"><Loader2 className="w-8 h-8 animate-spin text-emerald-500" /></div>}>
                      <ShoppingListView />
                    </Suspense>
                  </ErrorBoundary>
                )}
                {activeView === 'email' && (
                  <ErrorBoundary name="Email">
                    <Suspense fallback={<div className="flex justify-center p-12"><Loader2 className="w-8 h-8 animate-spin text-emerald-500" /></div>}>
                      <EmailView />
                    </Suspense>
                  </ErrorBoundary>
                )}
                {activeView === 'settings' && (
                  <ErrorBoundary name="Settings">
                    <Suspense fallback={<div className="flex justify-center p-12"><Loader2 className="w-8 h-8 animate-spin text-emerald-500" /></div>}>
                      <SettingsView 
                        onNavigate={(view, tab) => navigateToView(view as any, tab || null)} 
                        initialTab={activeTab || undefined} 
                      />
                    </Suspense>
                  </ErrorBoundary>
                )}
                {activeView === 'guide' && (
                  <ErrorBoundary name="Guide">
                    <Suspense fallback={<div className="flex justify-center p-12"><Loader2 className="w-8 h-8 animate-spin text-emerald-500" /></div>}>
                      <GuideView 
                        isOnboarding={isOnboarding} 
                        onFinishOnboarding={handleFinishOnboarding} 
                      />
                    </Suspense>
                  </ErrorBoundary>
                )}
                {activeView === 'support' && isAdmin && (
                  <ErrorBoundary name="Support Tickets">
                    <Suspense fallback={<div className="flex justify-center p-12"><Loader2 className="w-8 h-8 animate-spin text-emerald-500" /></div>}>
                      <TasksView supportOnly={true} />
                    </Suspense>
                  </ErrorBoundary>
                )}
              </>
            )}
          </div>
        </div>

        {/* AI Input Bar (Footer Area) */}
        {user && (
          <div className="absolute bottom-0 left-0 right-0 p-2 sm:p-4 bg-gradient-to-t from-[var(--bg-primary)] via-[var(--bg-primary)]/80 to-transparent pointer-events-none transition-all">
            <div className="max-w-2xl mx-auto pointer-events-auto">
              <AIInput />
            </div>
          </div>
        )}
      </main>

      {/* Briefing Modal */}
      <AnimatePresence>
        {showBriefing && (
          <div key="briefing-modal" className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={handleCloseBriefing}
              className="absolute inset-0 bg-zinc-900/60 backdrop-blur-sm"
            />
              <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative w-full max-w-lg bg-[var(--bg-primary)] rounded-[32px] overflow-y-auto max-h-[85vh] border border-[var(--border-color)] no-scrollbar"
            >
              <div className="p-5 sm:p-8 text-[var(--text-primary)] relative">
                <div className="relative z-10">
                  <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-[var(--color-primary)] rounded-xl flex items-center justify-center shrink-0">
                        <Sparkles className="w-6 h-6 text-white" />
                      </div>
                      <div>
                        <h3 className="text-xl font-bold">Daily Briefing</h3>
                        {briefingLastUpdated && (
                          <p className="text-[10px] text-[var(--color-primary)] mt-0.5 uppercase tracking-widest">
                            Last run: {briefingLastUpdated.toLocaleDateString([], { day: 'numeric', month: 'short' })} at {briefingLastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </p>
                        )}
                      </div>
                    </div>
                    <button 
                      onClick={handleCloseBriefing}
                      className="p-2 hover:bg-[var(--bg-secondary)] rounded-lg transition-colors"
                    >
                      <X className="w-5 h-5 text-[var(--text-tertiary)]" />
                    </button>
                  </div>

                  <div className="min-h-[120px]">
                    {isGenerating ? (
                      <div className="flex flex-col items-center justify-center py-8 gap-4">
                        <Loader2 className="w-8 h-8 text-[var(--color-primary)] animate-spin" />
                        <p className="text-[var(--text-secondary)] animate-pulse">Tribe is preparing your briefing...</p>
                      </div>
                    ) : briefingData && (
                      <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="space-y-6"
                      >
                        <div className="space-y-1">
                          <p className="text-[var(--accent-color)] font-medium">Weekly Outlook</p>
                          <div className="text-[var(--text-secondary)] leading-relaxed text-sm whitespace-pre-wrap space-y-4">
                            {briefingData.content.split('\n').map((line: string, i: number) => {
                              const headingMatch = line.match(/^\*\*(.*?)\*\*(.*)$/);
                              if (headingMatch) {
                                return (
                                  <div key={i} className="mb-2 mt-4 first:mt-0">
                                    <h4 className="text-[var(--accent-color)] font-bold text-lg">{headingMatch[1]}</h4>
                                    {headingMatch[2] && <span>{headingMatch[2]}</span>}
                                  </div>
                                );
                              }
                              return <div key={i}>{line}</div>;
                            })}
                          </div>
                        </div>

                         {/* Closing removed as per user request */}

                        <div className="pt-4 flex flex-wrap items-center justify-between gap-2.5">
                          <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                            <button 
                              onClick={speakBriefing}
                              className={`flex items-center gap-1.5 px-2.5 sm:px-3.5 py-2 rounded-xl font-bold text-[11px] sm:text-xs uppercase tracking-wider transition-all bg-[var(--accent-color)] text-white hover:opacity-90 ${
                                isSpeaking ? 'animate-pulse' : ''
                              }`}
                            >
                              <Volume2 className={`w-3.5 h-3.5 sm:w-4 sm:h-4 ${isSpeaking ? 'animate-bounce' : ''}`} />
                              {isSpeaking ? 'Stop' : 'Listen'}
                            </button>
                            
                            <button 
                              onClick={handleSmartConvert}
                              disabled={isConverting}
                              className={`flex items-center gap-1.5 px-2.5 sm:px-3.5 py-2 rounded-xl font-bold text-[11px] sm:text-xs uppercase tracking-wider transition-all bg-[var(--accent-color)] text-white hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed`}
                            >
                              <Sparkles className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                              Smart Convert
                            </button>

                            <button 
                              onClick={() => handleGenerateBriefing(true)}
                              disabled={isGenerating || timeRemaining > 0}
                              className="flex items-center gap-1.5 px-2.5 sm:px-3.5 py-2 bg-[var(--accent-color)] text-white hover:opacity-90 rounded-xl font-bold text-[11px] sm:text-xs uppercase tracking-wider transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                              title={timeRemaining > 0 ? (() => {
                                const h = Math.floor(timeRemaining / 3600);
                                const m = Math.ceil((timeRemaining % 3600) / 60);
                                if (h > 0) {
                                  return `Briefing is cooling down. Please wait ${h} hour${h !== 1 ? 's' : ''}${m > 0 ? ` and ${m} minute${m !== 1 ? 's' : ''}` : ''}`;
                                }
                                return `Briefing is cooling down. Please wait ${m} minute${m !== 1 ? 's' : ''}`;
                              })() : "Re-run briefing"}
                            >
                              <RefreshCw className={`w-3.5 h-3.5 sm:w-4 sm:h-4 ${isGenerating ? 'animate-spin' : ''}`} />
                              {timeRemaining > 0 
                                ? (() => {
                                    const h = Math.floor(timeRemaining / 3600);
                                    const m = Math.floor((timeRemaining % 3600) / 60);
                                    const s = timeRemaining % 60;
                                    return `Cooldown (${h > 0 ? `${h}h ` : ''}${m}m ${s}s)`;
                                  })()
                                : "Re-run"}
                            </button>
                          </div>
                          
                          <button 
                            onClick={handleCloseBriefing}
                            className="px-4 sm:px-6 py-2 bg-[var(--bg-secondary)] border-2 border-[var(--accent-color)] text-[var(--accent-color)] font-black text-[11px] sm:text-xs uppercase tracking-widest rounded-xl hover:bg-[var(--accent-color)] hover:text-white transition-all ml-auto sm:ml-0"
                          >
                            Close
                          </button>
                        </div>

                        {/* Filler to ensure content isn't cut off */}
                        <div className="h-10" />
                      </motion.div>
                    )}
                  </div>
                </div>
                <div className="absolute top-0 right-0 w-64 h-64 bg-[var(--accent-color)]/10 blur-[80px] rounded-full -mr-20 -mt-20 pointer-events-none" />
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
<AnimatePresence>
        {showPinSetupModal && (
          <Suspense fallback={<div className="flex justify-center p-12"><Loader2 className="w-8 h-8 animate-spin text-emerald-500" /></div>}>
            <PinSetupModal
              isOpen={showPinSetupModal}
              onClose={handleClosePinSetupModal}
            />
          </Suspense>
        )}
      </AnimatePresence>

      {/* Interactive Dashboard Tour */}
      <DashboardTour
        isOpen={showDashboardTour}
        onClose={handleFinishDashboardTour}
        onSelectAction={handleTourSelectAction}
        initialStep={tourReturnStep}
      />

      <AnimatePresence>
        {smartCaptureSampleText && (
          <SmartCaptureModal
            key="sample-smart-capture-modal"
            onClose={() => setSmartCaptureSampleText(null)}
            initialEmailText={smartCaptureSampleText}
            initialMode="email"
          />
        )}
        {showSmartConvertModal && briefingData && (
          <SmartCaptureModal
            key="smart-convert-modal"
            onClose={() => setShowSmartConvertModal(false)}
            initialEmailText={briefingData.content}
            initialMode="email"
            isBriefingContext={true}
          />
        )}
      </AnimatePresence>

      <PWAInstallBanner />
      <OfflineBanner />
    </div>
  );
}
