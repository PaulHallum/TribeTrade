import { useState, useEffect } from 'react';
import { 
  User, 
  Bell, 
  Moon, 
  Palette, 
  Volume2, 
  Shield, 
  ShieldAlert, 
  LogOut,
  MapPin,
  Heart,
  Check,
  Calendar as CalendarIcon,
  Download,
  Loader2,
  CheckSquare,
  RefreshCw,
  Sun,
  Users,
  Mail,
  Trash2,
  MessageSquare,
  BookOpen,
  KeyRound,
  ShieldCheck,
  Lock,
  Unlock,
  ArrowDown,
  ArrowRight,
  Building,
  CreditCard,
  Clock,
  ReceiptPoundSterling,
  FileText,
  Sparkles,
  ExternalLink,
  Smartphone,
  Tablet,
  Laptop,
  ChevronDown
} from 'lucide-react';
import { 
  RegisteredDevice, 
  DeviceSwapRecord, 
  subscribeRegisteredDevices, 
  deregisterDevice, 
  getOrCreateDeviceId, 
  calculateSwapsRemaining, 
  MAX_DEVICES, 
  MAX_MONTHLY_SWAPS 
} from '../../services/deviceService';
import { BusinessDetails, DEFAULT_BUSINESS_DETAILS } from '../../types/quote';
import { Vehicle } from '../../types/vehicle';
import VehicleComplianceSettings from './VehicleComplianceSettings';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { useAuth } from '../../App';
import { useSubscriptionTier } from '../../hooks/useSubscriptionTier';
import GoogleIcon from '../layout/GoogleIcon';
import MicrosoftIcon from '../layout/MicrosoftIcon';
import YahooIcon from '../layout/YahooIcon';
import AppleIcon from '../layout/AppleIcon';

import { auth, db } from '../../lib/firebase';
import { signOut } from 'firebase/auth';
import { doc, onSnapshot, setDoc, updateDoc, collection, query, orderBy, limit, getDocs, deleteDoc, addDoc, serverTimestamp, where } from 'firebase/firestore';
import ConfirmModal from '../common/ConfirmModal';

import AppSpecificPasswordModal from './AppSpecificPasswordModal';
import PinSetupModal from './PinSetupModal';
import { AnimatePresence, motion } from 'motion/react';
import { useSettings } from '../../contexts/SettingsContext';
import { logger } from '../../services/logger';
import { useToast } from '../../contexts/ToastContext';
import { combineDateTimeToISO } from '../../lib/dateUtils';
import { getNotificationStatus, isIOSStandaloneRequired, requestNotificationPermission, unregisterNotifications } from '../../services/notificationService';
import { ReminderOffset, REMINDER_OPTIONS } from '../../lib/reminderUtils';
import PageHeader from '../common/PageHeader';

