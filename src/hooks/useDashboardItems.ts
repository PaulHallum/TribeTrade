import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../App';
import { db } from '../lib/firebase';
import { collection, query, onSnapshot, limit, where, or, doc } from 'firebase/firestore';
import { logger } from '../services/logger';
import { ensureDate } from '../lib/dateUtils';
import { Vehicle } from '../types/vehicle';
import { Quote } from '../types/quote';
import { getVehicleComplianceEntriesForYear } from '../services/vehicleComplianceService';

export interface DashboardItem {
  id: string;
  type: 'task' | 'event' | 'email' | 'note' | 'birthday' | 'shopping' | 'quote';
  title: string;
  subtitle?: string;
  date?: Date;
  color?: string;
  data?: any;
  hasConflict?: boolean;
}

import { getFirstName } from '../utils/nameUtils';

export function useDashboardItems() {
  const { tradeUserId, user, googleAccessToken } = useAuth();
  const [firestoreItems, setFirestoreItems] = useState<DashboardItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [googleEvents, setGoogleEvents] = useState<DashboardItem[]>([]);
  const [members, setMembers] = useState<any[]>([]);

  const isValidDate = (d: any) => d instanceof Date && !isNaN(d.getTime());

  const items = useMemo(() => {
    const combined = [...firestoreItems, ...googleEvents];
    
    // Build membersMap to resolve Google event assignee names dynamically
    const membersMap = new Map();
    members.forEach((m: any) => {
      const name = getFirstName(m.displayName || m.name || m.email);
      membersMap.set(m.id, name);
      if (m.email) membersMap.set(m.email, name);
    });

    const googleKeys = new Set(googleEvents.map(e => {
      const d = e.date;
      return `${e.title.toLowerCase()}-${d ? `${d.toDateString()} ${d.getHours()}:${d.getMinutes()}` : ''}`;
    }));
    
    const mapped = combined.map(item => {
      if (item.type === 'event' && (item.id.startsWith('google-') || item.id.startsWith('google|'))) {
        const assignedTo = item.data?.assignedTo || 'all';
        let assignedName = 'Unassigned';
        if (assignedTo === 'all') {
          assignedName = 'Family';
        } else {
          assignedName = membersMap.get(assignedTo) || assignedTo;
        }
        return {
          ...item,
          subtitle: `${item.subtitle?.split(' • ')[0] || 'Google Calendar'} • ${assignedName}`
        };
      }
      return item;
    });

    const filtered = mapped.filter(item => {
      if (item.type === 'event' && !item.id.startsWith('google|')) {
        const d = item.date;
        const key = `${item.title.toLowerCase()}-${d ? `${d.toDateString()} ${d.getHours()}:${d.getMinutes()}` : ''}`;
        if (googleKeys.has(key)) return false;
        
        // Also check for explicit link
        if (item.data?.googleEventId) {
          const linked = googleEvents.some(ge => ge.id.endsWith(item.data.googleEventId));
          if (linked) return false;
        }
      }
      return true;
    });

    // Detect calendar event overlaps / conflicts
    const eventItems = filtered.filter(i => (i.type === 'event' || i.type === 'birthday') && i.date && isValidDate(i.date) && !i.data?.isAllDay);
    const conflicts = new Set<string>();

    for (let i = 0; i < eventItems.length; i++) {
      const aStart = (eventItems[i].date as Date).getTime();
      const aEnd = eventItems[i].data?.endTime ? ensureDate(eventItems[i].data.endTime).getTime() : aStart + 60 * 60 * 1000;

      for (let j = i + 1; j < eventItems.length; j++) {
        const bStart = (eventItems[j].date as Date).getTime();
        const bEnd = eventItems[j].data?.endTime ? ensureDate(eventItems[j].data.endTime).getTime() : bStart + 60 * 60 * 1000;

        if (Math.max(aStart, bStart) < Math.min(aEnd, bEnd)) {
          conflicts.add(eventItems[i].id);
          conflicts.add(eventItems[j].id);
        }
      }
    }

    const withConflicts = filtered.map(item => ({
      ...item,
      hasConflict: conflicts.has(item.id)
    }));

    return withConflicts.sort((a, b) => {
      const aValid = a.date && isValidDate(a.date);
      const bValid = b.date && isValidDate(b.date);
      if (!aValid && !bValid) return 0;
      if (!aValid) return 1;
      if (!bValid) return -1;
      return (a.date as Date).getTime() - (b.date as Date).getTime();
    });
  }, [firestoreItems, googleEvents, members]);

  useEffect(() => {
    if (!tradeUserId) {
      setLoading(false);
      return;
    }

    const tasksRef = collection(db, 'trade_users', tradeUserId, 'tasks');
    const categoriesRef = collection(db, 'trade_users', tradeUserId, 'taskCategories');
    const membersRef = collection(db, 'trade_users', tradeUserId, 'members');
    const eventsRef = collection(db, 'trade_users', tradeUserId, 'calendarEvents');
    const notesRef = collection(db, 'trade_users', tradeUserId, 'notes');
    const shoppingRef = collection(db, 'trade_users', tradeUserId, 'shoppingList');
    const quotesRef = collection(db, 'trade_users', tradeUserId, 'quotes');
    
    // Use plain limit queries with security filters
    const tasksQuery = query(
      tasksRef, 
      or(
        where('isShared', '==', true),
        where('authorId', '==', user?.uid)
      ),
      limit(500)
    );
    const eventsQuery = query(eventsRef, limit(50));
    const quotesQuery = query(quotesRef, limit(50));
    const notesQuery = query(
      notesRef, 
      or(
        where('isShared', '==', true),
        where('authorId', '==', user?.uid)
      ),
      limit(20)
    );
    const shoppingQuery = query(shoppingRef, limit(100));

    let membersMap = new Map();
    let membersList: any[] = [];
    let categoriesMap = new Map();
    let currentTaskDocs: any[] = [];
    let currentEventDocs: any[] = [];
    let currentNoteDocs: any[] = [];
    let currentShoppingDocs: any[] = [];
    let currentQuoteDocs: any[] = [];
    let currentVehicles: Vehicle[] = [];

    const updateItems = () => {
      const now = new Date();
      const thirtyDaysFromNow = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

      const rawTasks = currentTaskDocs.map(d => ({ id: d.id, ...d.data() }));
      
      const taskItems: DashboardItem[] = rawTasks
        .filter(data => {
          if (data.status === 'completed') return false; 
          if (!data.dueDate) return true; 
          
          try {
            const dueDate = ensureDate(data.dueDate);
            if (isNaN(dueDate.getTime())) return true; // Show it if date is weird but exists
            return dueDate <= thirtyDaysFromNow;
          } catch (e) {
            return true; // Don't hide tasks on error
          }
        })
        .map(data => {
          const categoryName = data.listId ? categoriesMap.get(data.listId) : null;
          let assignedName = 'Unassigned';
          if (data.assignedTo === 'all') {
            assignedName = 'Family';
          } else if (Array.isArray(data.assignedTo)) {
            assignedName = data.assignedTo.map((id: string) => membersMap.get(id) || id).join(' & ');
          } else if (data.assignedTo) {
            assignedName = membersMap.get(data.assignedTo) || data.assignedTo;
          }
          
          return {
            id: data.id,
            type: 'task',
            title: data.title || 'Untitled Task',
            subtitle: `${categoryName ? `${categoryName} • ` : ''}${assignedName}`,
            date: data.dueDate ? ensureDate(data.dueDate) : undefined,
            data: { ...data }
          };
        });

      if (taskItems.length === 0 && rawTasks.length > 0) {
        logger.warn(`Filtering Logic Alert: Found ${rawTasks.length} raw tasks but 0 passed filters.`);
      }

      const eventItems: DashboardItem[] = currentEventDocs
        .filter(doc => {
          const data = doc.data();
          if (data.source === 'vehicle_compliance' || doc.id.startsWith('vehicle_')) return false;
          if (!data.startTime) return false;
          const startTime = ensureDate(data.startTime);
          return startTime <= thirtyDaysFromNow; // Only show internal events in next 30 days
        })
        .map(doc => {
          const data = doc.data();
          return {
            id: doc.id,
            type: 'event',
            title: data.title,
            subtitle: data.location || 'No location',
            date: data.startTime ? ensureDate(data.startTime) : undefined,
            data: { ...data, id: doc.id, type: 'event' }
          };
        });

      const noteItems: DashboardItem[] = currentNoteDocs.map(doc => {
        const data = doc.data();
        const content = data.content || '';
        return {
          id: doc.id,
          type: 'note',
          title: data.title || content.split('\n')[0].substring(0, 40) || 'Untitled Note',
          subtitle: content.split('\n').slice(1).join(' ').substring(0, 60),
          date: data.createdAt ? ensureDate(data.createdAt) : undefined,
          color: data.color || '#fef3c7',
          data: { ...data, id: doc.id }
        };
      });

      const shoppingItems: DashboardItem[] = currentShoppingDocs
        .filter(doc => !doc.data().checked)
        .map(doc => ({
          id: doc.id,
          type: 'shopping',
          title: doc.data().name || 'Untitled Item',
          date: doc.data().createdAt ? ensureDate(doc.data().createdAt) : undefined,
          data: { ...doc.data(), id: doc.id }
        }));

      const birthdayItems: DashboardItem[] = membersList.filter(m => {
        if (!m.dob) return false;
        const dob = new Date(m.dob);
        if (isNaN(dob.getTime())) return false;
        const today = new Date();
        const birthdayThisYear = new Date(today.getFullYear(), dob.getMonth(), dob.getDate());
        const diff = birthdayThisYear.getTime() - today.getTime();
        return diff >= 0 && diff < 30 * 24 * 60 * 60 * 1000;
      }).map(m => {
        const dob = new Date(m.dob);
        const age = new Date().getFullYear() - dob.getFullYear();
        return {
          id: `bday-${m.id}`,
          type: 'birthday',
          title: `${m.name}'s Birthday`,
          subtitle: `Turning ${age}!`,
          date: new Date(new Date().getFullYear(), dob.getMonth(), dob.getDate())
        };
      });

      const currentYear = now.getFullYear();
      const yearsToCheck = [currentYear, currentYear + 1];
      const vehicleItems: DashboardItem[] = [];

      for (const year of yearsToCheck) {
        const entries = getVehicleComplianceEntriesForYear(currentVehicles, year);
        for (const entry of entries) {
          const diff = entry.date.getTime() - now.getTime();
          // Surface if within the next 30 days or overdue up to 14 days
          if (diff >= -14 * 24 * 60 * 60 * 1000 && diff <= 30 * 24 * 60 * 60 * 1000) {
            vehicleItems.push({
              id: entry.id,
              type: 'event',
              title: entry.title,
              subtitle: `${entry.vehicleName}${entry.registration ? ` (${entry.registration})` : ''} • ${entry.complianceTitle}`,
              date: entry.date,
              color: entry.color,
              data: {
                ...entry,
                type: 'vehicle',
                isAllDay: true
              }
            });
          }
        }
      }

      const quoteItems: DashboardItem[] = currentQuoteDocs.map(doc => {
        const data = doc.data() as Quote;
        const statusColors: Record<string, string> = {
          draft: '#71717a',
          pending: '#f59e0b',
          accepted: '#10b981',
          declined: '#ef4444'
        };
        const grandTotalFormatted = Number(data.grandTotal || 0).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        return {
          id: doc.id,
          type: 'quote',
          title: `${data.quoteNumber || 'Quote'}: ${data.customerName || 'Client'}`,
          subtitle: `${data.jobTitle || 'Job'} • £${grandTotalFormatted} • ${(data.status || 'draft').toUpperCase()}`,
          date: data.validUntil ? ensureDate(data.validUntil) : (data.dateIssued ? ensureDate(data.dateIssued) : undefined),
          color: statusColors[data.status] || '#71717a',
          data: { ...data, id: doc.id }
        };
      });

      setFirestoreItems([...taskItems, ...eventItems, ...noteItems, ...birthdayItems, ...shoppingItems, ...vehicleItems, ...quoteItems]);
      setLoading(false);
    };

    const snapshotError = (source: string) => (error: any) => {
      logger.error(`Dashboard snapshot error (${source})`, error);
      setLoading(false);
    };

    const unsubMembers = onSnapshot(membersRef, (memSnap) => {
      const list = memSnap.docs.map(doc => {
        const d = doc.data();
        return {
          id: doc.id,
          ...d,
          name: getFirstName(d.displayName || d.name || d.email)
        };
      });
      setMembers(list);
      membersList = list;
      // Map both ID and Email to the Name for easy lookup
      membersMap = new Map();
      membersList.forEach(m => {
        const cleanName = getFirstName(m.name);
        membersMap.set(m.id, cleanName);
        if (m.email) membersMap.set(m.email, cleanName);
      });
      updateItems();
    }, snapshotError('members'));

    const unsubCategories = onSnapshot(categoriesRef, (catSnap) => {
      categoriesMap = new Map(catSnap.docs.map(doc => [doc.id, doc.data().name]));
      updateItems();
    }, snapshotError('categories'));

    const unsubTasks = onSnapshot(tasksQuery, (snapshot) => {
      currentTaskDocs = snapshot.docs;
      updateItems();
    }, snapshotError('tasks'));

    const unsubEvents = onSnapshot(eventsQuery, (snapshot) => {
      currentEventDocs = snapshot.docs;
      updateItems();
    }, snapshotError('events'));

    const unsubQuotes = onSnapshot(quotesQuery, (snapshot) => {
      currentQuoteDocs = snapshot.docs;
      updateItems();
    }, snapshotError('quotes'));

    const unsubNotes = onSnapshot(notesQuery, (snapshot) => {
      currentNoteDocs = snapshot.docs;
      updateItems();
    }, snapshotError('notes'));

    const unsubShopping = onSnapshot(shoppingQuery, (snapshot) => {
      currentShoppingDocs = snapshot.docs;
      updateItems();
    }, snapshotError('shopping'));

    const unsubTradeUser = onSnapshot(doc(db, 'trade_users', tradeUserId), (snap) => {
      if (snap.exists() && snap.data()?.vehicles) {
        currentVehicles = snap.data().vehicles;
        updateItems();
      }
    }, snapshotError('tradeUser'));

    return () => {
      unsubMembers();
      unsubCategories();
      unsubTasks();
      unsubEvents();
      unsubQuotes();
      unsubNotes();
      unsubShopping();
      unsubTradeUser();
    };
  }, [tradeUserId]);

  useEffect(() => {
    const fetchGoogleEvents = async () => {
      if (!googleAccessToken) return;
      try {
        const now = new Date();
        const timeMin = now.toISOString();
        const timeMax = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString();
        
        const listResponse = await fetch('https://www.googleapis.com/calendar/v3/users/me/calendarList', {
          headers: { Authorization: `Bearer ${googleAccessToken}` }
        });

        if (listResponse.ok) {
          const listData = await listResponse.json();
          const calendars = (listData.items || []).filter((c: any) => c.selected !== false);

          const eventPromises = calendars.map(async (cal: any) => {
            try {
              const res = await fetch(
                `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(cal.id)}/events?timeMin=${encodeURIComponent(timeMin)}&timeMax=${encodeURIComponent(timeMax)}&singleEvents=true&orderBy=startTime&maxResults=10`,
                { headers: { Authorization: `Bearer ${googleAccessToken}` } }
              );
              if (res.ok) {
                const data = await res.json();
                return (data.items || []).map((item: any) => {
                  const startDate = item.start?.dateTime ? new Date(item.start.dateTime) : (item.start?.date ? new Date(item.start.date) : undefined);
                  return {
                    id: `google|${cal.id}|${item.id}`,
                    type: 'event',
                    title: item.summary || 'Untitled Event',
                    subtitle: cal.summary || 'Google Calendar',
                    date: startDate && !isNaN(startDate.getTime()) ? startDate : undefined,
                    color: cal.backgroundColor,
                    data: { 
                      ...item, 
                      type: 'external', 
                      calendarName: cal.summary,
                      assignedTo: item.extendedProperties?.private?.assignedTo || user?.uid || 'all',
                      isShared: item.extendedProperties?.private?.isShared !== 'false'
                    }
                  };
                });
              }
            } catch (err) {
              // ignore failures
            }
            return [];
          });

          const allEventArrays = await Promise.all(eventPromises);
          setGoogleEvents(allEventArrays.flat().sort((a, b) => (a.date?.getTime() || 0) - (b.date?.getTime() || 0)));
        }
      } catch (err) {
        logger.error('Dashboard Google Calendar fetch failed', err);
      }
    };

    fetchGoogleEvents();
  }, [googleAccessToken]);

  return { items, loading };
}
