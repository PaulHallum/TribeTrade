import React, { useState } from 'react';
import { motion } from 'motion/react';
import { X, Trash2, Save, Calendar as CalendarIcon, Clock, MapPin, AlignLeft, Loader2, Navigation, Sparkles, Share2, Bell } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { useSettings } from '../../contexts/SettingsContext';
import { useToast } from '../../contexts/ToastContext';
import { format, parseISO } from 'date-fns';
import { db } from '../../lib/firebase';
import { doc, updateDoc, deleteDoc, collection, addDoc, query, where, getDocs, getDoc } from 'firebase/firestore';
import { useAuth } from '../../App';
import { logger } from '../../services/logger';
import { combineDateTimeToISO, combineDateTimeToDate, formatToLocalDateTime, ensureDate } from '../../lib/dateUtils';
import { syncToGoogleCalendar } from '../../services/googleCalendar';
import { ReminderOffset, REMINDER_OPTIONS, calculateReminderTime, getGoogleCalendarReminders } from '../../lib/reminderUtils';
import SmartConvertModal from '../smart/SmartConvertModal';
import { AnimatePresence } from 'motion/react';
import { shareViaWebShare, shareToWhatsApp, formatSmartConvertEventText } from '../../lib/shareUtils';

interface CalendarEvent {
  id: string;
  title: string;
  description?: string;
  startTime: string;
  endTime?: string;
  location?: string;
  assignedTo?: string;
  authorId?: string;
  type?: 'event' | 'external' | 'birthday';
  googleEventId?: string;
  isShared?: boolean;
  editable?: boolean; // New flag to prevent 403 errors on read-only events
}

interface FamilyMember {
  id: string;
  name: string;
}

interface CalendarEventModalProps {
  event: CalendarEvent;
  tradeUserId: string;
  members: FamilyMember[];
  onClose: () => void;
}

