import { useState, useEffect, useRef } from 'react';
import {
  format,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  isSameMonth,
  isSameDay,
  addMonths,
  subMonths,
  parseISO,
  isBefore,
  startOfDay
} from 'date-fns';
import { ChevronLeft, ChevronRight, Plus, Clock, MapPin, Loader2, X, Trash2, Calendar as CalendarIcon, ExternalLink, RefreshCw, Share2, Users } from 'lucide-react';
import { useSettings } from '../../contexts/SettingsContext';
import { useToast } from '../../contexts/ToastContext';
import { shareToWhatsApp, shareViaWebShare, formatChildWeeklyScheduleText, copyToClipboard } from '../../lib/shareUtils';
import { motion, AnimatePresence } from 'motion/react';
import { db } from '../../lib/firebase';
import { collection, onSnapshot, query, where, doc, updateDoc, deleteDoc, or } from 'firebase/firestore';
import { useAuth } from '../../App';
import { logger } from '../../services/logger';
import { ensureDate } from '../../lib/dateUtils';
import CalendarEventModal from './CalendarEventModal';
import QuickAddModal from '../smart/QuickAddModal';
import PageHeader from '../common/PageHeader';
import GoogleIcon from '../layout/GoogleIcon';
import { Vehicle } from '../../types/vehicle';
import { getVehicleComplianceEntriesForYear } from '../../services/vehicleComplianceService';
import VehicleComplianceModal from './VehicleComplianceModal';


interface CalendarEvent {
  id: string;
  title: string;
  description?: string;
  startTime: string;
  endTime?: string;
  location?: string;
  assignedTo?: string;
  authorId?: string;
  type?: 'event' | 'external' | 'birthday' | 'vehicle';
  color?: string;
  isAllDay?: boolean;
}

interface FamilyMember {
  id: string;
  name: string;
  dob: string;
}

