import { logger } from './logger';
import { ReminderOffset, getGoogleCalendarReminders } from '../lib/reminderUtils';

export interface CalendarEvent {
  title: string;
  description?: string;
  startTime: string; // ISO String (e.g., 2024-05-20T10:00:00Z)
  endTime?: string;
  location?: string;
  isAllDay?: boolean;
  reminderOffset?: ReminderOffset;
}

/**
 * Syncs an event to Google Calendar using the native Fetch API.
 * Keeps dependencies minimal and execution fast.
 */
export async function syncToGoogleCalendar(token: string, event: CalendarEvent) {
  try {
    // Default duration: 1 hour if endTime is missing
    const start = new Date(event.startTime);
    const end = event.endTime
      ? new Date(event.endTime)
      : new Date(start.getTime() + 60 * 60 * 1000);

    const body: any = {
      summary: event.title,
      description: event.description || '',
      location: event.location || '',
      reminders: getGoogleCalendarReminders(event.reminderOffset || 'at_time'),
    };

    // Handle All-Day Events vs. Timed Events
    if (event.isAllDay) {
      body.start = { date: start.toISOString().split('T')[0] };
      body.end = { date: end.toISOString().split('T')[0] };
    } else {
      body.start = { dateTime: start.toISOString() };
      body.end = { dateTime: end.toISOString() };
    }

    const response = await fetch(
      'https://www.googleapis.com/calendar/v3/calendars/primary/events',
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
      }
    );

    const result = await response.json();

    if (!response.ok) {
      logger.error('❌ Google Calendar sync failed', result.error || result);
      return null;
    }

    logger.info(`✅ Event synced: ${event.title}`);
    return result;

  } catch (error: any) {
    logger.error('❌ Error in syncToGoogleCalendar', error.message);
    return null;
  }
}