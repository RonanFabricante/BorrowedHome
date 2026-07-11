/**
 * Booking wall-clock times are always Australia/Sydney.
 * Avoid browser/server local timezone when building ISO timestamps.
 */

export const BOOKING_TIMEZONE = "Australia/Sydney";

/**
 * Convert a Sydney calendar date + HH:mm wall-clock time to a UTC ISO string.
 */
export function sydneyLocalToUtcIso(dateYmd: string, timeHm: string): string {
  const [y, m, d] = dateYmd.split("-").map(Number);
  const [hh, mm] = timeHm.split(":").map(Number);

  if (![y, m, d, hh, mm].every((n) => Number.isFinite(n))) {
    throw new Error(`Invalid Sydney date/time: ${dateYmd} ${timeHm}`);
  }

  // Guess UTC, then correct so the Sydney wall-clock matches (handles DST).
  let utcMs = Date.UTC(y, m - 1, d, hh, mm, 0);
  for (let i = 0; i < 3; i++) {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: BOOKING_TIMEZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(new Date(utcMs));

    const get = (type: Intl.DateTimeFormatPartTypes) =>
      Number(parts.find((p) => p.type === type)?.value ?? "0");

    const desired = Date.UTC(y, m - 1, d, hh, mm);
    const actual = Date.UTC(
      get("year"),
      get("month") - 1,
      get("day"),
      get("hour"),
      get("minute")
    );
    utcMs += desired - actual;
  }

  return new Date(utcMs).toISOString();
}

/**
 * Day of week (0=Sunday … 6=Saturday) for a YYYY-MM-DD calendar date in Sydney.
 */
export function sydneyDayOfWeek(dateYmd: string): number {
  const noonIso = sydneyLocalToUtcIso(dateYmd, "12:00");
  const weekday = new Intl.DateTimeFormat("en-US", {
    timeZone: BOOKING_TIMEZONE,
    weekday: "short",
  }).format(new Date(noonIso));

  const map: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };

  const day = map[weekday];
  if (day === undefined) {
    throw new Error(`Could not resolve weekday for ${dateYmd}`);
  }
  return day;
}

/** Format a timestamp in Australia/Sydney (SSR-safe; avoids UTC vs local hydration drift). */
export function formatInSydney(
  value: string | Date,
  options: Intl.DateTimeFormatOptions
): string {
  return new Intl.DateTimeFormat("en-AU", {
    timeZone: BOOKING_TIMEZONE,
    ...options,
  }).format(new Date(value));
}

export function formatSydneyDate(value: string | Date): string {
  return formatInSydney(value, {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

export function formatSydneyDateLong(value: string | Date): string {
  return formatInSydney(value, {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export function formatSydneyTime(value: string | Date): string {
  return formatInSydney(value, {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}
