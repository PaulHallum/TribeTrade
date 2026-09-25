import { useState } from 'react';
import { 
  BookOpen, 
  HelpCircle, 
  Check, 
  X, 
  Sparkles, 
  Mic, 
  FileText, 
  Receipt, 
  Mail, 
  Calendar, 
  CheckSquare, 
  LayoutDashboard, 
  Shield, 
  Palette,
  ArrowRight,
  ChevronDown,
  ChevronUp,
  Loader2,
  Smartphone,
  CreditCard,
  Pin,
  Truck,
  Package,
  Wrench,
  Calculator
} from 'lucide-react';
import { motion } from 'motion/react';
import PageHeader from '../common/PageHeader';
import { useAuth } from '../../App';
import { useToast } from '../../contexts/ToastContext';
import { useSubscriptionTier } from '../../hooks/useSubscriptionTier';
import { useRef, useEffect } from 'react';

export default function GuideView({ 
  isOnboarding = false, 
  onFinishOnboarding 
}: { 
  isOnboarding?: boolean;
  onFinishOnboarding?: () => void;
}) {
  const [hasReachedBottom, setHasReachedBottom] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const [activeTab, setActiveTab] = useState<'how-to' | 'tiers'>('how-to');
  const [privacyExpanded, setPrivacyExpanded] = useState(false);
  const { user } = useAuth();
  const { showToast } = useToast();
  const { subscriptionTier, isTrial } = useSubscriptionTier();
  const [loadingCheckout, setLoadingCheckout] = useState(false);

  const handleUpgrade = async (plan: 'monthly' | 'yearly' = 'monthly') => {
    if (!user) {
      showToast('Please sign in to upgrade.', 'error');
      return;
    }
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

  const guides = [
    {
      title: 'Installing on iOS & Android (PWA)',
      icon: Smartphone,
      color: 'text-teal-500 bg-teal-50 dark:bg-teal-950/20',
      description: 'Install TribeTrade directly to your home screen for rapid offline-resilient access on the job site.',
      steps: [
        'On iOS (iPhone/iPad): Open Safari, navigate to TribeTrade, tap the "Share" icon at the bottom, and select "Add to Home Screen".',
        'On Android: Open Chrome, navigate to TribeTrade, tap the three dots in the top right, and select "Install app" or "Add to Home screen".',
        'Once added, launch TribeTrade directly from your home screen just like a native app with zero browser toolbars.',
        'Runs seamlessly on site, in the van, or at home, with automatic local caching and background synchronisation.',
        'Note: Push notifications on iOS require adding the app to your home screen.'
      ]
    },
    {
      title: 'Smart Convert & Magic Mic',
      icon: Sparkles,
      color: 'text-amber-500 bg-amber-50 dark:bg-amber-950/20',
      description: 'Turn unstructured text, WhatsApp messages, or spoken audio into quotes, jobs, and tasks in seconds.',
      steps: [
        'Tap the "Smart Convert" button or the Magic Mic button at the bottom of the screen while in the van or on site.',
        'Speak or paste naturally: "Quote for Dave for bathroom tiling, 2 days labour at £250 and £80 for grout and adhesive."',
        'Gemini AI extracts client names, job titles, labour days, and consumable items into structured quote items.',
        'Review the processed preview to adjust rates, dates, and details before saving or sharing with the client in one click.'
      ]
    },
    {
      title: 'Centralised Hub & 6 AM Morning Briefing',
      icon: LayoutDashboard,
      color: 'text-emerald-500 bg-emerald-50 dark:bg-emerald-950/20',
      description: 'Your morning trade control centre. Get an instant overview of jobs, weather on site, and pending quotes.',
      steps: [
        'Open the Hub to see today\'s scheduled site visits, urgent tasks, van MOT/tax status, and live revenue tracking.',
        'Tap "Briefing" (Sparkles icon) in the Hub header to trigger Gemini AI to synthesise your day into a concise trade update.',
        'Listen to your audio briefing directly on your van speakers while driving to your first job.',
        'Includes site weather forecasts so you know when outdoor jobs need sheeting or indoor work should be prioritised.'
      ]
    },
    {
      title: 'Professional Quotes & Estimates',
      icon: FileText,
      color: 'text-blue-500 bg-blue-50 dark:bg-blue-950/20',
      description: 'Create, customise, and issue polished trade quotes with labour, materials, VAT, and deposit terms.',
      steps: [
        'Navigate to Quotes and tap "+ New Quote" to start a new estimate or survey write-up.',
        'Add line items for Labour (day rate or hourly) and Materials with transparent trade markups.',
        'Configure VAT (20%, 5%, 0% / Exempt) and specify 20% deposit requirements or CIS reverse charge notes.',
        'Download instant branded PDF documents or share secure client viewing links via WhatsApp and Email.',
        'Track quote progression seamlessly from Draft to Sent, Accepted, and Invoiced.'
      ]
    },
    {
      title: '1-Click Invoicing & Payments',
      icon: Receipt,
      color: 'text-emerald-500 bg-emerald-50 dark:bg-emerald-950/20',
      description: 'Convert accepted quotes into formal VAT invoices instantly and track customer payments.',
      steps: [
        'When a client accepts your quote, tap "Convert to Invoice" to generate an invoice in one click.',
        'All client details, line items, VAT rates, and terms carry over automatically without retyping.',
        'Include payment terms, bank transfer details (sort code and account number), and CIS deductions suffered.',
        'Export professional PDF invoices ready to email or send directly to the client\'s phone.',
        'Mark invoices as Paid upon receipt of funds to keep trade cash flow records up to date.'
      ]
    },
    {
      title: 'Trade Calendar & Job Scheduling',
      icon: Calendar,
      color: 'text-indigo-500 bg-indigo-50 dark:bg-indigo-950/20',
      description: 'Organise site visits, surveys, and emergency callouts with colour-coded trade categories.',
      steps: [
        'Navigate to the Calendar view to view your day, week, or month at a glance.',
        'Categorise bookings by Site Work, Survey/Quote, Emergency Callout, or Vehicle/Admin.',
        'Enable 2-way Google Calendar synchronisation to keep personal and business calendars aligned.',
        'Tap any appointment to view customer contact details, postcodes, and linked quote documents.'
      ]
    },
    {
      title: 'Expenses & Receipt OCR',
      icon: Calculator,
      color: 'text-amber-500 bg-amber-50 dark:bg-amber-950/20',
      description: 'Snap photos of till receipts from trade merchants and automatically log allowable business expenses.',
      steps: [
        'Go to Expenses and tap "Scan Receipt" (or tap the camera button next to Magic Mic).',
        'Photograph till slips or merchant invoices from Screwfix, Toolstation, Travis Perkins, or fuel stations.',
        'TribeTrade\'s AI extracts merchant name, date, gross total, VAT amount, and HMRC SA103 expense category.',
        'Review the extracted details and tap Save to record the transaction instantly into your tax records.'
      ]
    },
    {
      title: 'HMRC Self-Assessment & MTD Export',
      icon: Calculator,
      color: 'text-rose-500 bg-rose-50 dark:bg-rose-950/20',
      description: 'Real-time tax liability forecasting, CIS deduction offsets, and Making Tax Digital (MTD) CSV export.',
      steps: [
        'Open the Self-Assessment & Tax breakdown inside the Expenses tab.',
        'View live Net Trading Profit, estimated Basic/Higher Rate Income Tax, and Class 4 National Insurance.',
        'Track CIS deductions suffered at source to see whether you owe an HMRC balance or are due a tax refund.',
        'Get a recommended monthly tax savings pot estimate so you are never caught out in January.',
        'Export a fully compliant Making Tax Digital (MTD) CSV spreadsheet ready for your accountant in 1 click.'
      ]
    },
    {
      title: 'Materials & Van Stock (The Shed)',
      icon: Package,
      color: 'text-violet-500 bg-violet-50 dark:bg-violet-950/20',
      description: 'Track consumables, van inventory, and compile trade pick lists before heading to the merchants.',
      steps: [
        'Navigate to Supplies to access your trade Pick List and "The Shed" consumables inventory.',
        'Add materials needed for upcoming jobs with quantities, merchant references, and estimated prices.',
        'Check off items at trade counters like Screwfix or Selco with a clean, touch-friendly mobile checklist.',
        'Keep tabs on frequently used van stock (screws, cable, pipe fittings, sealant) so you never run out on site.'
      ]
    },
    {
      title: 'Van & Fleet Maintenance Tracking',
      icon: Truck,
      color: 'text-sky-500 bg-sky-50 dark:bg-sky-950/20',
      description: 'Keep your work van legal and roadworthy with automated MOT, road tax, and service reminders.',
      steps: [
        'Open Settings > Vehicle Maintenance to record your work van\'s registration, MOT expiry, and service intervals.',
        'TribeTrade schedules automated calendar reminders 30 days and 7 days prior to MOT and road tax expiry.',
        'Log maintenance costs and replacement tyres directly into allowable vehicle expenses.',
        'Track business mileage for HMRC simplified vehicle expense claims (45p/mile).'
      ]
    }
  ];

  const pricingFeatures = [
    { name: 'Daily AI Limit (Briefings, Magic Mic, Quote Parsing, Breakdowns)', free: '0 requests / day (Manual only)', premium: '50 requests / day (Fair Use)', highlight: true },
    { name: 'Professional Quotes & Estimates', free: 'Up to 3 active quotes', premium: 'Unlimited Quotes & Estimates', highlight: true },
    { name: '1-Click Quote-to-Invoice Conversion', free: 'Basic manual invoice', premium: 'Unlimited 1-Click Conversions', highlight: true },
    { name: 'Instant PDF Generation & WhatsApp/Client Sharing', free: 'Standard PDF', premium: 'Branded PDF with 20% Deposit & CIS', highlight: true },
    { name: 'Receipt OCR & Till Slip Scanning (Screwfix, Shell, etc.)', free: 'Manual entry only', premium: 'Unlimited AI Receipt OCR', highlight: true },
    { name: '6 AM Trade Morning Briefing & Studio Voice Narration', free: 'Not included', premium: 'Daily AI Briefing + Studio HD Audio', highlight: true },
    { name: 'Magic Mic Hands-Free Van Voice Assistant', free: 'Manual typing only', premium: 'Full Natural Language Voice AI', highlight: true },
    { name: 'HMRC Self-Assessment Tax & CIS Calculation', free: 'Basic totals', premium: 'Full SA103 Liability, NI & CIS Offset', highlight: true },
    { name: 'Making Tax Digital (MTD) Accountant CSV Export', free: 'Not included', premium: '1-Click Compliant CSV Export', highlight: true },
    { name: 'Trade Materials Pick List & "The Shed" Van Stock', free: 'Max 25 items', premium: 'Unlimited Materials & Van Inventory', highlight: true },
    { name: 'Vehicle MOT, Road Tax & Service Reminder Alerts', free: 'Manual logging', premium: 'Automated Calendar & Push Alerts', highlight: true },
    { name: '2-Way Google Calendar Synchronisation', free: 'In-app calendar only', premium: 'Real-Time 2-Way Google Calendar Sync' },
    { name: 'Custom Trade Accent Themes & Branding', free: 'Light & Dark Mode only', premium: 'All 9 Trade Accent Palettes' },
    { name: 'Work Tablet PIN Security Lock Gate', free: 'Enabled', premium: 'Enabled' }
  ];

  useEffect(() => {
    if (!isOnboarding || !bottomRef.current) return;
    
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setHasReachedBottom(true);
        }
      },
      { threshold: 1.0 }
    );
    
    observer.observe(bottomRef.current);
    return () => observer.disconnect();
  }, [isOnboarding]);

  return (
    <div className={`max-w-4xl mx-auto px-4 ${isOnboarding ? 'pb-40' : 'pb-32'}`}>
      <PageHeader
        icon={BookOpen}
        title="TribeTrade Guide & Subscription Tiers"
        subtitle="How to get the most out of your trade business operating system"
      />

      {/* Tabs Switcher */}
      <div className="flex gap-2 p-1 bg-gradient-to-r from-emerald-500/10 to-blue-500/10 border border-emerald-500/20 dark:border-emerald-400/10 rounded-2xl mb-8 w-fit">
        <button
          onClick={() => setActiveTab('how-to')}
          className={`px-6 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all ${
            activeTab === 'how-to'
              ? 'bg-white dark:bg-zinc-900 text-emerald-600 dark:text-emerald-400 shadow-sm'
              : 'text-zinc-500 hover:text-zinc-800 dark:hover:text-white'
          }`}
        >
          How to Use TribeTrade
        </button>
        <button
          onClick={() => setActiveTab('tiers')}
          className={`px-6 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all ${
            activeTab === 'tiers'
              ? 'bg-white dark:bg-zinc-900 text-emerald-600 dark:text-emerald-400 shadow-sm'
              : 'text-zinc-500 hover:text-zinc-800 dark:hover:text-white'
          }`}
        >
          Free vs Premium Tiers
        </button>
      </div>

      {activeTab === 'how-to' && (
        <div className="space-y-6">
          <div className="bg-gradient-to-r from-emerald-500/10 to-blue-500/10 p-6 rounded-[32px] border border-emerald-500/20 dark:border-emerald-400/10 mb-4">
            <h3 className="text-lg font-bold text-zinc-900 dark:text-white mb-2 flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-emerald-500" />
              Welcome to TribeTrade
            </h3>
            <p className="text-sm text-zinc-650 dark:text-zinc-400 leading-relaxed">
              TribeTrade is built to eliminate paperwork friction and administrative mental load for UK tradespeople. 
              Using tailored AI models, it converts voice dictation, till receipts, and messy customer enquiries into 
              structured quotes, formal VAT invoices, scheduled site visits, and HMRC Self-Assessment tax records.
            </p>
            <div className="mt-4 pt-4 border-t border-emerald-500/10 dark:border-emerald-400/10">
              <button
                onClick={() => window.dispatchEvent(new CustomEvent('tribe_start_tour'))}
                className="px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white text-[11px] font-black uppercase tracking-widest rounded-xl transition-all active:scale-95 flex items-center gap-2 shadow-sm w-fit cursor-pointer"
              >
                <Sparkles className="w-3.5 h-3.5" />
                Re-run Interactive Trade Tour
              </button>
            </div>
          </div>

          <div className="grid gap-6 md:grid-cols-2">
            {guides.map((guide, idx) => (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.05 }}
                key={guide.title}
                className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-850 p-6 rounded-[32px] hover:border-zinc-300 dark:hover:border-zinc-800 transition-all flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center gap-3 mb-4">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${guide.color}`}>
                      <guide.icon className="w-5 h-5" />
                    </div>
                    <h4 className="text-base font-extrabold text-zinc-855 dark:text-white">{guide.title}</h4>
                  </div>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-4 font-medium">{guide.description}</p>
                  
                  <ul className="space-y-2.5 text-xs text-zinc-650 dark:text-zinc-350">
                    {guide.steps.map((step, sIdx) => (
                      <li key={sIdx} className="flex gap-2 leading-relaxed">
                        <span className="text-emerald-500 font-bold shrink-0">{sIdx + 1}.</span>
                        <span>{step}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </motion.div>
            ))}
          </div>

          {/* FAQ, Privacy, Security & Biometrics Expandable Section */}
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-855 rounded-[32px] overflow-hidden mt-8 transition-all shadow-sm">
            <button
              onClick={() => setPrivacyExpanded(!privacyExpanded)}
              className="w-full p-6 text-left flex items-center justify-between gap-4 hover:bg-zinc-50 dark:hover:bg-zinc-800/20 transition-all focus:outline-none cursor-pointer"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-emerald-500/10 text-emerald-500 rounded-xl flex items-center justify-center shrink-0">
                  <HelpCircle className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-zinc-900 dark:text-white">❓ Frequently Asked Questions & Trade Security</h4>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">Common trade questions, data privacy, and app troubleshooting.</p>
                </div>
              </div>
              <div className="w-8 h-8 rounded-full border border-zinc-200 dark:border-zinc-800 flex items-center justify-center shrink-0 text-zinc-400">
                {privacyExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </div>
            </button>
            
            {privacyExpanded && (
              <div className="px-6 pb-6 pt-2 border-t border-zinc-100 dark:border-zinc-850 text-xs text-zinc-650 dark:text-zinc-350 space-y-5 leading-relaxed">
                <div>
                  <h5 className="font-bold text-zinc-800 dark:text-zinc-200 mb-1">❓ How do I create and send my first trade quote?</h5>
                  <p>
                    Go to <strong>Quotes</strong> and tap <strong>+ New Quote</strong>, or simply dictate your quote hands-free into the Magic Mic bar. Review the calculated labour and materials items, choose whether to require a 20% deposit, and tap <strong>Share</strong> to send a PDF or secure client link directly via WhatsApp or Email.
                  </p>
                </div>

                <div>
                  <h5 className="font-bold text-zinc-800 dark:text-zinc-200 mb-1">❓ What is the difference between Free and Premium?</h5>
                  <p>
                    The <strong>Free Tier</strong> gives you full manual trade tools for quotes, invoices, calendar, expenses, and materials pick lists. <strong>Premium (£7.95/mo or £79/yr)</strong> unlocks full AI capabilities: 6 AM Morning Audio Briefings, hands-free Magic Mic dictation, instant merchant receipt OCR scanning, Making Tax Digital (MTD) CSV export, and vehicle maintenance alerts.
                  </p>
                </div>

                <div>
                  <h5 className="font-bold text-zinc-800 dark:text-zinc-200 mb-1">❓ How does HMRC Self-Assessment and CIS tracking work?</h5>
                  <p>
                    TribeTrade tracks your allowable business expenses across HMRC SA103 categories and records CIS deductions suffered at source. In the Expenses tab, you can view your estimated Income Tax, Class 4 National Insurance, and monthly tax savings pot in real time, plus download an MTD-ready CSV spreadsheet for your accountant.
                  </p>
                </div>

                <div>
                  <h5 className="font-bold text-zinc-800 dark:text-zinc-200 mb-1">🔒 Trade Privacy & Ephemeral Receipt Image Handling</h5>
                  <p>
                    Your business financial data is strictly private. When you photograph a till receipt, invoice, or job sheet, the image is processed <strong>ephemerally in volatile memory</strong> to extract text and data, and is immediately destroyed. <strong>No raw receipt photos are retained on our servers.</strong>
                  </p>
                </div>

                <div>
                  <h5 className="font-bold text-zinc-800 dark:text-zinc-200 mb-1">🔑 App PIN Security Lock</h5>
                  <p>
                    To ensure your sensitive trade calendar and job logistics data are kept private, TribeTrade supports a secure <strong>4-digit PIN Lock</strong>. 
                    You can set up or manage your custom security PIN directly inside the Settings tab to lock the app whenever you leave.
                  </p>
                </div>

                <div>
                  <h5 className="font-bold text-zinc-800 dark:text-zinc-250 mb-1">⚠️ Generative AI Accuracy Warning</h5>
                  <p>
                    TribeTrade uses advanced generative AI models to help structure your business information. While highly capable, generative AI can sometimes make mistakes or produce inaccurate details.
                    Always check critical dates, times, and contact information before finalising plans or relying solely on AI-generated instructions.
                  </p>
                </div>

                <div>
                  <h5 className="font-bold text-zinc-800 dark:text-zinc-250 mb-1">🔔 Notification Troubleshooting</h5>
                  <div className="space-y-2 mt-1">
                    <p>
                      If you are having trouble enabling notifications or the toggle is stuck/disabled, you might have them blocked at the device or browser level.
                    </p>
                    <ul className="list-disc pl-4 space-y-1">
                      <li><strong>Installed App (PWA):</strong> Open your device Settings &gt; Apps &gt; find this app (e.g., "Tribe") &gt; Permissions (or Notifications) &gt; Allow Notifications.</li>
                      <li><strong>Android Chrome Browser:</strong> Tap the Lock/Tune icon in the URL address bar &gt; Permissions &gt; Notifications &gt; Allow.</li>
                      <li><strong>OS-Level Block:</strong> Ensure you haven't blocked the Chrome app itself from showing notifications in your phone's main Settings &gt; Apps &gt; Chrome.</li>
                    </ul>
                  </div>
                </div>

                <div className="pt-2 border-t border-zinc-100 dark:border-zinc-850">
                  <h5 className="font-bold text-zinc-800 dark:text-zinc-200 mb-2">📄 Legal Documents</h5>
                  <div className="flex flex-col gap-3">
                    <a href="/privacy-policy" className="text-emerald-600 dark:text-emerald-400 font-semibold hover:underline inline-flex items-center gap-1.5 w-fit">
                      Privacy Policy <ArrowRight className="w-3 h-3" />
                    </a>
                    <a href="/terms-of-service" className="text-emerald-600 dark:text-emerald-400 font-semibold hover:underline inline-flex items-center gap-1.5 w-fit">
                      Terms of Service <ArrowRight className="w-3 h-3" />
                    </a>
                    <a href="/data-deletion" className="text-emerald-600 dark:text-emerald-400 font-semibold hover:underline inline-flex items-center gap-1.5 w-fit">
                      Data Deletion Policy <ArrowRight className="w-3 h-3" />
                    </a>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Dedicated Cancellation & Billing Management Pill */}
          <div id="how-to-cancel" className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-850 p-6 rounded-[32px] hover:border-zinc-300 dark:hover:border-zinc-800 transition-all mt-6 shadow-sm">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 rounded-xl flex items-center justify-center shrink-0">
                <CreditCard className="w-5 h-5" />
              </div>
              <div>
                <h4 className="text-sm font-bold text-zinc-900 dark:text-white">💳 How to Cancel or Manage Your Subscription</h4>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">Step-by-step guide for managing, cancelling, or reactivating your Premium plan</p>
              </div>
            </div>
            <div className="text-xs text-zinc-650 dark:text-zinc-350 space-y-2.5 leading-relaxed">
              <p>
                All subscriptions and billing details are managed securely via the Stripe Customer Portal:
              </p>
              <ol className="list-decimal pl-5 space-y-1.5 font-medium">
                <li>Go to <strong>Settings</strong> &gt; <strong>Subscription &amp; Billing</strong> and tap <strong>Manage in Stripe</strong>.</li>
                <li>In the Stripe Portal, <strong>click directly on your Active Plan</strong>.</li>
                <li>From there, you can choose to <strong>Cancel Subscription</strong>, <strong>Reactivate Plan</strong>, or update your payment card and billing information.</li>
                <li>When cancelled, your Premium features remain active until the end of your current paid billing period.</li>
              </ol>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'tiers' && (
        <div className="space-y-8">
          <div className="grid gap-6 md:grid-cols-2">
            {/* Free Tier Card */}
            <div className="bg-white dark:bg-zinc-900 border-2 border-zinc-200 dark:border-zinc-800 p-8 rounded-[32px] flex flex-col justify-between relative overflow-hidden">
              <div>
                <h4 className="text-lg font-black text-zinc-600 dark:text-zinc-400 uppercase tracking-wider">Free Tier</h4>
                <div className="mt-4 flex items-baseline gap-1">
                  <span className="text-4xl font-extrabold text-zinc-900 dark:text-white">£0</span>
                  <span className="text-xs text-zinc-500 font-bold">/ forever</span>
                </div>
                <p className="text-xs text-zinc-500 mt-2 font-medium">Essential manual trade business management without AI capabilities.</p>
                
                <hr className="my-6 border-zinc-200 dark:border-zinc-800" />
                
                <ul className="space-y-3.5 text-xs">
                  <li className="flex items-center gap-2.5 text-zinc-650 dark:text-zinc-300">
                    <Check className="w-4 h-4 text-emerald-500 shrink-0" />
                    <span>Full manual calendar & job scheduling</span>
                  </li>
                  <li className="flex items-center gap-2.5 text-zinc-650 dark:text-zinc-300">
                    <Check className="w-4 h-4 text-emerald-500 shrink-0" />
                    <span>Up to 3 active trade quotes</span>
                  </li>
                  <li className="flex items-center gap-2.5 text-zinc-650 dark:text-zinc-300">
                    <Check className="w-4 h-4 text-emerald-500 shrink-0" />
                    <span>Basic manual invoice generation</span>
                  </li>
                  <li className="flex items-center gap-2.5 text-zinc-650 dark:text-zinc-300">
                    <Check className="w-4 h-4 text-emerald-500 shrink-0" />
                    <span>Manual expense tracking</span>
                  </li>
                  <li className="flex items-center gap-2.5 text-zinc-650 dark:text-zinc-300">
                    <Check className="w-4 h-4 text-emerald-500 shrink-0" />
                    <span>Materials pick list & van stock (up to 25 items)</span>
                  </li>
                  <li className="flex items-center gap-2.5 text-zinc-650 dark:text-zinc-300">
                    <Check className="w-4 h-4 text-emerald-500 shrink-0" />
                    <span>Work tablet 4-digit PIN security lock</span>
                  </li>
                  <li className="flex items-center gap-2.5 text-zinc-650 dark:text-zinc-300">
                    <Check className="w-4 h-4 text-emerald-500 shrink-0" />
                    <span>Standard Light & Dark mode</span>
                  </li>
                </ul>
              </div>
              
              <div className="mt-8">
                {subscriptionTier === 'free' ? (
                  <div className="w-full py-3 bg-zinc-100 dark:bg-zinc-800 text-center text-xs font-black uppercase tracking-wider rounded-xl text-zinc-650 dark:text-zinc-300">
                    Current Tier
                  </div>
                ) : (
                  <div className="w-full py-3 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-center text-xs font-bold text-zinc-400 rounded-xl">
                    Basic Included
                  </div>
                )}
              </div>
            </div>

            {/* Premium Tier Card */}
            <div className={`bg-white dark:bg-zinc-900 border-2 ${subscriptionTier === 'premium' ? 'border-emerald-500 shadow-emerald-500/10' : 'border-zinc-200 dark:border-zinc-800'} p-8 rounded-[32px] flex flex-col justify-between relative overflow-hidden shadow-lg`}>
              <div className="absolute top-0 right-0 bg-emerald-500 text-white text-[9px] font-black uppercase tracking-widest px-4 py-1.5 rounded-bl-2xl">
                Best Value
              </div>
              
              <div>
                <div className="flex items-center gap-1.5">
                  <h4 className="text-lg font-black text-emerald-600 dark:text-emerald-400 uppercase tracking-wider">Premium Tier</h4>
                  <Sparkles className="w-4 h-4 text-emerald-500" />
                </div>
                <div className="mt-4 flex flex-col gap-1">
                  <div className="flex items-baseline gap-1">
                    <span className="text-4xl font-extrabold text-zinc-900 dark:text-white">£7.95</span>
                    <span className="text-xs text-zinc-500 font-bold">/ month</span>
                  </div>
                  <div className="flex items-baseline gap-1">
                    <span className="text-sm font-bold text-emerald-600 dark:text-emerald-400">or £79.00</span>
                    <span className="text-xs text-zinc-500 font-semibold">/ year</span>
                    <span className="text-[10px] font-black text-amber-600 dark:text-amber-400 uppercase tracking-wider ml-1 bg-amber-500/10 px-1.5 py-0.5 rounded-full border border-amber-500/20">(Save with yearly — 2 Months Free!)</span>
                  </div>
                </div>
                <p className="text-xs text-zinc-500 mt-2 font-medium">Complete AI-powered trade business suite with 6 AM Briefings, Voice Readout, Quotes, Receipt OCR, and HMRC Tax calculations.</p>
                
                <hr className="my-6 border-zinc-200 dark:border-zinc-800" />
                
                <ul className="space-y-3.5 text-xs">
                  <li className="flex items-center gap-2.5 text-zinc-650 dark:text-zinc-300">
                    <Check className="w-4 h-4 text-emerald-500 shrink-0" />
                    <span className="font-semibold text-zinc-800 dark:text-white">AI Daily Morning Briefing with Studio HD Audio*</span>
                  </li>
                  <li className="flex items-center gap-2.5 text-zinc-650 dark:text-zinc-300">
                    <Check className="w-4 h-4 text-emerald-500 shrink-0" />
                    <span className="font-semibold text-zinc-800 dark:text-white">Magic Mic Hands-Free Voice Quoting & Dictation*</span>
                  </li>
                  <li className="flex items-center gap-2.5 text-zinc-650 dark:text-zinc-300">
                    <Check className="w-4 h-4 text-emerald-500 shrink-0" />
                    <span className="font-semibold text-zinc-800 dark:text-white">Unlimited Trade Quotes & Estimates with Instant PDF</span>
                  </li>
                  <li className="flex items-center gap-2.5 text-zinc-650 dark:text-zinc-300">
                    <Check className="w-4 h-4 text-emerald-500 shrink-0" />
                    <span className="font-semibold text-zinc-800 dark:text-white">1-Click Quote-to-Invoice Conversion & CIS Notes</span>
                  </li>
                  <li className="flex items-center gap-2.5 text-zinc-650 dark:text-zinc-300">
                    <Check className="w-4 h-4 text-emerald-500 shrink-0" />
                    <span className="font-semibold text-zinc-800 dark:text-white">Automated Merchant Receipt OCR (Screwfix, etc.)*</span>
                  </li>
                  <li className="flex items-center gap-2.5 text-zinc-650 dark:text-zinc-300">
                    <Check className="w-4 h-4 text-emerald-500 shrink-0" />
                    <span className="font-semibold text-zinc-800 dark:text-white">Real-Time HMRC Self-Assessment & CIS Calculation</span>
                  </li>
                  <li className="flex items-center gap-2.5 text-zinc-650 dark:text-zinc-300">
                    <Check className="w-4 h-4 text-emerald-500 shrink-0" />
                    <span className="font-semibold text-zinc-800 dark:text-white">1-Click Making Tax Digital (MTD) CSV Export</span>
                  </li>
                  <li className="flex items-center gap-2.5 text-zinc-650 dark:text-zinc-300">
                    <Check className="w-4 h-4 text-emerald-500 shrink-0" />
                    <span>Automated Van MOT, Road Tax & Service Alerts</span>
                  </li>
                  <li className="flex items-center gap-2.5 text-zinc-650 dark:text-zinc-300">
                    <Check className="w-4 h-4 text-emerald-500 shrink-0" />
                    <span>Real-Time 2-Way Google Calendar Synchronisation</span>
                  </li>
                  <li className="flex items-center gap-2.5 text-zinc-650 dark:text-zinc-300">
                    <Check className="w-4 h-4 text-emerald-500 shrink-0" />
                    <span className="font-semibold text-zinc-800 dark:text-white">All 9 Custom Trade Accent Themes & Branding</span>
                  </li>
                </ul>

                <p className="text-[10px] text-zinc-400 dark:text-zinc-500 mt-4 leading-relaxed italic">
                  * Generous daily fair-use capacity limits (50 AI requests/day) apply to ensure continuous sub-second response times across all trade devices.
                </p>
              </div>
              
              <div className="mt-8">
                {subscriptionTier === 'premium' ? (
                  <div className="w-full py-3 bg-emerald-500 text-white text-center text-xs font-black uppercase tracking-wider rounded-xl shadow-sm">
                    {isTrial ? 'Current Tier (Reverse Trial)' : 'Current Tier (Active Subscription)'}
                  </div>
                ) : (
                  <div className="flex flex-col sm:flex-row gap-2">
                    <button 
                      onClick={() => handleUpgrade('monthly')}
                      disabled={loadingCheckout}
                      className="flex-1 py-3 bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-black uppercase tracking-wider rounded-xl transition-all shadow-md active:scale-95 flex items-center justify-center gap-2 cursor-pointer"
                    >
                      {loadingCheckout ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Monthly (£7.95)'}
                    </button>
                    <button 
                      onClick={() => handleUpgrade('yearly')}
                      disabled={loadingCheckout}
                      className="flex-1 py-3 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black uppercase tracking-wider rounded-xl transition-all shadow-md active:scale-95 flex items-center justify-center gap-2 border border-emerald-400/40 cursor-pointer"
                    >
                      {loadingCheckout ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Yearly (£79.00)'}
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Detailed Feature Comparison Table */}
          <div className="bg-white dark:bg-zinc-900 rounded-[32px] border border-zinc-200 dark:border-zinc-800 p-6 sm:p-8 shadow-sm space-y-4">
            <div>
              <h4 className="text-base font-black text-zinc-900 dark:text-white uppercase tracking-wider">
                Full Feature Comparison: Free vs Premium
              </h4>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                Everything you need to know about what's included in each tier.
              </p>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-zinc-200 dark:border-zinc-800 text-zinc-400 dark:text-zinc-500 uppercase tracking-wider text-[10px]">
                    <th className="py-3 px-3 font-bold">Feature</th>
                    <th className="py-3 px-3 font-bold">Free Tier</th>
                    <th className="py-3 px-3 font-bold text-emerald-600 dark:text-emerald-400">Premium Tier</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/60">
                  {pricingFeatures.map((feat, idx) => (
                    <tr key={idx} className="hover:bg-zinc-50 dark:hover:bg-zinc-800/30 transition-colors">
                      <td className="py-3 px-3 font-semibold text-zinc-800 dark:text-zinc-200">
                        {feat.name}
                      </td>
                      <td className="py-3 px-3 text-zinc-500 dark:text-zinc-400 font-medium">
                        {feat.free}
                      </td>
                      <td className="py-3 px-3 font-bold text-emerald-600 dark:text-emerald-400">
                        {feat.premium}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Sentinel for IntersectionObserver */}
      <div ref={bottomRef} className="h-10 w-full" />

      {isOnboarding && (
        <div className="fixed bottom-0 left-0 right-0 p-6 bg-white/80 dark:bg-zinc-950/80 backdrop-blur-md border-t border-zinc-200 dark:border-zinc-800 z-50 flex flex-col items-center justify-center space-y-3">
          {!hasReachedBottom ? (
            <p className="text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-widest animate-pulse">
              Scroll to bottom to continue
            </p>
          ) : (
            <p className="text-xs font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-widest">
              You're ready to go!
            </p>
          )}
          <button
            onClick={onFinishOnboarding}
            disabled={!hasReachedBottom}
            className="w-full max-w-md py-4 bg-emerald-600 hover:bg-emerald-700 text-white font-black text-sm uppercase tracking-wider rounded-2xl transition-all disabled:opacity-50 disabled:cursor-not-allowed active:scale-95 shadow-xl shadow-emerald-500/20 cursor-pointer"
          >
            Finish Guide & Launch Trade Hub
          </button>
        </div>
      )}
    </div>
  );
}