function NotificationStatus() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const { settings, updateSettings } = useSettings();
  const [testing, setTesting] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [confirmConfig, setConfirmConfig] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    confirmLabel?: string;
    variant?: 'danger' | 'warning' | 'info';
    onConfirm: () => void;
  }>({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => {}
  });

  const handleReset = async () => {
    if (!user) return;
    setResetting(true);
    try {
      await updateSettings({ notifications: false });
      showToast('Notifications turned off', 'info');
    } catch (err: any) {
      showToast('Reset failed: ' + err.message, 'error');
    } finally {
      setResetting(false);
    }
  };

  const enableNotifications = async () => {
    if (!user) return;
    setTesting(true);
    try {
      await updateSettings({ notifications: true });
      showToast('Notifications enabled', 'success');
    } catch (err: any) {
      showToast('Failed to enable: ' + err.message, 'error');
    } finally {
      setTesting(false);
    }
  };

  const status = getNotificationStatus();
  const iosIssue = isIOSStandaloneRequired();
  const isEnabled = status === 'granted' && settings.notifications !== false;

  return (
    <div className="bg-white dark:bg-zinc-900 p-5 rounded-3xl border border-zinc-200 dark:border-zinc-800">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Bell className="w-5 h-5 text-zinc-400" />
          <div className="space-y-0.5">
            <span className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">Notifications</span>
            <p className="text-[10px] text-zinc-500">
              {status === 'denied'
                ? 'Blocked by browser settings'
                : isEnabled
                ? 'Linked & permissions active'
                : status === 'granted' && settings.notifications === false
                ? 'Turned off in settings'
                : 'Receive alerts & reminders on this device'}
            </p>
          </div>
        </div>
        <button 
          onClick={() => {
            if (isEnabled) {
              setConfirmConfig({
                isOpen: true,
                title: 'Turn Off Notifications',
                message: 'This will clear notification links for this device. Turn off?',
                confirmLabel: 'Turn Off',
                variant: 'warning',
                onConfirm: handleReset
              });
            } else {
              enableNotifications();
            }
          }}
          disabled={testing || resetting}
          className={`w-12 h-6 rounded-full transition-all relative ${isEnabled ? 'bg-emerald-500' : 'bg-zinc-200 dark:bg-zinc-700'} ${(testing || resetting) ? 'opacity-50' : ''}`}
        >
          <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all ${isEnabled ? 'left-7' : 'left-1'}`} />
        </button>
      </div>

      {iosIssue && (
        <div className="mt-4 p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-2xl flex items-start gap-2">
          <p className="text-[10px] text-amber-600 dark:text-amber-500 leading-normal">
            <span className="font-bold text-amber-800 dark:text-amber-400">iOS standalone app required:</span> Tap share and select <span className="font-bold">"Add to Home Screen"</span> to enable push notifications on iPhone.
          </p>
        </div>
      )}

      <ConfirmModal
        isOpen={confirmConfig.isOpen}
        title={confirmConfig.title}
        message={confirmConfig.message}
        confirmLabel={confirmConfig.confirmLabel}
        variant={confirmConfig.variant}
        onConfirm={confirmConfig.onConfirm}
        onClose={() => setConfirmConfig(prev => ({ ...prev, isOpen: false }))}
      />
    </div>
  );
}

const feedbackSchema = z.object({
  category: z.enum(['Bug', 'Feature Request', 'Question']),
  message: z.string().min(1, 'Message is required').max(2000, 'Message cannot exceed 2000 characters'),
});

type FeedbackFormValues = z.infer<typeof feedbackSchema>;

const zodResolver = (schema: any) => async (data: any) => {
  const result = schema.safeParse(data);
  if (result.success) {
    return { values: result.data, errors: {} };
  }
  return {
    values: {},
    errors: result.error.errors.reduce((acc: any, current: any) => {
      acc[current.path[0]] = {
        message: current.message,
        type: current.code
      };
      return acc;
    }, {})
  };
};

export type SettingsCategoryTab = 'billing' | 'business' | 'fleet' | 'accounts' | 'app' | 'support';

export default function SettingsView({ 
  onNavigate,
  initialTab
}: { 
  onNavigate?: (view: string, tab?: string) => void;
  initialTab?: string;
}) {
  const { user, tradeUserId, googleAccessToken, signIn: reconnectGoogle, disconnectGoogle } = useAuth();
  const { showToast } = useToast();
  const { settings, updateSettings } = useSettings();
  const { subscriptionTier, isTrial, trialDaysRemaining, cancelAtPeriodEnd, currentPeriodEnd } = useSubscriptionTier();

  const handleCancelSubscription = async () => {
    if (!user) return;
    setConfirmConfig({
      isOpen: true,
      title: "Cancel Subscription?",
      message: "Are you sure you want to cancel your Premium subscription? You will retain full access to all Premium features until the end of your current billing period.",
      confirmLabel: "Cancel Subscription",
      variant: "danger",
      onConfirm: async () => {
        setLoadingCheckout(true);
        try {
          const token = await user.getIdToken();
          const res = await fetch('/api/billing/cancel-subscription', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`
            }
          });
          const data = await res.json();
          if (data.success) {
            showToast('Subscription cancelled. You will keep Premium access until the end of your billing cycle.', 'info');
          } else {
            showToast(data.error || 'Failed to cancel subscription', 'error');
          }
        } catch (err: any) {
          showToast(err.message || 'Failed to cancel subscription', 'error');
        } finally {
          setLoadingCheckout(false);
          setConfirmConfig(prev => ({ ...prev, isOpen: false }));
        }
      }
    });
  };

  const handleResumeSubscription = async () => {
    if (!user) return;
    setLoadingCheckout(true);
    try {
      const token = await user.getIdToken();
      const res = await fetch('/api/billing/resume-subscription', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      });
      const data = await res.json();
      if (data.success) {
        showToast('Welcome back! Your Premium subscription will automatically renew.', 'success');
      } else {
        showToast(data.error || 'Failed to resume subscription', 'error');
      }
    } catch (err: any) {
      showToast(err.message || 'Failed to resume subscription', 'error');
    } finally {
      setLoadingCheckout(false);
    }
  };

  const [members, setMembers] = useState<any[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false);
  const [passwordModalProvider, setPasswordModalProvider] = useState<'apple' | 'google'>('apple');
  const [dailyUses, setDailyUses] = useState(0);
  const [resetTime, setResetTime] = useState('');
  const [loadingCheckout, setLoadingCheckout] = useState(false);
  const [showPinSetup, setShowPinSetup] = useState(false);
  const [connectedAccounts, setConnectedAccounts] = useState<any[]>([]);
  const [connectingProvider, setConnectingProvider] = useState<string | null>(null);
  const [userTickets, setUserTickets] = useState<any[]>([]);
  const [activeCategoryTab, setActiveCategoryTab] = useState<SettingsCategoryTab>(
    (initialTab as SettingsCategoryTab) || 'billing'
  );
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    billing: true,
    tribeFamily: false,
    business: true,
    fleet: false,
    accounts: false,
    audio: false,
    appearance: false,
    support: false
  });

  useEffect(() => {
    if (initialTab && ['billing', 'business', 'fleet', 'accounts', 'app', 'support'].includes(initialTab)) {
      setActiveCategoryTab(initialTab as SettingsCategoryTab);
      setOpenSections(prev => ({
        ...prev,
        [initialTab]: true,
        ...(initialTab === 'business' ? { business: true } : {}),
        ...(initialTab === 'billing' ? { billing: true } : {}),
        ...(initialTab === 'app' ? { audio: true, appearance: true } : {})
      }));
    }
  }, [initialTab]);

  const toggleSection = (key: string) => {
    setOpenSections(prev => ({ ...prev, [key]: !prev[key] }));
  };

  // Registered Devices (Max 4 devices, 2 swaps per month)
  const [registeredDevices, setRegisteredDevices] = useState<RegisteredDevice[]>([]);
  const [deviceSwapHistory, setDeviceSwapHistory] = useState<DeviceSwapRecord[]>([]);
  const currentDeviceId = getOrCreateDeviceId();

  useEffect(() => {
    if (!tradeUserId) return;
    const unsub = subscribeRegisteredDevices(tradeUserId, (data) => {
      setRegisteredDevices(data.registeredDevices);
      setDeviceSwapHistory(data.swapHistory);
    });
    return () => unsub();
  }, [tradeUserId]);

  const { swapsRemaining, nextAvailableSwapDate } = calculateSwapsRemaining(deviceSwapHistory);

  const handleRemoveDevice = (dev: RegisteredDevice) => {
    if (!tradeUserId) return;
    const isAtLimit = registeredDevices.length >= MAX_DEVICES;
    setConfirmConfig({
      isOpen: true,
      title: 'Remove Device',
      message: `Are you sure you want to remove ${dev.name}? ${isAtLimit ? 'Because you are at the 4-device limit, removing this will count as 1 of your 2 monthly device changes.' : 'This will deregister the device from your account.'}`,
      confirmLabel: 'Remove Device',
      variant: 'warning',
      onConfirm: async () => {
        try {
          const res = await deregisterDevice(tradeUserId, dev.id);
          if (res.success) {
            showToast(`Removed ${dev.name}`, 'info');
          } else {
            showToast(res.error || 'Failed to remove device', 'error');
          }
        } catch (err: any) {
          showToast('Error removing device: ' + err.message, 'error');
        }
      }
    });
  };

  const [confirmConfig, setConfirmConfig] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    confirmLabel?: string;
    variant?: 'danger' | 'warning' | 'info';
    onConfirm: () => void;
  }>({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => {}
  });

  // Fetch submitted tickets for the current user in real-time
  useEffect(() => {
    if (!user) return;
    const ticketsRef = collection(db, 'support_tickets');
    const q = query(
      ticketsRef,
      where('userId', '==', user.uid)
    );
    const unsub = onSnapshot(q, (snap) => {
      const sorted = snap.docs
        .map(doc => ({ id: doc.id, ...doc.data() }))
        .sort((a: any, b: any) => {
          const aTime = a.timestamp?.seconds || 0;
          const bTime = b.timestamp?.seconds || 0;
          return bTime - aTime;
        });
      setUserTickets(sorted);
    }, (err) => {
      logger.error('Error fetching user feedback tickets:', err);
    });
    return () => unsub();
  }, [user]);

  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<FeedbackFormValues>({
    resolver: zodResolver(feedbackSchema),
    defaultValues: {
      category: 'Bug',
      message: ''
    }
  });

  const onSubmitFeedback = async (data: FeedbackFormValues) => {
    if (!user) return;
    
    // Ensure description/message is not blank
    const trimmedMessage = data.message.trim();
    if (!trimmedMessage) {
      showToast('Message is a mandatory field and cannot be empty.', 'error');
      return;
    }

    // Rate limiting / Spam protection (2 minute cooldown)
    const now = Date.now();
    const lastFeedback = localStorage.getItem('last_feedback_timestamp');
    if (lastFeedback) {
      const elapsed = now - parseInt(lastFeedback, 10);
      if (elapsed < 120000) { // 120,000ms = 2 minutes
        const waitSecs = Math.ceil((120000 - elapsed) / 1000);
        showToast(`Please wait ${waitSecs} seconds before submitting feedback again to prevent spam.`, 'error');
        return;
      }
    }

    // Set the cooldown synchronously before starting the network request to block double-clicks
    localStorage.setItem('last_feedback_timestamp', now.toString());

    try {
      const ticketData = {
        userId: user.uid,
        tradeUserId: tradeUserId || '',
        email: user.email || '',
        category: data.category,
        message: trimmedMessage,
        timestamp: serverTimestamp(),
        status: 'open',
        deviceMetadata: window.navigator.userAgent
      };

      await addDoc(collection(db, 'support_tickets'), ticketData);
      showToast('Support ticket submitted successfully!', 'success');
      reset();
    } catch (err: any) {
      // Revert the cooldown if the write fails so the user can retry
      localStorage.removeItem('last_feedback_timestamp');
      showToast('Failed to submit support ticket: ' + err.message, 'error');
    }
  };

  const [businessForm, setBusinessForm] = useState<BusinessDetails>(DEFAULT_BUSINESS_DETAILS);
  const [savingBusinessDetails, setSavingBusinessDetails] = useState(false);

  const handleSaveBusinessDetails = async () => {
    const tid = tradeUserId || `family_${user?.uid}`;
    if (!tid) return;
    setSavingBusinessDetails(true);
    try {
      await setDoc(doc(db, 'trade_users', tid), {
        businessName: businessForm.businessName.trim(),
        tradingName: businessForm.tradingName?.trim() || '',
        addressLine1: businessForm.addressLine1?.trim() || '',
        addressLine2: businessForm.addressLine2?.trim() || '',
        townCity: businessForm.townCity?.trim() || '',
        postcode: businessForm.postcode?.trim() || '',
        phone: businessForm.phone?.trim() || '',
        email: businessForm.email?.trim() || '',
        website: businessForm.website?.trim() || '',
        companyNumber: businessForm.companyNumber?.trim() || '',
        isVatRegistered: businessForm.isVatRegistered || false,
        vatNumber: businessForm.vatNumber?.trim() || '',
        defaultVatRate: Number(businessForm.defaultVatRate) || 20,
        defaultHourlyRate: Number(businessForm.defaultHourlyRate) || 45,
        defaultDayRate: Number(businessForm.defaultDayRate) || 320,
        bankName: businessForm.bankName?.trim() || '',
        accountName: businessForm.accountName?.trim() || '',
        sortCode: businessForm.sortCode?.trim() || '',
        accountNumber: businessForm.accountNumber?.trim() || '',
        defaultPaymentTerms: businessForm.defaultPaymentTerms?.trim() || '',
        defaultQuoteTerms: businessForm.defaultQuoteTerms?.trim() || ''
      }, { merge: true });
      showToast('Business details updated successfully', 'success');
      setOpenSections(prev => ({ ...prev, business: false }));
    } catch (err: any) {
      showToast('Failed to save business details: ' + err.message, 'error');
    } finally {
      setSavingBusinessDetails(false);
    }
  };

  const [activationState, setActivationState] = useState<'idle' | 'activating' | 'success'>('idle');

  const autoActivateSubscription = async () => {
    if (!user) return;
    setActivationState('activating');
    
    const params = new URLSearchParams(window.location.search);
    const sessionId = params.get('session_id');

    let isPremium = false;
    try {
      // First attempt
      const token = await user.getIdToken();
      const res = await fetch('/api/billing/sync-subscription', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ session_id: sessionId })
      });
      const data = await res.json();
      if (data.subscriptionTier === 'premium') {
        isPremium = true;
      } else {
        // Pause 2.5 seconds for Stripe background processing and retry
        await new Promise((r) => setTimeout(r, 2500));
        const tokenRetry = await user.getIdToken();
        const resRetry = await fetch('/api/billing/sync-subscription', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${tokenRetry}`
          },
          body: JSON.stringify({ session_id: sessionId })
        });
        const dataRetry = await resRetry.json();
        if (dataRetry.subscriptionTier === 'premium') {
          isPremium = true;
        }
      }
    } catch (err: any) {
      console.error('Error during auto-activating subscription:', err);
    } finally {
      setActivationState('success');
      setTimeout(() => {
        setActivationState('idle');
        const newUrl = window.location.pathname;
        window.history.replaceState({}, document.title, newUrl);
      }, 2500);
    }
  };

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('payment') === 'success') {
      autoActivateSubscription();
    }
  }, [user]);

  const handleUpgrade = async (plan: 'monthly' | 'yearly' = 'monthly') => {
    if (!user) return;
    setLoadingCheckout(true);
    try {
      const token = await user.getIdToken();
      const res = await fetch('/api/billing/checkout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ plan })
      });
      if (res.ok) {
        const data = await res.json();
        if (data.url) {
          sessionStorage.setItem('stripe_redirect', 'true');
          window.location.href = data.url;
        } else {
          showToast('Failed to start checkout. Please try again.', 'error');
        }
      } else {
        const errData = await res.json();
        showToast(`Checkout failed: ${errData.error || 'Server error'}`, 'error');
      }
    } catch (err: any) {
      showToast(`Error: ${err.message}`, 'error');
    } finally {
      setLoadingCheckout(false);
    }
  };

  const handleManageSubscription = async () => {
    if (!user) return;
    setLoadingCheckout(true);
    try {
      const token = await user.getIdToken();
      const res = await fetch('/api/billing/portal', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      });
      if (res.ok) {
        const data = await res.json();
        if (data.url) {
          sessionStorage.setItem('stripe_redirect', 'true');
          window.location.href = data.url;
        } else {
          showToast('Failed to open billing portal. Please try again.', 'error');
        }
      } else {
        const errData = await res.json();
        showToast(`Portal error: ${errData.error || 'Server error'}`, 'error');
      }
    } catch (err: any) {
      showToast(`Error: ${err.message}`, 'error');
    } finally {
      setLoadingCheckout(false);
    }
  };

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
        });
      }
    });

    const tid = tradeUserId || `family_${user.uid}`;
    const unsubBusiness = onSnapshot(doc(db, 'trade_users', tid), (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        setBusinessForm({
          ...DEFAULT_BUSINESS_DETAILS,
          businessName: data.businessName || data.familyName || '',
          tradingName: data.tradingName || '',
          addressLine1: data.addressLine1 || '',
          addressLine2: data.addressLine2 || '',
          townCity: data.townCity || '',
          postcode: data.postcode || '',
          phone: data.phone || '',
          email: data.email || '',
          website: data.website || '',
          companyNumber: data.companyNumber || '',
          isVatRegistered: data.isVatRegistered || false,
          vatNumber: data.vatNumber || '',
          defaultVatRate: data.defaultVatRate ?? 20,
          defaultHourlyRate: data.defaultHourlyRate ?? 45,
          defaultDayRate: data.defaultDayRate ?? 320,
          bankName: data.bankName || '',
          accountName: data.accountName || '',
          sortCode: data.sortCode || '',
          accountNumber: data.accountNumber || '',
          defaultPaymentTerms: data.defaultPaymentTerms || DEFAULT_BUSINESS_DETAILS.defaultPaymentTerms,
          defaultQuoteTerms: data.defaultQuoteTerms || DEFAULT_BUSINESS_DETAILS.defaultQuoteTerms
        });
        if (data.vehicles && Array.isArray(data.vehicles)) {
          setVehicles(data.vehicles);
        }
      }
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
      if (unsubBusiness) unsubBusiness();
      clearInterval(interval);
    };
  }, [user]);

  const maxUses = subscriptionTier === 'premium' ? 100 : 5;
  const leftUses = Math.max(0, maxUses - dailyUses);

  const handleDeleteAccount = () => {
    setConfirmConfig({
      isOpen: true,
      title: 'Delete Account & Data',
      message: 'WARNING: Are you sure you want to permanently delete your account? This will wipe your profile data and remove you from family groups. This action CANNOT be undone.',
      confirmLabel: 'Delete Account',
      variant: 'danger',
      onConfirm: async () => {
        try {
          const currentUser = auth.currentUser;
          if (!currentUser) return;

          let serverSuccess = false;
          try {
            const idToken = await currentUser.getIdToken();
            const res = await fetch('/api/user/delete', {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${idToken}`,
                'Content-Type': 'application/json'
              }
            });
            if (res.ok) {
              serverSuccess = true;
            }
          } catch (e) {
            console.warn('[Delete Account] Backend deletion fallback to client:', e);
          }

          if (!serverSuccess) {
            await currentUser.delete();
          }

          await signOut(auth);
          showToast('Your account and profile data have been permanently deleted.', 'success');
        } catch (err: any) {
          if (err.code === 'auth/requires-recent-login') {
            showToast('For security reasons, please sign out and sign back in to re-authenticate before deleting your account.', 'info');
          } else {
            showToast('Failed to delete account: ' + (err.message || 'Unknown error'), 'error');
          }
        }
      }
    });
  };

  const colors = [
    { name: 'Emerald', value: '#10b981' },
    { name: 'Indigo', value: '#6366f1' },
    { name: 'Rose', value: '#f43f5e' },
    { name: 'Amber', value: '#f59e0b' },
    { name: 'Violet', value: '#8b5cf6' }
  ];

  const accentColorOptions = [
    { id: 'rose', name: 'Rose Red', color: '#f43f5e' },
    { id: 'blue', name: 'Ocean Blue', color: '#3b82f6' },
    { id: 'emerald', name: 'Emerald Green', color: '#10b981' },
    { id: 'amber', name: 'Amber Gold', color: '#f59e0b' },
    { id: 'indigo', name: 'Deep Indigo', color: '#6366f1' },
    { id: 'violet', name: 'Vivid Violet', color: '#8b5cf6' },
    { id: 'cyan', name: 'Electric Cyan', color: '#06b6d4' },
    { id: 'pink', name: 'Hot Pink', color: '#ec4899' },
    { id: 'orange', name: 'Sunset Orange', color: '#f97316' },
    { id: 'lime', name: 'Fresh Lime', color: '#84cc16' }
  ];

  const presetColors = [
    '#f43f5e', '#3b82f6', '#10b981', '#f59e0b', '#6366f1', '#8b5cf6', '#06b6d4', '#ec4899', '#f97316', '#84cc16'
  ];

  useEffect(() => {
    if (!tradeUserId) return;

    const membersRef = collection(db, 'trade_users', tradeUserId, 'members');
    const unsub = onSnapshot(membersRef, (snapshot) => {
      const memberList = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setMembers(memberList);
    });

    const categoriesRef = collection(db, 'trade_users', tradeUserId, 'taskCategories');
    const unsubCats = onSnapshot(categoriesRef, (snapshot) => {
      setCategories(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });

    const accountsRef = collection(db, 'trade_users', tradeUserId, 'connectedAccounts');
    const unsubAccounts = onSnapshot(accountsRef, (snapshot) => {
      setConnectedAccounts(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (err) => {
      logger.warn('[Settings] Failed to fetch connected accounts snapshot', err);
    });

    return () => {
      unsub();
      unsubCats();
      unsubAccounts();
    };
  }, [tradeUserId]);

  const handleOAuthConnect = async (provider: string) => {
    setConnectingProvider(provider);
    try {
      const idToken = await auth.currentUser?.getIdToken();
      if (!idToken) {
        showToast('Please log in again to connect your email account.', 'error');
        setConnectingProvider(null);
        return;
      }

      const res = await fetch(`/api/oauth/connect?provider=${encodeURIComponent(provider)}`, {
        headers: { Authorization: `Bearer ${idToken}` }
      });
      const responseText = await res.text();
      let data: any = {};
      try {
        data = JSON.parse(responseText);
      } catch (err) {
        console.error('[OAuth] Non-JSON response received from server:', responseText);
        showToast('Backend server connection error. Please try again shortly.', 'error');
        setConnectingProvider(null);
        return;
      }

      if (!res.ok || !data.authUrl) {
        showToast(data.error || 'Failed to start connection', 'error');
        setConnectingProvider(null);
        return;
      }

      const width = 550, height = 650;
      const left = window.screenX + (window.outerWidth - width) / 2;
      const top = window.screenY + (window.outerHeight - height) / 2;
      const popup = window.open(data.authUrl, `${provider}-auth`, `width=${width},height=${height},left=${left},top=${top}`);

      const messageHandler = (event: MessageEvent) => {
        if (event.data?.type === 'OAUTH_SUCCESS') {
          window.removeEventListener('message', messageHandler);
          showToast(`Connected ${provider} email account!`, 'success');
          setConnectingProvider(null);
        } else if (event.data?.type === 'OAUTH_ERROR') {
          window.removeEventListener('message', messageHandler);
          showToast(`OAuth Error: ${event.data.error || 'Failed to connect account'}`, 'error');
          setConnectingProvider(null);
        }
      };

      window.addEventListener('message', messageHandler);

      const checkClosed = setInterval(() => {
        if (popup?.closed) {
          clearInterval(checkClosed);
          window.removeEventListener('message', messageHandler);
          setConnectingProvider(null);
        }
      }, 1000);

    } catch (err: any) {
      showToast('Connection error: ' + err.message, 'error');
      setConnectingProvider(null);
    }
  };

  const handleDisconnectAccount = async (accountId: string, providerName: string) => {
    if (!tradeUserId) return;
    try {
      await deleteDoc(doc(db, 'trade_users', tradeUserId, 'connectedAccounts', accountId));
      showToast(`Disconnected ${providerName} account`, 'info');
    } catch (err: any) {
      showToast('Failed to disconnect: ' + err.message, 'error');
    }
  };

  const handleUpdateMemberColor = async (id: string, color: string) => {
    if (!tradeUserId) return;
    await updateDoc(doc(db, 'trade_users', tradeUserId, 'members', id), { color });
  };

  const handleUpdateCategoryColor = async (id: string, color: string) => {
    if (!tradeUserId) return;
    await updateDoc(doc(db, 'trade_users', tradeUserId, 'taskCategories', id), { color });
  };

  const isGoogleConnected = !!googleAccessToken;


  return (
    <div className="max-w-3xl mx-auto pb-32 px-4">
      <PageHeader
        icon={User}
        title="Settings"
        subtitle="Account & Business Configuration"
      />

      {/* Category Sub-Menu Filter Pills for Mobile & Desktop */}
      <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-2 mt-4 -mx-1 px-1">
        {[
          { id: 'billing', label: 'Account & Subscription', icon: '💳' },
          { id: 'business', label: 'Business & Rates', icon: '🏢' },
          { id: 'fleet', label: 'Fleet & MOT', icon: '🚐' },
          { id: 'accounts', label: 'Connected Accounts', icon: '📧' },
          { id: 'app', label: 'App & Theme', icon: '🎨' },
          { id: 'support', label: 'Help & Security', icon: '🛡️' }
        ].map(cat => {
          const isActive = activeCategoryTab === cat.id;
          return (
            <button
              key={cat.id}
              onClick={() => {
                setActiveCategoryTab(cat.id as SettingsCategoryTab);
                setOpenSections(prev => ({
                  ...prev,
                  [cat.id]: true,
                  ...(cat.id === 'business' ? { business: true } : {}),
                  ...(cat.id === 'billing' ? { billing: true } : {}),
                  ...(cat.id === 'app' ? { audio: true, appearance: true } : {})
                }));
              }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all ${
                isActive
                  ? 'bg-emerald-600 text-white shadow-sm shadow-emerald-500/20'
                  : 'bg-zinc-100 dark:bg-zinc-800/80 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700'
              }`}
            >
              <span>{cat.icon}</span>
              <span>{cat.label}</span>
            </button>
          );
        })}
      </div>

      <div className="space-y-4 mt-4">
        {/* Account Status Card (Login/Logout) */}
        {activeCategoryTab === 'billing' && (
          <div className="bg-white dark:bg-zinc-900 p-5 rounded-3xl border border-zinc-200 dark:border-zinc-800">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-4 min-w-0">
                <div className="w-9 h-9 bg-emerald-500 rounded-xl flex items-center justify-center text-white shrink-0">
                  <User className="w-5 h-5" />
                </div>
                <div className="space-y-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="text-sm font-bold text-zinc-900 dark:text-white truncate">
                      {user?.displayName || 'Trade User'}
                    </h3>
                    <div className="flex items-center gap-1.5 px-2 py-0.5 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 text-[10px] font-black uppercase tracking-widest rounded-full border border-emerald-100 dark:border-emerald-800/20">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                      Online
                    </div>
                  </div>
                  <p className="text-[10px] font-medium text-zinc-500 dark:text-zinc-400 truncate">
                    Logged in as <span className="font-bold text-zinc-700 dark:text-zinc-200">{user?.email}</span>
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button 
                  onClick={() => {
                    setConfirmConfig({
                      isOpen: true,
                      title: 'Sign Out',
                      message: 'Are you sure you want to sign out of TribeTrade?',
                      confirmLabel: 'Sign Out',
                      variant: 'warning',
                      onConfirm: async () => {
                        try {
                          await signOut(auth);
                          showToast('Signed out successfully', 'info');
                        } catch (err: any) {
                          showToast('Error signing out: ' + err.message, 'error');
                        }
                      }
                    });
                  }}
                  className="p-2 bg-zinc-100 dark:bg-zinc-800 text-zinc-500 hover:text-red-500 dark:hover:bg-zinc-700 rounded-xl transition-all"
                  title="Sign Out"
                >
                  <LogOut className="w-5 h-5" />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Subscription & Billing Section */}
        {activeCategoryTab === 'billing' && (
          <div className="bg-white dark:bg-zinc-900 rounded-3xl border border-zinc-200 dark:border-zinc-800 overflow-hidden shadow-sm transition-all">
            <button
              onClick={() => toggleSection('billing')}
              className="w-full p-4 sm:p-5 flex items-center justify-between text-left hover:bg-zinc-50 dark:hover:bg-zinc-800/40 transition-colors"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-9 h-9 rounded-xl bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
                  <CreditCard className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <h4 className="text-sm font-bold text-zinc-900 dark:text-white truncate">
                    Subscription & Billing
                  </h4>
                  <p className="text-[10px] text-zinc-500 dark:text-zinc-400 truncate mt-0.5">
                    {isTrial ? `21-Day Trial (${trialDaysRemaining} days left)` : subscriptionTier === 'premium' ? 'Premium Active (£7.95/mo)' : 'Free Tier'}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 border border-emerald-100 dark:border-emerald-800/30">
                  {isTrial ? 'Trial' : subscriptionTier === 'premium' ? 'Premium' : 'Free'}
                </span>
                <ChevronDown className={`w-4 h-4 text-zinc-400 transition-transform duration-200 ${openSections.billing ? 'rotate-180' : ''}`} />
              </div>
            </button>

            {openSections.billing && (
              <div className="p-4 sm:p-5 pt-0 space-y-4 border-t border-zinc-100 dark:border-zinc-800/60 mt-2">
          <div className="flex items-center justify-between gap-4 flex-wrap sm:flex-nowrap">
            <div>
              <h4 className="text-sm font-bold text-zinc-900 dark:text-white flex items-center gap-2">
                💳 Subscription & Plan
              </h4>
              <p className="text-[10px] text-zinc-500 dark:text-zinc-400 mt-0.5">
                {isTrial 
                  ? `You are on your 21-Day Reverse Premium Trial (${trialDaysRemaining} ${trialDaysRemaining === 1 ? 'day' : 'days'} remaining). Subscribe to continue full use.`
                  : (subscriptionTier === 'premium' 
                    ? 'You are on Premium (£7.95/mo). Enjoy full AI features (Fair Use Policy applies), Voice Readout, custom themes, and unlimited Trade Users!' 
                    : 'AI features are not available without a subscription. Subscribe to Premium (£7.95/mo or £79/yr) to unlock AI Daily Briefings, Voice Readout, and Magic Mic AI.')}
              </p>
            </div>
            <div className="shrink-0 w-full sm:w-auto">
              {subscriptionTier === 'premium' && !isTrial ? (
                <button
                  onClick={handleManageSubscription}
                  disabled={loadingCheckout}
                  className="w-full sm:w-auto px-4 py-2 bg-zinc-800 hover:bg-zinc-700 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-white text-[11px] font-black uppercase tracking-widest rounded-xl transition-all active:scale-95 flex items-center justify-center gap-2 border border-zinc-700"
                >
                  {loadingCheckout ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      Loading...
                    </>
                  ) : (
                    'Manage in Stripe'
                  )}
                </button>
              ) : (
                <div className="flex flex-col sm:flex-row items-center gap-2">
                  <button
                    onClick={() => handleUpgrade('monthly')}
                    disabled={loadingCheckout}
                    className="w-full sm:w-auto px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white text-[11px] font-black uppercase tracking-widest rounded-xl transition-all active:scale-95 flex items-center justify-center gap-2"
                  >
                    {loadingCheckout ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Monthly (£7.95)'}
                  </button>
                  <button
                    onClick={() => handleUpgrade('yearly')}
                    disabled={loadingCheckout}
                    className="w-full sm:w-auto px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-black uppercase tracking-widest rounded-xl transition-all active:scale-95 flex items-center justify-center gap-2 border border-emerald-400/40 shadow-sm"
                  >
                    {loadingCheckout ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Yearly (£79.00)'}
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Cancellation Reference to Guide Page */}
          <div className="pt-3 border-t border-zinc-100 dark:border-zinc-800/80 flex flex-wrap items-center justify-between gap-2 text-[11px]">
            <span className="text-zinc-500 dark:text-zinc-400 font-medium">
              Need help managing or cancelling your subscription?
            </span>
            <button
              onClick={() => {
                onNavigate?.('guide');
                setTimeout(() => {
                  const cancelEl = document.getElementById('how-to-cancel');
                  if (cancelEl) cancelEl.scrollIntoView({ behavior: 'smooth' });
                }, 150);
              }}
              className="font-bold text-emerald-600 hover:text-emerald-700 dark:text-emerald-400 dark:hover:text-emerald-300 transition-colors flex items-center gap-1 cursor-pointer"
            >
              <span>How to cancel in guide</span>
              <ArrowRight className="w-3 h-3 text-emerald-500" />
            </button>
          </div>
        </div>
      )}
    </div>
  )}

        {/* Tribe Family Assistant Spotlight */}
        {activeCategoryTab === 'billing' && (
          <div className="bg-gradient-to-br from-indigo-500/10 via-purple-500/5 to-emerald-500/10 dark:from-indigo-950/40 dark:via-purple-950/20 dark:to-emerald-950/30 p-5 rounded-3xl border border-indigo-200/60 dark:border-indigo-800/40 relative overflow-hidden shadow-sm mt-4">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div className="flex items-center gap-3.5">
                <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 text-white flex items-center justify-center shadow-md shadow-indigo-500/20 shrink-0">
                  <Users className="w-5 h-5" />
                </div>
                <div className="space-y-0.5">
                  <h4 className="text-sm font-bold text-zinc-900 dark:text-white">
                    Tribe Family Hub
                  </h4>
                  <p className="text-xs text-zinc-600 dark:text-zinc-400">
                    Our sister assistant for shared family calendars, school inset days, and home schedules.
                  </p>
                </div>
              </div>
              <a
                href="https://tribefamilyhub.uk/try"
                target="_blank"
                rel="noopener noreferrer"
                className="w-full sm:w-auto px-4 py-2 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white text-xs font-bold rounded-xl shadow-md shadow-indigo-600/20 flex items-center justify-center gap-2 transition-all active:scale-95 shrink-0 group"
              >
                <span>Visit Tribe Family</span>
                <ExternalLink className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
              </a>
            </div>
          </div>
        )}

        {/* Business Details Section */}
        {activeCategoryTab === 'business' && (
          <div className="bg-white dark:bg-zinc-900 rounded-3xl border border-zinc-200 dark:border-zinc-800 overflow-hidden shadow-sm transition-all mt-4">
            <button
              onClick={() => toggleSection('business')}
              className="w-full p-4 sm:p-5 flex items-center justify-between text-left hover:bg-zinc-50 dark:hover:bg-zinc-800/40 transition-colors"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-9 h-9 rounded-xl bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
                  <Building className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <h4 className="text-sm font-bold text-zinc-900 dark:text-white truncate">
                    Business Details & Quotation Defaults
                  </h4>
                  <p className="text-[10px] text-zinc-500 dark:text-zinc-400 truncate mt-0.5">
                    {businessForm.tradingName || businessForm.businessName || 'Configure trading name, address & bank details'}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 border border-emerald-100 dark:border-emerald-800/30">
                  {businessForm.businessName ? 'Configured' : 'Setup Required'}
                </span>
                <ChevronDown className={`w-4 h-4 text-zinc-400 transition-transform duration-200 ${openSections.business ? 'rotate-180' : ''}`} />
              </div>
            </button>

            {openSections.business && (
              <div className="p-4 sm:p-5 pt-0 space-y-5 border-t border-zinc-100 dark:border-zinc-800/60 mt-2">
          <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
            These details are extracted and displayed onto your professional customer quotations, PDF exports, and BACS payment instructions.
          </p>

          {/* Company Name & Trading Name */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 mb-1">
                Company / Registered Name *
              </label>
              <input
                type="text"
                value={businessForm.businessName}
                onChange={e => setBusinessForm(prev => ({ ...prev, businessName: e.target.value }))}
                placeholder="e.g. TribeTrade Heating Ltd"
                className="w-full px-3.5 py-2 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl text-xs text-zinc-900 dark:text-white outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 mb-1">
                Trading As / Brand Name
              </label>
              <input
                type="text"
                value={businessForm.tradingName || ''}
                onChange={e => setBusinessForm(prev => ({ ...prev, tradingName: e.target.value }))}
                placeholder="e.g. TribeTrade Plumbing & Bathrooms"
                className="w-full px-3.5 py-2 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl text-xs text-zinc-900 dark:text-white outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
          </div>

          {/* Address */}
          <div className="space-y-2 pt-2 border-t border-zinc-100 dark:border-zinc-800">
            <span className="text-[10px] font-black uppercase tracking-wider text-zinc-400 flex items-center gap-1">
              <MapPin className="w-3 h-3 text-emerald-500" /> Trading Address
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <input
                type="text"
                value={businessForm.addressLine1 || ''}
                onChange={e => setBusinessForm(prev => ({ ...prev, addressLine1: e.target.value }))}
                placeholder="Address Line 1 (e.g. Unit 4, Solent Trade Park)"
                className="w-full px-3.5 py-2 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl text-xs text-zinc-900 dark:text-white outline-none focus:ring-2 focus:ring-emerald-500"
              />
              <input
                type="text"
                value={businessForm.addressLine2 || ''}
                onChange={e => setBusinessForm(prev => ({ ...prev, addressLine2: e.target.value }))}
                placeholder="Address Line 2 (optional)"
                className="w-full px-3.5 py-2 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl text-xs text-zinc-900 dark:text-white outline-none focus:ring-2 focus:ring-emerald-500"
              />
              <input
                type="text"
                value={businessForm.townCity || ''}
                onChange={e => setBusinessForm(prev => ({ ...prev, townCity: e.target.value }))}
                placeholder="Town / City (e.g. Southampton)"
                className="w-full px-3.5 py-2 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl text-xs text-zinc-900 dark:text-white outline-none focus:ring-2 focus:ring-emerald-500"
              />
              <input
                type="text"
                value={businessForm.postcode || ''}
                onChange={e => setBusinessForm(prev => ({ ...prev, postcode: e.target.value.toUpperCase() }))}
                placeholder="Postcode (e.g. SO15 1AF)"
                className="w-full px-3.5 py-2 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl text-xs text-zinc-900 dark:text-white outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
          </div>

          {/* Contact Details */}
          <div className="space-y-2 pt-2 border-t border-zinc-100 dark:border-zinc-800">
            <span className="text-[10px] font-black uppercase tracking-wider text-zinc-400 flex items-center gap-1">
              <Mail className="w-3 h-3 text-emerald-500" /> Contact & Online
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <input
                type="tel"
                value={businessForm.phone || ''}
                onChange={e => setBusinessForm(prev => ({ ...prev, phone: e.target.value }))}
                placeholder="Phone (e.g. 07700 900456)"
                className="w-full px-3.5 py-2 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl text-xs text-zinc-900 dark:text-white outline-none focus:ring-2 focus:ring-emerald-500"
              />
              <input
                type="email"
                value={businessForm.email || ''}
                onChange={e => setBusinessForm(prev => ({ ...prev, email: e.target.value }))}
                placeholder="Email (e.g. info@tribetrade.co.uk)"
                className="w-full px-3.5 py-2 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl text-xs text-zinc-900 dark:text-white outline-none focus:ring-2 focus:ring-emerald-500"
              />
              <input
                type="text"
                value={businessForm.website || ''}
                onChange={e => setBusinessForm(prev => ({ ...prev, website: e.target.value }))}
                placeholder="Website (e.g. www.tribetrade.co.uk)"
                className="w-full px-3.5 py-2 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl text-xs text-zinc-900 dark:text-white outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
          </div>

          {/* Registration & VAT */}
          <div className="space-y-2 pt-2 border-t border-zinc-100 dark:border-zinc-800">
            <span className="text-[10px] font-black uppercase tracking-wider text-zinc-400 flex items-center gap-1">
              <ReceiptPoundSterling className="w-3 h-3 text-emerald-500" /> Registration & VAT
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-[10px] font-semibold text-zinc-500 dark:text-zinc-400 mb-1">Company Reg Number</label>
                <input
                  type="text"
                  value={businessForm.companyNumber || ''}
                  onChange={e => setBusinessForm(prev => ({ ...prev, companyNumber: e.target.value }))}
                  placeholder="e.g. 12345678"
                  className="w-full px-3.5 py-2 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl text-xs text-zinc-900 dark:text-white outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-[10px] font-semibold text-zinc-500 dark:text-zinc-400">VAT Registered?</label>
                  <input
                    type="checkbox"
                    checked={businessForm.isVatRegistered || false}
                    onChange={e => setBusinessForm(prev => ({ ...prev, isVatRegistered: e.target.checked }))}
                    className="w-3.5 h-3.5 rounded text-emerald-600 focus:ring-emerald-500"
                  />
                </div>
                <input
                  type="text"
                  disabled={!businessForm.isVatRegistered}
                  value={businessForm.vatNumber || ''}
                  onChange={e => setBusinessForm(prev => ({ ...prev, vatNumber: e.target.value }))}
                  placeholder={businessForm.isVatRegistered ? 'VAT Number (e.g. GB 123 4567 89)' : 'Not VAT registered'}
                  className="w-full px-3.5 py-2 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl text-xs text-zinc-900 dark:text-white outline-none focus:ring-2 focus:ring-emerald-500 disabled:opacity-50"
                />
              </div>

              <div>
                <label className="block text-[10px] font-semibold text-zinc-500 dark:text-zinc-400 mb-1">Default UK VAT Rate (%)</label>
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={businessForm.defaultVatRate ?? 20}
                  onChange={e => setBusinessForm(prev => ({ ...prev, defaultVatRate: parseFloat(e.target.value) || 0 }))}
                  className="w-full px-3.5 py-2 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl text-xs text-zinc-900 dark:text-white outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
            </div>
          </div>

          {/* Labour Rates */}
          <div className="space-y-2 pt-2 border-t border-zinc-100 dark:border-zinc-800">
            <span className="text-[10px] font-black uppercase tracking-wider text-zinc-400 flex items-center gap-1">
              <Clock className="w-3 h-3 text-emerald-500" /> Standard Labour Rates (for Quick Quotes)
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[10px] font-semibold text-zinc-500 dark:text-zinc-400 mb-1">Standard Hourly Rate (£/hr)</label>
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={businessForm.defaultHourlyRate ?? 45}
                  onChange={e => setBusinessForm(prev => ({ ...prev, defaultHourlyRate: parseFloat(e.target.value) || 0 }))}
                  className="w-full px-3.5 py-2 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl text-xs text-zinc-900 dark:text-white outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
              <div>
                <label className="block text-[10px] font-semibold text-zinc-500 dark:text-zinc-400 mb-1">Standard Day Rate (£/day)</label>
                <input
                  type="number"
                  min="0"
                  step="5"
                  value={businessForm.defaultDayRate ?? 320}
                  onChange={e => setBusinessForm(prev => ({ ...prev, defaultDayRate: parseFloat(e.target.value) || 0 }))}
                  className="w-full px-3.5 py-2 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl text-xs text-zinc-900 dark:text-white outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
            </div>
          </div>

          {/* BACS Payment Details */}
          <div className="space-y-2 pt-2 border-t border-zinc-100 dark:border-zinc-800">
            <span className="text-[10px] font-black uppercase tracking-wider text-zinc-400 flex items-center gap-1">
              <CreditCard className="w-3 h-3 text-emerald-500" /> BACS Bank Details (Printed on Quotes & Invoices)
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
              <div>
                <label className="block text-[10px] font-semibold text-zinc-500 dark:text-zinc-400 mb-1">Bank Name</label>
                <input
                  type="text"
                  value={businessForm.bankName || ''}
                  onChange={e => setBusinessForm(prev => ({ ...prev, bankName: e.target.value }))}
                  placeholder="e.g. Barclays, NatWest"
                  className="w-full px-3.5 py-2 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl text-xs text-zinc-900 dark:text-white outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
              <div>
                <label className="block text-[10px] font-semibold text-zinc-500 dark:text-zinc-400 mb-1">Account Name</label>
                <input
                  type="text"
                  value={businessForm.accountName || ''}
                  onChange={e => setBusinessForm(prev => ({ ...prev, accountName: e.target.value }))}
                  placeholder="e.g. TribeTrade Heating Ltd"
                  className="w-full px-3.5 py-2 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl text-xs text-zinc-900 dark:text-white outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
              <div>
                <label className="block text-[10px] font-semibold text-zinc-500 dark:text-zinc-400 mb-1">Sort Code</label>
                <input
                  type="text"
                  value={businessForm.sortCode || ''}
                  onChange={e => setBusinessForm(prev => ({ ...prev, sortCode: e.target.value }))}
                  placeholder="e.g. 20-45-78"
                  className="w-full px-3.5 py-2 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl text-xs text-zinc-900 dark:text-white outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
              <div>
                <label className="block text-[10px] font-semibold text-zinc-500 dark:text-zinc-400 mb-1">Account Number</label>
                <input
                  type="text"
                  value={businessForm.accountNumber || ''}
                  onChange={e => setBusinessForm(prev => ({ ...prev, accountNumber: e.target.value }))}
                  placeholder="e.g. 87654321"
                  className="w-full px-3.5 py-2 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl text-xs text-zinc-900 dark:text-white outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
            </div>
          </div>

          {/* Terms & Notes */}
          <div className="space-y-2 pt-2 border-t border-zinc-100 dark:border-zinc-800">
            <span className="text-[10px] font-black uppercase tracking-wider text-zinc-400 flex items-center gap-1">
              <FileText className="w-3 h-3 text-emerald-500" /> Default Terms & Quote Notes
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[10px] font-semibold text-zinc-500 dark:text-zinc-400 mb-1">Default Payment Terms</label>
                <input
                  type="text"
                  value={businessForm.defaultPaymentTerms || ''}
                  onChange={e => setBusinessForm(prev => ({ ...prev, defaultPaymentTerms: e.target.value }))}
                  placeholder="e.g. Payment due within 14 days of completion."
                  className="w-full px-3.5 py-2 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl text-xs text-zinc-900 dark:text-white outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
              <div>
                <label className="block text-[10px] font-semibold text-zinc-500 dark:text-zinc-400 mb-1">Default Quote Validity Terms</label>
                <input
                  type="text"
                  value={businessForm.defaultQuoteTerms || ''}
                  onChange={e => setBusinessForm(prev => ({ ...prev, defaultQuoteTerms: e.target.value }))}
                  placeholder="e.g. Quotation valid for 30 days from date of issue."
                  className="w-full px-3.5 py-2 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl text-xs text-zinc-900 dark:text-white outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
            </div>
          </div>

          <div className="pt-2 flex justify-end">
            <button
              onClick={handleSaveBusinessDetails}
              disabled={savingBusinessDetails}
              className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-black rounded-2xl text-xs flex items-center gap-1.5 transition-all active:scale-95 shadow-sm disabled:opacity-50"
            >
              {savingBusinessDetails ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
              <span>Save Business Details</span>
            </button>
          </div>
        </div>
      )}
    </div>
  )}

        {/* Vehicle & Transport Fleet Compliance Section */}
        {activeCategoryTab === 'fleet' && (
          <VehicleComplianceSettings
            tradeUserId={tradeUserId || `family_${user?.uid}`}
            userId={user?.uid || ''}
            initialVehicles={vehicles}
          />
        )}

        {/* Tribe Guide & Help Section */}
        {activeCategoryTab === 'support' && (
          <div className="grid gap-2 mt-6">
            <h4 className="text-xs font-bold text-zinc-600 dark:text-zinc-400 uppercase tracking-widest px-4 py-2">Guides & Help</h4>
            
            <div id="guide-section" className="bg-white dark:bg-zinc-900 p-5 rounded-3xl border border-zinc-200 dark:border-zinc-800">
              <div className="flex items-center justify-between gap-4 flex-wrap sm:flex-nowrap">
                <div className="flex items-center gap-3 min-w-0">
                  <BookOpen className="w-5 h-5 text-emerald-500 shrink-0" />
                  <div className="space-y-0.5 min-w-0">
                    <span className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">Tribe Starters Guide</span>
                    <p className="text-[10px] text-zinc-500 dark:text-zinc-400 truncate">Learn how to get the most out of your home organiser</p>
                  </div>
                </div>
                <button 
                  onClick={() => onNavigate?.('guide')}
                  className="px-4 py-2 text-white text-[11px] font-black uppercase tracking-widest bg-emerald-500 hover:bg-emerald-600 rounded-xl transition-all active:scale-95 shrink-0"
                >
                  Open Guide
                </button>
              </div>
            </div>

            <div className="bg-white dark:bg-zinc-900 p-5 rounded-3xl border border-zinc-200 dark:border-zinc-800">
              <div className="flex items-center justify-between gap-4 flex-wrap sm:flex-nowrap">
                <div className="flex items-center gap-3 min-w-0">
                  <Sparkles className="w-5 h-5 text-emerald-500 shrink-0" />
                  <div className="space-y-0.5 min-w-0">
                    <span className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">Interactive Sandbox Tour</span>
                    <p className="text-[10px] text-zinc-500 dark:text-zinc-400 truncate">Re-run the first login walkthrough without saving data</p>
                  </div>
                </div>
                <button 
                  onClick={() => window.dispatchEvent(new CustomEvent('tribe_start_tour'))}
                  className="px-4 py-2 text-white text-[11px] font-black uppercase tracking-widest bg-emerald-500 hover:bg-emerald-600 rounded-xl transition-all active:scale-95 shrink-0"
                >
                  Start Tour
                </button>
              </div>
            </div>
          </div>
        )}

        {/* App Preferences & Display Theme */}
        {activeCategoryTab === 'app' && (
          <div className="space-y-4 mt-6">
            <div className="grid gap-2">
              <h4 className="text-xs font-bold text-zinc-600 dark:text-zinc-400 uppercase tracking-widest px-4 py-2">App Preferences</h4>
              
              <NotificationStatus />

          {/* Default Reminder Timing Pill */}
          <div className="bg-white dark:bg-zinc-900 p-5 rounded-3xl border border-zinc-200 dark:border-zinc-800">
            <div className="flex items-center justify-between gap-4 flex-wrap sm:flex-nowrap">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-9 h-9 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 rounded-xl flex items-center justify-center shrink-0">
                  <Bell className="w-5 h-5" />
                </div>
                <div className="space-y-0.5 min-w-0">
                  <span className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">Default Reminder Timing</span>
                  <p className="text-[10px] text-zinc-500 truncate">Default advance notice when scheduling events & tasks</p>
                </div>
              </div>

              <div className="shrink-0 w-full sm:w-auto">
                <select
                  value={settings.defaultReminderOffset || 'at_time'}
                  onChange={async (e) => {
                    await updateSettings({ defaultReminderOffset: e.target.value as ReminderOffset });
                    showToast('Default reminder timing updated', 'success');
                  }}
                  className="w-full sm:w-auto px-4 py-2 bg-zinc-50 dark:bg-zinc-800 border-none rounded-xl text-xs font-bold text-zinc-700 dark:text-zinc-200 focus:ring-2 focus:ring-emerald-500 cursor-pointer"
                >
                  {REMINDER_OPTIONS.map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* App PIN Security Pill */}
          <div className="bg-white dark:bg-zinc-900 p-5 rounded-3xl border border-zinc-200 dark:border-zinc-800">
            <div className="flex items-center justify-between gap-4 flex-wrap sm:flex-nowrap">
              <div className="flex items-center gap-3 min-w-0">
                <div className={`w-9 h-9 rounded-2xl flex items-center justify-center shrink-0 ${settings.pinLock && settings.pinHash ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400' : 'bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400'}`}>
                  {settings.pinLock && settings.pinHash ? <ShieldCheck className="w-5 h-5" /> : <KeyRound className="w-5 h-5" />}
                </div>
                <div className="space-y-0.5 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">App PIN Security</span>
                    {settings.pinLock && settings.pinHash ? (
                      <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800">
                        Enabled
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800">
                        Recommended
                      </span>
                    )}
                  </div>
                  <p className="text-[10px] text-zinc-500 dark:text-zinc-400 truncate">
                    {settings.pinLock && settings.pinHash
                      ? 'Your 4-digit PIN protects your app screen'
                      : 'Secure notes, calendar, & family data with a 4-digit PIN'}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0 w-full sm:w-auto justify-end">
                {settings.pinLock && settings.pinHash ? (
                  <>
                    <button 
                      onClick={() => setShowPinSetup(true)}
                      className="px-3 py-1.5 text-[11px] font-black uppercase tracking-widest bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded-xl transition-colors text-zinc-700 dark:text-zinc-300 active:scale-95"
                    >
                      Change PIN
                    </button>
                    <button 
                      onClick={async () => {
                        await updateSettings({ pinLock: false });
                        showToast('PIN Lock disabled', 'info');
                      }}
                      className="px-3 py-1.5 text-[11px] font-black uppercase tracking-widest bg-red-50 dark:bg-red-950/30 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/40 rounded-xl transition-colors active:scale-95"
                    >
                      Disable PIN
                    </button>
                  </>
                ) : (
                  <button 
                    onClick={() => setShowPinSetup(true)}
                    className="px-4 py-2 text-[11px] font-black uppercase tracking-widest bg-emerald-600 text-white hover:bg-emerald-700 dark:bg-emerald-500 dark:hover:bg-emerald-600 rounded-xl transition-all active:scale-95 shadow-sm"
                  >
                    Set Up PIN
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Registered Devices (Max 4 & Churn Protection) */}
          <div className="space-y-3 pt-4 border-t border-zinc-100 dark:border-zinc-800">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px] font-black text-zinc-400 uppercase tracking-widest px-1">Registered Devices</p>
                <p className="text-xs text-zinc-500 px-1 mt-0.5">
                  Max {MAX_DEVICES} active devices allowed per account (e.g. 2 mobiles, a tablet, and a laptop).
                </p>
              </div>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                registeredDevices.length >= MAX_DEVICES 
                  ? 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/60 dark:text-amber-400 dark:border-amber-800' 
                  : 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-400 dark:border-emerald-800'
              }`}>
                {registeredDevices.length} of {MAX_DEVICES} slots used
              </span>
            </div>

            {/* Monthly Swap Quota Status */}
            <div className="p-3 bg-zinc-50 dark:bg-zinc-800/40 rounded-2xl border border-zinc-100 dark:border-zinc-800 flex items-center justify-between text-xs">
              <span className="text-zinc-600 dark:text-zinc-400">Monthly Device Replacements:</span>
              <span className="font-bold text-zinc-800 dark:text-zinc-200">
                {swapsRemaining} of {MAX_MONTHLY_SWAPS} remaining this month
                {nextAvailableSwapDate && swapsRemaining === 0 && ` (next swap ${nextAvailableSwapDate})`}
              </span>
            </div>

            {/* Device list */}
            <div className="space-y-2">
              {registeredDevices.map(dev => {
                const isCurrent = dev.id === currentDeviceId;
                return (
                  <div
                    key={dev.id}
                    className="p-3 bg-zinc-50 dark:bg-zinc-800/50 rounded-2xl border border-zinc-100 dark:border-zinc-800 flex items-center justify-between gap-3"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-8 h-8 rounded-xl bg-white dark:bg-zinc-700 flex items-center justify-center shrink-0 shadow-sm">
                        {dev.type === 'mobile' ? (
                          <Smartphone className="w-4 h-4 text-emerald-500" />
                        ) : dev.type === 'tablet' ? (
                          <Tablet className="w-4 h-4 text-blue-500" />
                        ) : (
                          <Laptop className="w-4 h-4 text-zinc-500 dark:text-zinc-300" />
                        )}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-xs font-bold text-zinc-900 dark:text-white truncate">
                            {dev.name}
                          </span>
                          {isCurrent && (
                            <span className="text-[9px] font-bold px-1.5 py-0.2 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800">
                              This Device
                            </span>
                          )}
                        </div>
                        <p className="text-[10px] text-zinc-500">
                          Last active: {new Date(dev.lastActiveAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                        </p>
                      </div>
                    </div>

                    {!isCurrent && (
                      <button
                        onClick={() => handleRemoveDevice(dev)}
                        className="px-2.5 py-1 text-[10px] font-bold text-red-600 hover:text-red-700 dark:text-red-400 bg-red-50 hover:bg-red-100 dark:bg-red-950/40 rounded-xl transition-all"
                      >
                        Remove
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <h4 className="text-xs font-bold text-zinc-600 dark:text-zinc-400 uppercase tracking-widest px-4 py-2 mt-6 flex items-center gap-2">
              <span>Display & Theme</span>
              {subscriptionTier === 'free' && (
                <span title="Premium feature — upgrade to unlock">
                  <ShieldAlert className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                </span>
              )}
            </h4>
            <div className="bg-white dark:bg-zinc-900 p-6 rounded-[32px] border border-zinc-200 dark:border-zinc-800 space-y-6">
          <div className="space-y-4">
            <p className="text-[10px] font-black text-zinc-400 uppercase tracking-widest px-1">Display Mode</p>
            <div className="p-3 bg-zinc-50 dark:bg-zinc-800/50 rounded-2xl border border-zinc-100 dark:border-zinc-800 flex items-center justify-between">
              <div className="flex items-center gap-3">
                {settings.darkMode ? <Moon className="w-5 h-5 text-zinc-400" /> : <Sun className="w-5 h-5 text-zinc-400" />}
                <div className="space-y-0.5">
                  <span className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">Display Mode</span>
                  <p className="text-[10px] text-zinc-500">Toggle light or dark theme</p>
                </div>
              </div>
              <button 
                onClick={() => updateSettings({ darkMode: !settings.darkMode })}
                className={`w-12 h-6 rounded-full transition-all relative ${settings.darkMode ? 'bg-emerald-500' : 'bg-zinc-200 dark:bg-zinc-700'}`}
              >
                <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all ${settings.darkMode ? 'left-7' : 'left-1'}`} />
              </button>
            </div>
          </div>
          <div className="space-y-4">
            <p className="text-[10px] font-black text-zinc-400 uppercase tracking-widest px-1">App Icons & Theme</p>
            <div className={`p-4 bg-zinc-50 dark:bg-zinc-800/50 rounded-2xl border border-zinc-100 dark:border-zinc-800 grid grid-cols-1 md:grid-cols-2 gap-6 ${subscriptionTier === 'free' ? 'opacity-50' : ''}`}>
              <div className="space-y-2.5">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center text-white shrink-0 shadow-sm" style={{ backgroundColor: settings.iconColor || '#94a3b8' }}>
                    <Palette className="w-4 h-4" />
                  </div>
                  <div>
                    <span className="text-sm font-bold text-zinc-900 dark:text-white block">Icon Colour</span>
                    <p className="text-[10px] text-zinc-500 font-medium">Customise category and task icons</p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {presetColors.map(c => (
                    <button
                      key={c}
                      onClick={() => {
                        if (subscriptionTier === 'free') {
                          showToast('Upgrade to Premium to customise colour coding!', 'error');
                        } else {
                          updateSettings({ iconColor: c });
                        }
                      }}
                      className={`w-6 h-6 rounded-full border-2 transition-all ${settings.iconColor === c ? 'border-zinc-900 dark:border-white scale-110 shadow-sm' : 'border-transparent hover:scale-105'} ${subscriptionTier === 'free' ? 'cursor-not-allowed' : ''}`}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>
              </div>

              <div className="space-y-2.5 pt-4 md:pt-0 border-t md:border-t-0 md:border-l border-zinc-200/60 dark:border-zinc-700/60 md:pl-6">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center text-white shrink-0 shadow-sm" style={{ backgroundColor: settings.themeColor || '#10b981' }}>
                    <Palette className="w-4 h-4" />
                  </div>
                  <div>
                    <span className="text-sm font-bold text-zinc-900 dark:text-white block">App Theme Colour</span>
                    <p className="text-[10px] text-zinc-500 font-medium">Accent color across buttons and highlights</p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {accentColorOptions.map(hero => (
                    <button
                      key={hero.id}
                      onClick={() => {
                        if (subscriptionTier === 'free') {
                          showToast('Please upgrade to Premium to unlock designer themes!', 'error');
                        } else {
                          updateSettings({ themeColor: hero.color });
                        }
                      }}
                      title={hero.name}
                      className={`w-6 h-6 rounded-full border-2 transition-all ${settings.themeColor === hero.color ? 'border-zinc-900 dark:border-white scale-110 shadow-sm' : 'border-transparent hover:scale-105'} ${subscriptionTier === 'free' ? 'cursor-not-allowed' : ''}`}
                      style={{ backgroundColor: hero.color }}
                    />
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    )}

        {/* Connected Email & Calendar Accounts Section */}
        {activeCategoryTab === 'accounts' && (
          <div className="bg-white dark:bg-zinc-900 rounded-3xl border border-zinc-200 dark:border-zinc-800 overflow-hidden shadow-sm transition-all mt-4">
            <button
              onClick={() => toggleSection('accounts')}
              className="w-full p-4 sm:p-5 flex items-center justify-between text-left hover:bg-zinc-50 dark:hover:bg-zinc-800/40 transition-colors"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-9 h-9 rounded-xl bg-blue-50 dark:bg-blue-950/30 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
                  <Mail className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <h4 className="text-sm font-bold text-zinc-900 dark:text-white truncate">
                    Connected Email & Calendar Accounts
                  </h4>
                  <p className="text-[10px] text-zinc-500 dark:text-zinc-400 truncate mt-0.5">
                    Gmail, Google Calendar, Microsoft, Apple Mail & Yahoo sync
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 border border-blue-100 dark:border-blue-800/30">
                  {connectedAccounts.length + (isGoogleConnected ? 1 : 0)} Connected
                </span>
                <ChevronDown className={`w-4 h-4 text-zinc-400 transition-transform duration-200 ${openSections.accounts ? 'rotate-180' : ''}`} />
              </div>
            </button>

            {openSections.accounts && (
              <div className="border-t border-zinc-100 dark:border-zinc-800/60">
                <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
          
          {/* 1. Google Services (Prominent Primary Integration) */}
          <div className="p-4 sm:p-5 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3.5 min-w-0">
              <div className="w-11 h-11 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700/60 rounded-2xl flex items-center justify-center shrink-0 shadow-sm">
                <GoogleIcon className="w-6 h-6" isColoured={isGoogleConnected} />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold text-zinc-900 dark:text-white truncate">Google Services</span>
                  <span className="px-2 py-0.5 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 text-[9px] font-black uppercase tracking-wider rounded-md border border-blue-100 dark:border-blue-800/30">Primary</span>
                </div>
                <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5">Live Google Calendar synchronisation</p>
              </div>
            </div>
            
            <div className="flex items-center gap-2 shrink-0">
              {isGoogleConnected ? (
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 text-[10px] font-black uppercase tracking-widest rounded-xl border border-emerald-200 dark:border-emerald-800/50">
                    <Check className="w-3.5 h-3.5" />
                    Connected
                  </div>
                  <button 
                    onClick={reconnectGoogle}
                    className="p-2 text-zinc-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-xl transition-all"
                    title="Reconnect Google Account"
                  >
                    <RefreshCw className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => {
                      setConfirmConfig({
                        isOpen: true,
                        title: 'Disconnect Google Services',
                        message: 'Disconnect Google Services? This will stop live Google Calendar synchronisation until reconnected.',
                        confirmLabel: 'Disconnect',
                        variant: 'warning',
                        onConfirm: () => {
                          disconnectGoogle();
                          showToast('Disconnected Google Services', 'info');
                          setConfirmConfig(prev => ({ ...prev, isOpen: false }));
                        }
                      });
                    }}
                    className="p-2 text-zinc-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/40 rounded-xl transition-all"
                    title="Disconnect Google Account"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <button
                  onClick={reconnectGoogle}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-[11px] font-black uppercase tracking-widest rounded-xl transition-all shadow-sm active:scale-95 flex items-center gap-2"
                >
                  <GoogleIcon className="w-4 h-4" isColoured={false} />
                  Connect Google
                </button>
              )}
            </div>
          </div>

          {/* 1.5 Gmail Inbox via App Password */}
          {(() => {
            const gmailAccount = connectedAccounts.find(a => a.provider === 'google' || a.provider === 'gmail');
            return (
              <div className="p-4 sm:p-5 flex items-center justify-between gap-4">
                <div className="flex items-center gap-3.5 min-w-0">
                  <div className="w-11 h-11 bg-red-50 dark:bg-red-950/30 border border-red-100 dark:border-red-900/40 rounded-2xl flex items-center justify-center shrink-0">
                    <GoogleIcon className="w-5 h-5" isColoured={!!gmailAccount} />
                  </div>
                  <div className="min-w-0">
                    <span className="text-sm font-bold text-zinc-900 dark:text-white truncate">Gmail Inbox</span>
                    <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5">
                      {gmailAccount ? gmailAccount.emailAddress : 'Live Gmail inbox sync via Google App Password'}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {gmailAccount ? (
                    <div className="flex items-center gap-2">
                      <div className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 text-[10px] font-black uppercase tracking-widest rounded-xl border border-emerald-200 dark:border-emerald-800/50">
                        <Check className="w-3.5 h-3.5" />
                        Connected
                      </div>
                      <button
                        onClick={() => handleDisconnectAccount(gmailAccount.id, 'Gmail')}
                        className="p-2 text-zinc-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/40 rounded-xl transition-all"
                        title="Disconnect Gmail Account"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => {
                        setPasswordModalProvider('google');
                        setIsPasswordModalOpen(true);
                      }}
                      className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-[11px] font-black uppercase tracking-widest rounded-xl transition-all shadow-sm active:scale-95 flex items-center gap-2"
                    >
                      <GoogleIcon className="w-4 h-4" isColoured={false} />
                      Connect
                    </button>
                  )}
                </div>
              </div>
            );
          })()}

          {/* 2. Microsoft Outlook / Office 365 / Hotmail */}
          {(() => {
            const msAccount = connectedAccounts.find(a => a.provider === 'microsoft' || a.provider === 'outlook');
            return (
              <div className="p-4 sm:p-5 flex items-center justify-between gap-4">
                <div className="flex items-center gap-3.5 min-w-0">
                  <div className="w-11 h-11 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700/60 rounded-2xl flex items-center justify-center shrink-0">
                    <MicrosoftIcon className="w-5 h-5" isColoured={!!msAccount} />
                  </div>
                  <div className="min-w-0">
                    <span className="text-sm font-bold text-zinc-900 dark:text-white truncate">Microsoft Outlook</span>
                    <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5">
                      {msAccount ? msAccount.emailAddress : 'Outlook, Office 365 & Hotmail sync'}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {msAccount ? (
                    <div className="flex items-center gap-2">
                      <div className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 text-[10px] font-black uppercase tracking-widest rounded-xl border border-emerald-200 dark:border-emerald-800/50">
                        <Check className="w-3.5 h-3.5" />
                        Connected
                      </div>
                      <button
                        onClick={() => handleDisconnectAccount(msAccount.id, 'Microsoft Outlook')}
                        className="p-2 text-zinc-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/40 rounded-xl transition-all"
                        title="Disconnect Account"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => handleOAuthConnect('microsoft')}
                      disabled={connectingProvider === 'microsoft'}
                      className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-[11px] font-black uppercase tracking-widest rounded-xl transition-all shadow-sm active:scale-95 flex items-center gap-2 disabled:opacity-50"
                    >
                      {connectingProvider === 'microsoft' ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <MicrosoftIcon className="w-4 h-4" isColoured={true} />
                      )}
                      Sign In with Microsoft
                    </button>
                  )}
                </div>
              </div>
            );
          })()}

          {/* 3. Sky Mail & Yahoo Mail */}
          {(() => {
            const yahooAccount = connectedAccounts.find(a => a.provider === 'yahoo' || a.provider === 'sky');
            return (
              <div className="p-4 sm:p-5 flex items-center justify-between gap-4">
                <div className="flex items-center gap-3.5 min-w-0">
                  <div className="w-11 h-11 bg-purple-50 dark:bg-purple-950/30 border border-purple-100 dark:border-purple-900/40 rounded-2xl flex items-center justify-center shrink-0">
                    <YahooIcon className="w-5 h-5" isColoured={!!yahooAccount} />
                  </div>
                  <div className="min-w-0">
                    <span className="text-sm font-bold text-zinc-900 dark:text-white truncate">Sky Mail & Yahoo Mail</span>
                    <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5">
                      {yahooAccount ? yahooAccount.emailAddress : 'Sky Mail & Yahoo Mail inbox sync'}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {yahooAccount ? (
                    <div className="flex items-center gap-2">
                      <div className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 text-[10px] font-black uppercase tracking-widest rounded-xl border border-emerald-200 dark:border-emerald-800/50">
                        <Check className="w-3.5 h-3.5" />
                        Connected
                      </div>
                      <button
                        onClick={() => handleDisconnectAccount(yahooAccount.id, 'Sky Mail / Yahoo')}
                        className="p-2 text-zinc-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/40 rounded-xl transition-all"
                        title="Disconnect Account"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => handleOAuthConnect('yahoo')}
                      disabled={connectingProvider === 'yahoo'}
                      className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white text-[11px] font-black uppercase tracking-widest rounded-xl transition-all shadow-sm active:scale-95 flex items-center gap-2 disabled:opacity-50"
                    >
                      {connectingProvider === 'yahoo' ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <YahooIcon className="w-4 h-4" isColoured={true} />
                      )}
                      Sign In with Sky / Yahoo
                    </button>
                  )}
                </div>
              </div>
            );
          })()}

          {/* 4. Apple Mail (iCloud) */}
          {(() => {
            const appleAccount = connectedAccounts.find(a => a.provider === 'apple');
            return (
              <div className="p-4 sm:p-5 flex items-center justify-between gap-4">
                <div className="flex items-center gap-3.5 min-w-0">
                  <div className="w-11 h-11 bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700/60 rounded-2xl flex items-center justify-center shrink-0">
                    <AppleIcon className="w-5 h-5 text-zinc-900 dark:text-white" isColoured={true} />
                  </div>
                  <div className="min-w-0">
                    <span className="text-sm font-bold text-zinc-900 dark:text-white truncate">Apple Mail (iCloud)</span>
                    <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5">
                      {appleAccount ? appleAccount.emailAddress : 'iCloud mail & Apple account sync'}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {appleAccount ? (
                    <div className="flex items-center gap-2">
                      <div className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 text-[10px] font-black uppercase tracking-widest rounded-xl border border-emerald-200 dark:border-emerald-800/50">
                        <Check className="w-3.5 h-3.5" />
                        Connected
                      </div>
                      <button
                        onClick={() => handleDisconnectAccount(appleAccount.id, 'Apple Mail')}
                        className="p-2 text-zinc-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/40 rounded-xl transition-all"
                        title="Disconnect Account"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => {
                        setPasswordModalProvider('apple');
                        setIsPasswordModalOpen(true);
                      }}
                      className="px-4 py-2 bg-zinc-900 dark:bg-white hover:bg-zinc-800 dark:hover:bg-zinc-100 text-white dark:text-zinc-900 text-[11px] font-black uppercase tracking-widest rounded-xl transition-all shadow-xs flex items-center gap-2 active:scale-95 cursor-pointer"
                    >
                      <AppleIcon className="w-4 h-4 text-white dark:text-zinc-900" isColoured={false} />
                      Connect
                    </button>
                  )}
                </div>
              </div>
            );
          })()}

        </div>

        {/* Calendar Sync Informational Banner */}
        <div className="p-4 bg-zinc-50 dark:bg-zinc-900/50 rounded-2xl border border-zinc-200 dark:border-zinc-800 flex items-start gap-3 m-4">
          <CalendarIcon className="w-5 h-5 text-indigo-500 shrink-0 mt-0.5" />
          <div className="text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed">
            <span className="font-bold text-zinc-900 dark:text-white block mb-0.5">Calendar Sync Information</span>
            All events created in TribeTrade (including events converted from Yahoo, Outlook, or Apple Mail messages) are stored directly in TribeTrade's Native Calendar. To enable two-way synchronisation with an external device calendar, connect a Google or Microsoft Outlook account above.
          </div>
        </div>
      </div>
    )}
  </div>
)}

        {/* Registered Devices (Max 4 Devices, 2 Changes / Month) */}
        {activeCategoryTab === 'accounts' && (
          <div className="mt-4">
            <div className="flex items-center justify-between px-4 py-2">
              <h4 className="text-xs font-bold text-zinc-600 dark:text-zinc-400 uppercase tracking-widest">
                Registered Devices
              </h4>
              <span className="text-[11px] font-bold text-zinc-500">
                {registeredDevices.length} of {MAX_DEVICES} slots used
              </span>
            </div>

        <div className="bg-white dark:bg-zinc-900 p-5 rounded-[24px] border border-zinc-200 dark:border-zinc-800 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-zinc-100 dark:border-zinc-800 text-xs text-zinc-500 dark:text-zinc-400">
            <p>
              Your TribeTrade account permits up to <strong>{MAX_DEVICES} active devices</strong> (e.g. 2 mobiles, a tablet, and a laptop) with up to <strong>{MAX_MONTHLY_SWAPS} device changes per month</strong>.
            </p>
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold shrink-0 bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300">
              <Clock className="w-3.5 h-3.5 text-zinc-500" />
              <span>{swapsRemaining} swap{swapsRemaining === 1 ? '' : 's'} remaining this month</span>
            </div>
          </div>

          {registeredDevices.length === 0 ? (
            <p className="text-xs text-zinc-400 py-2">No devices registered yet.</p>
          ) : (
            <div className="space-y-2.5">
              {registeredDevices.map((dev) => {
                const isCurrent = dev.id === currentDeviceId;
                return (
                  <div
                    key={dev.id}
                    className="p-3 sm:p-3.5 rounded-2xl bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-150 dark:border-zinc-800 flex items-center justify-between gap-3"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-10 h-10 rounded-xl bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700/60 flex items-center justify-center shrink-0">
                        {dev.type === 'mobile' ? (
                          <Smartphone className="w-5 h-5 text-emerald-500" />
                        ) : dev.type === 'tablet' ? (
                          <Tablet className="w-5 h-5 text-blue-500" />
                        ) : (
                          <Laptop className="w-5 h-5 text-zinc-500 dark:text-zinc-300" />
                        )}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-xs sm:text-sm font-bold text-zinc-900 dark:text-white truncate">
                            {dev.name}
                          </span>
                          {isCurrent && (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 shrink-0">
                              This Device
                            </span>
                          )}
                        </div>
                        <p className="text-[10px] text-zinc-400 mt-0.5 truncate">
                          {dev.os} • {dev.browser} • Registered {new Date(dev.registeredAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                        </p>
                      </div>
                    </div>

                    {!isCurrent && (
                      <button
                        onClick={() => handleRemoveDevice(dev)}
                        className="p-2 text-zinc-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/40 rounded-xl transition-all shrink-0"
                        title={`Remove ${dev.name}`}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {nextAvailableSwapDate && swapsRemaining === 0 && (
            <p className="text-[11px] text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 p-2.5 rounded-xl border border-amber-200 dark:border-amber-800/60">
              You have used your 2 device changes for this rolling 30-day window. Your next device change will unlock on {nextAvailableSwapDate}.
            </p>
          )}
        </div>
      </div>
    )}

    {/* Help, Feedback & Legal */}
    {activeCategoryTab === 'support' && (
      <div className="space-y-6 mt-6">
        {/* Help & Feedback */}
        <div>
          <h4 className="text-xs font-bold text-zinc-600 dark:text-zinc-400 uppercase tracking-widest px-4 py-2">Help & Feedback</h4>
          <div className="bg-white dark:bg-zinc-900 p-6 rounded-[24px] border border-zinc-200 dark:border-zinc-800 space-y-4">
            <form onSubmit={handleSubmit(onSubmitFeedback)} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider mb-2">Category</label>
                <select
                  {...register('category')}
                  className="w-full px-4 py-3 bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-800 rounded-2xl text-sm font-medium text-zinc-800 dark:text-zinc-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="Bug">Bug</option>
                  <option value="Feature Request">Feature Request</option>
                  <option value="Question">Question</option>
                </select>
                {errors.category && (
                  <p className="text-rose-500 text-xs mt-1 font-semibold">{errors.category.message}</p>
                )}
              </div>

              <div>
                <label className="block text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider mb-2">Message</label>
                <textarea
                  {...register('message')}
                  rows={4}
                  maxLength={2000}
                  placeholder="Describe your issue or feedback..."
                  className="w-full px-4 py-3 bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-800 rounded-2xl text-sm font-medium text-zinc-800 dark:text-zinc-200 placeholder-zinc-400 dark:placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                />
                {errors.message && (
                  <p className="text-rose-500 text-xs mt-1 font-semibold">{errors.message.message}</p>
                )}
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-2xl text-xs uppercase tracking-widest transition-all active:scale-95 flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    Submitting...
                  </>
                ) : (
                  <>
                    <MessageSquare className="w-3.5 h-3.5" />
                    Submit Feedback
                  </>
                )}
              </button>
            </form>

            {/* User's Submitted Tickets */}
            {userTickets.length > 0 && (
              <div className="pt-6 border-t border-zinc-150 dark:border-zinc-800 space-y-3">
                <h5 className="text-[10px] font-black text-zinc-400 uppercase tracking-[0.15em] mb-2">My Requests & Feedback</h5>
                <div className="space-y-3 max-h-60 overflow-y-auto pr-1">
                  {userTickets.map((ticket) => (
                    <div key={ticket.id} className="p-4 bg-zinc-50 dark:bg-zinc-800/40 rounded-2xl border border-zinc-100 dark:border-zinc-800 text-xs space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider ${
                            ticket.category === 'Bug' ? 'bg-red-50 text-red-600 dark:bg-red-950/20 dark:text-red-400' :
                            ticket.category === 'Feature Request' ? 'bg-purple-50 text-purple-600 dark:bg-purple-950/20 dark:text-purple-400' :
                            'bg-blue-50 text-blue-600 dark:bg-blue-950/20 dark:text-blue-400'
                          }`}>
                            {ticket.category}
                          </span>
                          <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider ${
                            ticket.status === 'resolved' ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/20 dark:text-emerald-400' : 'bg-amber-50 text-amber-600 dark:bg-amber-950/20 dark:text-amber-400'
                          }`}>
                            {ticket.status === 'resolved' ? 'Resolved' : 'Open'}
                          </span>
                        </div>
                        <button
                          onClick={() => {
                            setConfirmConfig({
                              isOpen: true,
                              title: 'Delete Request',
                              message: 'Are you sure you want to delete this request?',
                              confirmLabel: 'Delete',
                              variant: 'danger',
                              onConfirm: async () => {
                                try {
                                  await deleteDoc(doc(db, 'support_tickets', ticket.id));
                                  showToast('Request deleted successfully', 'success');
                                } catch (err: any) {
                                  showToast('Failed to delete request: ' + err.message, 'error');
                                }
                              }
                            });
                          }}
                          className="p-1 text-zinc-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 rounded-lg transition-colors"
                          title="Delete request"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      <p className="text-zinc-750 dark:text-zinc-300 font-medium whitespace-pre-line">{ticket.message}</p>
                      {ticket.timestamp && (
                        <span className="block text-[10px] text-zinc-400">
                          {new Date(ticket.timestamp.seconds * 1000).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                        </span>
                      )}
                      {ticket.developerResponse && (
                        <div className="mt-2 pl-3 border-l-2 border-indigo-500 space-y-1">
                          <span className="block text-[9px] font-black text-indigo-600 dark:text-indigo-400 uppercase tracking-widest">Developer Response</span>
                          <p className="text-zinc-650 dark:text-zinc-350 italic font-medium">{ticket.developerResponse}</p>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Privacy & Legal */}
        <div>
          <h4 className="text-xs font-bold text-zinc-600 dark:text-zinc-400 uppercase tracking-widest px-4 py-2">Privacy & Legal</h4>
          <div className="bg-white dark:bg-zinc-900 p-5 rounded-[24px] border border-zinc-200 dark:border-zinc-800 space-y-3">
            <a
              href="/privacy.html"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-between p-3 rounded-2xl hover:bg-zinc-50 dark:hover:bg-zinc-800/60 transition-colors group"
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
                  <ShieldCheck className="w-4 h-4" />
                </div>
                <div>
                  <span className="text-sm font-semibold text-zinc-800 dark:text-zinc-200 group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors">
                    Privacy Policy
                  </span>
                  <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                    Read how Tribe Trade protects your business data and adheres to Google API user data policies.
                  </p>
                </div>
              </div>
              <ExternalLink className="w-4 h-4 text-zinc-400 group-hover:text-zinc-600 dark:group-hover:text-zinc-300 transition-colors" />
            </a>

            <div className="h-px bg-zinc-100 dark:bg-zinc-800" />

            <a
              href="/terms.html"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-between p-3 rounded-2xl hover:bg-zinc-50 dark:hover:bg-zinc-800/60 transition-colors group"
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800 flex items-center justify-center text-indigo-600 dark:text-indigo-400">
                  <BookOpen className="w-4 h-4" />
                </div>
                <div>
                  <span className="text-sm font-semibold text-zinc-800 dark:text-zinc-200 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                    Terms of Service
                  </span>
                  <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                    Review service terms, subscription details, and acceptable use guidelines.
                  </p>
                </div>
              </div>
              <ExternalLink className="w-4 h-4 text-zinc-400 group-hover:text-zinc-600 dark:group-hover:text-zinc-300 transition-colors" />
            </a>
          </div>
        </div>

        {/* Danger Zone */}
        <div className="bg-red-50/50 dark:bg-red-950/10 p-6 rounded-[24px] border border-red-100/50 dark:border-red-900/20 space-y-4">
          <div>
            <h4 className="text-sm font-bold text-red-800 dark:text-red-400">Danger Zone</h4>
            <p className="text-xs text-zinc-500">Permanently delete your account and wipe all associated personal data.</p>
          </div>
          <button 
            onClick={handleDeleteAccount}
            className="w-full py-3 bg-red-600 hover:bg-red-700 text-white font-bold rounded-xl text-xs uppercase tracking-widest transition-all active:scale-95 flex items-center justify-center gap-2"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Delete My Account & Data
          </button>
        </div>
      </div>
    )}
  </div>


        {isPasswordModalOpen && (
          <AppSpecificPasswordModal 
            onClose={() => setIsPasswordModalOpen(false)}
            onSuccess={() => showToast(`Connected ${passwordModalProvider === 'google' ? 'Gmail' : 'Apple Mail'} account successfully!`, 'success')}
            initialProvider={passwordModalProvider}
          />
        )}
        {showPinSetup && (
          <PinSetupModal 
            isOpen={showPinSetup}
            onClose={() => setShowPinSetup(false)} 
          />
        )}
      

      <ConfirmModal
        isOpen={confirmConfig.isOpen}
        title={confirmConfig.title}
        message={confirmConfig.message}
        confirmLabel={confirmConfig.confirmLabel}
        variant={confirmConfig.variant}
        onConfirm={confirmConfig.onConfirm}
        onClose={() => setConfirmConfig(prev => ({ ...prev, isOpen: false }))}
      />

      {activationState !== 'idle' && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl p-8 max-w-sm w-full text-center shadow-2xl flex flex-col items-center gap-4">
            {activationState === 'activating' && (
              <>
                <div className="w-16 h-16 rounded-2xl bg-emerald-500/10 flex items-center justify-center text-emerald-500 animate-pulse">
                  <Loader2 className="w-8 h-8 animate-spin" />
                </div>
                <h3 className="text-lg font-bold text-zinc-900 dark:text-white">Activating Premium...</h3>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">
                  Verifying your payment with Stripe and setting up your family account. Please wait a moment.
                </p>
              </>
            )}

            {activationState === 'success' && (
              <>
                <div className="w-16 h-16 rounded-2xl bg-emerald-500 text-white flex items-center justify-center shadow-lg shadow-emerald-500/30 animate-in zoom-in-75 duration-300">
                  <Check className="w-8 h-8 stroke-[3]" />
                </div>
                <h3 className="text-lg font-bold text-zinc-900 dark:text-white">Welcome to Premium!</h3>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">
                  Your payment was verified. AI Daily Briefings, Voice Readout, and unlimited Trade Users are now active!
                </p>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function SettingItem({ icon: Icon, label, value, onClick }: { icon: any, label: string, value?: any, onClick?: () => void }) {
  return (
    <div 
      onClick={onClick}
      className="bg-white dark:bg-zinc-900 p-3 rounded-xl border border-zinc-200 dark:border-zinc-800 flex items-center justify-between hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors cursor-pointer group"
    >
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-zinc-50 dark:bg-zinc-800 flex items-center justify-center text-zinc-500 dark:text-zinc-400 group-hover:bg-white dark:group-hover:bg-zinc-700 transition-colors">
          <Icon className="w-4 h-4" />
        </div>
        <span className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">{label}</span>
      </div>
      <div className="flex items-center gap-3">
        {value && <div className="text-sm font-bold text-zinc-900 dark:text-white">{value}</div>}
      </div>
    </div>
  );
}
