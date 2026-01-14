// Cancellation Policy Engine
// Computes refund amounts and policy outcomes based on cancellation timing and actor

export type CancellationActor = "guest" | "host" | "system";
export type CancellationReason = "changed_plans" | "unavailable" | "safety" | "other";

export interface PolicyResult {
  refundablePercent: 0 | 50 | 100;
  refundableAmountCents: number;
  reasonCode: string;
  message: string;
}

export interface CancellationContext {
  actor: CancellationActor;
  bookingStartTime: Date;
  cancelledAt: Date;
  totalAmountCents: number;
  policyVersion?: string;
}

/**
 * Compute cancellation policy result
 * 
 * V1 Policy (Day-use marketplace, aligned with 4-hour lead time):
 * 
 * Guest cancels:
 * - >= 24h before start: 100% refund
 * - 4h to <24h: 50% refund (v1: always void full, document policy for v2)
 * - < 4h: 0% refund (v1: always void full, document policy for v2)
 * 
 * Host cancels:
 * - Any time before end_time: 100% refund
 * 
 * System cancels:
 * - 100% refund (e.g., force majeure)
 */
export function computeCancellationPolicy(
  context: CancellationContext
): PolicyResult {
  const { actor, bookingStartTime, cancelledAt, totalAmountCents, policyVersion = "v1" } = context;

  const now = cancelledAt;
  const hoursUntilStart = (bookingStartTime.getTime() - now.getTime()) / (1000 * 60 * 60);

  // Host cancellation: always 100% refund
  if (actor === "host") {
    return {
      refundablePercent: 100,
      refundableAmountCents: totalAmountCents,
      reasonCode: "host_cancellation_full_refund",
      message: "Host cancellation: Full refund will be processed.",
    };
  }

  // System cancellation: always 100% refund
  if (actor === "system") {
    return {
      refundablePercent: 100,
      refundableAmountCents: totalAmountCents,
      reasonCode: "system_cancellation_full_refund",
      message: "System cancellation: Full refund will be processed.",
    };
  }

  // Guest cancellation: time-based policy
  if (actor === "guest") {
    if (hoursUntilStart >= 24) {
      return {
        refundablePercent: 100,
        refundableAmountCents: totalAmountCents,
        reasonCode: "guest_cancellation_24h_plus",
        message: "Cancelled 24+ hours before start: Full refund will be processed.",
      };
    } else if (hoursUntilStart >= 4) {
      // V1: Always void full amount (policy says 50%, but we don't charge cancellation fees yet)
      // Document this in UI and terms
      return {
        refundablePercent: 100, // Policy says 50%, but v1 implementation voids full amount
        refundableAmountCents: totalAmountCents,
        reasonCode: "guest_cancellation_4h_to_24h",
        message: "Cancelled 4-24 hours before start: Full refund will be processed. (Policy: 50% - v1 implementation returns full amount)",
      };
    } else {
      // V1: Always void full amount (policy says 0%, but we don't charge cancellation fees yet)
      return {
        refundablePercent: 100, // Policy says 0%, but v1 implementation voids full amount
        refundableAmountCents: totalAmountCents,
        reasonCode: "guest_cancellation_under_4h",
        message: "Cancelled less than 4 hours before start: Full refund will be processed. (Policy: 0% - v1 implementation returns full amount)",
      };
    }
  }

  // Fallback (should not reach here)
  return {
    refundablePercent: 100,
    refundableAmountCents: totalAmountCents,
    reasonCode: "default_full_refund",
    message: "Full refund will be processed.",
  };
}

/**
 * Check if a booking can be cancelled
 */
export function canCancelBooking(
  status: string,
  startTime: Date,
  now: Date = new Date()
): { canCancel: boolean; reason?: string } {
  // Cannot cancel if already cancelled
  if (status === "CANCELLED") {
    return { canCancel: false, reason: "Booking is already cancelled" };
  }

  // Cannot cancel if completed
  if (status === "COMPLETED") {
    return { canCancel: false, reason: "Cannot cancel a completed booking. Use dispute reporting if needed." };
  }

  // Cannot cancel if expired
  if (status === "EXPIRED") {
    return { canCancel: false, reason: "Booking has expired" };
  }

  // Cannot cancel if rejected
  if (status === "REJECTED" || status === "DECLINED") {
    return { canCancel: false, reason: "Booking was already rejected" };
  }

  // Can cancel if CONFIRMED or PAYMENT_PENDING
  if (status === "CONFIRMED" || status === "PAYMENT_PENDING") {
    // Cannot cancel after booking has started
    if (now >= startTime) {
      return { canCancel: false, reason: "Cannot cancel a booking that has already started" };
    }
    return { canCancel: true };
  }

  // REQUESTED bookings can be "withdrawn" (treated as cancellation)
  if (status === "REQUESTED" || status === "PENDING") {
    return { canCancel: true };
  }

  return { canCancel: false, reason: `Cannot cancel booking with status: ${status}` };
}
