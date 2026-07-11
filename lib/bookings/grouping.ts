import { normalizeBookingStatus } from "@/lib/bookingStatus";
import { formatSydneyDate, formatSydneyTime } from "@/lib/timezone";

export type BookingSection = "awaiting" | "upcoming" | "past";

export function bookingSection(booking: {
  status: string;
  end_at: string;
}): BookingSection {
  const status = normalizeBookingStatus(booking.status);
  if (status === "PAYMENT_PENDING") return "awaiting";
  if (
    status === "COMPLETED" ||
    status === "CANCELLED" ||
    status === "EXPIRED" ||
    status === "DECLINED" ||
    status === "REJECTED" ||
    new Date(booking.end_at).getTime() < Date.now()
  ) {
    return "past";
  }
  return "upcoming";
}

export function bookingsStatLine(
  bookings: Array<{
    status: string;
    start_at: string;
    end_at: string;
    listings?: unknown;
  }>
): string {
  const safe = (bookings || []).filter((b) => b?.listings);
  const awaiting = safe.filter(
    (b) => normalizeBookingStatus(b.status) === "PAYMENT_PENDING"
  ).length;
  const upcoming = safe.filter((b) => bookingSection(b) === "upcoming").length;
  const next = [...safe]
    .filter((b) => {
      const s = bookingSection(b);
      return s === "upcoming" || s === "awaiting";
    })
    .sort((a, b) => +new Date(a.start_at) - +new Date(b.start_at))[0];

  const parts = [`${safe.length} booking${safe.length === 1 ? "" : "s"}`];
  if (awaiting) parts.push(`${awaiting} awaiting payment`);
  if (upcoming) parts.push(`${upcoming} upcoming`);
  if (next) {
    parts.push(
      `next: ${formatSydneyDate(next.start_at)} ${formatSydneyTime(next.start_at)}`
    );
  }
  return parts.join(" · ");
}
