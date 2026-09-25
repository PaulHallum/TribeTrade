import { useState, useEffect, useCallback, useRef } from 'react';
import { Mail, Loader2, RefreshCw, Inbox, ExternalLink, LogIn, Sparkles, X, Trash2 } from 'lucide-react';
import { useAuth } from '../../App';
import { useToast } from '../../contexts/ToastContext';
import { useSettings } from '../../contexts/SettingsContext';
import { motion, AnimatePresence } from 'motion/react';
import { format } from 'date-fns';
import { logger } from '../../services/logger';

import SmartCaptureModal from '../smart/SmartCaptureModal';
import ConfirmModal from '../common/ConfirmModal';
import { auth, db } from '../../lib/firebase';
import { collection, onSnapshot } from 'firebase/firestore';
import PageHeader from '../common/PageHeader';
import GoogleIcon from '../layout/GoogleIcon';
import MicrosoftIcon from '../layout/MicrosoftIcon';
import YahooIcon from '../layout/YahooIcon';
import AppleIcon from '../layout/AppleIcon';
import AppSpecificPasswordModal from '../settings/AppSpecificPasswordModal';
import { fetchConnectedAccountsMessages } from '../../services/emailAdapters';

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
  bodyError?: string;
}

const stripHtml = (html: string) => {
  const tmp = document.createElement('DIV');
  tmp.innerHTML = html;
  return tmp.textContent || tmp.innerText || '';
};