export default function CalendarView({ initialEventId, onInitialItemHandled }: { initialEventId?: string | null, onInitialItemHandled?: () => void }) {
  const { tradeUserId, user, googleAccessToken, refreshGoogleToken, isGoogleReauthRequired, dismissGoogleReauthPrompt, signIn } = useAuth();
  const { settings } = useSettings();
  const { showToast } = useToast();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [tasks, setTasks] = useState<any[]>([]);
  const [members, setMembers] = useState<FamilyMember[]>([]);
  const [selectedMemberId, setSelectedMemberId] = useState<string>('all');
  const [loading, setLoading] = useState(true);
  const [selectedEventForModal, setSelectedEventForModal] = useState<CalendarEvent | null>(null);
  const [googleEvents, setGoogleEvents] = useState<CalendarEvent[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [selectedVehicleEvent, setSelectedVehicleEvent] = useState<any | null>(null);
  const [syncingGoogle, setSyncingGoogle] = useState(false);
  const [showQuickAdd, setShowQuickAdd] = useState(false);

  const handleShareWeeklySchedule = async (method: 'whatsapp' | 'webshare' | 'copy') => {
    const selectedMember = members.find(m => m.id === selectedMemberId);
    const memberName = selectedMember ? selectedMember.name : 'Family';

    // Filter events and tasks for selected member
    const memberEvents = events.filter(e => {
      if (selectedMemberId === 'all') return true;
      return !e.assignedTo || e.assignedTo === 'all' || e.assignedTo === selectedMemberId;
    });

    const memberTasks = tasks.filter(t => {
      if (selectedMemberId === 'all') return true;
      if (Array.isArray(t.assignedTo)) {
        return t.assignedTo.includes('all') || t.assignedTo.includes(selectedMemberId);
      }
      return !t.assignedTo || t.assignedTo === 'all' || t.assignedTo === selectedMemberId;
    });

    const text = formatChildWeeklyScheduleText(memberName, memberEvents, memberTasks, currentDate);

    if (method === 'whatsapp') {
      shareToWhatsApp(text);
      showToast(`Shared ${memberName}'s weekly schedule to WhatsApp!`, 'success');
    } else if (method === 'webshare') {
      const shared = await shareViaWebShare({
        title: `${memberName}'s Weekly Schedule`,
        text: text
      });
      if (!shared) {
        shareToWhatsApp(text);
      }
    } else {
      const copied = await copyToClipboard(text);
      if (copied) {
        showToast(`${memberName}'s weekly schedule copied to clipboard!`, 'success');
      }
    }
  };

  // Handle Deep Links
  useEffect(() => {
    if (!initialEventId) return;

    const allEvents = [...events, ...googleEvents];
    const event = allEvents.find(e => e.id === initialEventId);

    if (event) {
      const eventDate = ensureDate(event.startTime);
      setCurrentDate(eventDate);
      setSelectedDate(eventDate);
      setSelectedEventForModal(event);
      onInitialItemHandled?.();
    }
  }, [events, googleEvents, initialEventId, onInitialItemHandled]);


  const [isDeleting, setIsDeleting] = useState(false);

  const longPressTimer = useRef<any>(null);
  const isLongPress = useRef(false);

  const startPress = (e: React.PointerEvent, day: Date) => {
    if (e.button !== 0) return;
    isLongPress.current = false;
    if (longPressTimer.current) clearTimeout(longPressTimer.current);

    longPressTimer.current = setTimeout(() => {
      isLongPress.current = true;
      setSelectedDate(day);
      setShowQuickAdd(true);
      if (navigator.vibrate) {
        navigator.vibrate(50);
      }
    }, 600);
  };

  const endPress = (e: React.PointerEvent, day: Date) => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }

    if (!isLongPress.current) {
      if (isSameDay(day, selectedDate)) {
        setShowQuickAdd(true);
      } else {
        setSelectedDate(day);
      }
    }
    isLongPress.current = false;
  };

  const cancelPress = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  };

  const monthStart = startOfMonth(currentDate);
  const monthEnd = endOfMonth(monthStart);
  const startDate = startOfWeek(monthStart, { weekStartsOn: 1 });
  const endDate = endOfWeek(monthEnd, { weekStartsOn: 1 });

  const calendarDays = eachDayOfInterval({ start: startDate, end: endDate });

  useEffect(() => {
    const effectiveTradeUserId = tradeUserId || (user ? `trade_${user.uid}` : '');
    if (!effectiveTradeUserId) return;

    const eventsRef = collection(db, 'trade_users', effectiveTradeUserId, 'calendarEvents');
    // Subscribe to all workspace events (jobs, bookings, tasks) and filter private unshared items in memory
    const unsubEvents = onSnapshot(eventsRef, (snapshot) => {
      const eventList = snapshot.docs
        .map(doc => ({
          id: doc.id,
          ...doc.data()
        } as CalendarEvent))
        .filter(evt => {
          if (evt.isShared === false && evt.authorId && user?.uid && evt.authorId !== user.uid) {
            return false;
          }
          return true;
        });
      setEvents(eventList);
    }, (err) => {
      console.warn('[CalendarView] Failed to fetch calendarEvents:', err);
    });

    const membersRef = collection(db, 'trade_users', effectiveTradeUserId, 'members');
    const unsubMembers = onSnapshot(membersRef, (snapshot) => {
      const memberList = snapshot.docs.map(doc => {
        const d = doc.data();
        return {
          id: doc.id,
          ...d,
          name: d.displayName || d.name || d.email
        };
      }) as FamilyMember[];
      setMembers(memberList);
      setLoading(false);
    });

    const tasksRef = collection(db, 'trade_users', effectiveTradeUserId, 'tasks');
    const unsubTasks = onSnapshot(tasksRef, (snapshot) => {
      const taskList = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setTasks(taskList);
    }, (err) => {
      console.warn('[CalendarView] Failed to fetch tasks:', err);
    });

    const tradeUserRef = doc(db, 'trade_users', effectiveTradeUserId);
    const unsubTradeUser = onSnapshot(tradeUserRef, (snap) => {
      if (snap.exists() && snap.data()?.vehicles) {
        setVehicles(snap.data().vehicles);
      }
    }, (err) => {
      console.warn('[CalendarView] Failed to fetch trade user profile:', err);
    });

    return () => { unsubEvents(); unsubMembers(); unsubTasks(); unsubTradeUser(); };
  }, [tradeUserId, user]);

  useEffect(() => {
    const fetchGoogleEvents = async (token?: string) => {
      const activeToken = token || googleAccessToken;

      if (!activeToken) {
        // Try automatic refresh
        const freshToken = await refreshGoogleToken();
        if (freshToken) {
          return fetchGoogleEvents(freshToken);
        }
        return; // No token available — Google events won't load
      }

      setSyncingGoogle(true);
      try {
        const now = new Date();
        const pastDate = new Date(now);
        pastDate.setMonth(now.getMonth() - 3); // Fetch 3 months of history
        const timeMin = pastDate.toISOString();
        const futureDate = new Date(now.getFullYear() + 1, now.getMonth(), now.getDate()); // Fetch 1 year ahead
        const timeMax = futureDate.toISOString();

        const listResponse = await fetch('https://www.googleapis.com/calendar/v3/users/me/calendarList', {
          headers: { Authorization: `Bearer ${activeToken}` }
        });

        if (listResponse.ok) {
          const listData = await listResponse.json();
          const calendars = (listData.items || []).filter((c: any) => c.accessRole !== 'freeBusyReader');

          const eventPromises = calendars.map(async (cal: any) => {
            try {
              const res = await fetch(
                `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(cal.id)}/events?timeMin=${encodeURIComponent(timeMin)}&timeMax=${encodeURIComponent(timeMax)}&singleEvents=true&orderBy=startTime&maxResults=2500`,
                { headers: { Authorization: `Bearer ${activeToken}` } }
              );
              if (res.ok) {
                const data = await res.json();
                const beautifyColor = (hex?: string) => {
                  if (!hex) return '#0ea5e9';
                  // Map "browny/cocoa" tones to more vibrant Indigo
                  const brownTones = ['#795548', '#8d6e63', '#a52a2a', '#7b5e57', '#5d4037'];
                  if (brownTones.includes(hex.toLowerCase())) return '#6366f1';
                  return hex;
                };

                return (data.items || []).map((e: any) => ({
                  id: `google|${cal.id}|${e.id}`,
                  title: e.summary || '(No title)',
                  startTime: e.start?.dateTime || e.start?.date || '',
                  endTime: e.end?.dateTime || e.end?.date || '',
                  location: e.location || '',
                  type: 'external' as const,
                  color: beautifyColor(cal.backgroundColor),
                  editable: cal.accessRole === 'owner' || cal.accessRole === 'writer',
                  assignedTo: e.extendedProperties?.private?.assignedTo || members.find(m => m.id === user?.uid || (m as any).email === user?.email)?.id || user?.uid || 'all',
                  isShared: e.extendedProperties?.private?.isShared !== 'false',
                  isAllDay: !e.start?.dateTime
                }));
              }
            } catch (err) {
              // ignore individual calendar failures gracefully
            }
            return [];
          });

          const allEventArrays = await Promise.all(eventPromises);
          setGoogleEvents(allEventArrays.flat());
        } else if (listResponse.status === 401) {
          // Token expired — auto-refresh and retry
          const freshToken = await refreshGoogleToken();
          if (freshToken) {
            return fetchGoogleEvents(freshToken);
          }
          logger.error('Google Calendar token expired — refresh failed');
        } else {
          const errorData = await listResponse.json().catch(() => ({}));
          logger.error('Google Calendar API error', {
            status: listResponse.status,
            statusText: listResponse.statusText,
            error: errorData
          });
        }
      } catch (err) {
        logger.error('Failed to fetch Google Calendar events', err);
      } finally {
        setSyncingGoogle(false);
      }
    };

    fetchGoogleEvents();
  }, [googleAccessToken]);



  const getDayItems = (day: Date) => {
    const dayEvents = events.filter(e => {
      const eventStart = ensureDate(e.startTime);
      if (isSameDay(eventStart, day)) return true;
      if (e.endTime) {
        const eventEnd = ensureDate(e.endTime);
        const dayStart = startOfDay(day);
        const dayEnd = new Date(dayStart.getTime() + 86400000 - 1);
        return eventStart <= dayEnd && eventEnd >= dayStart;
      }
      return false;
    }).map(e => ({ ...e, type: 'event' }));
    const dayGoogleEvents = googleEvents.filter(e => isSameDay(ensureDate(e.startTime), day));

    // Deduplication: Hide Firestore event if matching Google event exists on the same day (by googleEventId, exact time key, or title)
    const dayGoogleKeys = new Set(dayGoogleEvents.map(e => {
      const d = ensureDate(e.startTime);
      return `${e.title.toLowerCase()}-${d.toISOString().slice(0, 16)}`;
    }));
    const dayGoogleTitles = new Set(dayGoogleEvents.map(e => e.title.trim().toLowerCase()));

    const filteredDayEvents = dayEvents.filter(event => {
      if ((event as any).source === 'vehicle_compliance' || event.id.startsWith('vehicle_')) {
        return false;
      }
      if ((event as any).googleEventId) {
        const linked = dayGoogleEvents.some(ge => ge.id.endsWith((event as any).googleEventId));
        if (linked) return false;
      }
      const d = ensureDate(event.startTime);
      const key = `${event.title.toLowerCase()}-${d.toISOString().slice(0, 16)}`;
      if (dayGoogleKeys.has(key)) return false;

      const normalizedTitle = event.title.trim().toLowerCase();
      if (dayGoogleTitles.has(normalizedTitle)) return false;

      return true;
    });

    const dayBirthdays = members.filter(m => {
      if (!m.dob) return false;
      const dob = ensureDate(m.dob);
      return dob.getMonth() === day.getMonth() && dob.getDate() === day.getDate();
    }).map(m => ({
      id: m.id,
      title: `${m.name}'s Birthday`,
      type: 'birthday' as const,
      startTime: day.toISOString(),
      color: (m as any).color || '#fb7185'
    }));

    const dayYear = day.getFullYear();
    const vehicleEntries = getVehicleComplianceEntriesForYear(vehicles, dayYear);
    const dayVehicleItems = vehicleEntries
      .filter(entry => isSameDay(entry.date, day))
      .map(entry => ({
        id: entry.id,
        title: entry.title,
        type: 'vehicle' as const,
        startTime: entry.date.toISOString(),
        color: entry.color,
        isAllDay: true,
        vehicleId: entry.vehicleId,
        complianceItemId: entry.complianceItemId,
        vehicleName: entry.vehicleName,
        registration: entry.registration,
        complianceTitle: entry.complianceTitle,
        isReminder: entry.isReminder,
        dueDateString: entry.dueDateString,
        notes: entry.notes
      }));

    let allDayItems = [...filteredDayEvents, ...dayGoogleEvents, ...dayBirthdays, ...dayVehicleItems];

    if (selectedMemberId !== 'all') {
      allDayItems = allDayItems.filter(item => {
        if (item.type === 'birthday') return item.id === selectedMemberId;
        return !(item as any).assignedTo || (item as any).assignedTo === 'all' || (item as any).assignedTo === selectedMemberId;
      });
    }

    const timedItems = allDayItems.filter(i => (i as any).type !== 'birthday' && !(i as any).isAllDay && (i as any).startTime);
    const conflicts = new Set<string>();

    for (let i = 0; i < timedItems.length; i++) {
      const aStart = ensureDate((timedItems[i] as any).startTime).getTime();
      const aEnd = (timedItems[i] as any).endTime ? ensureDate((timedItems[i] as any).endTime!).getTime() : aStart + 60 * 60 * 1000;

      for (let j = i + 1; j < timedItems.length; j++) {
        const bStart = ensureDate((timedItems[j] as any).startTime).getTime();
        const bEnd = (timedItems[j] as any).endTime ? ensureDate((timedItems[j] as any).endTime!).getTime() : bStart + 60 * 60 * 1000;

        if (Math.max(aStart, bStart) < Math.min(aEnd, bEnd)) {
          conflicts.add(timedItems[i].id);
          conflicts.add(timedItems[j].id);
        }
      }
    }

    return allDayItems.map(item => ({
      ...item,
      hasConflict: conflicts.has(item.id)
    }));
  };


  return (
    <div className="w-full pb-40">
      <PageHeader
        icon={CalendarIcon}
        title={format(currentDate, 'MMMM yyyy')}
        subtitle="Schedule & Trade Appointments"
        extra={
          <div className="bg-gradient-to-r from-emerald-500/10 to-blue-500/10 border border-emerald-500/20 dark:border-emerald-400/10 p-1 rounded-2xl flex gap-1 items-center">
            <button
              onClick={() => handleShareWeeklySchedule('webshare')}
              className="p-2.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-750 transition-colors text-slate-600 dark:text-slate-400"
              title="Share Weekly Schedule"
            >
              <Share2 size={18} />
            </button>
            <button
              onClick={() => window.open('https://calendar.google.com', '_blank')}
              className="p-2.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-750 transition-colors text-slate-600 dark:text-slate-400"
              title="Open Google Calendar"
            >
              <ExternalLink size={18} />
            </button>
            <button
              onClick={() => setCurrentDate(subMonths(currentDate, 1))}
              className="p-2.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-750 transition-colors"
            >
              <ChevronLeft size={18} className="text-slate-600 dark:text-slate-400" />
            </button>
            <button
              onClick={() => setCurrentDate(addMonths(currentDate, 1))}
              className="p-2.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-750 transition-colors"
            >
              <ChevronRight size={18} className="text-slate-600 dark:text-slate-400" />
            </button>
          </div>
        }
      />

      {isGoogleReauthRequired && (
        <div className="mb-4 p-4 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/50 rounded-2xl flex items-center justify-between gap-3 shadow-sm">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 bg-white dark:bg-zinc-800 rounded-xl flex items-center justify-center shrink-0 border border-amber-200 dark:border-amber-900/50">
              <GoogleIcon className="w-5 h-5" isColoured={true} />
            </div>
            <div className="min-w-0">
              <span className="text-xs font-bold text-amber-900 dark:text-amber-200 block truncate">
                Google Calendar Sync Disconnected
              </span>
              <p className="text-[11px] text-amber-700 dark:text-amber-400 truncate">
                Re-authenticate to sync Google Calendar events directly into Tribe.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => signIn()}
              className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-[10px] font-black uppercase tracking-wider rounded-xl transition-all shadow-sm active:scale-95 flex items-center gap-1.5"
            >
              <RefreshCw className="w-3 h-3" />
              Reconnect
            </button>
            <button
              onClick={dismissGoogleReauthPrompt}
              className="p-1.5 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 rounded-lg transition-colors"
              title="Dismiss"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-7 gap-px bg-zinc-200 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-800 rounded-2xl overflow-hidden ">
        {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day) => (
          <div key={day} className="bg-zinc-50 dark:bg-zinc-900 py-2 text-center text-[10px] font-bold uppercase tracking-widest text-zinc-400">
            {day}
          </div>
        ))}
        {calendarDays.map((day, i) => {
          const isSelected = isSameDay(day, selectedDate);
          const isCurrentMonth = isSameMonth(day, monthStart);
          const isPast = isBefore(day, startOfDay(new Date()));

          return (
            <div
              key={day.toString()}
              onPointerDown={(e) => startPress(e, day)}
              onPointerUp={(e) => endPress(e, day)}
              onPointerLeave={cancelPress}
              onPointerCancel={cancelPress}
              className={`min-h-[100px] bg-white dark:bg-zinc-900 p-1.5 cursor-pointer transition-all select-none hover:bg-zinc-50 dark:hover:bg-zinc-800 ${!isCurrentMonth ? 'text-zinc-300 dark:text-zinc-700' : 'text-zinc-900 dark:text-white'
                } ${isSelected ? 'ring-2 ring-inset ring-emerald-500' : ''} ${isPast ? 'opacity-40' : ''}`}
            >
              <div className="flex justify-between items-start mb-0.5">
                <span className={`text-xs font-semibold w-6 h-6 flex items-center justify-center rounded-full ${isSameDay(day, new Date()) ? 'bg-emerald-500 text-white' : ''
                  }`}>
                  {format(day, 'd')}
                </span>
              </div>
              <div className="space-y-0.5 mt-0.5 overflow-y-auto max-h-[65px] scrollbar-hide">
                {getDayItems(day).map((item) => {
                  const isAllDay = item.type === 'birthday' || (item.type === 'external' && item.isAllDay);
                  let eventTime = null;
                  if (!isAllDay && item.startTime) {
                    try {
                      const date = ensureDate(item.startTime);
                      if (!isNaN(date.getTime())) {
                        eventTime = format(date, 'HH:mm');
                      }
                    } catch (e) { }
                  }

                  return (
                    <div
                      key={item.id}
                      onPointerDown={(e) => e.stopPropagation()}
                      onPointerUp={(e) => e.stopPropagation()}
                      onClick={(e) => {
                        e.stopPropagation();
                        if ((item as any).type === 'vehicle') {
                          setSelectedVehicleEvent(item);
                        } else {
                          setSelectedEventForModal(item as any);
                        }
                      }}
                      className={`relative text-[10px] pl-3 pr-1.5 py-1 rounded-lg font-semibold border transition-all hover:brightness-110 shadow-sm overflow-hidden ${item.hasConflict ? 'ring-2 ring-amber-500 border-amber-500 animate-pulse' : ''
                        }`}
                      style={item.type === 'external' && item.color ? {
                        backgroundColor: settings.darkMode ? item.color + '20' : item.color + '05',
                        color: item.color,
                        borderColor: item.hasConflict ? '#f59e0b' : item.color + '33'
                      } : (item.type === 'birthday' ? {
                        backgroundColor: settings.darkMode ? '#fb718520' : '#fb718505',
                        color: '#fb7185',
                        borderColor: item.hasConflict ? '#f59e0b' : '#fb718533'
                      } : (item.type === 'vehicle' ? {
                        backgroundColor: settings.darkMode ? (item.color || '#f59e0b') + '25' : (item.color || '#f59e0b') + '10',
                        color: item.color || '#f59e0b',
                        borderColor: (item.color || '#f59e0b') + '60'
                      } : {
                        backgroundColor: settings.darkMode ? '#10b98120' : '#10b98105',
                        color: '#10b981',
                        borderColor: item.hasConflict ? '#f59e0b' : '#10b98133'
                      }))}
                    >
                      <div
                        className="absolute left-0 top-0 bottom-0 w-1"
                        style={{
                          backgroundColor: item.hasConflict
                            ? '#f59e0b'
                            : ((item.type === 'external' && item.color) ? item.color : (item.type === 'birthday' ? '#fb7185' : (item.type === 'vehicle' ? (item.color || '#f59e0b') : '#10b981')))
                        }}
                      />
                      <div className="flex flex-col items-start gap-px">
                        <div className="flex items-center justify-between w-full">
                          {eventTime && (
                            <span className="text-[8.5px] font-semibold opacity-60 leading-none mb-0.5">
                              {eventTime}
                            </span>
                          )}
                          {item.hasConflict && (
                            <span className="text-[8px] font-black uppercase text-amber-500 bg-amber-50 dark:bg-amber-950/60 px-1 rounded">
                              Conflict
                            </span>
                          )}
                        </div>
                        <span className="break-words line-clamp-2 leading-tight">{item.title}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* Event Details Modal */}
      <AnimatePresence>
        {selectedEventForModal && (
          <CalendarEventModal
            event={selectedEventForModal}
            tradeUserId={tradeUserId!}
            members={members as any}
            onClose={() => setSelectedEventForModal(null)}
          />
        )}
        {selectedVehicleEvent && (
          <VehicleComplianceModal
            event={selectedVehicleEvent}
            tradeUserId={tradeUserId!}
            userId={user?.uid}
            onClose={() => setSelectedVehicleEvent(null)}
          />
        )}
        {showQuickAdd && (
          <QuickAddModal
            onClose={() => setShowQuickAdd(false)}
            initialDate={selectedDate}
            restrictToType="event"
          />
        )}
      </AnimatePresence>
    </div>
  );
}
