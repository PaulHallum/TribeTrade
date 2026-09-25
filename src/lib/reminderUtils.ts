/**
 * Reminder utilities for Tribe: The Family Hub
 * Handles calculating reminder trigger times, offset options, and Google Calendar overrides.
 */

export type ReminderOffset = 'at_time' | '10m' | '30m' | '1h' | '1d' | 'none';

export interface ReminderOption {
  value: ReminderOffset;
  label: string;
}

export const REMINDER_OPTIONS: ReminderOption[] = [
  { value: 'at_time', label: 'At time of event' },
  { value: '10m', label: '10 minutes before' },
  { value: '30m', label: '30 minutes before' },
  { value: '1h', label: '1 hour before' },
  { value: '1d', label: '1 day before (09:00)' },
  { value: 'none', label: 'No reminder' },
];

export const TASK_REMINDER_OPTIONS: ReminderOption[] = [
  { value: 'at_time', label: 'At due time' },
  { value: '10m', label: '10 minutes before' },
  { value: '30m', label: '30 minutes before' },
  { value: '1h', label: '1 hour before' },
  { value: '1d', label: '1 day before (09:00)' },
  { value: 'none', label: 'No reminder' },
];

/**
 * Calculates the exact reminder trigger Date based on the target Date and offset.
 */
export function calculateReminderTime(targetDate: Date | null, offset: ReminderOffset = 'at_time'): Date | null {
  if (!targetDate || isNaN(targetDate.getTime())) return null;
  if (offset === 'none') return null;

  switch (offset) {
    case '10m':
      return new Date(targetDate.getTime() - 10 * 60 * 1000);
    case '30m':
      return new Date(targetDate.getTime() - 30 * 60 * 1000);
    case '1h':
      return new Date(targetDate.getTime() - 60 * 60 * 1000);
    case '1d': {
      // 1 day before: set to 09:00 AM local time on the preceding day
      const d = new Date(targetDate.getTime() - 24 * 60 * 60 * 1000);
      d.setHours(9, 0, 0, 0);
      return d;
    }
    case 'at_time':
    default:
      return targetDate;
  }
}

/**
 * Creates a safe local daytime Date (09:00 AM) for all-day events, avoiding midnight UTC / 01:00 BST triggers.
 */
export function getAllDayDefaultTime(dateStr: string): Date {
  try {
    const [year, month, day] = dateStr.split('-').map(Number);
    if (!isNaN(year) && !isNaN(month) && !isNaN(day)) {
      return new Date(year, month - 1, day, 9, 0, 0, 0);
    }
  } catch (e) {
    // Fallback
  }
  const d = new Date(dateStr);
  d.setHours(9, 0, 0, 0);
  return d;
}

/**
 * Maps a ReminderOffset into Google Calendar API reminder settings.
 * Disables useDefault to prevent Google Calendar from triggering unwanted 1-day or 1-week early alerts.
 */
export function getGoogleCalendarReminders(offset: ReminderOffset = 'at_time'): {
  useDefault: boolean;
  overrides: Array<{ method: string; minutes: number }>;
} {
  if (offset === 'none') {
    return {
      useDefault: false,
      overrides: [],
    };
  }

  const minutesMap: Record<ReminderOffset, number> = {
    'at_time': 0,
    '10m': 10,
    '30m': 30,
    '1h': 60,
    '1d': 1440,
    'none': 0,
  };

  return {
    useDefault: false,
    overrides: [
      { method: 'popup', minutes: minutesMap[offset] ?? 0 },
    ],
  };
}
