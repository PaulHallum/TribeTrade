/**
 * Timezone-aware date utilities for Tribe: The Family Hub (UK-centric)
 */

/**
 * Higher-order function to create a date by combining a local date string (YYYY-MM-DD)
 * and a local time string (HH:mm) without UTC shifting issues.
 * 
 * In the UK (BST), '2024-04-07T16:00' should mean 16:00 local time.
 * Standard `new Date('2024-04-07T16:00').toISOString()` often shifts to 15:00 UTC 
 * if the browser interprets the input as UTC.
 */
export function combineDateTimeToDate(dateStr: string, timeStr: string): Date | null {
  if (!dateStr || !timeStr) return null;
  
  try {
    // Create date using local interpretation
    const [year, month, day] = dateStr.split('-').map(Number);
    const [hours, minutes] = timeStr.split(':').map(Number);
    
    // month is 0-indexed in JS Date constructor
    const d = new Date(year, month - 1, day, hours, minutes);
    return isNaN(d.getTime()) ? null : d;
  } catch (e) {
    return null;
  }
}

export function combineDateTimeToISO(dateStr: string, timeStr: string): string {
  const d = combineDateTimeToDate(dateStr, timeStr);
  return d ? d.toISOString() : "";
}

/**
 * Format a Date object or ISO string to local HH:mm for time inputs
 */
export function formatToLocalTime(dateSource: string | Date | any): string {
  if (!dateSource) return '12:00';
  const d = ensureDate(dateSource);

  if (isNaN(d.getTime())) return '12:00';
  
  const hours = d.getHours().toString().padStart(2, '0');
  const minutes = d.getMinutes().toString().padStart(2, '0');
  return `${hours}:${minutes}`;
}

/**
 * Format a Date object or ISO string to local YYYY-MM-DD for date inputs
 */
export function formatToLocalDate(dateSource: string | Date | any): string {
  if (!dateSource) return '';
  const d = ensureDate(dateSource);

  if (isNaN(d.getTime())) return '';
  
  const year = d.getFullYear();
  const month = (d.getMonth() + 1).toString().padStart(2, '0');
  const day = d.getDate().toString().padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Format a Date object or ISO string to local YYYY-MM-DDTHH:mm for datetime-local inputs
 */
export function formatToLocalDateTime(dateSource: string | Date | any): string {
  if (!dateSource) return '';
  const d = ensureDate(dateSource);

  if (isNaN(d.getTime())) return '';
  
  const year = d.getFullYear();
  const month = (d.getMonth() + 1).toString().padStart(2, '0');
  const day = d.getDate().toString().padStart(2, '0');
  const hours = d.getHours().toString().padStart(2, '0');
  const minutes = d.getMinutes().toString().padStart(2, '0');
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

/**
 * Force any date-like input to a Date object safely.
 */
export function ensureDate(dateSource: string | Date | any): Date {
  if (!dateSource) return new Date(NaN);
  
  if (dateSource instanceof Date) {
    return dateSource;
  }
  
  if (typeof dateSource === 'string') {
    // Replace space with T for ISO compatibility if needed
    const sanitized = dateSource.includes(' ') ? dateSource.replace(' ', 'T') : dateSource;
    const d = new Date(sanitized);
    return isNaN(d.getTime()) ? new Date(NaN) : d;
  }
  
  if (dateSource.toDate && typeof dateSource.toDate === 'function') {
    return dateSource.toDate();
  }
  
  if (dateSource.seconds !== undefined) { // Firebase Timestamp object but missing .toDate()
    return new Date(dateSource.seconds * 1000 + (dateSource.nanoseconds || 0) / 1000000);
  }

  // Handle case where it's already an object with seconds/nanoseconds but not a Timestamp class
  if (typeof dateSource === 'object' && dateSource !== null && 'seconds' in dateSource) {
    return new Date(dateSource.seconds * 1000 + (dateSource.nanoseconds || 0) / 1000000);
  }

  const d = new Date(dateSource);
  return isNaN(d.getTime()) ? new Date(NaN) : d;
}

/**
 * Interpret an AI-generated ISO date-time string (e.g. from Gemini) as local time.
 * This prevents UTC shifting (e.g. 10:00 UTC shifting to 11:00 BST).
 */
export function parseAISODateToLocal(isoStr: string | null | undefined): Date | null {
  if (!isoStr) return null;
  try {
    const matches = isoStr.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
    if (matches) {
      const year = Number(matches[1]);
      const month = Number(matches[2]);
      const day = Number(matches[3]);
      const hours = Number(matches[4]);
      const minutes = Number(matches[5]);
      
      const d = new Date(year, month - 1, day, hours, minutes);
      return isNaN(d.getTime()) ? null : d;
    }
    const d = new Date(isoStr);
    return isNaN(d.getTime()) ? null : d;
  } catch (e) {
    return null;
  }
}
