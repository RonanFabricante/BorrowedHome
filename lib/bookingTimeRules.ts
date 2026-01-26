/**
 * Booking time validation rules using minutes-from-midnight
 * 
 * Rules:
 * 1. Day-use only: start and end on same calendar date
 * 2. End must be <= 21:00 (9:00 PM)
 * 3. Minimum duration: 2 hours (120 minutes)
 * 4. Lead time: start must be at least 4 hours from now
 * 5. Latest start: 19:00 (to allow 2h minimum duration ending by 21:00)
 */

export const MIN_DURATION_MINUTES = 120; // 2 hours minimum
export const CUTOFF_MINUTES = 21 * 60; // 1260 minutes (9:00 PM)
export const LATEST_START_MINUTES = CUTOFF_MINUTES - MIN_DURATION_MINUTES; // 1140 minutes (19:00)
export const LEAD_TIME_MINUTES = 240; // 4 hours

export interface TimeValidationResult {
  ok: boolean;
  errors: string[];
}

export interface TimeNormalizationResult {
  startMinutes: number;
  endMinutes: number;
  adjustments: string[];
}

/**
 * Convert time string or Date to minutes from midnight (0-1439)
 */
export function toMinutes(time: string | Date): number {
  if (time instanceof Date) {
    return time.getHours() * 60 + time.getMinutes();
  }

  const timeStr = time.trim().toUpperCase();
  const hasAM = timeStr.includes('AM');
  const hasPM = timeStr.includes('PM');
  const timeOnly = timeStr.replace(/[AP]M/i, '').trim();
  
  const parts = timeOnly.split(':');
  if (parts.length < 2) {
    throw new Error(`Invalid time format: ${time}`);
  }

  let hours = parseInt(parts[0], 10);
  const minutes = parseInt(parts[1], 10);

  if (isNaN(hours) || isNaN(minutes)) {
    throw new Error(`Invalid time format: ${time}`);
  }

  if (hasAM) {
    if (hours === 12) hours = 0;
  } else if (hasPM) {
    if (hours !== 12) hours += 12;
  }

  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
    throw new Error(`Invalid time: ${time}`);
  }

  return hours * 60 + minutes;
}

/**
 * Convert minutes from midnight to time string (HH:MM)
 */
export function fromMinutes(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
}

/**
 * Calculate minimum end minutes (start + 2 hours)
 */
export function minEndMinutes(startMinutes: number): number {
  return startMinutes + MIN_DURATION_MINUTES;
}

/**
 * Normalize start and end times to valid ranges
 * Returns adjusted times and list of adjustments made
 */
export function normalize({
  startMinutes,
  endMinutes,
}: {
  startMinutes: number;
  endMinutes: number;
}): TimeNormalizationResult {
  const adjustments: string[] = [];
  let adjustedStart = startMinutes;
  let adjustedEnd = endMinutes;

  // Clamp start to latest allowed (19:00)
  if (adjustedStart > LATEST_START_MINUTES) {
    adjustedStart = LATEST_START_MINUTES;
    adjustments.push(`Start time adjusted to ${fromMinutes(adjustedStart)} (latest allowed)`);
  }

  // Ensure end is at least start + 2 hours
  const minEnd = minEndMinutes(adjustedStart);
  if (adjustedEnd < minEnd) {
    adjustedEnd = minEnd;
    adjustments.push(`End time adjusted to meet minimum 2 hours`);
  }

  // Clamp end to cutoff (21:00)
  if (adjustedEnd > CUTOFF_MINUTES) {
    adjustedEnd = CUTOFF_MINUTES;
    adjustments.push(`End time adjusted to ${fromMinutes(adjustedEnd)} (latest allowed)`);
  }

  return {
    startMinutes: adjustedStart,
    endMinutes: adjustedEnd,
    adjustments,
  };
}

/**
 * Validate booking times
 */
export function validate({
  date,
  startMinutes,
  endMinutes,
  now = new Date(),
}: {
  date: string | Date;
  startMinutes: number;
  endMinutes: number;
  now?: Date;
}): TimeValidationResult {
  const errors: string[] = [];

  // Check minimum duration
  const duration = endMinutes - startMinutes;
  if (duration < MIN_DURATION_MINUTES) {
    errors.push("Bookings must be at least 2 hours.");
  }

  // Check end time cutoff
  if (endMinutes > CUTOFF_MINUTES) {
    errors.push("Bookings must end by 9:00 PM.");
  }

  // Check start time is valid (not before 7 AM)
  if (startMinutes < 7 * 60) {
    errors.push("Earliest start time is 7:00 AM (day-use only)");
  }

  // Check start time doesn't exceed latest allowed
  if (startMinutes > LATEST_START_MINUTES) {
    errors.push(`Latest start time is ${fromMinutes(LATEST_START_MINUTES)} (7:00 PM) to allow minimum 2-hour duration ending by 9:00 PM`);
  }

  // Check day-use (same calendar date) - if date provided
  if (date) {
    try {
      const startDate = date instanceof Date ? date : new Date(date);
      const endDate = date instanceof Date ? date : new Date(date);
      
      // If times would cross midnight, it's invalid
      if (endMinutes < startMinutes) {
        errors.push("Overnight bookings are not permitted.");
      }
    } catch {
      // Date parsing error handled elsewhere
    }
  }

  // Check lead time (if now is provided)
  if (now) {
    try {
      const startDate = date instanceof Date ? date : new Date(date as string);
      const startDateTime = new Date(startDate);
      startDateTime.setHours(Math.floor(startMinutes / 60), startMinutes % 60, 0, 0);
      
      const diffMs = startDateTime.getTime() - now.getTime();
      const diffMinutes = diffMs / (1000 * 60);
      
      if (diffMinutes < LEAD_TIME_MINUTES) {
        errors.push("Bookings must be requested at least 4 hours in advance.");
      }
    } catch {
      // Date parsing error handled elsewhere
    }
  }

  return {
    ok: errors.length === 0,
    errors,
  };
}

/**
 * Check if a start time would result in invalid end time
 */
export function wouldExceedCutoff(startMinutes: number): boolean {
  return minEndMinutes(startMinutes) > CUTOFF_MINUTES;
}
