import { useState, useEffect } from 'react';
import { 
  Sparkles, 
  PoundSterling, 
  Clock, 
  Calendar, 
  FileText, 
  Receipt, 
  Mail, 
  ShieldCheck, 
  Volume2, 
  ArrowRight, 
  Camera,
  Smartphone,
  Laptop,
  Download,
  Wand2,
  Play,
  Pin,
  Bell,
  Lock,
  ExternalLink,
  Package,
  Truck,
  Calculator,
  Wrench,
  CheckCircle2
} from 'lucide-react';
import DashboardTour from '../dashboard/DashboardTour';

export default function TryTribePage() {
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      if (params.get('tour') === 'true' || params.get('demo') === 'true') {
        setTimeout(() => {
          document.getElementById('interactive-tour')?.scrollIntoView({ behavior: 'smooth' });
        }, 150);
      }
    }
  }, []);

  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-900 font-sans selection:bg-emerald-500 selection:text-white">
      {/* Background Subtle Glow Accents */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none z-0">
        <div className="absolute -top-40 -left-40 w-96 h-96 bg-emerald-500/10 rounded-full blur-3xl" />
        <div className="absolute top-1/3 -right-40 w-96 h-96 bg-amber-500/10 rounded-full blur-3xl" />
        <div className="absolute -bottom-40 left-1/3 w-96 h-96 bg-sky-500/10 rounded-full blur-3xl" />
      </div>

      <div className="relative z-10 max-w-5xl mx-auto px-4 sm:px-6 pt-4 sm:pt-10 pb-12 sm:pb-20 space-y-12 sm:space-y-20">

        {/* Hero Section */}
        <section className="text-center space-y-6 max-w-3xl mx-auto flex flex-col items-center">
          {/* Centred Brand & Logo */}
          <div className="flex flex-col items-center space-y-4 mb-2">
            <div className="w-20 h-20 rounded-3xl bg-white border border-zinc-200 p-2 shadow-2xl shadow-emerald-500/10 flex items-center justify-center">
              <img src="/logo.png" alt="TribeTrade Logo" className="w-full h-full object-contain" />
            </div>
            
            <h1 className="text-5xl sm:text-7xl font-black text-zinc-950 tracking-tight leading-none">
              Tribe<span className="bg-gradient-to-r from-emerald-600 via-teal-500 to-sky-600 bg-clip-text text-transparent">Trade</span>
            </h1>
          </div>

          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-bold uppercase tracking-widest shadow-xs">
            <Sparkles className="w-3.5 h-3.5 text-emerald-600" /> The UK's Intelligent Trade Business Hub
          </div>

          <p className="text-xl sm:text-2xl font-extrabold text-zinc-800 tracking-tight">
            Run Your Trade Business from Your Pocket
          </p>

          <p className="text-zinc-600 text-sm sm:text-base max-w-xl mx-auto leading-relaxed">
            Professional Quotes, 1-Click Invoices, Receipt OCR & HMRC Tax Prep — built specifically for busy UK tradespeople on the tools.
          </p>

          <div className="pt-2 flex flex-wrap items-center justify-center gap-4">
            <a 
              href="/?action=signup" 
              className="px-8 py-4 rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold text-base shadow-xl shadow-emerald-600/20 hover:scale-[1.02] active:scale-[0.98] transition-all"
            >
              Start 14-Day Free Trial
            </a>
            <button 
              onClick={() => {
                document.getElementById('interactive-tour')?.scrollIntoView({ behavior: 'smooth' });
              }}
              className="px-6 py-4 rounded-2xl bg-amber-50 hover:bg-amber-100 text-amber-900 font-bold text-base border border-amber-200 shadow-xs transition-all flex items-center gap-2 cursor-pointer"
            >
              <Play className="w-4 h-4 text-amber-600 fill-current" /> Try Interactive Tour Below
            </button>
          </div>
        </section>

        {/* The Power of TribeTrade: Smart Convert Highlight */}
        <section className="p-8 sm:p-10 rounded-3xl bg-gradient-to-r from-emerald-50 via-teal-50 to-sky-50 border border-emerald-200/80 shadow-sm space-y-4">
          <div className="flex items-center gap-3 text-emerald-700 text-xs font-bold uppercase tracking-wider">
            <Wand2 className="w-4 h-4 text-emerald-600" /> Feature Spotlight
          </div>
          <h2 className="text-2xl sm:text-3xl font-black text-zinc-950">The Power of TribeTrade: Smart Convert & Magic Mic</h2>
          <p className="text-sm sm:text-base text-zinc-700 leading-relaxed">
            Stop spending evenings re-typing materials, dates, and client postcodes into spreadsheets. Dictate a quote hands-free from the van, snap a photo of a merchant receipt, or paste an enquiry. <strong>Smart Convert</strong> automatically extracts client names, labour days, and consumable items — drafting quotes, scheduling calendar appointments, and logging allowable expenses in seconds.
          </p>
        </section>

        {/* Embedded Interactive Live Sandbox Demo Tour Section */}
        <section id="interactive-tour" className="space-y-6 pt-2">
          <div className="text-center space-y-2 max-w-2xl mx-auto">
            <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-amber-50 border border-amber-200 text-amber-800 text-xs font-bold uppercase tracking-wider shadow-xs">
              <Sparkles className="w-3.5 h-3.5 text-amber-600" /> Interactive Trade Sandbox
            </div>
            <h2 className="text-2xl sm:text-4xl font-black text-zinc-950">
              Try TribeTrade Live Right Here
            </h2>
            <p className="text-zinc-600 text-xs sm:text-sm max-w-xl mx-auto">
              No sign-up or credit card required. Step through our 5-part live simulation below to see how TribeTrade handles client quotes, morning audio briefings, 1-click invoicing, Screwfix receipt scanning, and HMRC tax preparation.
            </p>
          </div>

          {/* Embedded Tour Component */}
          <DashboardTour isEmbedded={true} isTryTribeView={true} />
        </section>

        {/* Core Value Proposition Cards */}
        <section id="features" className="space-y-8">
          <div className="text-center space-y-2">
            <h2 className="text-2xl sm:text-3xl font-black text-zinc-950">Everything Included in Your Trade Hub</h2>
            <p className="text-zinc-600 text-sm max-w-xl mx-auto">Engineered specifically for UK Electricians, Plumbers, Builders, Carpenters, Decorators, and Independent Tradespeople.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            
            {/* 1. Daily Briefing */}
            <div className="p-6 rounded-3xl bg-white border border-zinc-200 hover:border-emerald-500/50 hover:shadow-md transition-all space-y-4">
              <div className="w-12 h-12 rounded-2xl bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-600">
                <Volume2 className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-bold text-zinc-950">6 AM Daily Trade Briefing & Voice Readout</h3>
              <p className="text-xs text-zinc-600 leading-relaxed">
                Start your morning with an automated AI summary of site appointments, weather on site, and materials needed. Listen hands-free in your van while driving to your first job.
              </p>
            </div>

            {/* 2. Professional Quotes */}
            <div className="p-6 rounded-3xl bg-white border border-zinc-200 hover:border-emerald-500/50 hover:shadow-md transition-all space-y-4">
              <div className="w-12 h-12 rounded-2xl bg-blue-50 border border-blue-200 flex items-center justify-center text-blue-600">
                <FileText className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-bold text-zinc-950">Professional Quotes & Instant PDF</h3>
              <p className="text-xs text-zinc-600 leading-relaxed">
                Generate polished trade estimates with labour day rates, materials markup, 20% deposit requirements, and VAT. Share branded PDFs via WhatsApp or Email in one tap.
              </p>
            </div>

            {/* 3. 1-Click Invoicing */}
            <div className="p-6 rounded-3xl bg-white border border-zinc-200 hover:border-emerald-500/50 hover:shadow-md transition-all space-y-4">
              <div className="w-12 h-12 rounded-2xl bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-600">
                <Receipt className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-bold text-zinc-950">1-Click Invoicing & CIS Notes</h3>
              <p className="text-xs text-zinc-600 leading-relaxed">
                Convert accepted quotes straight into formal VAT invoices with your bank transfer details, payment terms, and CIS deduction calculations. Track payments from sent to settled.
              </p>
            </div>

            {/* 4. Smart Receipt OCR */}
            <div className="p-6 rounded-3xl bg-white border border-zinc-200 hover:border-emerald-500/50 hover:shadow-md transition-all space-y-4">
              <div className="w-12 h-12 rounded-2xl bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-600">
                <Camera className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-bold text-zinc-950">Receipt OCR & Expense Tracking</h3>
              <p className="text-xs text-zinc-600 leading-relaxed">
                Snap photos of till receipts from Screwfix, Toolstation, or fuel stations. TribeTrade automatically extracts merchant, date, VAT amount, and HMRC SA103 allowable expense categories.
              </p>
            </div>

            {/* 5. Trade Calendar */}
            <div className="p-6 rounded-3xl bg-white border border-zinc-200 hover:border-emerald-500/50 hover:shadow-md transition-all space-y-4">
              <div className="w-12 h-12 rounded-2xl bg-sky-50 border border-sky-200 flex items-center justify-center text-sky-600">
                <Calendar className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-bold text-zinc-950">Trade Calendar & 2-Way Google Sync</h3>
              <p className="text-xs text-zinc-600 leading-relaxed">
                Colour-coded trade schedules for Site Work, Surveys, and Emergency Callouts with 2-way Google Calendar synchronisation. Never double-book a site survey or miss a client visit.
              </p>
            </div>

            {/* 6. Materials & Van Stock */}
            <div className="p-6 rounded-3xl bg-white border border-zinc-200 hover:border-emerald-500/50 hover:shadow-md transition-all space-y-4">
              <div className="w-12 h-12 rounded-2xl bg-violet-50 border border-violet-200 flex items-center justify-center text-violet-600">
                <Package className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-bold text-zinc-950">Materials Pick List & The Shed</h3>
              <p className="text-xs text-zinc-600 leading-relaxed">
                Compile materials pick lists for trade counter runs at Screwfix or Selco, and keep track of essential van inventory so you always have the right cables, fittings, and tools on site.
              </p>
            </div>

            {/* 7. HMRC Tax & MTD */}
            <div className="p-6 rounded-3xl bg-white border border-zinc-200 hover:border-emerald-500/50 hover:shadow-md transition-all space-y-4">
              <div className="w-12 h-12 rounded-2xl bg-rose-50 border border-rose-200 flex items-center justify-center text-rose-600">
                <Calculator className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-bold text-zinc-950">HMRC Self-Assessment & MTD Export</h3>
              <p className="text-xs text-zinc-600 leading-relaxed">
                Real-time tax liability forecasting, Class 4 NI calculations, CIS deduction offsets, and a monthly tax savings pot recommendation. Export MTD-ready CSV spreadsheets for your accountant.
              </p>
            </div>

            {/* 8. Van Fleet Tracking */}
            <div className="p-6 rounded-3xl bg-white border border-zinc-200 hover:border-emerald-500/50 hover:shadow-md transition-all space-y-4">
              <div className="w-12 h-12 rounded-2xl bg-teal-50 border border-teal-200 flex items-center justify-center text-teal-600">
                <Truck className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-bold text-zinc-950">Van MOT, Tax & Service Reminders</h3>
              <p className="text-xs text-zinc-600 leading-relaxed">
                Keep your work van legal with automated 30-day and 7-day MOT and road tax expiry alerts, service history logging, and business mileage recording for HMRC 45p/mile claims.
              </p>
            </div>

          </div>

          {/* Everything Included & Pricing Banner */}
          <div className="mt-8 p-6 sm:p-8 rounded-3xl bg-gradient-to-br from-white via-amber-50/30 to-emerald-50/30 border-2 border-amber-200/80 shadow-xl shadow-zinc-200/50 space-y-5 text-center max-w-3xl mx-auto">
            <div className="flex flex-wrap items-center justify-center gap-3 font-bold text-sm">
              <span className="inline-flex items-center gap-1.5 bg-amber-100/90 border border-amber-300 text-amber-900 px-4 py-1.5 rounded-full text-base font-black">
                <PoundSterling className="w-5 h-5 text-amber-700" /> Only £7.95 / month
              </span>
              <span className="text-zinc-300">•</span>
              <span className="inline-flex items-center gap-1.5 bg-emerald-50 border border-emerald-200 text-emerald-800 px-3.5 py-1.5 rounded-full text-xs sm:text-sm font-bold">
                <Clock className="w-4 h-4 text-emerald-600" /> 5+ Hours Saved Weekly
              </span>
              <span className="text-zinc-300">•</span>
              <span className="inline-flex items-center gap-1.5 bg-teal-50 border border-teal-200 text-teal-800 px-3.5 py-1.5 rounded-full text-xs sm:text-sm font-bold">
                <ShieldCheck className="w-4 h-4 text-teal-600" /> 14-Day Free Trial
              </span>
            </div>
            
            <p className="text-lg sm:text-xl font-black text-zinc-900 leading-relaxed max-w-2xl mx-auto">
              Everything above included for less than the price of <span className="underline decoration-amber-500 decoration-2 underline-offset-4">a roll of tape and a box of screws a month</span> (£7.95/mo or £79/yr). No hidden fees, cancel anytime.
            </p>

            <div className="pt-2 flex flex-wrap items-center justify-center gap-4">
              <a 
                href="/?action=signup" 
                className="px-8 py-3.5 rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold text-sm sm:text-base shadow-lg shadow-emerald-600/20 hover:scale-[1.02] active:scale-[0.98] transition-all"
              >
                Start 14-Day Free Trial
              </a>
            </div>
          </div>
        </section>

        {/* How Connecting Your Trade Email Works */}
        <section id="email-connection" className="p-8 sm:p-12 rounded-3xl bg-white border border-zinc-200 shadow-sm space-y-8">
          <div className="text-center space-y-3 max-w-2xl mx-auto">
            <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-teal-50 border border-teal-200 text-teal-800 text-xs font-bold uppercase tracking-wider shadow-xs">
              <Mail className="w-3.5 h-3.5 text-teal-600" /> Transparent & Privacy-First
            </div>
            <h2 className="text-2xl sm:text-3xl font-black text-zinc-950">
              How Connecting Your Trade Email Works
            </h2>
            <p className="text-zinc-600 text-xs sm:text-sm leading-relaxed">
              Customer enquiries, job leads, and merchant delivery notes shouldn't get lost in your personal inbox. TribeTrade securely connects to your business email accounts so you can convert client requests straight into quotes and calendar appointments in 1 tap.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Card 1: 1-Click OAuth */}
            <div className="p-6 rounded-2xl bg-zinc-50 border border-zinc-200/80 space-y-4">
              <div className="w-10 h-10 rounded-xl bg-blue-50 border border-blue-200 flex items-center justify-center text-blue-600">
                <ExternalLink className="w-5 h-5" />
              </div>
              <h3 className="font-bold text-zinc-950 text-base">
                1-Click Provider Sign-In
              </h3>
              <p className="text-xs font-semibold text-blue-700">
                Microsoft Outlook • Hotmail • Yahoo • Sky Mail
              </p>
              <p className="text-xs text-zinc-600 leading-relaxed">
                Connect directly via official Microsoft and Yahoo popups with read-only permission for enquiries. Your passwords are never seen or stored by TribeTrade.
              </p>
            </div>

            {/* Card 2: App-Specific Passwords */}
            <div className="p-6 rounded-2xl bg-zinc-50 border border-zinc-200/80 space-y-4">
              <div className="w-10 h-10 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-600">
                <Lock className="w-5 h-5" />
              </div>
              <h3 className="font-bold text-zinc-950 text-base">
                App-Specific Passwords
              </h3>
              <p className="text-xs font-semibold text-emerald-700">
                Google Mail (Gmail) • Apple Mail (iCloud)
              </p>
              <p className="text-xs text-zinc-600 leading-relaxed">
                Generate a dedicated 16-character code in your Google or Apple security settings. Your primary password remains 100% private. Validated over secure SSL IMAP.
              </p>
            </div>

            {/* Card 3: Zero Retention Promise */}
            <div className="p-6 rounded-2xl bg-zinc-50 border border-zinc-200/80 space-y-4">
              <div className="w-10 h-10 rounded-xl bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-600">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <h3 className="font-bold text-zinc-950 text-base">
                Zero-Data Storage Guarantee
              </h3>
              <p className="text-xs font-semibold text-amber-700">
                AES-256 Vault • No AI Training • 1-Tap Disconnect
              </p>
              <p className="text-xs text-zinc-600 leading-relaxed">
                Customer emails are processed ephemerally in real time to extract job details and contact information, then immediately discarded. We never archive your messages or use them to train public AI.
              </p>
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-teal-50/80 border border-teal-200 text-center text-xs text-teal-900 font-bold">
            🔒 Complete Business Control: Connected email inboxes can be unlinked with a single tap in Settings at any time.
          </div>
        </section>

        {/* Simple How to Use Guide */}
        <section className="p-8 sm:p-12 rounded-3xl bg-gradient-to-br from-emerald-900 to-teal-950 text-white space-y-8 shadow-xl">
          <div className="text-center space-y-2 max-w-xl mx-auto">
            <h2 className="text-2xl sm:text-3xl font-black">Set Up Your Trade Business in 60 Seconds</h2>
            <p className="text-emerald-200 text-xs sm:text-sm">Zero complicated software onboarding. Designed so you can start quoting and scheduling right away on your phone.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="p-5 rounded-2xl bg-emerald-950/60 border border-emerald-800/80 space-y-3">
              <div className="w-8 h-8 rounded-full bg-emerald-400 text-emerald-950 font-black flex items-center justify-center text-sm">1</div>
              <h3 className="font-bold text-white text-sm">Create Your Trade Profile</h3>
              <p className="text-xs text-emerald-200/80">Sign in and set your business name and trade craft (Electrician, Plumber, Builder, etc.).</p>
            </div>

            <div className="p-5 rounded-2xl bg-emerald-950/60 border border-emerald-800/80 space-y-3">
              <div className="w-8 h-8 rounded-full bg-emerald-400 text-emerald-950 font-black flex items-center justify-center text-sm">2</div>
              <h3 className="font-bold text-white text-sm">Set Your Rates & VAT</h3>
              <p className="text-xs text-emerald-200/80">Configure standard hourly/day rates, VAT status, and invoice bank details in Settings.</p>
            </div>

            <div className="p-5 rounded-2xl bg-emerald-950/60 border border-emerald-800/80 space-y-3">
              <div className="w-8 h-8 rounded-full bg-emerald-400 text-emerald-950 font-black flex items-center justify-center text-sm">3</div>
              <h3 className="font-bold text-white text-sm">Quote & Get Paid Faster</h3>
              <p className="text-xs text-emerald-200/80">Dictate quotes hands-free, scan till receipts on site, and let AI handle your daily administrative burden.</p>
            </div>
          </div>
        </section>

        {/* Work Tablet PIN Security */}
        <section className="p-6 sm:p-8 rounded-3xl bg-white border border-zinc-200 shadow-sm flex flex-col md:flex-row items-center gap-6">
          <div className="w-14 h-14 rounded-2xl bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-600 shrink-0">
            <ShieldCheck className="w-7 h-7" />
          </div>
          <div className="space-y-1 text-center md:text-left">
            <h3 className="text-base font-bold text-zinc-950">Work Tablet PIN Lock & On-Site Security</h3>
            <p className="text-xs text-zinc-600 leading-relaxed">
              Leaving an iPad or Android tablet in the van or on site? Enable an optional 4-digit PIN lock to keep customer records, quotes, and bank details secure from unauthorised eyes.
            </p>
          </div>
        </section>

        {/* PWA & Multi-Device Availability Section */}
        <section className="p-8 sm:p-12 rounded-3xl bg-white border border-zinc-200 shadow-sm space-y-8">
          <div className="text-center space-y-3 max-w-2xl mx-auto">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-sky-50 border border-sky-200 text-sky-700 text-xs font-bold uppercase tracking-wider">
              <Download className="w-3.5 h-3.5 text-sky-600" /> Progressive Web App (PWA)
            </div>
            <h2 className="text-2xl sm:text-3xl font-black text-zinc-950">Available Across All Your Trade Devices</h2>
            <p className="text-zinc-600 text-xs sm:text-sm leading-relaxed">
              TribeTrade is engineered as a high-performance <strong>Progressive Web App (PWA)</strong>. Enjoy full-screen native performance, instant push notifications, and fast offline-resilient access without app store bloat or forced updates.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="p-6 rounded-2xl bg-zinc-50 border border-zinc-200/80 space-y-3 text-center sm:text-left">
              <div className="w-10 h-10 rounded-xl bg-sky-50 border border-sky-200 flex items-center justify-center text-sky-600 mx-auto sm:mx-0">
                <Smartphone className="w-5 h-5" />
              </div>
              <h3 className="font-bold text-zinc-950 text-sm">iPhone & iPad (iOS)</h3>
              <p className="text-xs text-zinc-600 leading-relaxed">
                Open TribeTrade in Safari, tap the <strong>Share</strong> button, and tap <strong>"Add to Home Screen"</strong> for an instant app experience.
              </p>
            </div>

            <div className="p-6 rounded-2xl bg-zinc-50 border border-zinc-200/80 space-y-3 text-center sm:text-left">
              <div className="w-10 h-10 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-600 mx-auto sm:mx-0">
                <Smartphone className="w-5 h-5" />
              </div>
              <h3 className="font-bold text-zinc-950 text-sm">Android Phones & Tablets</h3>
              <p className="text-xs text-zinc-600 leading-relaxed">
                Open TribeTrade in Chrome and tap <strong>"Install App"</strong> on the prompt to add directly to your home screen with push notification support.
              </p>
            </div>

            <div className="p-6 rounded-2xl bg-zinc-50 border border-zinc-200/80 space-y-3 text-center sm:text-left">
              <div className="w-10 h-10 rounded-xl bg-purple-50 border border-purple-200 flex items-center justify-center text-purple-600 mx-auto sm:mx-0">
                <Laptop className="w-5 h-5" />
              </div>
              <h3 className="font-bold text-zinc-950 text-sm">Mac & Windows Laptops</h3>
              <p className="text-xs text-zinc-600 leading-relaxed">
                Install directly via Chrome or Edge for a dedicated, full-screen desktop window in your home office.
              </p>
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-center text-xs text-emerald-800 font-bold">
            ⚡ Instant Cloud Synchronisation: Any quote, calendar appointment, or expense logged in the van instantly syncs with your home office screen.
          </div>
        </section>

        {/* Final Call to Action */}
        <footer className="text-center space-y-6 pt-8 border-t border-zinc-200">
          <h2 className="text-3xl sm:text-4xl font-black text-zinc-950">Ready to Take Control of Your Trade Business?</h2>
          <p className="text-zinc-600 text-sm max-w-md mx-auto">
            Try TribeTrade risk-free with our 14-day trial. No credit card required upfront, no auto-billing traps. Full premium access.
          </p>
          <div className="pt-2 flex flex-wrap items-center justify-center gap-4">
            <a 
              href="/?action=signup" 
              className="inline-flex items-center gap-2 px-8 py-4 rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold text-base shadow-xl shadow-emerald-600/20 hover:scale-[1.02] active:scale-[0.98] transition-all"
            >
              Start Your Free Trial Now <ArrowRight className="w-5 h-5" />
            </a>
            <button 
              onClick={() => {
                document.getElementById('interactive-tour')?.scrollIntoView({ behavior: 'smooth' });
              }}
              className="inline-flex items-center gap-2 px-6 py-4 rounded-2xl bg-amber-50 hover:bg-amber-100 text-amber-900 font-bold text-base border border-amber-200 shadow-xs transition-all cursor-pointer"
            >
              <Play className="w-4 h-4 text-amber-600 fill-current" /> Try Interactive Tour Above
            </button>
          </div>
          <div className="flex items-center justify-center gap-4 text-xs font-semibold text-zinc-500 pt-3">
            <a href="/guide" className="hover:text-emerald-600 underline underline-offset-2 transition-colors">User Guide</a>
            <span>•</span>
            <a href="/privacy.html" target="_blank" rel="noopener noreferrer" className="hover:text-emerald-600 underline underline-offset-2 transition-colors">Privacy Policy</a>
            <span>•</span>
            <a href="/terms.html" target="_blank" rel="noopener noreferrer" className="hover:text-emerald-600 underline underline-offset-2 transition-colors">Terms of Service</a>
          </div>
          <div className="text-[11px] text-zinc-400">
            TribeTrade • Built for UK Electricians, Plumbers, Builders, Carpenters & Independent Tradespeople
          </div>
        </footer>

      </div>
    </div>
  );
}
