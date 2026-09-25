import { subMonths, addYears, format, parseISO, isValid } from 'date-fns';
import { doc, collection, writeBatch, getDocs, query, where } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { Vehicle, VehicleComplianceItem } from '../types/vehicle';
import { logger } from './logger';

export interface CalculatedComplianceEntry {
  id: string;
  vehicleId: string;
  complianceItemId: string;
  vehicleName: string;
  registration: string;
  complianceTitle: string;
  complianceType: string;
  isReminder: boolean;
  date: Date;
  dateString: string; // YYYY-MM-DD
  dueDateString: string; // Original due date
  title: string;
  description: string;
  color: string;
  notes?: string;
}

/**
 * Calculates the two annual calendar entries (1-month reminder and due date)
 * for a specific compliance item and calendar year.
 */
export function calculateComplianceEntriesForYear(
  vehicle: Vehicle,
  item: VehicleComplianceItem,
  targetYear: number
): { reminderEntry: CalculatedComplianceEntry; dueEntry: CalculatedComplianceEntry } | null {
  if (!item.dueDate || typeof item.dueDate !== 'string') return null;

  const parsedOriginal = parseISO(item.dueDate);
  if (!isValid(parsedOriginal)) return null;

  const month = parsedOriginal.getMonth();
  const day = parsedOriginal.getDate();

  // Create due date for the target year
  const targetDueDate = new Date(targetYear, month, day, 9, 0, 0);

  // 1-month advance reminder is strictly 1 calendar month before
  const targetReminderDate = subMonths(targetDueDate, 1);

  const cleanReg = vehicle.registration ? vehicle.registration.trim().toUpperCase() : '';
  const vehicleLabel = cleanReg ? `${vehicle.name} (${cleanReg})` : vehicle.name;

  const reminderEntry: CalculatedComplianceEntry = {
    id: `vehicle_${vehicle.id}_${item.id}_reminder_${targetYear}`,
    vehicleId: vehicle.id,
    complianceItemId: item.id,
    vehicleName: vehicle.name,
    registration: cleanReg,
    complianceTitle: item.title,
    complianceType: item.type,
    isReminder: true,
    date: targetReminderDate,
    dateString: format(targetReminderDate, 'yyyy-MM-dd'),
    dueDateString: format(targetDueDate, 'yyyy-MM-dd'),
    title: `⚠️ 1 Month Reminder: ${item.title} Due - ${vehicleLabel}`,
    description: `Advance reminder: ${item.title} for ${vehicleLabel} is due on ${format(targetDueDate, 'dd/MM/yyyy')}.${item.notes ? ` Notes: ${item.notes}` : ''}`,
    color: '#f59e0b', // Amber
    notes: item.notes
  };

  const dueEntry: CalculatedComplianceEntry = {
    id: `vehicle_${vehicle.id}_${item.id}_due_${targetYear}`,
    vehicleId: vehicle.id,
    complianceItemId: item.id,
    vehicleName: vehicle.name,
    registration: cleanReg,
    complianceTitle: item.title,
    complianceType: item.type,
    isReminder: false,
    date: targetDueDate,
    dateString: format(targetDueDate, 'yyyy-MM-dd'),
    dueDateString: format(targetDueDate, 'yyyy-MM-dd'),
    title: `🚨 ${item.title.toUpperCase()} DUE TODAY - ${vehicleLabel}`,
    description: `${item.title} is DUE TODAY for ${vehicleLabel}.${item.notes ? ` Notes: ${item.notes}` : ''}`,
    color: '#ef4444', // Red/Rose
    notes: item.notes
  };

  return { reminderEntry, dueEntry };
}

/**
 * Projects all vehicle compliance entries for a given target year.
 */
export function getVehicleComplianceEntriesForYear(
  vehicles: Vehicle[],
  targetYear: number
): CalculatedComplianceEntry[] {
  const entries: CalculatedComplianceEntry[] = [];

  for (const vehicle of vehicles) {
    if (!vehicle.complianceItems || !Array.isArray(vehicle.complianceItems)) continue;

    for (const item of vehicle.complianceItems) {
      const calculated = calculateComplianceEntriesForYear(vehicle, item, targetYear);
      if (calculated) {
        entries.push(calculated.reminderEntry);
        entries.push(calculated.dueEntry);
      }
    }
  }

  return entries;
}

/**
 * Advance due date by exactly 1 year (e.g. after MOT pass or annual service completion).
 */
export function advanceComplianceDueDate(currentDueDate: string): string {
  try {
    const parsed = parseISO(currentDueDate);
    if (!isValid(parsed)) return currentDueDate;
    const nextYear = addYears(parsed, 1);
    return format(nextYear, 'yyyy-MM-dd');
  } catch (err) {
    logger.warn('Failed to advance compliance due date:', err);
    return currentDueDate;
  }
}

/**
 * Sync active vehicle compliance entries to Firestore calendarEvents collection.
 * Writes events for the current active cycle (current year and next year) with source='vehicle_compliance'.
 */
export async function syncVehiclesToFirestoreEvents(
  tradeUserId: string,
  vehicles: Vehicle[],
  authorId: string
): Promise<void> {
  if (!tradeUserId || !authorId) return;

  try {
    const eventsRef = collection(db, 'trade_users', tradeUserId, 'calendarEvents');
    const existingSnap = await getDocs(query(eventsRef, where('source', '==', 'vehicle_compliance')));

    const batch = writeBatch(db);

    // Delete existing vehicle compliance calendar events to prevent stale records
    existingSnap.docs.forEach((docSnap) => {
      batch.delete(docSnap.ref);
    });

    const currentYear = new Date().getFullYear();
    const yearsToSync = [currentYear, currentYear + 1];

    for (const year of yearsToSync) {
      const entries = getVehicleComplianceEntriesForYear(vehicles, year);

      for (const entry of entries) {
        const eventDocRef = doc(eventsRef, entry.id);
        batch.set(eventDocRef, {
          title: entry.title,
          description: entry.description,
          startTime: entry.date.toISOString(),
          endTime: new Date(entry.date.getTime() + 60 * 60 * 1000).toISOString(),
          isAllDay: true,
          type: 'event',
          color: entry.color,
          source: 'vehicle_compliance',
          vehicleId: entry.vehicleId,
          complianceItemId: entry.complianceItemId,
          isReminder: entry.isReminder,
          registration: entry.registration,
          vehicleName: entry.vehicleName,
          authorId: authorId,
          isShared: true
        });
      }
    }

    await batch.commit();
    logger.info(`Successfully synchronised vehicle compliance entries for trade user ${tradeUserId}`);
  } catch (error) {
    logger.error('Failed to sync vehicle compliance entries to Firestore:', error);
    throw error;
  }
}
