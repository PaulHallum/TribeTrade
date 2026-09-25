import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Sparkles, Calendar, Wrench, Users, ArrowRight, Check, X, FileText, ShoppingBag, Mic, MapPin, Play, RefreshCw, Lock, Volume2, Search, Compass, Copy, Mail, ExternalLink, Star, Navigation, Phone, Clock, Share2, Pin, Camera, Send, Plus, User as UserIcon, CheckCircle2, Circle, CloudSun, Trash2, Pencil, Filter, Save, Loader2, Receipt, Truck, Package, Calculator, FileCheck, Briefcase, PoundSterling, ShieldCheck, Download, Building, CreditCard } from 'lucide-react';
import { useAuth } from '../../App';
import { db } from '../../lib/firebase';
import { doc, setDoc, onSnapshot } from 'firebase/firestore';
import { logger } from '../../services/logger';

interface DashboardTourProps {
  isOpen?: boolean;
  onClose?: () => void;
  onSelectAction?: (view: 'smart' | 'supplies' | 'family' | 'settings' | 'pin' | 'quotes' | 'expenses', payload?: any) => void;
  initialStep?: number;
  isTryTribeView?: boolean;
  isEmbedded?: boolean;
}

export default function DashboardTour({ 
  isOpen = true, 
  onClose, 
  onSelectAction, 
  initialStep, 
  isTryTribeView = false,
  isEmbedded = false
}: DashboardTourProps) {
  const [currentStep, setCurrentStep] = useState(initialStep ?? 0);

  React.useEffect(() => {
    if (initialStep !== undefined && isOpen) {
      setCurrentStep(initialStep);
    }
  }, [initialStep, isOpen]);

  // Sandbox State (Strictly In-Memory - Zero Database Insertion)
  const [smartDemoState, setSmartDemoState] = useState<'idle' | 'parsing' | 'extracted'>('idle');

  const [voiceDemoState, setVoiceDemoState] = useState<'idle' | 'listening' | 'transcribed'>('transcribed');
  const [voiceExampleType, setVoiceExampleType] = useState<'materials' | 'jobs'>('materials');
  const [showVoiceChat, setShowVoiceChat] = useState(true);
  const [isPlayingBriefingDemo, setIsPlayingBriefingDemo] = useState(false);

  // Step 3: Quotes & Invoicing State
  const [quoteTourTab, setQuoteTourTab] = useState<'quotes' | 'invoices'>('quotes');
  const [quoteConvertedToInvoice, setQuoteConvertedToInvoice] = useState(false);
  const [quoteDepositRecorded, setQuoteDepositRecorded] = useState(false);

  // Step 4: Expense & Receipt OCR State
  const [selectedReceiptMerchant, setSelectedReceiptMerchant] = useState<'Screwfix' | 'Toolstation' | 'Travis Perkins' | 'Shell Fuel' | 'CEF'>('Screwfix');
  const [receiptOcrScanning, setReceiptOcrScanning] = useState(false);

  // Step 5: Trade Business Setup State & Synchronization
  const { tradeUserId } = useAuth();
  const [tourBusinessName, setTourBusinessName] = useState(() => {
    return localStorage.getItem('tribe_tour_business_name') || localStorage.getItem('tribe_tour_family_name') || 'Apex Electrical & Solar';
  });
  const [tourTradeCraft, setTourTradeCraft] = useState('Electrician');
  const [isSavingBusinessName, setIsSavingBusinessName] = useState(false);
  const [savedBusinessNameSuccess, setSavedBusinessNameSuccess] = useState(false);
  const [tourInviteCode, setTourInviteCode] = useState('482 910');
  const [copiedCodeDemo, setCopiedCodeDemo] = useState(false);
  const [sharedCodeDemo, setSharedCodeDemo] = useState(false);

  React.useEffect(() => {
    if (!tradeUserId) return;
    const unsub = onSnapshot(doc(db, 'trade_users', tradeUserId), (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        if (data.businessName || data.familyName) {
          setTourBusinessName(data.businessName || data.familyName);
        }
        if (data.tradeCraft) {
          setTourTradeCraft(data.tradeCraft);
        }
        if (data.inviteCode) {
          const raw = String(data.inviteCode);
          if (raw.length === 6) {
            setTourInviteCode(`${raw.slice(0, 3)} ${raw.slice(3)}`);
          } else {
            setTourInviteCode(raw);
          }
        }
      }
    });
    return () => unsub();
  }, [tradeUserId]);

  const saveTourBusinessName = async () => {
    const trimmed = tourBusinessName.trim();
    if (!trimmed) return;
    setIsSavingBusinessName(true);
    try {
      if (tradeUserId) {
        await setDoc(doc(db, 'trade_users', tradeUserId), {
          businessName: trimmed,
          familyName: trimmed,
          tradeCraft: tourTradeCraft,
        }, { merge: true });
      }
      localStorage.setItem('tribe_tour_business_name', trimmed);
      localStorage.setItem('tribe_tour_family_name', trimmed);
      setSavedBusinessNameSuccess(true);
      setTimeout(() => setSavedBusinessNameSuccess(false), 3000);
    } catch (error) {
      logger.error('Error saving business name from tour', error);
    } finally {
      setIsSavingBusinessName(false);
    }
  };

  const handleSaveBusinessName = async () => {
    await saveTourBusinessName();
  };

  const handleGoToPinSetup = async () => {
    if (tourBusinessName.trim()) {
      await saveTourBusinessName();
    }
    onClose?.();
    onSelectAction?.('pin');
  };

  const handleFinishSetup = async () => {
    if (tourBusinessName.trim()) {
      await saveTourBusinessName();
    }
    onClose?.();
  };

  if (!isOpen) return null;

  const handleRunSmartDemo = () => {
    setSmartDemoState('parsing');
    setTimeout(() => setSmartDemoState('extracted'), 1200);
  };

  const handleRunVoiceDemo = () => {
    setVoiceDemoState('listening');
    setTimeout(() => setVoiceDemoState('transcribed'), 1500);
  };

  const handleTriggerReceiptOcr = (merchant: 'Screwfix' | 'Toolstation' | 'Travis Perkins' | 'Shell Fuel' | 'CEF') => {
    setSelectedReceiptMerchant(merchant);
    setReceiptOcrScanning(true);
    setTimeout(() => setReceiptOcrScanning(false), 900);
  };

  const handleCopyCodeDemo = () => {
    setCopiedCodeDemo(true);
    setTimeout(() => setCopiedCodeDemo(false), 2000);
  };

  const handleShareCodeDemo = async () => {
    const cleanCode = tourInviteCode.replace(/\s+/g, '') || '482910';
    const inviteUrl = `${window.location.origin}/?joinCode=${cleanCode}`;
    const shareData = {
      title: 'Join my Trade Team on TribeTrade',
      text: `Join our trade crew on TribeTrade using 6-digit code: ${tourInviteCode}`,
      url: inviteUrl,
    };

    if (navigator.share) {
      try {
        await navigator.share(shareData);
      } catch (err) {
        navigator.clipboard.writeText(inviteUrl);
        setSharedCodeDemo(true);
        setTimeout(() => setSharedCodeDemo(false), 2000);
      }
    } else {
      navigator.clipboard.writeText(inviteUrl);
      setSharedCodeDemo(true);
      setTimeout(() => setSharedCodeDemo(false), 2000);
    }
  };

  const tourSteps = [
    // Step 0: Welcome to TribeTrade Hub
    {
      badge: isTryTribeView ? 'Interactive Tour • Step 1 of 5' : 'Interactive Tour • Step 1 of 6',
      title: 'Welcome to TribeTrade',
      subtitle: 'Your UK trade operating system for job quotes, 1-click invoices, receipt OCR & tax prep.',
      icon: Sparkles,
      color: 'from-amber-500 to-orange-500',
    },
    // Step 1: AI Smart Capture & Quote Drafting
    {
      badge: isTryTribeView ? 'Interactive Tour • Step 2 of 5' : 'Interactive Tour • Step 2 of 6',
      title: 'AI Smart Capture & Quote Drafting',
      subtitle: 'See how customer WhatsApp notes or voice enquiries convert into itemised quotes in 30 seconds.',
      icon: FileText,
      color: 'from-emerald-500 to-teal-600',
    },
    // Step 2: Magic Mic Voice Assistant & 6 AM Audio Briefings
    {
      badge: isTryTribeView ? 'Interactive Tour • Step 3 of 5' : 'Interactive Tour • Step 3 of 6',
      title: 'Magic Mic & 6 AM Audio Briefings',
      subtitle: 'Dictate van notes and material orders hands-free, and listen to morning trade summaries.',
      icon: Mic,
      color: 'from-rose-500 to-pink-600',
    },
    // Step 3: Quotes, Invoicing & 1-Click Payments
    {
      badge: isTryTribeView ? 'Interactive Tour • Step 4 of 5' : 'Interactive Tour • Step 4 of 6',
      title: 'Quotes, Invoicing & 1-Click Payments',
      subtitle: 'Draft professional PDF quotes, capture client deposits, and convert to invoice in 1 click.',
      icon: Receipt,
      color: 'from-purple-500 to-indigo-600',
    },
    // Step 4: Expenses, Receipt OCR & HMRC MTD Tax Prep
    {
      badge: isTryTribeView ? 'Interactive Tour • Step 5 of 5 (Tour Complete)' : 'Interactive Tour • Step 5 of 6',
      title: 'Expenses, Receipt OCR & HMRC Tax Prep',
      subtitle: 'Snap merchant till slips, auto-extract 20% VAT, and forecast your Self-Assessment tax pot.',
      icon: Calculator,
      color: 'from-sky-500 to-blue-600',
    },
    ...(!isTryTribeView ? [{
      badge: 'Next Steps • Trade Business Setup Guide',
      title: 'Trade Business Setup Guide',
      subtitle: 'Set your trading name, primary tradecraft, apprentice join code, and work tablet security PIN.',
      icon: Wrench,
      color: 'from-blue-600 to-cyan-600',
    }] : []),
  ];

  const activeStep = tourSteps[currentStep];
  const StepIcon = activeStep.icon;

  if (!isEmbedded && !isOpen) return null;

  const tourCardContent = (
    <div className={`w-full ${isEmbedded ? 'max-w-4xl mx-auto shadow-xl' : 'max-w-3xl shadow-2xl max-h-[90vh] flex flex-col my-auto'} bg-white dark:bg-zinc-900 rounded-[32px] border border-zinc-200 dark:border-zinc-800 overflow-hidden relative text-left`}>
      {/* Top Accent Bar */}
      <div className={`h-2.5 shrink-0 bg-gradient-to-r ${activeStep.color}`} />

      {/* Close Button */}
      {!isEmbedded && onClose && (
        <button
          onClick={onClose}
          className="absolute top-5 right-5 p-2 rounded-full text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors z-20 cursor-pointer"
          title="Exit Tour"
        >
          <X className="w-5 h-5" />
        </button>
      )}

      {/* Main Scrollable Body */}
      <div className="p-5 sm:p-7 md:p-8 flex-1 overflow-y-auto">
          {/* Header Badge & Title */}
          <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full text-xs font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 mb-4">
            <Sparkles className="w-3.5 h-3.5" />
            {activeStep.badge}
          </div>

          <div className="flex items-center gap-4 mb-6">
            <div className={`w-14 h-14 rounded-2xl bg-gradient-to-br ${activeStep.color} flex items-center justify-center text-white shadow-lg shrink-0`}>
              <StepIcon className="w-7 h-7" />
            </div>
            <div>
              <h3 className="text-xl md:text-2xl font-black text-zinc-900 dark:text-white tracking-tight">
                {activeStep.title}
              </h3>
              <p className="text-xs md:text-sm text-zinc-500 dark:text-zinc-400">
                {activeStep.subtitle}
              </p>
            </div>
          </div>

          {/* STEP 0: WELCOME & REALISTIC TRADE HUB OVERVIEW */}
          {currentStep === 0 && (
            <div className="space-y-4">
              {/* Authentic Live Trade Hub Dashboard Mockup */}
              <div className="bg-zinc-50/70 dark:bg-zinc-950/60 rounded-3xl p-3.5 sm:p-5 border border-zinc-200/80 dark:border-zinc-800 space-y-4 shadow-sm">
                {/* 1. Header Greeting & Weather */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-zinc-200/60 dark:border-zinc-800">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-amber-500 to-orange-600 text-white font-black text-sm flex items-center justify-center shadow-sm">
                      <Wrench className="w-5 h-5" />
                    </div>
                    <div>
                      <h4 className="text-sm sm:text-base font-black text-zinc-900 dark:text-white flex items-center gap-1.5">
                        Good morning, Apex Electrical 👋
                      </h4>
                      <p className="text-[11px] text-zinc-500 dark:text-zinc-400 font-medium flex items-center gap-1.5">
                        <CloudSun className="w-3.5 h-3.5 text-amber-500" /> Wednesday, 22 October • 14°C Dry (Bristol, UK)
                      </p>
                    </div>
                  </div>
                  <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-500/20 text-amber-700 dark:text-amber-300 text-xs font-bold shrink-0 shadow-xs">
                    <Sparkles className="w-3.5 h-3.5 text-amber-500 animate-pulse" />
                    <span>6 AM Trade Briefing Ready</span>
                  </div>
                </div>

                {/* 2. Zero-Friction Shared Job & Site Whiteboard */}
                <div className="p-3.5 rounded-2xl bg-amber-50/80 dark:bg-amber-950/20 border border-amber-200/80 dark:border-amber-900/40 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-black uppercase tracking-wider text-amber-900 dark:text-amber-200 flex items-center gap-1.5">
                      <Pin className="w-3.5 h-3.5 text-amber-600 fill-amber-500" />
                      Trade Site & Van Whiteboard
                    </span>
                    <span className="text-[10px] font-bold text-amber-800 dark:text-amber-300 bg-amber-200/60 dark:bg-amber-900/50 px-2 py-0.5 rounded-full">
                      Live Van & Team Sync
                    </span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                    {/* Note 1 */}
                    <div className="p-2.5 bg-white/90 dark:bg-zinc-900 rounded-xl border border-amber-200/50 dark:border-zinc-800 shadow-xs space-y-1">
                      <div className="font-bold text-zinc-900 dark:text-white flex items-center justify-between text-[11px]">
                        <span>⚡ Elm Road EV Charger</span>
                        <span className="text-[10px] text-zinc-400 font-normal">Site Note</span>
                      </div>
                      <p className="text-[11px] text-zinc-600 dark:text-zinc-300 leading-snug">
                        Customer requested 7kW tethered unit. Meter box key is under plant pot. Main fuse is 100A verified.
                      </p>
                    </div>

                    {/* Note 2 */}
                    <div className="p-2.5 bg-white/90 dark:bg-zinc-900 rounded-xl border border-amber-200/50 dark:border-zinc-800 shadow-xs space-y-1">
                      <div className="font-bold text-zinc-900 dark:text-white flex items-center justify-between text-[11px]">
                        <span>🚚 Screwfix Click & Collect</span>
                        <span className="text-[10px] text-zinc-400 font-normal">Supplies</span>
                      </div>
                      <p className="text-[11px] text-zinc-600 dark:text-zinc-300 leading-snug">
                        Order #4829 ready at Bristol South branch. 25m 6mm² armoured cable & 40A Type A RCBO.
                      </p>
                    </div>
                  </div>
                </div>

                {/* 3. Two-Column Layout: Jobs Calendar & Quotes/Invoicing */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                  {/* Calendar Column */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-xs pb-0.5">
                      <span className="font-black text-zinc-500 dark:text-zinc-400 uppercase tracking-wider text-[10px]">
                        Today's Site Schedule
                      </span>
                      <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950 px-2 py-0.5 rounded-full">
                        3 JOBS BOOKED
                      </span>
                    </div>

                    <div className="space-y-1.5">
                      <div className="p-2.5 bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200/80 dark:border-zinc-800 shadow-xs flex items-center justify-between text-xs">
                        <div className="min-w-0 pr-2">
                          <div className="font-bold text-zinc-900 dark:text-white truncate flex items-center gap-1.5">
                            <Calendar className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                            EV Charger Installation
                          </div>
                          <div className="text-[10px] text-zinc-500 truncate pt-0.5">
                            08:30 AM • 14 Elm Road (Dave Harris)
                          </div>
                        </div>
                        <span className="px-2 py-0.5 bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 rounded text-[9px] font-bold shrink-0">
                          Confirmed
                        </span>
                      </div>

                      <div className="p-2.5 bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200/80 dark:border-zinc-800 shadow-xs flex items-center justify-between text-xs">
                        <div className="min-w-0 pr-2">
                          <div className="font-bold text-zinc-900 dark:text-white truncate flex items-center gap-1.5">
                            <Calendar className="w-3.5 h-3.5 text-sky-500 shrink-0" />
                            Consumer Unit Upgrade
                          </div>
                          <div className="text-[10px] text-zinc-500 truncate pt-0.5">
                            01:00 PM • 42 Oakfield Rd (Sarah Jenkins)
                          </div>
                        </div>
                        <span className="px-2 py-0.5 bg-sky-50 dark:bg-sky-950/50 text-sky-700 dark:text-sky-300 rounded text-[9px] font-bold shrink-0">
                          Job Run
                        </span>
                      </div>

                      <div className="p-2.5 bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200/80 dark:border-zinc-800 shadow-xs flex items-center justify-between text-xs">
                        <div className="min-w-0 pr-2">
                          <div className="font-bold text-zinc-900 dark:text-white truncate flex items-center gap-1.5">
                            <FileCheck className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                            Site Survey & Estimate
                          </div>
                          <div className="text-[10px] text-zinc-500 truncate pt-0.5">
                            04:30 PM • High St Bakery (Commercial)
                          </div>
                        </div>
                        <span className="px-2 py-0.5 bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300 rounded text-[9px] font-bold shrink-0">
                          Quote Survey
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Quotes & Invoicing Column */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-xs pb-0.5">
                      <span className="font-black text-zinc-500 dark:text-zinc-400 uppercase tracking-wider text-[10px]">
                        Active Quotes & Invoicing
                      </span>
                      <span className="text-[10px] font-bold text-violet-600 dark:text-violet-400 bg-violet-50 dark:bg-violet-950 px-2 py-0.5 rounded-full">
                        £5,832 PIPELINE
                      </span>
                    </div>

                    <div className="space-y-1.5">
                      <div className="p-2.5 bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200/80 dark:border-zinc-800 shadow-xs flex items-center justify-between text-xs">
                        <div className="min-w-0 pr-2">
                          <div className="font-bold text-zinc-900 dark:text-white truncate flex items-center gap-1.5">
                            <FileText className="w-3.5 h-3.5 text-violet-500 shrink-0" />
                            Q-1042: EV Charger Install
                          </div>
                          <div className="text-[10px] text-zinc-500 truncate pt-0.5">
                            £1,152.00 inc VAT • Sent to Dave Harris
                          </div>
                        </div>
                        <span className="px-2 py-0.5 bg-violet-50 dark:bg-violet-950/50 text-violet-700 dark:text-violet-300 rounded text-[9px] font-bold shrink-0">
                          Sent
                        </span>
                      </div>

                      <div className="p-2.5 bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200/80 dark:border-zinc-800 shadow-xs flex items-center justify-between text-xs">
                        <div className="min-w-0 pr-2">
                          <div className="font-bold text-zinc-900 dark:text-white truncate flex items-center gap-1.5">
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                            Q-1043: Full Rewire 3-Bed Semi
                          </div>
                          <div className="text-[10px] text-zinc-500 truncate pt-0.5">
                            £4,200.00 • Accepted (£840 Deposit Paid)
                          </div>
                        </div>
                        <span className="px-2 py-0.5 bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 rounded text-[9px] font-bold shrink-0">
                          Accepted
                        </span>
                      </div>

                      <div className="p-2.5 bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200/80 dark:border-zinc-800 shadow-xs flex items-center justify-between text-xs">
                        <div className="min-w-0 pr-2">
                          <div className="font-bold text-zinc-900 dark:text-white truncate flex items-center gap-1.5">
                            <Receipt className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
                            INV-2089: Kitchen Spotlights
                          </div>
                          <div className="text-[10px] text-zinc-500 truncate pt-0.5">
                            £480.00 • Paid in Full via Bank Transfer
                          </div>
                        </div>
                        <span className="px-2 py-0.5 bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 rounded text-[9px] font-bold shrink-0">
                          Paid
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* 4. Van Fleet & Stock Summary Bar */}
                <div className="p-3 bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200/80 dark:border-zinc-800 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 text-xs">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-7 h-7 rounded-lg bg-amber-50 dark:bg-amber-950/50 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
                      <Truck className="w-4 h-4" />
                    </div>
                    <div className="min-w-0 truncate">
                      <div className="font-bold text-zinc-900 dark:text-white text-xs truncate">
                        Ford Transit Custom (AB21 XYZ)
                      </div>
                      <div className="text-[10px] text-zinc-500 dark:text-zinc-400 truncate">
                        MOT: 48 days remaining • Road Tax: Current • Multifunction Tester: Calibrated
                      </div>
                    </div>
                  </div>
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 rounded-lg text-[10px] font-bold shrink-0 self-start sm:self-auto">
                    <Package className="w-3 h-3" /> The Shed: 18 materials logged
                  </span>
                </div>
              </div>

              {/* Step Navigation Shortcuts */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setCurrentStep(1)}
                  className="p-2.5 bg-white dark:bg-zinc-900 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 rounded-xl border border-zinc-200 dark:border-zinc-800 text-left transition-all group cursor-pointer"
                >
                  <div className="flex items-center justify-between">
                    <FileText className="w-4 h-4 text-emerald-500" />
                    <ArrowRight className="w-3.5 h-3.5 text-zinc-400 group-hover:translate-x-0.5 transition-transform" />
                  </div>
                  <div className="text-[11px] font-bold text-zinc-900 dark:text-white pt-1">Smart Capture</div>
                  <div className="text-[9px] text-zinc-500">WhatsApp notes to quotes</div>
                </button>

                <button
                  type="button"
                  onClick={() => setCurrentStep(2)}
                  className="p-2.5 bg-white dark:bg-zinc-900 hover:bg-rose-50 dark:hover:bg-rose-950/30 rounded-xl border border-zinc-200 dark:border-zinc-800 text-left transition-all group cursor-pointer"
                >
                  <div className="flex items-center justify-between">
                    <Mic className="w-4 h-4 text-rose-500" />
                    <ArrowRight className="w-3.5 h-3.5 text-zinc-400 group-hover:translate-x-0.5 transition-transform" />
                  </div>
                  <div className="text-[11px] font-bold text-zinc-900 dark:text-white pt-1">Magic Mic</div>
                  <div className="text-[9px] text-zinc-500">Hands-free van dictation</div>
                </button>

                <button
                  type="button"
                  onClick={() => setCurrentStep(3)}
                  className="p-2.5 bg-white dark:bg-zinc-900 hover:bg-purple-50 dark:hover:bg-purple-950/30 rounded-xl border border-zinc-200 dark:border-zinc-800 text-left transition-all group cursor-pointer"
                >
                  <div className="flex items-center justify-between">
                    <Receipt className="w-4 h-4 text-purple-500" />
                    <ArrowRight className="w-3.5 h-3.5 text-zinc-400 group-hover:translate-x-0.5 transition-transform" />
                  </div>
                  <div className="text-[11px] font-bold text-zinc-900 dark:text-white pt-1">Quotes & Billing</div>
                  <div className="text-[9px] text-zinc-500">1-click quotes to invoices</div>
                </button>

                <button
                  type="button"
                  onClick={() => setCurrentStep(4)}
                  className="p-2.5 bg-white dark:bg-zinc-900 hover:bg-sky-50 dark:hover:bg-sky-950/30 rounded-xl border border-zinc-200 dark:border-zinc-800 text-left transition-all group cursor-pointer"
                >
                  <div className="flex items-center justify-between">
                    <Calculator className="w-4 h-4 text-sky-500" />
                    <ArrowRight className="w-3.5 h-3.5 text-zinc-400 group-hover:translate-x-0.5 transition-transform" />
                  </div>
                  <div className="text-[11px] font-bold text-zinc-900 dark:text-white pt-1">Expenses & Tax</div>
                  <div className="text-[9px] text-zinc-500">Receipt OCR & MTD prep</div>
                </button>
              </div>
            </div>
          )}

          {/* STEP 1: INTERACTIVE SMART CONVERT & QUOTE DRAFTING DEMO */}
          {currentStep === 1 && (
            <div className="space-y-4">
              {/* Sample Input: Customer WhatsApp / SMS Message */}
              <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 p-4 space-y-3 shadow-sm">
                <div className="flex items-center justify-between pb-2.5 border-b border-zinc-100 dark:border-zinc-800 text-xs">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center font-bold text-xs shrink-0">
                      <Mail className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="font-bold text-zinc-900 dark:text-white text-xs">Dave Harris (New Client)</div>
                      <div className="text-[10px] text-zinc-400">07700 900123 • Elm Road, Bristol</div>
                    </div>
                  </div>
                  <span className="text-[10px] font-bold text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 rounded-full border border-emerald-500/20">
                    Received WhatsApp Enquiry
                  </span>
                </div>

                <div className="space-y-1.5">
                  <div className="font-bold text-xs text-zinc-900 dark:text-white">
                    Message: Driveway EV Charger Installation
                  </div>
                  <p className="text-xs text-zinc-600 dark:text-zinc-300 leading-relaxed font-sans pt-0.5">
                    "Hi Dave here. Could you quote for fitting a <strong>7kW tethered EV charger</strong> on my driveway at 14 Elm Road? Consumer unit is about 12 metres away in the hallway. Looking to get this booked for <strong>Thursday 23rd October at 8:30am</strong> if you have availability."
                  </p>
                </div>
              </div>

              {smartDemoState === 'idle' && (
                <button
                  onClick={handleRunSmartDemo}
                  className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all shadow-md flex items-center justify-center gap-2 active:scale-98 cursor-pointer"
                >
                  <Play className="w-4 h-4 fill-white" />
                  Run Interactive AI Quote Extraction Demo
                </button>
              )}

              {smartDemoState === 'parsing' && (
                <div className="py-8 text-center space-y-3 bg-emerald-50 dark:bg-emerald-950/30 rounded-2xl border border-emerald-500/20">
                  <RefreshCw className="w-8 h-8 animate-spin text-emerald-500 mx-auto" />
                  <p className="text-xs font-bold text-emerald-700 dark:text-emerald-300">
                    Parsing tradecraft, labour hours, materials, VAT & calendar slot...
                  </p>
                </div>
              )}

              {smartDemoState === 'extracted' && (
                <div className="space-y-3 bg-emerald-50/50 dark:bg-emerald-950/20 p-4 rounded-2xl border border-emerald-500/20">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-black text-emerald-600 dark:text-emerald-400 uppercase tracking-wider">
                      ✨ AI Extracted Quote & Scheduled Visit
                    </span>
                    <button onClick={() => setSmartDemoState('idle')} className="text-[10px] font-bold text-zinc-400 hover:text-zinc-600 cursor-pointer">
                      Reset
                    </button>
                  </div>

                  <div className="space-y-2 max-h-[260px] overflow-y-auto pr-1">
                    {/* Calendar Event */}
                    <div className="p-3 bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 flex justify-between items-center text-xs shadow-sm">
                      <div>
                        <div className="font-bold text-zinc-900 dark:text-white flex items-center gap-1.5">
                          <Calendar className="w-3.5 h-3.5 text-emerald-500" />
                          EV Charger Installation & Commissioning
                        </div>
                        <div className="text-zinc-500 text-[11px] pt-0.5">Thu, 23 Oct @ 08:30 AM • 14 Elm Road (Dave Harris)</div>
                      </div>
                      <span className="px-2 py-0.5 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 rounded-md text-[10px] font-bold shrink-0">
                        Calendar Booking
                      </span>
                    </div>

                    {/* Extracted Quote Breakdown */}
                    <div className="p-3 bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 space-y-2 text-xs shadow-sm">
                      <div className="flex justify-between items-center pb-1.5 border-b border-zinc-100 dark:border-zinc-800">
                        <div className="font-bold text-zinc-900 dark:text-white flex items-center gap-1.5">
                          <FileText className="w-3.5 h-3.5 text-violet-500" />
                          Quote Draft #Q-1042 (Dave Harris)
                        </div>
                        <span className="px-2 py-0.5 bg-violet-500/10 text-violet-600 dark:text-violet-400 rounded-md text-[10px] font-bold">
                          Itemised Quote
                        </span>
                      </div>
                      <div className="space-y-1 text-[11px] text-zinc-600 dark:text-zinc-300">
                        <div className="flex justify-between">
                          <span>Labour: 1 day installation, RCD testing & NICEIC cert</span>
                          <span className="font-semibold text-zinc-900 dark:text-white">£360.00</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Materials: 7kW Wallbox, 15m SWA cable, 40A Type A RCBO</span>
                          <span className="font-semibold text-zinc-900 dark:text-white">£600.00</span>
                        </div>
                        <div className="flex justify-between text-zinc-500 pt-1 border-t border-zinc-100 dark:border-zinc-800">
                          <span>Subtotal: £960.00 • 20% VAT: £192.00</span>
                          <span className="font-black text-emerald-600 dark:text-emerald-400 text-xs">Total: £1,152.00</span>
                        </div>
                      </div>
                    </div>

                    {/* Deposit & CIS Note */}
                    <div className="p-2.5 bg-amber-50 dark:bg-amber-950/30 rounded-xl border border-amber-200/60 dark:border-amber-900/40 text-[11px] flex items-center justify-between text-amber-800 dark:text-amber-300">
                      <span>20% Deposit requested: <strong>£230.40</strong> • HMRC CIS 20% auto-deduction ready if sub-contracted</span>
                      <Check className="w-4 h-4 text-emerald-500 shrink-0 ml-2" />
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* STEP 2: MAGIC MIC VOICE ASSISTANT DEMO */}
          {currentStep === 2 && (
            <div className="space-y-4">
              {/* Voice Example Selector */}
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    setVoiceExampleType('materials');
                    setShowVoiceChat(true);
                  }}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                    voiceExampleType === 'materials'
                      ? 'bg-emerald-600 text-white shadow-sm'
                      : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300'
                  }`}
                >
                  📦 Log Van Stock & Materials
                </button>
                <button
                  onClick={() => {
                    setVoiceExampleType('jobs');
                    setShowVoiceChat(true);
                  }}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                    voiceExampleType === 'jobs'
                      ? 'bg-emerald-600 text-white shadow-sm'
                      : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300'
                  }`}
                >
                  📅 Book Site Survey / Job
                </button>
              </div>

              {/* Floating Chat & Bar Mockup */}
              <div className="relative bg-zinc-50/70 dark:bg-zinc-950/60 rounded-3xl p-3 sm:p-4 border border-zinc-200/80 dark:border-zinc-800/80 shadow-inner space-y-3">
                <AnimatePresence>
                  {showVoiceChat && (
                    <motion.div
                      initial={{ opacity: 0, y: 10, scale: 0.98 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: 10, scale: 0.98 }}
                      className="bg-white dark:bg-zinc-900 rounded-[2rem] border border-zinc-200/80 dark:border-zinc-800 overflow-hidden shadow-lg"
                    >
                      {/* Chat Header */}
                      <div className="p-4 border-b border-zinc-100 dark:border-zinc-800 flex items-center justify-between bg-zinc-50/50 dark:bg-zinc-800/40">
                        <div className="flex items-center gap-2.5">
                          <div className="w-7 h-7 bg-emerald-500 rounded-xl flex items-center justify-center shrink-0 shadow-xs">
                            <Sparkles className="w-4 h-4 text-white" />
                          </div>
                          <span className="text-xs font-black uppercase tracking-widest text-zinc-600 dark:text-zinc-300">
                            TRIBETRADE COPILOT
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => setShowVoiceChat(false)}
                          className="p-1 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-full transition-colors text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 cursor-pointer"
                          title="Close chat"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>

                      {/* Chat Messages */}
                      <div className="p-4 space-y-3">
                        {voiceDemoState === 'listening' ? (
                          <div className="flex justify-start">
                            <div className="max-w-[85%] flex gap-2.5">
                              <div className="w-8 h-8 rounded-full bg-emerald-500 text-white flex items-center justify-center shrink-0 shadow-sm">
                                <Sparkles className="w-4 h-4" />
                              </div>
                              <div className="bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 text-sm px-4 py-2.5 rounded-2xl rounded-tl-none font-bold italic animate-pulse border border-emerald-100 dark:border-emerald-800">
                                {voiceExampleType === 'materials'
                                  ? 'Listening: "Add 2 boxes of 20mm conduit and a 32A MCB to The Shed..."'
                                  : 'Listening: "Schedule site survey for Oakfield Road tomorrow at 1pm..."'}
                              </div>
                            </div>
                          </div>
                        ) : (
                          <>
                            {/* User Bubble (Right) */}
                            <div className="flex justify-end">
                              <div className="max-w-[85%] flex gap-2.5 flex-row-reverse items-start">
                                <div className="w-8 h-8 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center shrink-0 shadow-xs">
                                  <UserIcon className="w-4 h-4 text-zinc-500" />
                                </div>
                                <div className="bg-[#18181b] dark:bg-white text-white dark:text-zinc-900 px-4 py-2.5 rounded-2xl rounded-tr-none text-sm font-medium shadow-sm leading-relaxed">
                                  {voiceExampleType === 'materials'
                                    ? 'Add 2 boxes of 20mm conduit and a 32A MCB to The Shed'
                                    : 'Schedule consumer unit survey for 42 Oakfield Road tomorrow at 1pm'}
                                </div>
                              </div>
                            </div>

                            {/* Tribe Assistant Bubble (Left) */}
                            <div className="flex justify-start">
                              <div className="max-w-[85%] flex gap-2.5 flex-row items-start">
                                <div className="w-8 h-8 rounded-full bg-emerald-500 text-white flex items-center justify-center shrink-0 shadow-sm">
                                  <Sparkles className="w-4 h-4" />
                                </div>
                                <div className="bg-[#f3f4f6] dark:bg-zinc-800 text-zinc-800 dark:text-zinc-100 px-4 py-2.5 rounded-2xl rounded-tl-none text-sm font-medium border border-zinc-100 dark:border-zinc-700/60 shadow-xs leading-relaxed">
                                  {voiceExampleType === 'materials'
                                    ? "Logged 2x 20mm conduit and 1x 32A Type B MCB to The Shed (Van Stock). Total inventory count: 18 items."
                                    : "Added Consumer Unit Survey (42 Oakfield Rd) for tomorrow at 1:00 PM to your Trade Calendar."}
                                </div>
                              </div>
                            </div>
                          </>
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Floating Bottom Bar Replica */}
                <div className="flex items-center gap-2.5 sm:gap-3 px-1 pt-1">
                  {/* Quick Add Button */}
                  <div
                    className="w-12 h-12 rounded-full bg-emerald-500 text-white flex items-center justify-center shrink-0 shadow-lg cursor-pointer"
                    title="Quick Add"
                  >
                    <Plus className="w-6 h-6 stroke-[2.5]" />
                  </div>

                  {/* Main Input Pill */}
                  <div 
                    onClick={() => {
                      if (!showVoiceChat) setShowVoiceChat(true);
                    }}
                    className={`flex-1 bg-white dark:bg-zinc-900 border rounded-full px-3.5 py-2.5 flex items-center gap-2.5 shadow-md transition-all cursor-pointer ${
                      voiceDemoState === 'listening'
                        ? 'border-emerald-500 ring-4 ring-emerald-500/10'
                        : 'border-zinc-200 dark:border-zinc-800'
                    }`}
                  >
                    <div className="p-1 text-zinc-400 shrink-0">
                      <Camera className="w-5 h-5" />
                    </div>

                    <div className="flex-1 flex items-center text-sm min-w-0 select-none">
                      {voiceDemoState === 'listening' ? (
                        <span className="text-emerald-600 dark:text-emerald-400 font-bold italic animate-pulse">
                          Listening in van...
                        </span>
                      ) : (
                        <>
                          <span className="text-zinc-800 dark:text-zinc-200 font-light mr-0.5 animate-pulse">|</span>
                          <span className="text-zinc-400 font-medium">Ask TribeTrade...</span>
                        </>
                      )}
                    </div>

                    <div className="p-1 text-zinc-300 shrink-0">
                      <Send className="w-4 h-4" />
                    </div>
                  </div>

                  {/* Magic Mic Button */}
                  <button
                    type="button"
                    onClick={() => {
                      setShowVoiceChat(true);
                      handleRunVoiceDemo();
                    }}
                    className={`w-12 h-12 rounded-full flex items-center justify-center shrink-0 shadow-lg transition-all active:scale-95 relative cursor-pointer ${
                      voiceDemoState === 'listening'
                        ? 'bg-emerald-500 text-white ring-4 ring-emerald-500/30 animate-pulse'
                        : 'bg-emerald-500 hover:bg-emerald-600 text-white hover:scale-105'
                    }`}
                    title="Test Voice Dictation"
                  >
                    {voiceDemoState === 'listening' && (
                      <div className="absolute inset-0 rounded-full animate-ping bg-emerald-500/30 -z-10" />
                    )}
                    <Mic className="w-6 h-6" />
                  </button>
                </div>

                {/* Micro Action Helper */}
                <div className="flex items-center justify-between px-2 pt-1 text-xs">
                  <span className="text-zinc-500 dark:text-zinc-400 font-medium flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                    Tap the green mic button to simulate hands-free van voice dictation
                  </span>
                  <button
                    onClick={() => {
                      setShowVoiceChat(true);
                      handleRunVoiceDemo();
                    }}
                    className="font-bold text-emerald-600 dark:text-emerald-400 hover:underline cursor-pointer"
                  >
                    Replay Dictation
                  </button>
                </div>
              </div>

              {/* Daily Audio Briefing Preview Card */}
              <div className="p-4 bg-zinc-900 text-white rounded-2xl space-y-2 border border-zinc-800 shadow-md">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    <div className="w-9 h-9 rounded-xl bg-amber-400/20 text-amber-400 flex items-center justify-center font-bold shrink-0">
                      <Volume2 className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="text-[10px] font-black text-amber-400 uppercase tracking-widest">6 AM Daily Trade Briefing</div>
                      <div className="text-xs font-bold text-white">Your Morning Commute Summary</div>
                    </div>
                  </div>
                  <button
                    onClick={() => setIsPlayingBriefingDemo(!isPlayingBriefingDemo)}
                    className="px-3.5 py-2 bg-amber-400 hover:bg-amber-300 text-zinc-950 rounded-xl text-xs font-bold flex items-center gap-1.5 shrink-0 transition-all active:scale-95 shadow-sm cursor-pointer"
                  >
                    <Volume2 className={`w-4 h-4 ${isPlayingBriefingDemo ? 'animate-pulse' : ''}`} />
                    {isPlayingBriefingDemo ? 'Playing Briefing...' : 'Play Briefing'}
                  </button>
                </div>
                <p className="text-[11px] text-zinc-400 leading-relaxed font-sans pt-1">
                  Listen to an AI voice summary of today's 3 booked site jobs, travel weather, Screwfix pickup alerts & MOT countdown while driving.
                </p>
              </div>
            </div>
          )}

          {/* STEP 3: QUOTES, INVOICING & 1-CLICK PAYMENTS */}
          {currentStep === 3 && (
            <div className="space-y-4">
              {/* Sub-Navigation Pill Bar */}
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="inline-flex items-center gap-1 bg-purple-50/70 dark:bg-purple-950/40 p-1 rounded-full border border-purple-200/60 dark:border-purple-900/60 shadow-xs">
                  <button
                    type="button"
                    onClick={() => setQuoteTourTab('quotes')}
                    className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-bold transition-all cursor-pointer ${
                      quoteTourTab === 'quotes'
                        ? 'bg-white dark:bg-zinc-900 text-zinc-900 dark:text-white shadow-xs border border-zinc-200/80 dark:border-zinc-700'
                        : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white'
                    }`}
                  >
                    <FileText className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400" />
                    <span>Quotes & Estimates (2)</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setQuoteTourTab('invoices')}
                    className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-bold transition-all cursor-pointer ${
                      quoteTourTab === 'invoices'
                        ? 'bg-white dark:bg-zinc-900 text-zinc-900 dark:text-white shadow-xs border border-zinc-200/80 dark:border-zinc-700'
                        : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white'
                    }`}
                  >
                    <Receipt className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400" />
                    <span>Invoices & CIS {quoteConvertedToInvoice ? '(2)' : '(1)'}</span>
                  </button>
                </div>

                <span className="text-[11px] font-bold text-purple-700 dark:text-purple-300 bg-purple-50 dark:bg-purple-950/40 px-3 py-1 rounded-full border border-purple-500/20">
                  {quoteTourTab === 'quotes' ? '📋 Professional PDF Quotes' : '💳 1-Click Invoices & CIS Deductions'}
                </span>
              </div>

              {/* VIEW 1: QUOTES & ESTIMATES */}
              {quoteTourTab === 'quotes' && (
                <div className="space-y-3.5">
                  {/* Top Action Bar */}
                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                    <div className="relative flex-1">
                      <Search className="w-4 h-4 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        readOnly
                        value="Search quotes by client, job name or address..."
                        className="w-full pl-9 pr-3 py-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl text-xs font-medium text-zinc-400 select-none shadow-xs focus:outline-none"
                      />
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        className="px-3.5 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-xs font-black uppercase tracking-wider flex items-center gap-1.5 shadow-xs cursor-pointer"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>NEW QUOTE</span>
                      </button>
                    </div>
                  </div>

                  {/* Interactive Quote Card #Q-1042 */}
                  <div className="p-4 bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 border-l-4 border-l-purple-500 shadow-sm space-y-3">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-xs text-purple-600 dark:text-purple-400">#Q-1042</span>
                        <h4 className="font-bold text-sm text-zinc-900 dark:text-white">EV Charger Installation</h4>
                        <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-full ${
                          quoteConvertedToInvoice 
                            ? 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400' 
                            : quoteDepositRecorded
                            ? 'bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400'
                            : 'bg-purple-50 dark:bg-purple-950/50 text-purple-600 dark:text-purple-400'
                        }`}>
                          {quoteConvertedToInvoice ? 'CONVERTED TO INVOICE' : quoteDepositRecorded ? 'DEPOSIT PAID (£230.40)' : 'SENT TO CLIENT'}
                        </span>
                      </div>
                      <span className="text-xs font-black text-zinc-900 dark:text-white">£1,152.00 inc VAT</span>
                    </div>

                    <div className="p-3 bg-zinc-50 dark:bg-zinc-800/40 rounded-xl space-y-1.5 text-xs">
                      <div className="flex justify-between text-zinc-600 dark:text-zinc-300">
                        <span>Client: Dave Harris • 14 Elm Road, Bristol</span>
                        <span className="font-mono text-zinc-400">07700 900123</span>
                      </div>
                      <div className="text-[11px] text-zinc-500">
                        Labour (£360) + Materials (£600) + 20% VAT (£192) • Standard 20% Deposit: £230.40
                      </div>
                    </div>

                    {/* Interactive Action Buttons */}
                    <div className="flex items-center gap-2 flex-wrap">
                      {!quoteDepositRecorded && (
                        <button
                          type="button"
                          onClick={() => setQuoteDepositRecorded(true)}
                          className="px-3 py-1.5 bg-blue-50 dark:bg-blue-950/50 hover:bg-blue-100 text-blue-700 dark:text-blue-300 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-xs"
                        >
                          <PoundSterling className="w-3.5 h-3.5" />
                          <span>Record £230.40 Deposit</span>
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => {
                          setQuoteConvertedToInvoice(true);
                          setQuoteTourTab('invoices');
                        }}
                        className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-xs active:scale-95"
                      >
                        <Receipt className="w-3.5 h-3.5" />
                        <span>⚡ Convert to Invoice (1-Click)</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => alert('Demo PDF Quote preview generated with your business header, VAT number and payment terms.')}
                        className="px-3 py-1.5 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 text-zinc-700 dark:text-zinc-200 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer"
                      >
                        <Download className="w-3.5 h-3.5" />
                        <span>Download PDF</span>
                      </button>
                    </div>
                  </div>

                  {/* Secondary Quote Card #Q-1043 */}
                  <div className="p-3.5 bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-xs flex items-center justify-between text-xs">
                    <div>
                      <div className="font-bold text-zinc-900 dark:text-white flex items-center gap-2">
                        <span className="font-mono text-zinc-400">#Q-1043</span>
                        <span>Full Rewire 3-Bed Semi</span>
                        <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase bg-emerald-50 text-emerald-600">
                          ACCEPTED
                        </span>
                      </div>
                      <div className="text-[11px] text-zinc-500 pt-0.5">Sarah Jenkins • Oakfield Road • £840.00 Deposit Logged</div>
                    </div>
                    <span className="font-black text-sm text-zinc-900 dark:text-white">£4,200.00</span>
                  </div>

                  {/* Bottom Prompter */}
                  <div className="p-3 bg-purple-50/70 dark:bg-purple-950/30 rounded-2xl border border-purple-200/60 dark:border-purple-900/40 flex items-center justify-between gap-2 text-xs">
                    <span className="text-purple-900 dark:text-purple-200 font-medium">
                      ✨ Click <strong>Convert to Invoice</strong> above to see how TribeTrade eliminates double data entry for UK trades.
                    </span>
                    <button
                      type="button"
                      onClick={() => setQuoteTourTab('invoices')}
                      className="px-3.5 py-1.5 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-xs font-bold shrink-0 transition-all cursor-pointer shadow-xs"
                    >
                      View Invoices →
                    </button>
                  </div>
                </div>
              )}

              {/* VIEW 2: INVOICES & CIS */}
              {quoteTourTab === 'invoices' && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between text-xs font-bold text-zinc-500">
                    <span>Tax Invoices & CIS Breakdown</span>
                    <button
                      type="button"
                      onClick={() => setQuoteTourTab('quotes')}
                      className="text-purple-600 hover:underline font-bold cursor-pointer"
                    >
                      ← Back to Quotes
                    </button>
                  </div>

                  {/* Converted Invoice Card */}
                  {quoteConvertedToInvoice ? (
                    <div className="p-4 bg-white dark:bg-zinc-900 rounded-2xl border border-emerald-500/40 border-l-4 border-l-emerald-500 shadow-sm space-y-3">
                      <div className="flex items-center justify-between flex-wrap gap-2">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-xs text-emerald-600">#INV-2090</span>
                          <h4 className="font-bold text-sm text-zinc-900 dark:text-white">EV Charger Installation (Dave Harris)</h4>
                          <span className="text-[9px] font-black uppercase px-2 py-0.5 rounded-full bg-amber-50 text-amber-700">
                            AWAITING PAYMENT
                          </span>
                        </div>
                        <span className="text-xs font-black text-emerald-600 dark:text-emerald-400">£1,152.00 Due</span>
                      </div>

                      <div className="p-3 bg-emerald-50/50 dark:bg-emerald-950/20 rounded-xl space-y-1 text-xs">
                        <div className="flex justify-between font-bold text-zinc-900 dark:text-white">
                          <span>Converted from Quote #Q-1042</span>
                          <span>BACS Payment Details Attached</span>
                        </div>
                        <p className="text-[11px] text-zinc-600 dark:text-zinc-300">
                          UK Bank Sort Code: 20-00-00 • Account: 12345678 • Payment terms: 14 days from completion.
                        </p>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-xs cursor-pointer"
                        >
                          Send Invoice via WhatsApp
                        </button>
                        <button
                          type="button"
                          className="px-3.5 py-1.5 bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-200 rounded-xl text-xs font-bold cursor-pointer"
                        >
                          Copy Payment Link
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="p-3.5 bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-xs flex items-center justify-between text-xs">
                      <div>
                        <div className="font-bold text-zinc-900 dark:text-white flex items-center gap-2">
                          <span className="font-mono text-zinc-400">#INV-2089</span>
                          <span>Kitchen Spotlights Installation</span>
                          <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase bg-emerald-50 text-emerald-600">
                            PAID IN FULL
                          </span>
                        </div>
                        <div className="text-[11px] text-zinc-500 pt-0.5">Mark Stevens • £480.00 received via BACS transfer</div>
                      </div>
                      <span className="font-black text-sm text-zinc-900 dark:text-white">£480.00</span>
                    </div>
                  )}

                  {/* CIS 20% Deduction Feature Pill */}
                  <div className="p-3 bg-zinc-50 dark:bg-zinc-800/40 rounded-2xl border border-zinc-200 dark:border-zinc-700 text-xs flex items-center justify-between">
                    <span className="text-zinc-600 dark:text-zinc-300">
                      <strong>HMRC CIS Compliance:</strong> Split materials and labour automatically with 20% or 30% contractor deductions.
                    </span>
                    <ShieldCheck className="w-5 h-5 text-emerald-500 shrink-0 ml-2" />
                  </div>
                </div>
              )}
            </div>
          )}

          {/* STEP 4: EXPENSES, RECEIPT OCR & HMRC MTD TAX PREP */}
          {currentStep === 4 && (
            <div className="space-y-3">
              <div className="bg-zinc-50/70 dark:bg-zinc-950/60 rounded-2xl p-3 sm:p-4 border border-zinc-200/80 dark:border-zinc-800 space-y-3 shadow-sm">
                {/* 1. Header */}
                <div className="flex items-center justify-between gap-3 pb-2 border-b border-zinc-200/60 dark:border-zinc-800">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-9 h-9 bg-sky-100 dark:bg-sky-950/60 rounded-xl flex items-center justify-center text-sky-600 dark:text-sky-400 shrink-0">
                      <Calculator className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <h3 className="text-sm font-extrabold text-slate-900 dark:text-white leading-tight truncate">
                        Trade Expenses & Merchant Receipt OCR
                      </h3>
                      <p className="text-[10px] text-slate-500 dark:text-slate-400 truncate">
                        Instant 20% VAT Extraction • <span className="text-emerald-600 dark:text-emerald-400 font-bold">50 AI Scans Available Today</span>
                      </p>
                    </div>
                  </div>
                  <span className="px-2.5 py-1 bg-sky-50 dark:bg-sky-950/50 text-sky-700 dark:text-sky-300 rounded-lg text-[10px] font-bold shrink-0">
                    HMRC MTD Ready
                  </span>
                </div>

                {/* 2. Merchant Selector Bar */}
                <div className="space-y-1">
                  <span className="text-[9px] font-black text-zinc-400 uppercase tracking-widest px-1">SELECT MERCHANT TILL SLIP TO SCAN</span>
                  <div className="bg-white dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800 p-0.5 rounded-xl flex gap-1 overflow-x-auto">
                    {(['Screwfix', 'Toolstation', 'Travis Perkins', 'Shell Fuel', 'CEF'] as const).map((m) => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => handleTriggerReceiptOcr(m)}
                        className={`flex-1 py-1.5 px-2 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all shrink-0 cursor-pointer ${
                          selectedReceiptMerchant === m
                            ? 'bg-sky-600 text-white shadow-xs'
                            : 'text-zinc-600 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-white'
                        }`}
                      >
                        {m}
                      </button>
                    ))}
                  </div>
                </div>

                {/* 3. Interactive OCR Receipt Card */}
                <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-3.5 shadow-xs space-y-2.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Receipt className="w-4 h-4 text-sky-600" />
                      <span className="text-xs font-bold text-zinc-900 dark:text-white">
                        {selectedReceiptMerchant} Bristol South Branch
                      </span>
                    </div>
                    <span className="text-[10px] text-zinc-400">Till Slip #SC-9821 • 22 Oct 2026</span>
                  </div>

                  {receiptOcrScanning ? (
                    <div className="py-6 text-center space-y-2 bg-sky-50 dark:bg-sky-950/20 rounded-xl">
                      <RefreshCw className="w-6 h-6 animate-spin text-sky-500 mx-auto" />
                      <p className="text-xs font-bold text-sky-700 dark:text-sky-300">Scanning till receipt with camera OCR...</p>
                    </div>
                  ) : (
                    <div className="space-y-1.5 text-xs">
                      <div className="flex justify-between text-zinc-600 dark:text-zinc-300">
                        <span>25m 6mm² 3-Core SWA Armoured Cable</span>
                        <span className="font-semibold text-zinc-900 dark:text-white">£89.00</span>
                      </div>
                      <div className="flex justify-between text-zinc-600 dark:text-zinc-300">
                        <span>40A Type A 30mA Single Module RCBO</span>
                        <span className="font-semibold text-zinc-900 dark:text-white">£30.00</span>
                      </div>
                      <div className="pt-2 border-t border-zinc-100 dark:border-zinc-800 flex justify-between items-center text-[11px]">
                        <span className="text-zinc-500">Net: £119.00 • Reclaimable 20% VAT: £23.80</span>
                        <span className="font-black text-xs text-sky-600 dark:text-sky-400">Total: £142.80</span>
                      </div>
                    </div>
                  )}

                  <div className="p-2 bg-emerald-50 dark:bg-emerald-950/30 rounded-lg flex items-center justify-between text-[11px] text-emerald-800 dark:text-emerald-300">
                    <span className="flex items-center gap-1.5 font-bold">
                      <Check className="w-3.5 h-3.5 text-emerald-600 stroke-[3]" />
                      Auto-categorised as Job Material Expense (Reclaimable)
                    </span>
                    <span className="text-[10px] font-mono">20% VAT £23.80</span>
                  </div>
                </div>

                {/* 4. HMRC Self-Assessment Tax Forecast Widget */}
                <div className="p-3 bg-gradient-to-r from-sky-500/10 via-blue-500/5 to-indigo-500/10 rounded-xl border border-sky-500/20 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-black text-sky-800 dark:text-sky-300 uppercase tracking-widest flex items-center gap-1.5">
                      <ShieldCheck className="w-3.5 h-3.5 text-sky-600" />
                      Live HMRC Self-Assessment Tax Forecast
                    </span>
                    <span className="text-[10px] font-bold text-sky-700 dark:text-sky-300">2026/27 Tax Year</span>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center text-xs">
                    <div className="p-2 bg-white/80 dark:bg-zinc-900 rounded-lg border border-sky-200/50 dark:border-zinc-800">
                      <div className="text-[9px] text-zinc-400 uppercase">Gross Invoiced</div>
                      <div className="font-bold text-zinc-900 dark:text-white">£14,850</div>
                    </div>
                    <div className="p-2 bg-white/80 dark:bg-zinc-900 rounded-lg border border-sky-200/50 dark:border-zinc-800">
                      <div className="text-[9px] text-zinc-400 uppercase">Expenses & Stock</div>
                      <div className="font-bold text-rose-600">-£3,620</div>
                    </div>
                    <div className="p-2 bg-white/80 dark:bg-zinc-900 rounded-lg border border-sky-200/50 dark:border-zinc-800">
                      <div className="text-[9px] text-zinc-400 uppercase">Taxable Profit</div>
                      <div className="font-bold text-zinc-900 dark:text-white">£11,230</div>
                    </div>
                    <div className="p-2 bg-white/80 dark:bg-zinc-900 rounded-lg border border-sky-200/50 dark:border-zinc-800">
                      <div className="text-[9px] text-zinc-400 uppercase">Tax Pot (Set Aside)</div>
                      <div className="font-bold text-emerald-600">£2,807</div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-1">
                    <span className="text-[10px] text-zinc-500">
                      Calculates 20% basic rate Income Tax + Class 4 National Insurance.
                    </span>
                    <button
                      type="button"
                      onClick={() => alert('Downloaded HMRC Making Tax Digital (MTD) CSV with date, merchant, net, VAT, and expense category.')}
                      className="px-3 py-1 bg-sky-600 hover:bg-sky-700 text-white rounded-lg text-[10px] font-bold flex items-center gap-1 cursor-pointer transition-all shadow-xs"
                    >
                      <Download className="w-3 h-3" />
                      Export MTD CSV
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* STEP 5: TRADE BUSINESS SETUP GUIDE */}
          {currentStep === 5 && (
            <div className="space-y-4">
              {/* Tour Complete Celebration Banner */}
              <div className="bg-emerald-50/80 dark:bg-emerald-950/30 p-3.5 rounded-2xl border border-emerald-500/30 flex items-center justify-between text-xs">
                <div className="flex items-center gap-2.5">
                  <span className="text-lg">🎉</span>
                  <div>
                    <div className="font-bold text-emerald-900 dark:text-emerald-200">Interactive Tour Complete!</div>
                    <div className="text-[11px] text-emerald-700 dark:text-emerald-300">Configure your business profile to get maximum benefit from TribeTrade.</div>
                  </div>
                </div>
                <span className="text-[10px] font-bold bg-emerald-600 text-white px-2.5 py-0.5 rounded-full shadow-sm">Setup Guide</span>
              </div>

              {/* Trading Name & Tradecraft Section */}
              <div className="bg-emerald-50/60 dark:bg-emerald-950/20 p-4 rounded-2xl border border-emerald-500/20 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-[10px] font-bold tracking-wider uppercase text-emerald-600 dark:text-emerald-400 block mb-0.5">
                      Business Identity
                    </span>
                    <h4 className="text-xs sm:text-sm font-black text-zinc-900 dark:text-white">
                      What is your trade business called?
                    </h4>
                    <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5">
                      Your trading name used on client quotes, tax invoices, and morning audio briefings.
                    </p>
                  </div>
                  {savedBusinessNameSuccess && (
                    <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-100/80 dark:bg-emerald-900/50 px-2.5 py-0.5 rounded-full animate-fade-in">
                      <Check className="w-3 h-3 stroke-[3]" />
                      Saved
                    </span>
                  )}
                </div>

                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <input
                      type="text"
                      value={tourBusinessName}
                      onChange={(e) => {
                        setTourBusinessName(e.target.value);
                        setSavedBusinessNameSuccess(false);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          handleSaveBusinessName();
                        }
                      }}
                      placeholder="e.g. Apex Electrical & Solar, Harris & Sons Plumbing"
                      className="w-full px-3.5 py-2.5 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-xl text-xs sm:text-sm text-zinc-900 dark:text-white placeholder:text-zinc-400 focus:ring-2 focus:ring-emerald-500 outline-none transition-all shadow-xs"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={handleSaveBusinessName}
                    disabled={isSavingBusinessName || !tourBusinessName.trim()}
                    className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-xs uppercase tracking-wider transition-all disabled:opacity-50 active:scale-95 flex items-center gap-1.5 shrink-0 shadow-xs cursor-pointer"
                  >
                    {isSavingBusinessName ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : savedBusinessNameSuccess ? (
                      <Check className="w-3.5 h-3.5 stroke-[3]" />
                    ) : (
                      <Save className="w-3.5 h-3.5" />
                    )}
                    {savedBusinessNameSuccess ? 'Saved' : 'Save'}
                  </button>
                </div>

                {/* Tradecraft Chips */}
                <div className="space-y-1 pt-1">
                  <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block">Primary Tradecraft</span>
                  <div className="flex flex-wrap gap-1.5">
                    {['Electrician', 'Plumbing & Heating', 'Carpentry', 'General Building', 'Roofing', 'Painting & Decorating'].map((craft) => (
                      <button
                        key={craft}
                        type="button"
                        onClick={() => {
                          setTourTradeCraft(craft);
                          saveTourBusinessName();
                        }}
                        className={`px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all cursor-pointer ${
                          tourTradeCraft === craft
                            ? 'bg-emerald-600 text-white shadow-xs'
                            : 'bg-white dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 border border-zinc-200/80 dark:border-zinc-700 hover:bg-zinc-100'
                        }`}
                      >
                        {craft}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* 6-Digit Crew & Apprentice Join Code */}
              <div className="bg-gradient-to-r from-blue-500/10 to-cyan-500/10 p-4 rounded-2xl border border-blue-500/20 space-y-3">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div>
                    <span className="text-[10px] font-bold tracking-wider uppercase text-blue-600 dark:text-blue-400 block mb-0.5">
                      Your 6-Digit Crew & Apprentice Join Code
                    </span>
                    <div className="font-mono text-2xl font-black text-blue-700 dark:text-blue-300 tracking-[0.2em]">
                      {tourInviteCode}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={handleCopyCodeDemo}
                      className="px-3 py-2 bg-white dark:bg-zinc-800 text-zinc-700 dark:text-zinc-200 rounded-xl text-xs font-bold shadow-sm border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-50 transition-all flex items-center gap-1.5 active:scale-95 cursor-pointer"
                    >
                      <Copy className="w-3.5 h-3.5 text-blue-600" />
                      {copiedCodeDemo ? 'Copied!' : 'Copy Code'}
                    </button>
                    <button
                      type="button"
                      onClick={handleShareCodeDemo}
                      className="px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-md transition-all flex items-center gap-1.5 shrink-0 active:scale-95 cursor-pointer"
                    >
                      <Share2 className="w-3.5 h-3.5" />
                      {sharedCodeDemo ? 'Link Copied!' : 'Share Crew Link'}
                    </button>
                  </div>
                </div>
                <p className="text-[11px] text-zinc-600 dark:text-zinc-300 leading-relaxed border-t border-blue-500/10 pt-2">
                  Apprentices, subbies or office managers can join your trade hub in 1 step to view today's jobs, access site notes, and log materials from the van.
                </p>
              </div>

              {/* Quick Setup Direct Links */}
              <div className="space-y-2 pt-1">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block">
                    Jump Straight to Setup Pages
                  </span>
                  <span className="text-[10px] text-zinc-500">Click any card to configure</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                  <button
                    type="button"
                    onClick={async () => {
                      if (tourBusinessName.trim() && !savedBusinessNameSuccess) {
                        await saveTourBusinessName();
                      }
                      onClose?.();
                      onSelectAction?.('settings', { tab: 'business' });
                    }}
                    className="p-3 bg-white dark:bg-zinc-800/80 hover:bg-emerald-50/50 dark:hover:bg-emerald-950/20 border border-zinc-200 dark:border-zinc-700 hover:border-emerald-500/40 rounded-2xl text-left transition-all group shadow-2xs active:scale-[0.98] cursor-pointer"
                  >
                    <div className="flex items-center gap-2.5 mb-1.5">
                      <div className="w-7 h-7 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0 group-hover:bg-emerald-500 group-hover:text-white transition-colors">
                        <Building className="w-3.5 h-3.5" />
                      </div>
                      <div className="font-bold text-xs text-zinc-900 dark:text-white group-hover:text-emerald-600 dark:group-hover:text-emerald-400 truncate">
                        Business & Rates
                      </div>
                    </div>
                    <p className="text-[10px] text-zinc-500 dark:text-zinc-400 line-clamp-2 leading-relaxed">
                      Trading name, business address, and BACS bank details for PDF quotes.
                    </p>
                  </button>

                  <button
                    type="button"
                    onClick={async () => {
                      if (tourBusinessName.trim() && !savedBusinessNameSuccess) {
                        await saveTourBusinessName();
                      }
                      onClose?.();
                      onSelectAction?.('settings', { tab: 'billing' });
                    }}
                    className="p-3 bg-white dark:bg-zinc-800/80 hover:bg-emerald-50/50 dark:hover:bg-emerald-950/20 border border-zinc-200 dark:border-zinc-700 hover:border-emerald-500/40 rounded-2xl text-left transition-all group shadow-2xs active:scale-[0.98] cursor-pointer"
                  >
                    <div className="flex items-center gap-2.5 mb-1.5">
                      <div className="w-7 h-7 rounded-xl bg-purple-500/10 text-purple-600 dark:text-purple-400 flex items-center justify-center shrink-0 group-hover:bg-purple-600 group-hover:text-white transition-colors">
                        <CreditCard className="w-3.5 h-3.5" />
                      </div>
                      <div className="font-bold text-xs text-zinc-900 dark:text-white group-hover:text-purple-600 dark:group-hover:text-purple-400 truncate">
                        Subscription & Plan
                      </div>
                    </div>
                    <p className="text-[10px] text-zinc-500 dark:text-zinc-400 line-clamp-2 leading-relaxed">
                      Trial status, monthly or yearly plan, and Stripe invoice billing.
                    </p>
                  </button>

                  <button
                    type="button"
                    onClick={async () => {
                      if (tourBusinessName.trim() && !savedBusinessNameSuccess) {
                        await saveTourBusinessName();
                      }
                      onClose?.();
                      onSelectAction?.('settings', { tab: 'fleet' });
                    }}
                    className="p-3 bg-white dark:bg-zinc-800/80 hover:bg-emerald-50/50 dark:hover:bg-emerald-950/20 border border-zinc-200 dark:border-zinc-700 hover:border-emerald-500/40 rounded-2xl text-left transition-all group shadow-2xs active:scale-[0.98] cursor-pointer"
                  >
                    <div className="flex items-center gap-2.5 mb-1.5">
                      <div className="w-7 h-7 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0 group-hover:bg-amber-500 group-hover:text-white transition-colors">
                        <Truck className="w-3.5 h-3.5" />
                      </div>
                      <div className="font-bold text-xs text-zinc-900 dark:text-white group-hover:text-amber-600 dark:group-hover:text-amber-400 truncate">
                        Fleet & Van MOT
                      </div>
                    </div>
                    <p className="text-[10px] text-zinc-500 dark:text-zinc-400 line-clamp-2 leading-relaxed">
                      Vehicle registrations, MOT expiry dates, and service interval reminders.
                    </p>
                  </button>

                  <button
                    type="button"
                    onClick={async () => {
                      if (tourBusinessName.trim() && !savedBusinessNameSuccess) {
                        await saveTourBusinessName();
                      }
                      onClose?.();
                      onSelectAction?.('settings', { tab: 'accounts' });
                    }}
                    className="p-3 bg-white dark:bg-zinc-800/80 hover:bg-emerald-50/50 dark:hover:bg-emerald-950/20 border border-zinc-200 dark:border-zinc-700 hover:border-emerald-500/40 rounded-2xl text-left transition-all group shadow-2xs active:scale-[0.98] cursor-pointer"
                  >
                    <div className="flex items-center gap-2.5 mb-1.5">
                      <div className="w-7 h-7 rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0 group-hover:bg-blue-600 group-hover:text-white transition-colors">
                        <Mail className="w-3.5 h-3.5" />
                      </div>
                      <div className="font-bold text-xs text-zinc-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400 truncate">
                        Email & Calendar Sync
                      </div>
                    </div>
                    <p className="text-[10px] text-zinc-500 dark:text-zinc-400 line-clamp-2 leading-relaxed">
                      Sync Gmail, Google Calendar, Outlook, Apple or Yahoo bookings.
                    </p>
                  </button>

                  <button
                    type="button"
                    onClick={async () => {
                      if (tourBusinessName.trim() && !savedBusinessNameSuccess) {
                        await saveTourBusinessName();
                      }
                      onClose?.();
                      onSelectAction?.('quotes');
                    }}
                    className="p-3 bg-white dark:bg-zinc-800/80 hover:bg-emerald-50/50 dark:hover:bg-emerald-950/20 border border-zinc-200 dark:border-zinc-700 hover:border-emerald-500/40 rounded-2xl text-left transition-all group shadow-2xs active:scale-[0.98] cursor-pointer"
                  >
                    <div className="flex items-center gap-2.5 mb-1.5">
                      <div className="w-7 h-7 rounded-xl bg-teal-500/10 text-teal-600 dark:text-teal-400 flex items-center justify-center shrink-0 group-hover:bg-teal-600 group-hover:text-white transition-colors">
                        <Receipt className="w-3.5 h-3.5" />
                      </div>
                      <div className="font-bold text-xs text-zinc-900 dark:text-white group-hover:text-teal-600 dark:group-hover:text-teal-400 truncate">
                        Invoicing & Day Rates
                      </div>
                    </div>
                    <p className="text-[10px] text-zinc-500 dark:text-zinc-400 line-clamp-2 leading-relaxed">
                      Customise labor day rates, quotation markup, and invoice payment terms.
                    </p>
                  </button>

                  <button
                    type="button"
                    onClick={handleGoToPinSetup}
                    className="p-3 bg-white dark:bg-zinc-800/80 hover:bg-emerald-50/50 dark:hover:bg-emerald-950/20 border border-zinc-200 dark:border-zinc-700 hover:border-emerald-500/40 rounded-2xl text-left transition-all group shadow-2xs active:scale-[0.98] cursor-pointer"
                  >
                    <div className="flex items-center gap-2.5 mb-1.5">
                      <div className="w-7 h-7 rounded-xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0 group-hover:bg-indigo-600 group-hover:text-white transition-colors">
                        <Lock className="w-3.5 h-3.5" />
                      </div>
                      <div className="font-bold text-xs text-zinc-900 dark:text-white group-hover:text-indigo-600 dark:group-hover:text-indigo-400 truncate">
                        Tablet PIN Security
                      </div>
                    </div>
                    <p className="text-[10px] text-zinc-500 dark:text-zinc-400 line-clamp-2 leading-relaxed">
                      Lock sensitive financials on shared van tablets or site devices.
                    </p>
                  </button>
                </div>
              </div>

              {/* Site Whiteboard Notice */}
              <div className="p-3.5 bg-zinc-50 dark:bg-zinc-800/50 rounded-2xl border border-zinc-200 dark:border-zinc-700 text-xs flex items-start gap-2.5">
                <div className="p-2 bg-amber-100 dark:bg-amber-900/40 text-amber-600 dark:text-amber-400 rounded-xl font-bold shrink-0">
                  📌
                </div>
                <div>
                  <div className="font-bold text-zinc-900 dark:text-zinc-100">Trade Site & Van Whiteboard Ready</div>
                  <div className="text-[11px] text-zinc-600 dark:text-zinc-300 leading-relaxed mt-0.5">
                    Right at the top of your Hub sits your Trade Whiteboard. Post quick site gate codes, key box locations, or merchant pickup slips that sync instantly across all team devices.
                  </div>
                </div>
              </div>

              {/* Guidance Prompt */}
              <div className="p-4 bg-zinc-50 dark:bg-zinc-800/60 rounded-2xl border border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-200 text-xs md:text-sm font-semibold flex items-center gap-3 shadow-sm">
                <span className="text-xl shrink-0">💡</span>
                <p className="leading-relaxed">
                  You can finish setup anytime from Trade Settings, but configuring your trading name now ensures professional PDF quotes from day one!
                </p>
              </div>
            </div>
          )}
        </div>

        {/* STEP NAVIGATION BUTTONS (PINNED FOOTER) */}
        <div className="shrink-0 bg-white/95 dark:bg-zinc-900/95 backdrop-blur-md px-5 sm:px-7 md:px-8 py-3.5 sm:py-4 border-t border-zinc-100 dark:border-zinc-800">
          <div className="flex items-center justify-between">
            {/* Dots Indicator */}
            <div className="flex items-center gap-1.5">
              {tourSteps.map((_, i) => (
                <button
                  key={i}
                  onClick={() => setCurrentStep(i)}
                  className={`h-2 rounded-full transition-all ${
                    i === currentStep ? 'w-6 bg-emerald-500' : 'w-2 bg-zinc-200 dark:bg-zinc-700 hover:bg-zinc-300'
                  }`}
                />
              ))}
            </div>

            {/* Navigation Buttons */}
            <div className="flex items-center gap-3">
              {currentStep > 0 && (
                <button
                  onClick={() => setCurrentStep(prev => prev - 1)}
                  className="px-4 py-2.5 rounded-xl text-xs font-semibold text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
                >
                  Back
                </button>
              )}

              {isTryTribeView ? (
                currentStep === 4 ? (
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setCurrentStep(0)}
                      className="px-4 py-2.5 rounded-xl text-xs font-semibold text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
                    >
                      Restart Tour
                    </button>
                    <a
                      href="/?action=signup"
                      className="px-5 py-2.5 rounded-xl text-xs font-bold text-white shadow-lg bg-emerald-600 hover:bg-emerald-700 transition-all flex items-center gap-2 active:scale-98"
                    >
                      <Check className="w-4 h-4 stroke-[3]" />
                      Start 14-Day Free Trial
                    </a>
                  </div>
                ) : (
                  <button
                    onClick={() => setCurrentStep(prev => prev + 1)}
                    className={`px-5 py-2.5 rounded-xl text-xs font-bold text-white shadow-md bg-gradient-to-r ${activeStep.color} hover:brightness-110 active:scale-98 transition-all flex items-center gap-1.5 cursor-pointer`}
                  >
                    Next Step
                    <ArrowRight className="w-4 h-4" />
                  </button>
                )
              ) : currentStep === 4 ? (
                <button
                  onClick={() => setCurrentStep(5)}
                  className="px-5 py-2.5 rounded-xl text-xs font-bold text-white shadow-md bg-gradient-to-r from-sky-500 to-blue-600 hover:brightness-110 active:scale-98 transition-all flex items-center gap-1.5 cursor-pointer"
                >
                  Complete Tour & View Setup Guide
                  <ArrowRight className="w-4 h-4" />
                </button>
              ) : currentStep === 5 ? (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={async () => {
                      if (tourBusinessName.trim() && !savedBusinessNameSuccess) {
                        await saveTourBusinessName();
                      }
                      onClose?.();
                    }}
                    className="px-3.5 py-2.5 rounded-xl text-xs font-semibold text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
                  >
                    Skip for Now
                  </button>
                  <button
                    type="button"
                    onClick={handleFinishSetup}
                    className="px-5 py-2.5 rounded-xl text-xs font-bold text-white shadow-lg bg-emerald-600 hover:bg-emerald-700 transition-all flex items-center gap-2 active:scale-98 cursor-pointer"
                  >
                    <Check className="w-4 h-4 stroke-[3]" />
                    Finish Setup & Launch Trade Hub
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setCurrentStep(prev => prev + 1)}
                  className={`px-5 py-2.5 rounded-xl text-xs font-bold text-white shadow-md bg-gradient-to-r ${activeStep.color} hover:brightness-110 active:scale-98 transition-all flex items-center gap-1.5 cursor-pointer`}
                >
                  Next Step
                  <ArrowRight className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
        </div>
    </div>
  );

  if (isEmbedded) {
    return (
      <div className="w-full">
        {tourCardContent}
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-zinc-950/85 backdrop-blur-xl p-4 overflow-y-auto">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 15 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: -15 }}
        transition={{ duration: 0.25 }}
        className="w-full max-w-2xl my-auto"
      >
        {tourCardContent}
      </motion.div>
    </div>
  );
}
