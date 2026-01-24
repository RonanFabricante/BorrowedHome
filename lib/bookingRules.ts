/**
 * Booking validation rules for BorrowedHome day-use bookings
 * 
 * Rules:
 * 1. Day-use only: start and end must be on the same calendar date
 * 2. End time must be <= 21:00 (9:00 PM)
 * 3. Booking duration is fixed at exactly 2 hours
 * 4. Lead time: bookings must be requested at least 4 hours in advance
 * 5. Latest allowed start time is 19:00 (7:00 PM) to ensure end <= 21:00
 */

export const BOOKING_DURATION_MINUTES = 120; // 2 hours
export const LEAD_TIME_MINUTES = 240; // 4 hours
export const END_TIME_CUTOFF_HOUR = 21; // 9:00 PM
export const LATEST_START_HOUR = 19; // 7:00 PM (to ensure end <= 21:00)

export interface BookingValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * Compute end time from start time (start + 2 hours)
 */
export function computeEndTime(startTime: string, durationMinutes: number = BOOKING_DURATION_MINUTES): string {
  const [hours, minutes] = startTime.split(':').map(Number);
  const startMinutes = hours * 60 + minutes;
  const endMinutes = startMinutes + durationMinutes;
  const endHours = Math.floor(endMinutes / 60);
  const endMins = endMinutes % 60;
  return `${String(endHours).padStart(2, '0')}:${String(endMins).padStart(2, '0')}`;
}

/**
 * Check if start and end times are on the same calendar date
 */
export function isDayUse(startDateTime: Date, endDateTime: Date): boolean {
  return (
    startDateTime.getFullYear() === endDateTime.getFullYear() &&
    startDateTime.getMonth() === endDateTime.getMonth() &&
    startDateTime.getDate() === endDateTime.getDate()
  );
}

/**
 * Check if end time is before or at the cutoff (21:00)
 */
export function isEndBeforeCutoff(endDateTime: Date, cutoffHour: number = END_TIME_CUTOFF_HOUR): boolean {
  const endHour = endDateTime.getHours();
  const endMinutes = endDateTime.getMinutes();
  return endHour < cutoffHour || (endHour === cutoffHour && endMinutes === 0);
}

/**
 * Check if lead time requirement is satisfied (4 hours minimum)
 */
export function isLeadTimeSatisfied(
  now: Date,
  startDateTime: Date,
  leadMinutes: number = LEAD_TIME_MINUTES
): boolean {
  const diffMs = startDateTime.getTime() - now.getTime();
  const diffMinutes = diffMs / (1000 * 60);
  return diffMinutes >= leadMinutes;
}

/**
 * Validate a booking request
 */
export function validateBookingRequest({
  startDateTime,
  endDateTime,
  now = new Date(),
}: {
  startDateTime: Date;
  endDateTime: Date;
  now?: Date;
}): BookingValidationResult {
  const errors: string[] = [];

  // Check day-use (same calendar date)
  if (!isDayUse(startDateTime, endDateTime)) {
    errors.push("Bookings must start and end on the same day (day-use only, no overnight)");
  }

  // Check end time cutoff
  if (!isEndBeforeCutoff(endDateTime)) {
    errors.push(`Bookings must end by ${END_TIME_CUTOFF_HOUR}:00 (9:00 PM) (day-use only)`);
  }

  // Check duration is exactly 2 hours
  const durationMs = endDateTime.getTime() - startDateTime.getTime();
  const durationMinutes = durationMs / (1000 * 60);
  if (Math.abs(durationMinutes - BOOKING_DURATION_MINUTES) > 1) {
    // Allow 1 minute tolerance for rounding
    errors.push(`Booking duration must be exactly ${BOOKING_DURATION_MINUTES / 60} hours`);
  }

  // Check lead time
  if (!isLeadTimeSatisfied(now, startDateTime)) {
    const hours = Math.floor(LEAD_TIME_MINUTES / 60);
    errors.push(`Bookings must be requested at least ${hours} hours before the start time`);
  }

  // Check start time is valid (not before 7 AM)
  const startHour = startDateTime.getHours();
  if (startHour < 7) {
    errors.push("Earliest start time is 7:00 AM (day-use only)");
  }

  // Check start time doesn't exceed latest allowed (19:00)
  if (startHour > LATEST_START_HOUR || (startHour === LATEST_START_HOUR && startDateTime.getMinutes() > 0)) {
    errors.push(`Latest start time is ${LATEST_START_HOUR}:00 (7:00 PM) to ensure booking ends by ${END_TIME_CUTOFF_HOUR}:00`);
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Get the latest allowed start time for a given date
 * Returns the latest time that would result in end time <= 21:00
 */
export function getLatestStartTime(date: Date): Date {
  const latest = new Date(date);
  latest.setHours(LATEST_START_HOUR, 0, 0, 0);
  return latest;
}

/**
 * Check if a start time would result in an invalid end time
 */
export function wouldExceedCutoff(startTime: string): boolean {
  const endTime = computeEndTime(startTime);
  const [endHours] = endTime.split(':').map(Number);
  return endHours > END_TIME_CUTOFF_HOUR;
}
