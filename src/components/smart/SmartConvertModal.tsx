import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  X,
  Loader2,
  Check,
  Sparkles,
  StickyNote,
  CheckSquare,
  RefreshCw,
  Zap,
  Calendar,
  Share2,
  Trash2,
  Copy
} from 'lucide-react';
import { shareToWhatsApp, shareViaWebShare, formatSmartConvertEventText, copyToClipboard } from '../../lib/shareUtils';
import { processSmartConvert } from '../../services/smartCaptureService';
import { weatherService } from '../../services/weatherService';
import { db } from '../../lib/firebase';
import { collection, addDoc, doc, updateDoc, query, where, getDocs } from 'firebase/firestore';
import { useAuth } from '../../App';
import { useSettings } from '../../contexts/SettingsContext';
import { logger } from '../../services/logger';
import { useToast } from '../../contexts/ToastContext';
import { syncToGoogleCalendar } from '../../services/googleCalendar';
import ReactMarkdown from 'react-markdown';
import { parseAISODateToLocal } from '../../lib/dateUtils';

const getLocalDateString = (dateObj: Date | string) => {
  try {
    const d = new Date(dateObj);
    if (isNaN(d.getTime())) return '';
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  } catch (e) {
    return '';
  }
};

const getLocalTimeString = (dateObj: Date | string) => {
  try {
    const d = new Date(dateObj);
    if (isNaN(d.getTime())) return '09:00';
    const hours = String(d.getHours()).padStart(2, '0');
    const minutes = String(d.getMinutes()).padStart(2, '0');
    return `${hours}:${minutes}`;
  } catch (e) {
    return '09:00';
  }
};

const setLocalDate = (currentDateObj: Date | string | null | undefined, newDateStr: string) => {
  const d = currentDateObj ? new Date(currentDateObj) : new Date();
  const [year, month, day] = newDateStr.split('-').map(Number);
  d.setFullYear(year, month - 1, day);
  return d.toISOString();
};

const setLocalTime = (currentDateObj: Date | string | null | undefined, newTimeStr: string) => {
  const d = currentDateObj ? new Date(currentDateObj) : new Date();
  const [hours, minutes] = newTimeStr.split(':').map(Number);
  d.setHours(hours, minutes, 0, 0);
  return d.toISOString();
};

interface SmartConvertModalProps {
  onClose: () => void;
  content: string;
  originalId?: string;
  originalType?: 'note' | 'task' | 'event';
  members?: any[];
  onUpdated?: (newTitle: string, newContent: string) => void;
}

