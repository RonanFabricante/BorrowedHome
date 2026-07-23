import { createAdminClient } from "@/lib/supabase/admin";

export type ExpireUnpaidResult = {
  expiredCount: number;
  expiredIds: string[];
};

/**
 * Expire PAYMENT_PENDING bookings past payment_deadline_at via SECURITY DEFINER RPC.
 * Safe to call repeatedly (idempotent).
 */
export async function expireUnpaidBookings(): Promise<ExpireUnpaidResult> {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("expire_unpaid_bookings");

  if (error) {
    throw new Error(error.message);
  }

  // PostgREST returns TABLE as an array of rows
  const row = Array.isArray(data) ? data[0] : data;
  const expiredCount = Number(row?.expired_count ?? 0);
  const expiredIds: string[] = row?.expired_ids ?? [];

  if (expiredCount > 0) {
    for (const bookingId of expiredIds) {
      try {
        await admin.rpc("log_booking_event", {
          p_booking_id: bookingId,
          p_event_type: "EXPIRED",
          p_actor_id: null,
          p_payload: { reason: "payment_deadline_passed" },
        });
      } catch (eventError) {
        console.error(
          `[ExpireUnpaid] Failed to log event for ${bookingId}:`,
          eventError
        );
      }
    }
  }

  return { expiredCount, expiredIds };
}

/**
 * If this booking is PAYMENT_PENDING past its deadline, expire all due bookings
 * (cheap batch RPC) and return whether this booking is now past payment.
 */
export async function expireIfPastPaymentDeadline(booking: {
  id: string;
  status: string;
  payment_deadline_at: string | null;
}): Promise<{ expired: boolean }> {
  if (booking.status !== "PAYMENT_PENDING" || !booking.payment_deadline_at) {
    return { expired: false };
  }

  if (new Date(booking.payment_deadline_at) >= new Date()) {
    return { expired: false };
  }

  await expireUnpaidBookings();
  return { expired: true };
}
