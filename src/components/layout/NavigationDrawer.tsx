import React, { useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  LayoutDashboard, 
  Calendar, 
  CheckSquare, 
  Mail, 
  Package, 
  FileText, 
  ReceiptPoundSterling,
  Settings,
  BookOpen,
  Shield,
  X,
  LogOut,
  Sparkles
} from 'lucide-react';
import { auth } from '../../lib/firebase';
import { signOut } from 'firebase/auth';

type View = 'hub' | 'calendar' | 'quotes' | 'expenses' | 'tasks' | 'supplies' | 'email' | 'settings' | 'guide' | 'support';

interface NavigationDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  activeView: View;
  onNavigate: (view: View) => void;
  user: any;
  subscriptionTier: string;
  isTrial: boolean;
  trialDaysRemaining?: number;
  isAdmin?: boolean;
  themeColor?: string;
}

export default function NavigationDrawer({
  isOpen,
  onClose,
  activeView,
  onNavigate,
  user,
  subscriptionTier,
  isTrial,
  trialDaysRemaining,
  isAdmin,
  themeColor = '#10b981'
}: NavigationDrawerProps) {
  // Close on Escape key press
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const handleSelect = (view: View) => {
    onNavigate(view);
    onClose();
  };

  const handleSignOut = async () => {
    onClose();
    await signOut(auth);
  };

  const coreItems = [
    { id: 'hub' as View, label: 'Hub (Home)', icon: LayoutDashboard },
    { id: 'calendar' as View, label: 'Calendar', icon: Calendar },
  ];

  const workflowItems = [
    { id: 'quotes' as View, label: 'Quotes & Invoices', icon: FileText },
    { id: 'expenses' as View, label: 'Expenses & Mileage', icon: ReceiptPoundSterling },
    { id: 'tasks' as View, label: 'Tasks', icon: CheckSquare },
    { id: 'supplies' as View, label: 'Supplies (The Shed)', icon: Package },
    { id: 'email' as View, label: 'Email', icon: Mail },
  ];

  if (isAdmin) {
    workflowItems.push({ id: 'support' as View, label: 'Support Management', icon: Shield });
  }

  const preferenceItems = [
    { id: 'settings' as View, label: 'Settings', icon: Settings },
    { id: 'guide' as View, label: 'User Guide', icon: BookOpen },
  ];

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50"
            aria-hidden="true"
          />

          {/* Slide-out Drawer */}
          <motion.aside
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 240 }}
            className="fixed top-0 right-0 bottom-0 w-[300px] max-w-[85vw] bg-[var(--bg-secondary)] border-l border-[var(--border-color)] shadow-2xl z-50 flex flex-col text-[var(--text-primary)]"
            role="dialog"
            aria-modal="true"
            aria-label="Navigation Menu"
          >
            {/* Drawer Header */}
            <div className="p-4 border-b border-[var(--border-color)] flex items-center justify-between">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-8 h-8 rounded-xl bg-white border border-zinc-200/90 shadow-xs p-1 flex items-center justify-center shrink-0">
                  <img src="/logo.png" alt="TribeTrade" className="w-full h-full object-contain rounded-md" />
                </div>
                <div className="min-w-0">
                  <h2 className="text-sm font-bold truncate">TribeTrade</h2>
                  <p className="text-[11px] text-zinc-500 dark:text-zinc-400 truncate">
                    {user?.email || 'Logged In'}
                  </p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="p-1.5 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 transition-colors"
                title="Close navigation"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Plan / Subscription Status Pill */}
            <div className="px-4 py-2.5 bg-zinc-50 dark:bg-zinc-900/50 border-b border-[var(--border-color)] flex items-center justify-between text-xs">
              <div className="flex items-center gap-1.5 text-zinc-600 dark:text-zinc-300 font-medium">
                <Sparkles className="w-3.5 h-3.5 text-emerald-500" />
                <span>Plan:</span>
              </div>
              <button
                onClick={() => handleSelect('settings')}
                className={`text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full cursor-pointer hover:opacity-85 active:scale-95 transition-all ${
                  isTrial
                    ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300'
                    : subscriptionTier === 'premium'
                    ? 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300'
                    : 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300'
                }`}
                title="Manage subscription in Settings"
              >
                {isTrial ? `Trial (${trialDaysRemaining ?? 0}d left)` : subscriptionTier === 'premium' ? 'Premium' : 'Free Tier'}
              </button>
            </div>

            {/* Nav Item Groups */}
            <div className="flex-1 overflow-y-auto p-3 space-y-4">
              {/* Core Items */}
              <div>
                <p className="px-3 text-[10px] font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-500 mb-1">
                  Core
                </p>
                <div className="space-y-0.5">
                  {coreItems.map((item) => (
                    <button
                      key={item.id}
                      onClick={() => handleSelect(item.id)}
                      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-medium transition-all ${
                        activeView === item.id
                          ? 'font-bold shadow-sm'
                          : 'hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-600 dark:text-zinc-300'
                      }`}
                      style={activeView === item.id ? { backgroundColor: `${themeColor}18`, color: themeColor } : {}}
                    >
                      <item.icon className="w-4 h-4 shrink-0" />
                      <span>{item.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Workflow Items */}
              <div>
                <p className="px-3 text-[10px] font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-500 mb-1">
                  Business Workflow
                </p>
                <div className="space-y-0.5">
                  {workflowItems.map((item) => (
                    <button
                      key={item.id}
                      onClick={() => handleSelect(item.id)}
                      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-medium transition-all ${
                        activeView === item.id
                          ? 'font-bold shadow-sm'
                          : 'hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-600 dark:text-zinc-300'
                      }`}
                      style={activeView === item.id ? { backgroundColor: `${themeColor}18`, color: themeColor } : {}}
                    >
                      <item.icon className="w-4 h-4 shrink-0" />
                      <span>{item.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Preferences */}
              <div>
                <p className="px-3 text-[10px] font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-500 mb-1">
                  System & Help
                </p>
                <div className="space-y-0.5">
                  {preferenceItems.map((item) => (
                    <button
                      key={item.id}
                      onClick={() => handleSelect(item.id)}
                      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-medium transition-all ${
                        activeView === item.id
                          ? 'font-bold shadow-sm'
                          : 'hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-600 dark:text-zinc-300'
                      }`}
                      style={activeView === item.id ? { backgroundColor: `${themeColor}18`, color: themeColor } : {}}
                    >
                      <item.icon className="w-4 h-4 shrink-0" />
                      <span>{item.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Footer Sign Out */}
            <div className="p-3 border-t border-[var(--border-color)]">
              <button
                onClick={handleSignOut}
                className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-xs font-semibold text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors"
              >
                <LogOut className="w-4 h-4" />
                <span>Sign Out</span>
              </button>
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}
