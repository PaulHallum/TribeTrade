import { format, startOfWeek, endOfWeek, eachDayOfInterval, isSameDay } from 'date-fns';
import { ensureDate } from './dateUtils';

export interface ShareData {
  title?: string;
  text: string;
  url?: string;
}

/**
 * Share text via Web Share API if supported, or fallback to WhatsApp link / clipboard
 */
export async function shareViaWebShare(data: ShareData): Promise<boolean> {
  if (navigator.share) {
    try {
      await navigator.share({
        title: data.title || 'NoteGenius Share',
        text: data.text,
        url: data.url
      });
      return true;
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        console.error('Web Share failed', err);
      }
      return false;
    }
  }
  return false;
}

/**
 * Open WhatsApp with pre-filled text
 */
export function shareToWhatsApp(text: string): void {
  const encodedText = encodeURIComponent(text);
  const whatsappUrl = `https://wa.me/?text=${encodedText}`;
  window.open(whatsappUrl, '_blank', 'noopener,noreferrer');
}

/**
 * Copy text to clipboard
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    } else {
      const textArea = document.createElement('textarea');
      textArea.value = text;
      textArea.style.position = 'fixed';
      textArea.style.left = '-999999px';
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();
      const successful = document.execCommand('copy');
      document.body.removeChild(textArea);
      return successful;
    }
  } catch (err) {
    console.error('Copy to clipboard failed', err);
    return false;
  }
}

/**
 * Format a day's meal plan into clean text for WhatsApp / sharing
 */
export function formatMealPlanText(meal: any, dayName: string, dateStr?: string): string {
  if (!meal) {
    return `🍽️ Meal Plan for ${dayName}${dateStr ? ` (${dateStr})` : ''}\nNo meal scheduled yet.`;
  }

  const lines: string[] = [];
  lines.push(`🍽️ Meal Plan for ${dayName}${dateStr ? ` (${dateStr})` : ''}`);
  lines.push('────────────────────────');

  if (meal.isJoint) {
    lines.push(`• Meal: ${meal.jointDinner || 'Not specified'}`);
  } else {
    if (meal.kidsDinner) {
      lines.push(`• Kids: ${meal.kidsDinner}`);
    }
    if (meal.adultsDinner) {
      lines.push(`• Adults: ${meal.adultsDinner}`);
    }
  }

  const ingredients = meal.allIngredients || meal.keyIngredients || [];
  if (ingredients.length > 0) {
    lines.push('');
    lines.push(`🛒 Ingredients: ${ingredients.join(', ')}`);
  }

  return lines.join('\n');
}

/**
 * Format a child/member's 7-day schedule into clean text for WhatsApp / sharing
 */
export function formatChildWeeklyScheduleText(
  memberName: string,
  events: any[],
  tasks: any[],
  referenceDate: Date = new Date()
): string {
  const weekStart = startOfWeek(referenceDate, { weekStartsOn: 1 });
  const weekEnd = endOfWeek(referenceDate, { weekStartsOn: 1 });
  const days = eachDayOfInterval({ start: weekStart, end: weekEnd });

  const lines: string[] = [];
  lines.push(`📅 Weekly Schedule for ${memberName}`);
  lines.push(`(${format(weekStart, 'MMM d')} - ${format(weekEnd, 'MMM d, yyyy')})`);
  lines.push('────────────────────────');

  let hasAnyItems = false;

  days.forEach(day => {
    const dayStr = format(day, 'EEE, MMM d');
    const dayEvents = events.filter(e => {
      if (!e.startTime) return false;
      const eventDate = ensureDate(e.startTime);
      return isSameDay(eventDate, day);
    });

    const dayTasks = tasks.filter(t => {
      if (!t.dueDate) return false;
      const taskDate = ensureDate(t.dueDate);
      return isSameDay(taskDate, day);
    });

    if (dayEvents.length > 0 || dayTasks.length > 0) {
      hasAnyItems = true;
      lines.push(`\n📌 ${dayStr}`);

      dayEvents.forEach(e => {
        let timeStr = 'All day';
        if (e.startTime && !e.isAllDay && e.type !== 'birthday') {
          try {
            timeStr = format(ensureDate(e.startTime), 'HH:mm');
          } catch (err) { }
        }
        const loc = e.location ? ` (@ ${e.location})` : '';
        lines.push(`  • [${timeStr}] ${e.title}${loc}`);
      });

      dayTasks.forEach(t => {
        lines.push(`  ✓ Task: ${t.title}${t.status === 'completed' ? ' (Done)' : ''}`);
      });
    }
  });

  if (!hasAnyItems) {
    lines.push('\nNo scheduled events or tasks for this week.');
  }

  return lines.join('\n');
}

/**
 * Format extracted Smart Convert event details into clean text for WhatsApp / sharing
 */
export function formatSmartConvertEventText(
  title: string,
  expandedContent?: string,
  startTime?: string,
  location?: string
): string {
  const lines: string[] = [];
  lines.push(`📅 Event: ${title}`);

  if (startTime) {
    try {
      const dt = ensureDate(startTime);
      lines.push(`⏰ Time: ${format(dt, 'PPPP p')}`);
    } catch (err) {
      lines.push(`⏰ Time: ${startTime}`);
    }
  }

  if (location) {
    lines.push(`📍 Location: ${location}`);
  }

  if (expandedContent) {
    lines.push(`\n📝 Details:\n${expandedContent}`);
  }

  return lines.join('\n');
}

/**
 * Format a task into clean text for WhatsApp / sharing
 */
export function formatTaskShareText(
  title: string,
  description?: string,
  dueDate?: string,
  assignedToName?: string
): string {
  const lines: string[] = [];
  lines.push(`✅ Task: ${title}`);

  if (dueDate) {
    try {
      const dt = ensureDate(dueDate);
      lines.push(`⏰ Due: ${format(dt, 'PPP p')}`);
    } catch {
      lines.push(`⏰ Due: ${dueDate}`);
    }
  }

  if (assignedToName) {
    lines.push(`👤 Assigned to: ${assignedToName}`);
  }

  if (description) {
    lines.push(`\n📝 Description:\n${description}`);
  }

  return lines.join('\n');
}

/**
 * Format a note into clean text for WhatsApp / sharing
 */
export function formatNoteShareText(title?: string, content?: string): string {
  const lines: string[] = [];
  if (title) {
    lines.push(`📌 Note: ${title}`);
  }
  if (content) {
    if (title) lines.push('');
    lines.push(content);
  }
  return lines.join('\n');
}

