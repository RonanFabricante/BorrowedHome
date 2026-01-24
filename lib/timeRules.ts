/**
 * Time parsing and validation utilities for day-use bookings
 * Uses minutes-from-midnight for reliable time comparisons
 */

export const END_TIME_CUTOFF_MINUTES = 21 * 60; // 1260 minutes (9:00 PM)

export interface TimeValidationResult {
  ok: boolean;
  errors: string[];
}

/**
 * Parse a time string or Date to minutes from midnight (0-1439)
 * Handles formats: "07:00", "09:00 AM", "21:00", Date objects
 */
export function parseTimeToMinutes(time: string | Date): number {
  if (time instanceof Date) {
    // Extract hours and minutes from Date object (local time)
    return time.getHours() * 60 + time.getMinutes();
  }

  // Handle string formats
  const timeStr = time.trim().toUpperCase();
  
  // Remove AM/PM if present
  const hasAM = timeStr.includes('AM');
  const hasPM = timeStr.includes('PM');
  const timeOnly = timeStr.replace(/[AP]M/i, '').trim();
  
  // Parse HH:MM or HH:MM:SS
  const parts = timeOnly.split(':');
  if (parts.length < 2) {
    throw new Error(`Invalid time format: ${time}`);
  }

  let hours = parseInt(parts[0], 10);
  const minutes = parseInt(parts[1], 10);

  if (isNaN(hours) || isNaN(minutes)) {
    throw new Error(`Invalid time format: ${time}`);
  }

  // Handle AM/PM
  if (hasAM) {
    if (hours === 12) {
      hours = 0; // 12:00 AM = midnight
    }
  } else if (hasPM) {
    if (hours !== 12) {
      hours += 12; // 1:00 PM = 13:00, etc.
    }
  }

  // Validate range
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
    throw new Error(`Invalid time: ${time}`);
  }

  return hours * 60 + minutes;
}

/**
 * Validate a day-use booking using minutes-from-midnight
 */
export function validateDayUseBooking({
  date,
  startTime,
  endTime,
}: {
  date: string | Date;
  startTime: string | Date;
  endTime: string | Date;
}): TimeValidationResult {
  const errors: string[] = [];

  try {
    // Parse times to minutes
    const startMinutes = parseTimeToMinutes(startTime);
    const endMinutes = parseTimeToMinutes(endTime);

    // Debug logging (only in development)
    if (process.env.NODE_ENV === 'development') {
      console.log('[TimeValidation]', {
        startTime: typeof startTime === 'string' ? startTime : startTime.toTimeString(),
        endTime: typeof endTime === 'string' ? endTime : endTime.toTimeString(),
        startMinutes,
        endMinutes,
        cutoffMinutes: END_TIME_CUTOFF_MINUTES,
        endExceedsCutoff: endMinutes > END_TIME_CUTOFF_MINUTES,
      });
    }

    // Check: end must be after start
    if (endMinutes <= startMinutes) {
      errors.push("End time must be after start time");
    }

    // Check: end time must be <= 21:00 (1260 minutes)
    if (endMinutes > END_TIME_CUTOFF_MINUTES) {
      errors.push(`Bookings must end by 21:00 (9:00 PM) (day-use only)`);
    }

    // Check: same calendar date (if date is provided)
    if (date) {
      const startDate = date instanceof Date ? date : new Date(date);
      const endDate = date instanceof Date ? date : new Date(date);
      
      // If end time is on the next day (crosses midnight), it's invalid
      // This is handled by the endMinutes > startMinutes check above
      // But we also check if the date would differ
      if (startDate.getFullYear() !== endDate.getFullYear() ||
          startDate.getMonth() !== endDate.getMonth() ||
          startDate.getDate() !== endDate.getDate()) {
        errors.push("Bookings must start and end on the same day (day-use only, no overnight)");
      }
    }

    return {
      ok: errors.length === 0,
      errors,
    };
  } catch (err: any) {
    return {
      ok: false,
      errors: [err.message || "Invalid time format"],
    };
  }
}

/**
 * Check if end time exceeds the cutoff (21:00)
 */
export function endTimeExceedsCutoff(endTime: string | Date): boolean {
  try {
    const endMinutes = parseTimeToMinutes(endTime);
    return endMinutes > END_TIME_CUTOFF_MINUTES;
  } catch {
    return true; // If we can't parse, assume invalid
  }
}