export default function SmartConvertModal({ onClose, content, originalId, originalType, members = [], onUpdated }: SmartConvertModalProps) {
  const { showToast } = useToast();
  const { user, tradeUserId, googleAccessToken } = useAuth();
  const [loading, setLoading] = useState(true);
  const [result, setResult] = useState<{ title: string; expandedContent: string; summary: string; actions?: any[]; replyDraft?: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [selectedAssignees, setSelectedAssignees] = useState<string[]>([]);
  const [isShared, setisShared] = useState(true);
  const [duplicateWarning, setDuplicateWarning] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<(() => void) | null>(null);
  const { settings } = useSettings();

  const handleRemoveAction = (index: number) => {
    if (!result || !result.actions) return;
    const updatedActions = result.actions.filter((_, i) => i !== index);
    setResult({ ...result, actions: updatedActions });
  };

  useEffect(() => {
    handleProcess();
  }, []);

  const handleProcess = async () => {
    setLoading(true);
    setError(null);
    try {
      const forecast = await weatherService.get5DayForecast();
      const res = await processSmartConvert(content, members, forecast);

      // Conflict Detection
      if (tradeUserId) {
        let conflictFound = false;

        // 1. Check Events
        if (res.actions) {
          const eventsRef = collection(db, 'trade_users', tradeUserId, 'calendarEvents');
          for (const action of res.actions) {
            if (action.action === 'CREATE_CALENDAR_EVENT' && action.data?.startTime) {
              const start = new Date(action.data.startTime);
              const end = new Date(start.getTime() + 60 * 60 * 1000); // Assume 1hr

              const q = query(eventsRef,
                where('startTime', '>=', start),
                where('startTime', '<=', end)
              );
              const snap = await getDocs(q);
              if (!snap.empty) {
                setDuplicateWarning(`Schedule Clash: This overlaps with an existing event "${snap.docs[0].data().title}".`);
                conflictFound = true;
                break;
              }
            }
          }
        }

        // 2. Check Tasks & Notes by Title (if no event conflict found)
        if (!conflictFound && res.title) {
          const tasksRef = collection(db, 'trade_users', tradeUserId, 'tasks');
          const tasksQ = query(tasksRef, where('title', '==', res.title));
          const tasksSnap = await getDocs(tasksQ);
          if (!tasksSnap.empty) {
            setDuplicateWarning(`A task with the title "${res.title}" already exists.`);
            conflictFound = true;
          }

          if (!conflictFound) {
            const notesRef = collection(db, 'trade_users', tradeUserId, 'notes');
            const notesQ = query(notesRef, where('title', '==', res.title));
            const notesSnap = await getDocs(notesQ);
            if (!notesSnap.empty) {
              setDuplicateWarning(`A note with the title "${res.title}" already exists.`);
            }
          }
        }
      }

      setResult(res);

      // Auto-assign based on AI suggestion if available
      const firstTask = res.actions?.find((a: any) => a.action === 'CREATE_TASK');
      if (firstTask?.data?.assignedTo) {
        if (firstTask.data.assignedTo === 'all') {
          setSelectedAssignees(['all']);
        } else {
          const names = firstTask.data.assignedTo.split(/, | and /);
          const foundIds = members
            .filter(m => names.some((n: string) => m.name.toLowerCase() === n.toLowerCase() || m.id === n))
            .map(m => m.id);
          setSelectedAssignees(foundIds);
        }
      }
    } catch (err: any) {
      logger.error('Smart convert failed', err);
      if (err.message === 'LIMIT_EXCEEDED') {
        setError('Daily limit reached. Please wait or upgrade to Premium for more uses.');
      } else {
        setError('Tribe failed to convert your notes. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };
  const confirmAndExecute = (actionFn: () => void) => {
    if (duplicateWarning) {
      setPendingAction(() => actionFn);
    } else {
      actionFn();
    }
  };

  const handleSaveAsNewNote = async () => {
    if (!result || !tradeUserId || !user) return;
    setSaving(true);
    try {
      await addDoc(collection(db, 'trade_users', tradeUserId, 'notes'), {
        title: result.title,
        content: result.expandedContent,
        authorId: user.uid,
        isShared: isShared,
        color: '#f4f4f5',
        createdAt: new Date().toISOString()
      });
      onClose();
    } catch (err) {
      logger.error('Save new note failed', err);
      setError('Failed to save as new note.');
      setSaving(false);
    }
  };

  const handleSaveAsNewTask = async () => {
    if (!result || !tradeUserId || !user) return;
    setSaving(true);
    try {
      const taskAction = result.actions?.find(a => a.action === 'CREATE_TASK');
      const actionDueDate = taskAction?.data?.dueDate;
      const parsedDueDate = actionDueDate ? parseAISODateToLocal(actionDueDate) : null;

      await addDoc(collection(db, 'trade_users', tradeUserId, 'tasks'), {
        title: result.title,
        description: result.expandedContent,
        authorId: user.uid,
        isShared: isShared,
        assignedTo: selectedAssignees.length > 0 ? (selectedAssignees.includes('all') ? 'all' : selectedAssignees) : 'all',
        status: 'pending',
        dueDate: parsedDueDate,
        reminderTime: parsedDueDate,
        notified: false,
        createdAt: new Date().toISOString()
      });
      onClose();
    } catch (err) {
      logger.error('Save new task failed', err);
      setError('Failed to save as new task.');
      setSaving(false);
    }
  };

  const handleSaveAsNewEvent = async () => {
    if (!result || !tradeUserId || !user) return;
    setSaving(true);
    try {
      let startTime = new Date();
      let endTime = new Date(startTime.getTime() + 3600000);
      let location = '';
      const eventAction = result.actions?.find(a => a.action === 'CREATE_CALENDAR_EVENT');
      if (eventAction?.data) {
        if (eventAction.data.startTime) {
          const parsedTime = parseAISODateToLocal(eventAction.data.startTime);
          if (parsedTime) {
            startTime = parsedTime;
            endTime = new Date(startTime.getTime() + 3600000);
          }
        }
        if (eventAction.data.endTime) {
          const parsedEnd = parseAISODateToLocal(eventAction.data.endTime);
          if (parsedEnd && !isNaN(parsedEnd.getTime())) endTime = parsedEnd;
        }
        if (eventAction.data.location) location = eventAction.data.location;
      }

      const docRef = await addDoc(collection(db, 'trade_users', tradeUserId, 'calendarEvents'), {
        title: result.title,
        description: result.expandedContent,
        startTime: startTime,
        endTime: endTime,
        reminderTime: startTime, // Mapping for background notifier
        notified: false,
        location: location,
        authorId: user.uid,
        isShared: isShared,
        createdAt: new Date().toISOString()
      });

      // Sync to Google Calendar if connected
      if (googleAccessToken) {
        const gEvent = await syncToGoogleCalendar(googleAccessToken, {
          title: result.title,
          description: result.expandedContent,
          startTime: startTime.toISOString(),
          endTime: endTime.toISOString(),
          location: location
        });

        if (gEvent && gEvent.id) {
          await updateDoc(docRef, { googleEventId: gEvent.id });
        }
      }

      onClose();
    } catch (err) {
      logger.error('Save new event failed', err);
      setError('Failed to save as new event.');
      setSaving(false);
    }
  };

  const handleApplyActions = async () => {
    if (!result?.actions || !tradeUserId || !user) return;
    setSaving(true);
    try {
      for (const actionItem of result.actions) {
        const { action, data } = actionItem;
        if (action === 'CREATE_TASK') {
          const isRSVP = data.title?.toLowerCase().includes('rsvp');
          const parsedDueDate = data.dueDate ? parseAISODateToLocal(data.dueDate) : null;
          await addDoc(collection(db, 'trade_users', tradeUserId, 'tasks'), {
            title: data.title || result.title,
            description: data.description || '',
            authorId: user.uid,
            isShared: isShared,
            assignedTo: selectedAssignees.length > 0 ? (selectedAssignees.includes('all') ? 'all' : selectedAssignees) : (data.assignedTo || 'all'),
            status: 'pending',
            dueDate: parsedDueDate,
            reminderTime: parsedDueDate,
            notified: false,
            nudgeEnabled: isRSVP, // Forget-Me-Not Ping for RSVPs
            nudgeAt: parsedDueDate ? new Date(parsedDueDate.getTime() - 48 * 60 * 60 * 1000) : null,
            priority: isRSVP ? 'high' : 'medium',
            createdAt: new Date().toISOString()
          });
        } else if (action === 'CREATE_CALENDAR_EVENT') {
          const startTime = data.startTime ? parseAISODateToLocal(data.startTime) || new Date() : new Date();
          const docRef = await addDoc(collection(db, 'trade_users', tradeUserId, 'calendarEvents'), {
            title: data.title || result.title,
            description: data.description || '',
            assignedTo: selectedAssignees.length > 0 ? (selectedAssignees.includes('all') ? 'all' : selectedAssignees) : (data.assignedTo || 'all'),
            startTime: startTime,
            reminderTime: startTime, // Mapping for background notifier
            notified: false,
            location: data.location || '',
            authorId: user.uid,
            isShared: isShared,
            createdAt: new Date().toISOString()
          });

          // Sync to Google Calendar if connected
          if (googleAccessToken) {
            const gEvent = await syncToGoogleCalendar(googleAccessToken, {
              title: data.title || result.title,
              description: data.description || '',
              startTime: startTime.toISOString(),
              location: data.location
            });

            if (gEvent && gEvent.id) {
              await updateDoc(docRef, { googleEventId: gEvent.id });
            }
          }
        } else if (action === 'CREATE_SHOPPING_ITEM') {
          await addDoc(collection(db, 'trade_users', tradeUserId, 'shoppingList'), {
            name: data.name || data.title || result.title,
            category: data.category || 'Essentials',
            checked: false,
            authorId: user.uid,
            createdAt: new Date().toISOString()
          });
        }
      }
      onClose();
    } catch (err) {
      logger.error('Apply actions failed', err);
      setError('Failed to apply some actions.');
      setSaving(false);
    }
  };

  const handleUpdateOriginal = async () => {
    if (!result || !tradeUserId || !originalId || !originalType) return;
    setSaving(true);
    try {
      const coll = originalType === 'note' ? 'notes' : (originalType === 'event' ? 'calendarEvents' : 'tasks');
      const updates: any = originalType === 'note'
        ? { title: result.title, content: result.expandedContent }
        : { title: result.title, description: result.expandedContent };

      await updateDoc(doc(db, 'trade_users', tradeUserId, coll, originalId), updates);
      onUpdated?.(result.title, result.expandedContent);
      onClose();
    } catch (err) {
      logger.error('Update original failed', err);
      setError('Failed to update the original item.');
      setSaving(false);
    }
  };

  const handleShareReply = async (method: 'whatsapp' | 'webshare' | 'copy') => {
    if (!result?.replyDraft) return;
    const text = `💬 Reply Draft:\n"${result.replyDraft}"`;

    if (method === 'whatsapp') {
      shareToWhatsApp(text);
      showToast('Shared reply draft to WhatsApp!', 'success');
    } else if (method === 'webshare') {
      const shared = await shareViaWebShare({
        title: 'Reply Draft',
        text: text
      });
      if (!shared) {
        shareToWhatsApp(text);
      }
    } else {
      const copied = await copyToClipboard(text);
      if (copied) {
        showToast('Reply draft copied to clipboard!', 'success');
      }
    }
  };

  const handleShareContent = async (method: 'whatsapp' | 'webshare' | 'copy') => {
    if (!result) return;

    let startTime = '';
    let location = '';
    const eventAction = result.actions?.find(a => a.action === 'CREATE_CALENDAR_EVENT');
    if (eventAction?.data) {
      if (eventAction.data.startTime) startTime = eventAction.data.startTime;
      if (eventAction.data.location) location = eventAction.data.location;
    }

    const text = formatSmartConvertEventText(result.title, result.expandedContent, startTime, location);

    if (method === 'whatsapp') {
      shareToWhatsApp(text);
      showToast('Shared event details to WhatsApp!', 'success');
    } else if (method === 'webshare') {
      const shared = await shareViaWebShare({
        title: result.title,
        text: text
      });
      if (!shared) {
        shareToWhatsApp(text);
      }
    } else {
      const copied = await copyToClipboard(text);
      if (copied) {
        showToast('Event details copied to clipboard!', 'success');
      }
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center sm:p-4">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="absolute inset-0 bg-zinc-950/60 backdrop-blur-md"
      />

      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 40 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 40 }}
        className="relative w-full max-w-2xl bg-white dark:bg-zinc-900 rounded-t-[28px] sm:rounded-[32px] overflow-hidden flex flex-col h-[85dvh] sm:h-auto sm:max-h-[90vh]"
      >
        <div className="px-4 py-3 sm:p-6 border-b border-zinc-100 dark:border-zinc-800 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-2xl bg-emerald-500 flex items-center justify-center text-white">
              <Zap className="w-4 h-4 sm:w-5 sm:h-5" />
            </div>
            <div>
              <h3 className="text-lg sm:text-xl font-bold text-zinc-900 dark:text-white">Smart Convert</h3>
              <p className="text-[10px] font-black text-emerald-500 uppercase tracking-widest">AI Smart Conversion</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button 
              onClick={() => handleShareContent('webshare')} 
              className="p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-xl transition-colors text-zinc-400 hover:text-emerald-500"
              title="Share Event Details"
            >
              <Share2 className="w-5 h-5 sm:w-6 sm:h-6" />
            </button>
            <button onClick={onClose} className="p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-xl transition-colors">
              <X className="w-5 h-5 sm:w-6 sm:h-6 text-zinc-400" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto overscroll-contain p-4 sm:p-10">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-16 sm:py-20 gap-6">
              <div className="relative">
                <div className="w-20 h-20 border-4 border-emerald-100 dark:border-emerald-900/20 rounded-full" />
                <div className="absolute inset-0 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin" />
              </div>
              <div className="text-center">
                <h4 className="text-lg font-bold text-zinc-900 dark:text-white">Tribe is strategising...</h4>
                <p className="text-zinc-500">Expanding your ideas into a plan of attack.</p>
              </div>
            </div>
          ) : error ? (
            <div className="text-center py-12">
              <div className="w-16 h-16 bg-red-50 dark:bg-red-900/20 text-red-500 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <RefreshCw className="w-8 h-8" />
              </div>
              <p className="text-zinc-900 dark:text-white font-bold mb-2">Something went wrong</p>
              <p className="text-sm text-zinc-500 mb-6">{error}</p>
              <button onClick={handleProcess} className="px-6 py-3 bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 rounded-xl font-bold">Try Again</button>
            </div>
          ) : result && (
            <div className="space-y-5">

              <div className="space-y-3">
                <h2 className="text-xl sm:text-2xl font-black text-zinc-900 dark:text-white leading-tight">
                  {result.title}
                </h2>
                <div className="prose prose-sm dark:prose-invert max-w-none whitespace-pre-wrap text-sm leading-relaxed text-zinc-600 dark:text-zinc-400 prose-a:text-emerald-500 hover:prose-a:text-emerald-600">
                  <ReactMarkdown>{result.expandedContent}</ReactMarkdown>
                </div>

                {/* One-Tap Reply */}
                {result.replyDraft && result.replyDraft.trim().length > 0 && (
                  <div className="mt-4 p-3 sm:p-4 bg-emerald-50 dark:bg-emerald-900/20 rounded-2xl sm:rounded-3xl border border-emerald-100 dark:border-emerald-800">
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="text-[10px] font-black uppercase tracking-widest text-emerald-600 dark:text-emerald-400">Invite Reply Draft</h4>
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => handleShareReply('webshare')}
                          className="flex items-center gap-1 px-2.5 py-1 bg-emerald-500 text-white text-[9px] font-black uppercase tracking-widest rounded-full hover:bg-emerald-600 transition-all shadow-sm"
                          title="Share Reply via native Apps"
                        >
                          <Share2 className="w-3 h-3" />
                          Share
                        </button>
                        <button
                          onClick={() => handleShareReply('copy')}
                          className="flex items-center gap-1 px-2 py-1 bg-emerald-100 dark:bg-emerald-800 text-emerald-800 dark:text-emerald-200 text-[9px] font-black uppercase tracking-widest rounded-full hover:bg-emerald-200 transition-all"
                          title="Copy Reply to Clipboard"
                        >
                          <Copy className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                    <p className="text-xs italic text-emerald-800 dark:text-emerald-200">"{result.replyDraft}"</p>
                  </div>
                )}

              </div>

              {/* Action Buttons — inside scroll area for mobile */}
              <div className="mt-6 pt-5 border-t border-zinc-100 dark:border-zinc-800">
                <div className="flex flex-col gap-3">
                  {result?.actions && result.actions.length > 0 && (
                    <div className="space-y-2 mb-2">
                      <button
                        disabled={loading || saving}
                        onClick={() => confirmAndExecute(handleApplyActions)}
                        className="w-full py-3.5 sm:py-4 text-white rounded-2xl font-black text-xs uppercase tracking-[0.2em] active:scale-[0.98] transition-all flex items-center justify-center gap-2 mb-1 shadow-lg"
                        style={{ backgroundColor: settings.themeColor, boxShadow: `0 10px 15px -3px ${settings.themeColor}33` }}
                      >
                        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                        Create All {result.actions.length} Actions
                      </button>
                      <div className="bg-zinc-100 dark:bg-zinc-800/80 rounded-2xl p-3 sm:p-4 space-y-2 border border-zinc-200/50 dark:border-zinc-700/50 text-left">
                        <p className="text-[10px] font-black uppercase tracking-widest text-zinc-500 dark:text-zinc-400">Actions to be created:</p>
                        <ul className="space-y-1.5">
                          {result.actions.map((act: any, index: number) => {
                            let icon = '📝';
                            let title = act.data?.title || act.data?.name || 'Untitled';
                            let typeLabel = 'Note';
                            if (act.action === 'CREATE_TASK') {
                              icon = '✅';
                              typeLabel = 'Task';
                            } else if (act.action === 'CREATE_CALENDAR_EVENT') {
                              icon = '📅';
                              typeLabel = 'Calendar Event';
                            } else if (act.action === 'CREATE_SHOPPING_ITEM') {
                              icon = '🛒';
                              typeLabel = 'Shopping Item';
                            } else if (act.action === 'CREATE_RECIPE') {
                              icon = '🍳';
                              typeLabel = 'Recipe';
                            }

                            return (
                              <li key={index} className="flex items-start gap-2.5 text-xs text-zinc-700 dark:text-zinc-300">
                                <span className="shrink-0 mt-0.5">{icon}</span>
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-start justify-between gap-2">
                                    <div className="min-w-0">
                                      <span className="font-semibold text-zinc-900 dark:text-white">{typeLabel}: </span>
                                      <span className="break-words">{title}</span>
                                    </div>
                                    <button
                                      onClick={() => handleRemoveAction(index)}
                                      className="p-1 text-zinc-400 hover:text-red-500 rounded-md hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors shrink-0"
                                      title="Remove action"
                                    >
                                      <X className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                  {act.action === 'CREATE_TASK' && act.data?.dueDate && (
                                    <div className="flex flex-wrap items-center gap-3 mt-1 bg-zinc-50 dark:bg-zinc-900/50 p-1.5 rounded-xl border border-zinc-150/50 dark:border-zinc-800 w-fit">
                                      <div className="flex items-center gap-1.5">
                                        <span className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider">Due:</span>
                                        <input
                                          type="date"
                                          value={getLocalDateString(act.data.dueDate)}
                                          onChange={(e) => {
                                            if (e.target.value) {
                                              const updatedActions = [...result.actions!];
                                              updatedActions[index].data.dueDate = setLocalDate(act.data.dueDate, e.target.value);
                                              setResult({ ...result, actions: updatedActions });
                                            }
                                          }}
                                          className="bg-transparent text-[10px] text-emerald-600 dark:text-emerald-400 font-medium focus:outline-none cursor-pointer border-none p-0"
                                        />
                                      </div>
                                      <div className="flex items-center gap-1.5 border-l border-zinc-200 dark:border-zinc-800 pl-3">
                                        <span className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider">Time:</span>
                                        <input
                                          type="time"
                                          value={getLocalTimeString(act.data.dueDate)}
                                          onChange={(e) => {
                                            if (e.target.value) {
                                              const updatedActions = [...result.actions!];
                                              updatedActions[index].data.dueDate = setLocalTime(act.data.dueDate, e.target.value);
                                              setResult({ ...result, actions: updatedActions });
                                            }
                                          }}
                                          className="bg-transparent text-[10px] text-emerald-600 dark:text-emerald-400 font-medium focus:outline-none cursor-pointer border-none p-0"
                                        />
                                      </div>
                                    </div>
                                  )}
                                  {act.action === 'CREATE_CALENDAR_EVENT' && act.data?.startTime && (
                                    <div className="flex flex-wrap items-center gap-3 mt-1 bg-zinc-50 dark:bg-zinc-900/50 p-1.5 rounded-xl border border-zinc-150/50 dark:border-zinc-800 w-fit">
                                      <div className="flex items-center gap-1.5">
                                        <span className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider">Date:</span>
                                        <input
                                          type="date"
                                          value={getLocalDateString(act.data.startTime)}
                                          onChange={(e) => {
                                            if (e.target.value) {
                                              const updatedActions = [...result.actions!];
                                              updatedActions[index].data.startTime = setLocalDate(act.data.startTime, e.target.value);
                                              setResult({ ...result, actions: updatedActions });
                                            }
                                          }}
                                          className="bg-transparent text-[10px] text-blue-600 dark:text-blue-400 font-medium focus:outline-none cursor-pointer border-none p-0"
                                        />
                                      </div>
                                      <div className="flex items-center gap-1.5 border-l border-zinc-200 dark:border-zinc-800 pl-3">
                                        <span className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider">Time:</span>
                                        <input
                                          type="time"
                                          value={getLocalTimeString(act.data.startTime)}
                                          onChange={(e) => {
                                            if (e.target.value) {
                                              const updatedActions = [...result.actions!];
                                              updatedActions[index].data.startTime = setLocalTime(act.data.startTime, e.target.value);
                                              setResult({ ...result, actions: updatedActions });
                                            }
                                          }}
                                          className="bg-transparent text-[10px] text-blue-600 dark:text-blue-400 font-medium focus:outline-none cursor-pointer border-none p-0"
                                        />
                                      </div>
                                    </div>
                                  )}
                                </div>
                              </li>
                            );
                          })}
                        </ul>
                      </div>
                    </div>
                  )}

                  <div className="grid grid-cols-3 gap-2 sm:gap-3">
                    <button
                      disabled={loading || saving}
                      onClick={() => confirmAndExecute(handleSaveAsNewNote)}
                      className="flex items-center justify-center gap-1.5 sm:gap-2 py-3 sm:py-4 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-2xl font-black text-[9px] uppercase tracking-widest hover:bg-emerald-50 dark:hover:bg-emerald-900/20 transition-all disabled:opacity-50"
                    >
                      <StickyNote className="w-4 h-4 text-emerald-500" />
                      Note
                    </button>
                    <button
                      disabled={loading || saving}
                      onClick={() => confirmAndExecute(handleSaveAsNewTask)}
                      className="flex items-center justify-center gap-1.5 sm:gap-2 py-3 sm:py-4 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-2xl font-black text-[9px] uppercase tracking-widest hover:bg-emerald-50 dark:hover:bg-emerald-900/20 transition-all disabled:opacity-50"
                    >
                      <CheckSquare className="w-4 h-4 text-violet-500" />
                      Task
                    </button>
                    <button
                      disabled={loading || saving}
                      onClick={() => confirmAndExecute(handleSaveAsNewEvent)}
                      className="flex items-center justify-center gap-1.5 sm:gap-2 py-3 sm:py-4 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-2xl font-black text-[9px] uppercase tracking-widest hover:bg-emerald-50 dark:hover:bg-emerald-900/20 transition-all disabled:opacity-50"
                    >
                      <Calendar className="w-4 h-4 text-blue-500" />
                      Event
                    </button>
                  </div>

                  {originalId && (
                    <button
                      disabled={loading || saving}
                      onClick={handleUpdateOriginal}
                      className="flex items-center justify-center gap-2 py-3.5 sm:py-4 text-white rounded-2xl font-black text-xs uppercase tracking-[0.2em] active:scale-[0.98] transition-all disabled:opacity-50"
                      style={{ backgroundColor: settings.themeColor }}
                    >
                      {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                      Update Original {originalType === 'note' ? 'Note' : (originalType === 'event' ? 'Event' : 'Task')}
                    </button>
                  )}
                </div>
              </div>

            </div>
          )}
        </div>

        {/* Confirmation Overlay */}
        {pendingAction && duplicateWarning && (
          <div className="absolute inset-0 z-50 bg-zinc-950/80 backdrop-blur-sm flex items-center justify-center p-4 rounded-t-[28px] sm:rounded-[32px]">
            <div className="bg-white dark:bg-zinc-900 rounded-3xl p-6 max-w-sm w-full shadow-2xl border border-zinc-100 dark:border-zinc-800 text-center">
              <div className="w-16 h-16 bg-amber-100 dark:bg-amber-900/20 text-amber-500 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <Zap className="w-8 h-8" />
              </div>
              <h3 className="text-xl font-bold text-zinc-900 dark:text-white mb-2">Possible Duplicate</h3>
              <p className="text-zinc-500 text-sm mb-6">{duplicateWarning}<br /><br />Are you sure you want to continue?</p>
              <div className="flex gap-3">
                <button
                  onClick={() => setPendingAction(null)}
                  className="flex-1 py-3 px-4 rounded-xl font-bold text-zinc-900 dark:text-white bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    if (pendingAction) pendingAction();
                    setPendingAction(null);
                  }}
                  className="flex-1 py-3 px-4 rounded-xl font-bold text-white bg-emerald-500 hover:bg-emerald-600 transition-colors"
                >
                  Continue
                </button>
              </div>
            </div>
          </div>
        )}

      </motion.div>
    </div>
  );
}