export default function EmailView() {
  const { googleAccessToken, refreshGoogleToken, tradeUserId } = useAuth();
  const { showToast } = useToast();
  const { settings } = useSettings();
  const [emails, setEmails] = useState<EmailMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedEmail, setSelectedEmail] = useState<EmailMessage | null>(null);
  const [showSmartCapture, setShowSmartCapture] = useState<EmailMessage | null>(null);
  const [fetchingBody, setFetchingBody] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isBatchTrashing, setIsBatchTrashing] = useState(false);
  const [isTrashing, setIsTrashing] = useState(false);
  const [isFetchingMore, setIsFetchingMore] = useState(false);
  const [members, setMembers] = useState<any[]>([]);
  const nextPageTokenRef = useRef<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false);
  const [passwordModalProvider, setPasswordModalProvider] = useState<'apple' | 'google' | 'outlook' | 'yahoo' | 'sky'>('google');
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
    if (!tradeUserId) return;
    const membersRef = collection(db, 'trade_users', tradeUserId, 'members');
    return onSnapshot(membersRef, (snap) => {
      setMembers(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });
  }, [tradeUserId]);

  const trashEmail = async (emailId: string) => {
    setIsTrashing(true);
    try {
      setEmails(prev => prev.filter(e => e.id !== emailId));
      setSelectedIds(prev => {
        const next = new Set(prev);
        next.delete(emailId);
        return next;
      });
      setSelectedEmail(null);
      showToast('Email dismissed from inbox', 'info');
    } catch (err) {
      logger.error('Failed to dismiss email', err);
      showToast('Failed to dismiss email', 'error');
    } finally {
      setIsTrashing(false);
    }
  };

  const trashBatchEmails = async (ids: string[]) => {
    if (ids.length === 0) return;
    setIsBatchTrashing(true);
    try {
      setEmails(prev => prev.filter(e => !ids.includes(e.id)));
      setSelectedIds(prev => {
        const next = new Set(prev);
        ids.forEach(id => next.delete(id));
        return next;
      });
      showToast(`Dismissed ${ids.length} ${ids.length === 1 ? 'email' : 'emails'} from inbox`, 'info');
    } catch (err) {
      logger.error('Failed to batch dismiss emails', err);
      showToast('Failed to dismiss selected emails', 'error');
    } finally {
      setIsBatchTrashing(false);
    }
  };

  const fetchEmailBody = async (emailId: string) => {
    setSelectedEmail(prev => {
      if (prev?.id === emailId) {
        return { ...prev, body: prev.body || prev.snippet || '' };
      }
      return prev;
    });
  };

  useEffect(() => {
    if (selectedEmail && !selectedEmail.body && !fetchingBody) {
      fetchEmailBody(selectedEmail.id);
    }
  }, [selectedEmail]);

  const fetchEmails = useCallback(async (_token?: string, loadMore = false) => {
    if (loadMore) {
      setIsFetchingMore(true);
    } else {
      setLoading(true);
    }
    setError(null);

    try {
      const combinedMessages: EmailMessage[] = [];

      // Fetch connected OAuth accounts (Microsoft Graph, Yahoo/Sky Mail, Apple Mail)
      try {
        const idToken = await auth.currentUser?.getIdToken();
        if (idToken) {
          const connectedMsgs = await fetchConnectedAccountsMessages(idToken);
          combinedMessages.push(...connectedMsgs);
        }
      } catch (connErr) {
        logger.warn('[EmailView] Error fetching connected accounts messages:', connErr);
      }

      // Sort all combined emails by date descending
      combinedMessages.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

      if (loadMore) {
        setEmails(prev => [...prev, ...combinedMessages]);
      } else {
        setEmails(combinedMessages);
      }
    } catch (err) {
      logger.error('Failed to fetch emails', err);
      setError('fetch_failed');
    } finally {
      setLoading(false);
      setIsFetchingMore(false);
    }
  }, []);

  // Fetch on mount
  useEffect(() => {
    nextPageTokenRef.current = null;
    fetchEmails();
  }, [fetchEmails]);

  // ─── Loading ─────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3">
        <Loader2 className="w-8 h-8 text-emerald-500 animate-spin" />
        <p className="text-xs text-zinc-400 animate-pulse">Connecting to email accounts…</p>
      </div>
    );
  }

  // ─── Error states ────────────────────────────────────────────
  if (error === 'not_connected' || error === 'token_expired') {
    return (
      <div className="max-w-2xl mx-auto text-center py-16">
        <div className="w-16 h-16 bg-zinc-100 dark:bg-zinc-800 rounded-2xl flex items-center justify-center mx-auto mb-4">
          <Mail className="w-8 h-8 text-zinc-400" />
        </div>
        <h3 className="text-lg font-bold text-zinc-900 dark:text-white mb-2">
          {error === 'token_expired' ? 'Session Expired' : 'No Email Account Connected'}
        </h3>
        <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-6">
          Connect an email account in Settings to view trade emails, or use Smart Capture to scan invoices & quotes.
        </p>
        <button
          onClick={() => fetchEmails()}
          className="inline-flex items-center gap-2 px-6 py-3 bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 font-bold rounded-xl hover:opacity-90 transition-all"
        >
          <RefreshCw className="w-4 h-4" />
          Refresh
        </button>
      </div>
    );
  }

  if (error === 'fetch_failed') {
    return (
      <div className="max-w-2xl mx-auto text-center py-16">
        <div className="w-16 h-16 bg-red-50 dark:bg-red-900/20 rounded-2xl flex items-center justify-center mx-auto mb-4">
          <Mail className="w-8 h-8 text-red-400" />
        </div>
        <h3 className="text-lg font-bold text-zinc-900 dark:text-white mb-2">Unable to Load Emails</h3>
        <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-6">Something went wrong. Please try again.</p>
        <button
          onClick={() => fetchEmails()}
          className="inline-flex items-center gap-2 px-6 py-3 bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-white font-bold rounded-xl hover:opacity-90 transition-all"
        >
          <RefreshCw className="w-4 h-4" />
          Retry
        </button>
      </div>
    );
  }

  // ─── Email list ──────────────────────────────────────────────
  const providersInList = Array.from(new Set(emails.map(e => getServiceName(e.provider))));
  const headerTitle = providersInList.length === 1 
    ? `${providersInList[0]} Inbox` 
    : providersInList.length > 1 
      ? 'Connected Inbox' 
      : 'Email Inbox';
  const headerSubtitle = providersInList.length > 0 
    ? `Unified correspondence across ${providersInList.join(', ')}` 
    : 'Recent Trade Correspondence';

  return (
    <div className="max-w-2xl mx-auto pb-32">
      <PageHeader
        icon={Mail}
        title={headerTitle}
        subtitle={headerSubtitle}
        extra={
          <div className="bg-gradient-to-r from-emerald-500/10 to-blue-500/10 border border-emerald-500/20 dark:border-emerald-400/10 p-1 rounded-2xl flex gap-1">
            <button 
              onClick={() => fetchEmails()} 
              disabled={loading}
              className="p-2.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-750 transition-colors text-slate-600 dark:text-slate-400"
              title="Refresh"
            >
              <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
            </button>
            <button 
              onClick={() => window.open('https://mail.google.com', '_blank')} 
              className="p-2.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-750 transition-colors text-slate-600 dark:text-slate-400"
              title="Open Connected Mail"
            >
              <ExternalLink size={18} />
            </button>
          </div>
        }
      />

      {/* Email List Header Toolbar */}
      {emails.length > 0 && (
        <div className="flex items-center justify-between bg-zinc-50 dark:bg-zinc-900/50 border border-zinc-200/80 dark:border-zinc-800 p-2.5 rounded-xl mb-3">
          <label className="flex items-center gap-2 cursor-pointer select-none text-xs font-bold text-zinc-600 dark:text-zinc-400 pl-1">
            <input 
              type="checkbox"
              checked={selectedIds.size > 0 && selectedIds.size === emails.length}
              onChange={(e) => {
                if (e.target.checked) {
                  setSelectedIds(new Set(emails.map(e => e.id)));
                } else {
                  setSelectedIds(new Set());
                }
              }}
              className="w-4 h-4 rounded border-zinc-300 text-red-500 focus:ring-red-500 cursor-pointer"
            />
            <span>
              {selectedIds.size === 0 
                ? 'Select All' 
                : `${selectedIds.size} of ${emails.length} selected`}
            </span>
          </label>

          {selectedIds.size > 0 && (
            <button
              onClick={() => {
                const count = selectedIds.size;
                const selectedEmailsList = emails.filter(e => selectedIds.has(e.id));
                const providersPresent = Array.from(new Set(selectedEmailsList.map(e => getServiceName(e.provider))));
                const serviceNameStr = providersPresent.join(' & ');

                setConfirmConfig({
                  isOpen: true,
                  title: `Dismiss ${count} Email${count === 1 ? '' : 's'}?`,
                  message: `Are you sure you want to dismiss ${count} ${count === 1 ? 'email' : 'emails'} from your unified inbox view?`,
                  confirmLabel: isBatchTrashing ? 'Dismissing...' : 'Dismiss',
                  variant: 'warning',
                  onConfirm: () => trashBatchEmails(Array.from(selectedIds))
                });
              }}
              disabled={isBatchTrashing}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-500/10 hover:bg-zinc-500/20 text-zinc-600 dark:text-zinc-400 border border-zinc-500/20 font-bold text-xs rounded-lg transition-colors active:scale-95 disabled:opacity-50"
            >
              {isBatchTrashing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
              Dismiss ({selectedIds.size})
            </button>
          )}
        </div>
      )}

      {/* Email List */}
      {emails.length === 0 ? (
        <div className="text-center py-12 max-w-md mx-auto">
          <div className="w-16 h-16 bg-zinc-100 dark:bg-zinc-800/80 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-zinc-200 dark:border-zinc-700/50">
            <Inbox className="w-8 h-8 text-zinc-400" />
          </div>
          <h3 className="text-base font-bold text-zinc-900 dark:text-white mb-1.5">No Emails Found</h3>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-6 leading-relaxed">
            Connect your Gmail inbox or another email account to see customer inquiries, supplier invoices, merchant updates, and job notices here.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-2.5">
            <button
              onClick={() => {
                setPasswordModalProvider('google');
                setIsPasswordModalOpen(true);
              }}
              className="w-full sm:w-auto px-4 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 transition-all shadow-xs active:scale-95 cursor-pointer"
            >
              <GoogleIcon className="w-4 h-4" isColoured={false} />
              Connect Gmail
            </button>
            <button
              onClick={() => fetchEmails()}
              className="w-full sm:w-auto px-4 py-2.5 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-200 rounded-xl text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 transition-all active:scale-95 cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Refresh
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          {emails.map((email) => {
            const isChecked = selectedIds.has(email.id);
            return (
              <motion.div
                key={email.id}
                layout
                className={`flex items-center gap-2 w-full bg-white dark:bg-zinc-900 border rounded-xl p-3 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-all relative overflow-hidden ${
                  isChecked
                    ? 'border-red-500/40 bg-red-50/20 dark:bg-red-950/10'
                    : email.unread
                    ? 'border-emerald-200/50 dark:border-emerald-800/30'
                    : 'border-zinc-100 dark:border-zinc-800'
                }`}
              >
                <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-red-500" />
                
                <input
                  type="checkbox"
                  checked={isChecked}
                  onChange={(e) => {
                    e.stopPropagation();
                    setSelectedIds(prev => {
                      const next = new Set(prev);
                      if (e.target.checked) {
                        next.add(email.id);
                      } else {
                        next.delete(email.id);
                      }
                      return next;
                    });
                  }}
                  className="w-4 h-4 ml-1 rounded border-zinc-300 text-red-500 focus:ring-red-500 cursor-pointer shrink-0"
                />

                <div 
                  onClick={() => setSelectedEmail(email)} 
                  className="flex-1 min-w-0 cursor-pointer flex items-start justify-between gap-2"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      {email.unread && (
                        <div className="w-2 h-2 bg-emerald-500 rounded-full shrink-0" />
                      )}
                      {email.provider === 'microsoft' && <MicrosoftIcon className="w-3.5 h-3.5 shrink-0" isColoured={true} />}
                      {email.provider === 'yahoo' && <YahooIcon className="w-3.5 h-3.5 shrink-0" isColoured={true} />}
                      {email.provider === 'apple' && <AppleIcon className="w-3.5 h-3.5 shrink-0" isColoured={true} />}
                      {(!email.provider || email.provider === 'google') && <GoogleIcon className="w-3.5 h-3.5 shrink-0" isColoured={true} />}
                      <span className={`text-sm truncate ${
                        email.unread
                          ? 'font-bold text-zinc-900 dark:text-white'
                          : 'font-medium text-zinc-700 dark:text-zinc-300'
                      }`}>
                        {email.from}
                      </span>
                    </div>
                    <h4 className={`text-sm leading-tight mt-0.5 truncate ${
                      email.unread
                        ? 'font-bold text-zinc-900 dark:text-white'
                        : 'text-zinc-600 dark:text-zinc-400'
                    }`}>
                      {email.subject}
                    </h4>
                    <p className="text-[11px] text-zinc-400 dark:text-zinc-500 leading-snug line-clamp-1 mt-0.5">
                      {email.snippet}
                    </p>
                  </div>
                  <ExternalLink className="w-3 h-3 text-zinc-300 shrink-0 mt-1" />
                </div>
              </motion.div>
            );
          })}

          {hasMore && (
            <div className="pt-4 flex justify-center">
              <button
                onClick={() => fetchEmails(undefined, true)}
                disabled={isFetchingMore}
                className="px-6 py-3 text-white rounded-xl font-black uppercase tracking-widest text-[10px] active:scale-95 transition-all flex items-center gap-2 disabled:opacity-50"
                style={{ backgroundColor: settings.themeColor }}
              >
                {isFetchingMore ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                Load More
              </button>
            </div>
          )}
        </div>
      )}

      {/* Email Body / Detail View Modal */}
      <AnimatePresence>
        {selectedEmail && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-0 sm:p-8">
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
              className="relative bg-white dark:bg-zinc-900 rounded-none sm:rounded-[32px] w-full max-w-5xl overflow-hidden flex flex-col h-full sm:h-auto sm:max-h-[92vh] border border-zinc-200 dark:border-zinc-800"
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
                      const serviceName = getServiceName(selectedEmail.provider);
                      setConfirmConfig({
                        isOpen: true,
                        title: `Delete Email from ${serviceName}?`,
                        message: `⚠️ PERMANENT DELETION WARNING: Deleting this email in Tribe Trade will PERMANENTLY move it to Trash in your connected ${serviceName} account (${selectedEmail.accountEmail || 'primary account'}) as well. Are you sure you want to delete it?`,
                        confirmLabel: `Delete from ${serviceName}`,
                        variant: 'danger',
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
              <div className="flex-1 overflow-y-auto p-4 sm:p-8 space-y-6">
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-2xl bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center font-black text-emerald-600 dark:text-emerald-400 text-lg">
                        {selectedEmail.from && selectedEmail.from.length > 0 ? selectedEmail.from[0].toUpperCase() : '?'}
                      </div>
                      <div>
                        <h4 className="font-black text-zinc-900 dark:text-white leading-tight">{selectedEmail.from}</h4>
                        <p className="text-[9px] font-bold text-zinc-400 uppercase tracking-[0.2em]">{format(new Date(selectedEmail.date), 'MMMM d, yyyy • HH:mm')}</p>
                      </div>
                    </div>
                  </div>
                  
                  <h2 className="text-xl sm:text-2xl font-black text-zinc-900 dark:text-white leading-tight">
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
                  ) : selectedEmail.bodyError ? (
                    <div className="flex flex-col items-center justify-center py-12 gap-3 rounded-xl border border-red-200 dark:border-red-900/30 bg-red-50/50 dark:bg-red-900/10 p-6">
                      <Mail className="w-8 h-8 text-red-400" />
                      <div className="text-center">
                        <p className="font-semibold text-red-800 dark:text-red-200 text-sm mb-1">Could Not Load This Email</p>
                        <p className="text-xs text-red-600 dark:text-red-400">{selectedEmail.bodyError}</p>
                      </div>
                      <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-2">You can still view it in {getServiceName(selectedEmail.provider)}:</p>
                      <a 
                        href={getWebmailUrl(selectedEmail)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-2 px-4 py-2 bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 font-bold text-xs rounded-lg hover:bg-zinc-200 transition-all"
                      >
                        Open in {getServiceName(selectedEmail.provider)}
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    </div>
                  ) : selectedEmail.body ? (
                    <div className="overflow-x-auto">
                      <iframe 
                        title="Email Content"
                        srcDoc={`
                          <html>
                            <head>
                              <style>
                                body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; font-size: 14px; line-height: 1.5; color: #374151; margin: 0; padding: 0; }
                                img { max-width: 100%; height: auto; display: block; }
                                img[src^="https://images.webapi.gc.roversservices.co.uk"] { display: none !important; }
                                a { color: #10b981; }
                              </style>
                              <script>
                                window.onload = () => {
                                  document.querySelectorAll('img').forEach(img => {
                                    img.onerror = () => img.style.display = 'none';
                                  });
                                };
                              </script>
                            </head>
                            <body style="padding: 20px;">${selectedEmail.body}</body>
                          </html>
                        `}
                        className="w-full min-h-[600px] border-none"
                      />
                    </div>
                  ) : (
                    <p className="text-zinc-600 dark:text-zinc-300 leading-relaxed text-sm whitespace-pre-wrap">
                      {selectedEmail.snippet}...
                    </p>
                  )}
                  
                  <div className="py-6 text-center border-2 border-dashed border-zinc-100 dark:border-zinc-800 rounded-3xl mt-4">
                    <p className="text-[9px] font-bold text-zinc-400 uppercase tracking-[0.2em] mb-4">View Full Thread in {getServiceName(selectedEmail.provider)}</p>
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

      {/* Smart Capture Modal */}
      <AnimatePresence>
        {showSmartCapture && !showSmartCapture.bodyError && (
          <SmartCaptureModal 
            onClose={() => setShowSmartCapture(null)} 
            initialEmailText={`Subject: ${showSmartCapture.subject}\nFrom: ${showSmartCapture.from}\nDate: ${showSmartCapture.date}\n\nContent:\n${stripHtml(showSmartCapture.body || showSmartCapture.snippet).substring(0, 5000)}`}
            members={members}
          />
        )}
      </AnimatePresence>
      <ConfirmModal 
        isOpen={confirmConfig.isOpen}
        title={confirmConfig.title}
        message={confirmConfig.message}
        confirmLabel={confirmConfig.confirmLabel}
        variant={confirmConfig.variant || 'danger'}
        onConfirm={confirmConfig.onConfirm}
        onClose={() => setConfirmConfig(prev => ({ ...prev, isOpen: false }))}
      />
      <AnimatePresence>
        {isPasswordModalOpen && (
          <AppSpecificPasswordModal
            onClose={() => setIsPasswordModalOpen(false)}
            onSuccess={() => {
              showToast('Connected Gmail account successfully!', 'success');
              fetchEmails();
            }}
            initialProvider={passwordModalProvider}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