export default function CalendarEventModal({ event, tradeUserId, members, onClose }: CalendarEventModalProps) {
  const { settings } = useSettings();
  const { showToast } = useToast();
  const { googleAccessToken, refreshGoogleToken, user } = useAuth();
  const [reminderOffset, setReminderOffset] = useState<ReminderOffset>((event as any)?.reminderOffset || 'at_time');
  const [editingEvent, setEditingEvent] = useState<CalendarEvent>(() => {
    const s = ensureDate(event.startTime);
    const validStart = !isNaN(s.getTime()) ? s.toISOString() : new Date().toISOString();
    const e = event.endTime ? ensureDate(event.endTime) : null;
    const startDateObj = ensureDate(validStart);
    const defaultEndIso = new Date(startDateObj.getTime() + 3600000).toISOString();
    const validEnd = e && !isNaN(e.getTime()) ? e.toISOString() : defaultEndIso;
    return {
      ...event,
      startTime: validStart,
      endTime: validEnd
    };
  });
  const [isEditingDescription, setIsEditingDescription] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [showSmartConvert, setShowSmartConvert] = useState(false);

  const handleUpdateEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tradeUserId || !editingEvent) return;

    setIsSaving(true);
    try {
      if (editingEvent.type === 'external' && (editingEvent.id.startsWith('google-') || editingEvent.id.startsWith('google|'))) {
        // Sync to Google Calendar
        if (!googleAccessToken) {
          showToast('You must be connected to Google to edit this event.', 'info');
          setIsSaving(false);
          return;
        }

        // Parse: google|{calendarId}|{eventId} or legacy google-{calendarId}-{eventId}
        const delimiter = editingEvent.id.includes('google|') ? '|' : '-';
        const parts = editingEvent.id.split(delimiter);
        const calendarId = decodeURIComponent(parts[1]);
        const eventId = parts.slice(2).join(delimiter);

        const startAsDate = ensureDate(editingEvent.startTime);
        if (isNaN(startAsDate.getTime())) {
          showToast('Please select a valid date and time.', 'error');
          setIsSaving(false);
          return;
        }

        const endAsDate = editingEvent.endTime ? ensureDate(editingEvent.endTime) : new Date(startAsDate.getTime() + 3600000);
        if (isNaN(endAsDate.getTime())) throw new Error('Invalid end time');

        let response = await fetch(
          `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${eventId}`,
          {
            method: 'PATCH',
            headers: {
              'Authorization': `Bearer ${googleAccessToken}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              summary: editingEvent.title,
              description: editingEvent.description,
              location: editingEvent.location,
              start: {
                dateTime: startAsDate.toISOString()
              },
              end: {
                dateTime: endAsDate.toISOString()
              },
              reminders: getGoogleCalendarReminders(reminderOffset),
              extendedProperties: {
                private: {
                  assignedTo: editingEvent.assignedTo || 'all',
                  isShared: String(editingEvent.isShared ?? true)
                }
              }
            })
          }
        );

        if (response.status === 401 && refreshGoogleToken) {
          const freshToken = await refreshGoogleToken();
          if (freshToken) {
            response = await fetch(
              `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${eventId}`,
              {
                method: 'PATCH',
                headers: {
                  'Authorization': `Bearer ${freshToken}`,
                  'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                  summary: editingEvent.title,
                  description: editingEvent.description,
                  location: editingEvent.location,
                  start: {
                    dateTime: startAsDate.toISOString()
                  },
                  end: {
                    dateTime: endAsDate.toISOString()
                  },
                  reminders: getGoogleCalendarReminders(reminderOffset),
                  extendedProperties: {
                    private: {
                      assignedTo: editingEvent.assignedTo || 'all',
                      isShared: String(editingEvent.isShared ?? true)
                    }
                  }
                })
              }
            );
          }
        }

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          if (response.status === 403) {
            showToast('Permission Denied: Please go to Settings and reconnect your Google account, ensuring you check the box to allow Tribe to manage your calendar.', 'error');
            throw new Error('missing_scopes');
          }
          throw new Error(errorData.error?.message || 'Failed to sync with Google');
        }
      } else if (editingEvent.type === 'event') {
        // Sync to Tribe Firestore
        const eventRef = doc(db, 'trade_users', tradeUserId, 'calendarEvents', editingEvent.id);
        const startAsDate = ensureDate(editingEvent.startTime);
        const isTimeValid = !isNaN(startAsDate.getTime());
        const endAsDate = editingEvent.endTime ? ensureDate(editingEvent.endTime) : (isTimeValid ? new Date(startAsDate.getTime() + 3600000) : null);
        
        const calculatedReminder = isTimeValid ? calculateReminderTime(startAsDate, reminderOffset) : null;
        const now = new Date();
        const shouldResetNotified = calculatedReminder ? calculatedReminder > now : false;

        await updateDoc(eventRef, {
          title: editingEvent.title,
          description: editingEvent.description || '',
          location: editingEvent.location || '',
          startTime: isTimeValid ? startAsDate.toISOString() : null,
          endTime: endAsDate ? endAsDate.toISOString() : null,
          reminderTime: calculatedReminder, // Saved as Date object (Firestore Timestamp)
          reminderOffset: reminderOffset,
          notified: !shouldResetNotified, // Only reset to false if reminder is in the future
          assignedTo: editingEvent.assignedTo || 'all',
          isShared: editingEvent.isShared ?? true
        });

        // Auto-generate 7-day advance reminder task for birthdays/anniversaries if enabled
        const titleLower = editingEvent.title.toLowerCase();
        const isBirthdayOrAnniversary = titleLower.includes('birthday') || titleLower.includes('anniversary');
        if (isBirthdayOrAnniversary && isTimeValid) {
          const familyDoc = await getDoc(doc(db, 'trade_users', tradeUserId));
          const autoBirthday = familyDoc.exists() ? (familyDoc.data()?.autoBirthdayGiftReminders ?? true) : true;

          if (autoBirthday) {
            const sevenDaysBefore = new Date(startAsDate.getTime() - 7 * 24 * 60 * 60 * 1000);
            sevenDaysBefore.setHours(9, 0, 0, 0); // Always set to 09:00 AM daytime
            let taskReminderTime = sevenDaysBefore;
            if (sevenDaysBefore < now) {
              const nextMorning = new Date(now);
              if (now.getHours() >= 9) {
                nextMorning.setDate(nextMorning.getDate() + 1);
              }
              nextMorning.setHours(9, 0, 0, 0);
              taskReminderTime = nextMorning;
            }

            // Check if a pending buy card/presents task already exists for this event
            const tasksRef = collection(db, 'trade_users', tradeUserId, 'tasks');
            const q = query(
              tasksRef,
              where('title', '==', `Buy card/presents for ${editingEvent.title}`),
              where('status', '==', 'pending')
            );
            
            const snap = await getDocs(q);
            if (snap.empty) {
              await addDoc(collection(db, 'trade_users', tradeUserId, 'tasks'), {
                title: `Buy card/presents for ${editingEvent.title}`,
                status: 'pending',
                authorId: user?.uid || '',
                assignedTo: editingEvent.assignedTo || 'all',
                isShared: editingEvent.isShared ?? true,
                dueDate: taskReminderTime,
                reminderTime: taskReminderTime,
                notified: false,
                createdAt: new Date().toISOString()
              });
            }
          }
        }

        // If Google is connected, either update existing or create new sync
        if (googleAccessToken && isTimeValid) {
          const gEventId = (editingEvent as any).googleEventId;
          
          if (gEventId) {
            // Update existing
            const response = await fetch(
              `https://www.googleapis.com/calendar/v3/calendars/primary/events/${gEventId}`,
              {
                method: 'PATCH',
                headers: {
                  'Authorization': `Bearer ${googleAccessToken}`,
                  'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                  summary: editingEvent.title,
                  description: editingEvent.description,
                  location: editingEvent.location,
                  start: { 
                    dateTime: startAsDate.toISOString()
                  },
                  end: { 
                    dateTime: (endAsDate || new Date(startAsDate.getTime() + 3600000)).toISOString()
                  },
                  reminders: getGoogleCalendarReminders(reminderOffset)
                })
              }
            );

            if (!response.ok && response.status === 403) {
              showToast('Tribe needs permission to update your Google Calendar. Please reconnect in Settings.', 'info');
            }
          } else {
            // Create new sync if not previously synced
            const gEvent = await syncToGoogleCalendar(googleAccessToken, {
              title: editingEvent.title,
              description: editingEvent.description,
              startTime: startAsDate.toISOString(),
              endTime: endAsDate ? endAsDate.toISOString() : undefined,
              location: editingEvent.location,
              reminderOffset: reminderOffset
            });
            
            if (gEvent && gEvent.id) {
              await updateDoc(eventRef, { googleEventId: gEvent.id });
            }
          }
        }
      }
      onClose();
    } catch (error: any) {
      logger.error('Error updating calendar event', error);
      showToast(error.message || 'Failed to update event', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteEvent = async () => {
    if (!tradeUserId || !editingEvent) return;

    setIsDeleting(true);
    try {
      if (editingEvent.type === 'external' && (editingEvent.id.startsWith('google-') || editingEvent.id.startsWith('google|'))) {
        let activeToken = googleAccessToken;
        if (!activeToken && refreshGoogleToken) {
          activeToken = await refreshGoogleToken();
        }
        if (!activeToken) {
          showToast('Please connect to Google Calendar in Settings to delete this event.', 'info');
          return;
        }
        
        const delimiter = editingEvent.id.includes('google|') ? '|' : '-';
        const parts = editingEvent.id.split(delimiter);
        const calendarId = decodeURIComponent(parts[1]);
        const eventId = parts.slice(2).join(delimiter);

        let response = await fetch(
          `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${eventId}`,
          {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${activeToken}` }
          }
        );

        if (response.status === 401 && refreshGoogleToken) {
          const freshToken = await refreshGoogleToken();
          if (freshToken) {
            response = await fetch(
              `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${eventId}`,
              {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${freshToken}` }
              }
            );
          }
        }

        if (!response.ok && response.status !== 404 && response.status !== 410) {
          const errorData = await response.json().catch(() => ({}));
          if (response.status === 403) {
            throw new Error('You do not have permission to delete this event from Google Calendar (it may be read-only or managed by someone else).');
          }
          throw new Error(errorData.error?.message || 'Failed to delete Google event');
        }
      } else if (editingEvent.type === 'event') {
        const eventRef = doc(db, 'trade_users', tradeUserId, 'calendarEvents', editingEvent.id);
        
        // If it was synced to Google, attempt to delete it there too
        if (googleAccessToken && (editingEvent as any).googleEventId) {
          const gEventId = (editingEvent as any).googleEventId;
          try {
            let response = await fetch(
              `https://www.googleapis.com/calendar/v3/calendars/primary/events/${gEventId}`,
              {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${googleAccessToken}` }
              }
            );
            
            if (response.status === 401 && refreshGoogleToken) {
              const freshToken = await refreshGoogleToken();
              if (freshToken) {
                response = await fetch(
                  `https://www.googleapis.com/calendar/v3/calendars/primary/events/${gEventId}`,
                  {
                    method: 'DELETE',
                    headers: { 'Authorization': `Bearer ${freshToken}` }
                  }
                );
              }
            }

            if (!response.ok && response.status !== 404 && response.status !== 410) {
              const errorData = await response.json().catch(() => ({}));
              logger.warn('Google Calendar sync deletion failed, but proceeding with local deletion', errorData);
            }
          } catch (err) {
            logger.warn('Failed to connect to Google for sync deletion', err);
          }
        }

        await deleteDoc(eventRef);
      }
      onClose();
    } catch (error: any) {
      logger.error('Error deleting calendar event', error);
      showToast(error.message || 'Failed to delete event', 'error');
    } finally {
      setIsDeleting(false);
    }
  };

  const isBirthday = editingEvent.type === 'birthday';
  const isGoogle = editingEvent.type === 'external';
  const canDelete = !isBirthday && (editingEvent.type === 'event' || editingEvent.editable !== false);

  const handleShare = async () => {
    const text = formatSmartConvertEventText(
      editingEvent.title,
      editingEvent.description,
      editingEvent.startTime,
      editingEvent.location
    );

    const shared = await shareViaWebShare({
      title: editingEvent.title,
      text
    });
    if (!shared) {
      shareToWhatsApp(text);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4">
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="absolute inset-0 bg-zinc-950/40 backdrop-blur-md" 
        onClick={onClose} 
      />
      <motion.div 
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        className="relative bg-white dark:bg-zinc-900 rounded-[32px] w-full max-w-xl  overflow-hidden flex flex-col max-h-[85vh]"
      >
        {/* Header */}
        <div className="p-4 sm:p-6 border-b border-zinc-100 dark:border-zinc-800 flex items-center justify-between bg-zinc-50/50 dark:bg-zinc-900/50 shrink-0">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-2xl flex items-center justify-center ${
              editingEvent.type === 'birthday' ? 'bg-rose-100 text-rose-600' :
              editingEvent.type === 'external' ? 'bg-blue-100 text-blue-600' :
              'bg-emerald-100 text-emerald-600'
            }`}>
              <CalendarIcon className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-black text-zinc-900 dark:text-white uppercase tracking-tight">
                {isBirthday ? 'Event Details' : isGoogle ? 'Edit Google Event' : 'Edit Event'}
              </h3>
              <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">
                {editingEvent.type === 'birthday' ? 'Birthday' : editingEvent.type === 'external' ? 'Google Calendar' : 'Family Event'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {editingEvent && (
              <button 
                onClick={() => setShowSmartConvert(true)}
                className="p-2.5 text-zinc-400 hover:text-emerald-500 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 rounded-full transition-all"
                title="Smart Convert"
              >
                <Sparkles className="w-5 h-5" />
              </button>
            )}
            <button 
              onClick={handleShare}
              className="p-2.5 text-zinc-400 hover:text-emerald-500 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 rounded-full transition-all"
              title="Share Event Details"
            >
              <Share2 className="w-5 h-5" />
            </button>
            {canDelete && (
              <button 
                onClick={() => setIsDeleting(true)}
                className="p-2.5 text-zinc-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-full transition-all"
              >
                {isDeleting ? <Loader2 className="w-5 h-5 animate-spin" /> : <Trash2 className="w-5 h-5" />}
              </button>
            )}
            <button onClick={onClose} className="p-2.5 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-full transition-colors">
              <X className="w-6 h-6 text-zinc-400" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 sm:p-10 space-y-8">
          {isBirthday ? (
            <div className="space-y-6">
              <div className="space-y-2">
                <h2 className="text-2xl font-black text-zinc-900 dark:text-white leading-tight">
                  {editingEvent.title}
                </h2>
                <div className="flex items-center gap-2 text-zinc-500">
                  <Clock className="w-4 h-4" />
                  <span className="text-sm font-bold">
                    {format(parseISO(editingEvent.startTime), 'EEEE, MMMM do • HH:mm')}
                    {editingEvent.endTime && !isNaN(parseISO(editingEvent.endTime).getTime())
                      ? ` - ${format(parseISO(editingEvent.endTime), 'HH:mm')}`
                      : ''}
                  </span>
                </div>
              </div>

              {editingEvent.location && (
                <div className="flex items-center justify-between p-4 bg-zinc-50 dark:bg-zinc-800/50 rounded-2xl border border-zinc-100 dark:border-zinc-800 group/loc">
                  <div className="flex items-start gap-3">
                    <MapPin className="w-5 h-5 text-zinc-400 mt-0.5" />
                    <div>
                      <p className="text-xs font-black text-zinc-400 uppercase tracking-widest mb-1">Location</p>
                      <p className="text-sm font-bold text-zinc-700 dark:text-zinc-200">{editingEvent.location}</p>
                    </div>
                  </div>
                  <button 
                    onClick={() => {
                      const query = encodeURIComponent(editingEvent.location!);
                      window.open(`https://www.google.com/maps/search/?api=1&query=${query}`, '_blank');
                    }}
                    className="p-2 bg-white dark:bg-zinc-700 text-zinc-400 hover:text-emerald-500 rounded-xl  border border-zinc-100 dark:border-zinc-600 transition-all active:scale-95"
                    title="Open in Google Maps"
                  >
                    <Navigation className="w-4 h-4" />
                  </button>
                </div>
              )}

              {editingEvent.description && (
                <div className="flex items-start gap-3 p-4 bg-zinc-50 dark:bg-zinc-800/50 rounded-2xl border border-zinc-100 dark:border-zinc-800">
                  <AlignLeft className="w-5 h-5 text-zinc-400 mt-0.5" />
                  <div>
                    <p className="text-xs font-black text-zinc-400 uppercase tracking-widest mb-1">Description</p>
                    <div className="text-sm text-zinc-600 dark:text-zinc-400 leading-relaxed prose prose-sm dark:prose-invert max-w-none">
                      <ReactMarkdown>{editingEvent.description}</ReactMarkdown>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <form onSubmit={handleUpdateEvent} className="space-y-6">
              <div className="space-y-4">
                <input 
                  autoFocus
                  type="text"
                  value={editingEvent.title}
                  onChange={(e) => setEditingEvent({ ...editingEvent, title: e.target.value })}
                  placeholder="What's happening?"
                  className="w-full text-2xl font-black bg-transparent border-none text-zinc-900 dark:text-white placeholder-zinc-300 focus:ring-0 outline-none p-0"
                />
                {isEditingDescription ? (
                  <textarea 
                    autoFocus
                    value={editingEvent.description || ''}
                    onChange={(e) => setEditingEvent({ ...editingEvent, description: e.target.value })}
                    onBlur={() => setIsEditingDescription(false)}
                    placeholder="Add a description..."
                    rows={4}
                    className="w-full bg-transparent border-none text-zinc-500 dark:text-zinc-400 placeholder-zinc-300 focus:ring-0 outline-none p-0 resize-none text-sm leading-relaxed"
                  />
                ) : (
                  <div 
                    onClick={() => setIsEditingDescription(true)}
                    className="w-full min-h-[40px] text-zinc-500 dark:text-zinc-400 text-sm leading-relaxed cursor-text prose prose-sm dark:prose-invert max-w-none"
                  >
                    {editingEvent.description ? (
                      <ReactMarkdown>{editingEvent.description}</ReactMarkdown>
                    ) : (
                      <span className="text-zinc-300">Add a description...</span>
                    )}
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-zinc-400 uppercase tracking-[0.2em] px-1">Start Time</label>
                  <div className="relative">
                    <Clock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400 pointer-events-none" />
                    <input 
                      type="datetime-local"
                      value={formatToLocalDateTime(editingEvent.startTime)}
                      onChange={(e) => {
                        const val = e.target.value;
                        if (!val) return;
                        const [d, t] = val.split('T');
                        if (d && t) {
                          const iso = combineDateTimeToISO(d, t);
                          if (iso) {
                            const oldStart = ensureDate(editingEvent.startTime);
                            const newStart = ensureDate(iso);
                            let newEndTime = editingEvent.endTime;
                            if (!isNaN(oldStart.getTime()) && !isNaN(newStart.getTime()) && editingEvent.endTime) {
                              const oldEnd = ensureDate(editingEvent.endTime);
                              if (!isNaN(oldEnd.getTime())) {
                                const duration = oldEnd.getTime() - oldStart.getTime();
                                newEndTime = new Date(newStart.getTime() + (duration > 0 ? duration : 3600000)).toISOString();
                              }
                            } else if (!isNaN(newStart.getTime())) {
                              newEndTime = new Date(newStart.getTime() + 3600000).toISOString();
                            }
                            setEditingEvent({ ...editingEvent, startTime: iso, endTime: newEndTime });
                          }
                        }
                      }}
                      className="w-full pl-10 pr-4 py-3 bg-zinc-50 dark:bg-zinc-800 border-none rounded-2xl text-sm font-bold text-zinc-700 dark:text-zinc-200 focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-black text-zinc-400 uppercase tracking-[0.2em] px-1">End Time</label>
                  <div className="relative">
                    <Clock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400 pointer-events-none" />
                    <input 
                      type="datetime-local"
                      value={formatToLocalDateTime(editingEvent.endTime || new Date(ensureDate(editingEvent.startTime).getTime() + 3600000).toISOString())}
                      onChange={(e) => {
                        const val = e.target.value;
                        if (!val) return;
                        const [d, t] = val.split('T');
                        if (d && t) {
                          const iso = combineDateTimeToISO(d, t);
                          if (iso) {
                            setEditingEvent({ ...editingEvent, endTime: iso });
                          }
                        }
                      }}
                      className="w-full pl-10 pr-4 py-3 bg-zinc-50 dark:bg-zinc-800 border-none rounded-2xl text-sm font-bold text-zinc-700 dark:text-zinc-200 focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>
                </div>
              </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-zinc-400 uppercase tracking-[0.2em] px-1">Location</label>
                    <div className="relative group/loc">
                      <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400 pointer-events-none" />
                      <input 
                        type="text"
                        value={editingEvent.location || ''}
                        onChange={(e) => setEditingEvent({ ...editingEvent, location: e.target.value })}
                        placeholder="Add location"
                        className="w-full pl-10 pr-12 py-3 bg-zinc-50 dark:bg-zinc-800 border-none rounded-2xl text-sm font-bold text-zinc-700 dark:text-zinc-200 focus:ring-2 focus:ring-emerald-500"
                      />
                      {editingEvent.location && (
                        <button 
                          type="button"
                          onClick={() => {
                            const query = encodeURIComponent(editingEvent.location!);
                            window.open(`https://www.google.com/maps/search/?api=1&query=${query}`, '_blank');
                          }}
                          className="absolute right-2 top-1/2 -translate-y-1/2 p-2 text-zinc-400 hover:text-emerald-500 transition-colors"
                          title="Open in Maps"
                        >
                          <Navigation className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-zinc-400 uppercase tracking-[0.2em] px-1">Reminder</label>
                    <div className="relative">
                      <Bell className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400 pointer-events-none" />
                      <select
                        value={reminderOffset}
                        onChange={(e) => setReminderOffset(e.target.value as ReminderOffset)}
                        className="w-full pl-10 pr-4 py-3 bg-zinc-50 dark:bg-zinc-800 border-none rounded-2xl text-sm font-bold text-zinc-700 dark:text-zinc-200 focus:ring-2 focus:ring-emerald-500 appearance-none cursor-pointer"
                      >
                        {REMINDER_OPTIONS.map(opt => (
                          <option key={opt.value} value={opt.value}>{opt.label}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>
            </form>
          )}
        </div>

        {/* Footer */}
        <div className="p-6 bg-zinc-50 dark:bg-zinc-900/50 border-t border-zinc-100 dark:border-zinc-800 flex items-center justify-between shrink-0">
          {isBirthday ? (
             <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest italic">Birthdays are read-only</p>
          ) : (
            <>
              {isDeleting ? (
                <div className="flex-1 flex gap-3">
                  <button 
                    onClick={() => setIsDeleting(false)}
                    className="flex-1 py-3 bg-zinc-200 dark:bg-zinc-800 text-zinc-900 dark:text-white font-black text-xs uppercase tracking-widest rounded-2xl hover:bg-zinc-300 transition-all"
                  >
                    Cancel
                  </button>
                  <button 
                    onClick={handleDeleteEvent}
                    className="flex-1 py-3 bg-red-500 text-white font-black text-xs uppercase tracking-widest rounded-2xl hover:bg-red-600 transition-all "
                  >
                    Confirm Delete
                  </button>
                </div>
              ) : (
                <button 
                  onClick={handleUpdateEvent}
                  disabled={isSaving}
                  className="w-full flex items-center justify-center gap-2 py-4 bg-emerald-600 text-white font-black text-xs uppercase tracking-[0.2em] rounded-2xl hover:bg-emerald-700 transition-all  active:scale-95 disabled:opacity-50"
                >
                  {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  {isGoogle ? 'Save to Google' : 'Save Changes'}
                </button>
              )}
            </>
          )}
        </div>

        {/* Smart Convert Modal */}
        <AnimatePresence>
          {showSmartConvert && (
            <SmartConvertModal 
              onClose={() => setShowSmartConvert(false)}
              content={`Type: ${editingEvent.type}\nTitle: ${editingEvent.title}\nDate: ${editingEvent.startTime}\nDescription: ${editingEvent.description || ''}\nLocation: ${editingEvent.location || ''}`}
              originalId={editingEvent.id}
              originalType="event"
              members={members}
              onUpdated={(newTitle, newDescription) => {
                setEditingEvent(prev => ({
                  ...prev,
                  title: newTitle,
                  description: newDescription
                }));
              }}
            />
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}
