export type BookingStatus =
  | "REQUESTED"
  | "PENDING"
  | "PAYMENT_PENDING"
  | "CONFIRMED"
  | "COMPLETED"
  | "CANCELLED"
  | "DECLINED"
  | "EXPIRED"
  | "ACCEPTED";

export function normalizeBookingStatus(status: unknown): string {
  return typeof status === "string" ? status.toUpperCase().trim() : "";
}

export function isPaymentPending(booking: { status?: unknown } | null | undefined): boolean {
  return normalizeBookingStatus(booking?.status) === "PAYMENT_PENDING";
}

