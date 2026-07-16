/**
 * Automatic payment capture with review window
 * Handles automatic capture of authorised payments after review window expires,
 * and retries host Transfers when the charge was captured but Connect payout is missing.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { stripe } from "@/lib/stripe/server";
import { completeHostPayout, needsHostTransfer } from "@/lib/payments/completeHostPayout";

const REVIEW_WINDOW_HOURS = 24;

export interface AutoCaptureResult {
  success: boolean;
  skipped?: boolean;
  scheduled?: boolean;
  captured?: boolean;
  transferId?: string;
  reason?: string;
  reviewWindowEndsAt?: Date;
  error?: string;
}

/**
 * Automatically capture payment after review window if no dispute reported.
 * Also completes host Transfer for orphan rows (charge captured, no stripe_transfer_id).
 */
export async function autoCaptureWithReviewWindow(
  bookingId: string
): Promise<AutoCaptureResult> {
  const supabase = createAdminClient();

  try {
    const { data: booking, error: bookingError } = await supabase
      .from("bookings")
      .select(
        `
        id,
        status,
        end_at,
        total_amount,
        platform_fee_amount,
        deposit_amount,
        currency,
        listings!inner(
          host_id,
          title
        ),
        payments!inner(
          id,
          status,
          stripe_payment_intent_id,
          stripe_deposit_intent_id,
          stripe_transfer_id,
          amount,
          deposit_amount,
          currency,
          deposit_released_at,
          review_window_ends_at,
          dispute_reported_at,
          auto_capture_scheduled_at,
          capture_hold_reason
        )
      `
      )
      .eq("id", bookingId)
      .single();

    if (bookingError || !booking) {
      return {
        success: false,
        skipped: true,
        reason: "Booking not found",
        error: bookingError?.message,
      };
    }

    if (booking.status !== "COMPLETED") {
      return {
        success: false,
        skipped: true,
        reason: `Booking not completed (status: ${booking.status})`,
      };
    }

    const paymentsRaw = booking.payments as unknown;
    const paymentsList = Array.isArray(paymentsRaw)
      ? paymentsRaw
      : paymentsRaw
        ? [paymentsRaw]
        : [];
    const payment = paymentsList[0] as
      | {
          id: string;
          status: string;
          stripe_payment_intent_id: string;
          stripe_deposit_intent_id: string | null;
          stripe_transfer_id: string | null;
          amount: number;
          deposit_amount: number;
          currency?: string;
          deposit_released_at: string | null;
          review_window_ends_at: string | null;
          dispute_reported_at: string | null;
          auto_capture_scheduled_at: string | null;
          capture_hold_reason: string | null;
        }
      | undefined;

    if (!payment) {
      return {
        success: false,
        skipped: true,
        reason: "No payment record found for booking",
      };
    }

    if (payment.stripe_transfer_id) {
      return {
        success: true,
        skipped: true,
        reason: "Host transfer already completed",
        transferId: payment.stripe_transfer_id,
      };
    }

    if (!needsHostTransfer(payment)) {
      return {
        success: false,
        skipped: true,
        reason: `Payment not eligible for host payout (status: ${payment.status})`,
      };
    }

    if (payment.dispute_reported_at) {
      return {
        success: false,
        skipped: true,
        reason: "Dispute reported - manual review required",
        error: payment.capture_hold_reason || "Dispute reported",
      };
    }

    // Orphan: DB says captured but Connect transfer missing — skip review window, transfer now
    if (payment.status === "captured") {
      console.log(
        `[AutoCapture] Completing missing host transfer for booking ${bookingId}`
      );
      return await captureAndTransferToHost(bookingId, payment, booking);
    }

    let reviewWindowEndsAt: Date;
    if (payment.review_window_ends_at) {
      reviewWindowEndsAt = new Date(payment.review_window_ends_at);
    } else {
      const bookingEndTime = new Date(booking.end_at);
      reviewWindowEndsAt = new Date(
        bookingEndTime.getTime() + REVIEW_WINDOW_HOURS * 3600000
      );

      await supabase
        .from("payments")
        .update({
          review_window_ends_at: reviewWindowEndsAt.toISOString(),
          auto_capture_scheduled_at: reviewWindowEndsAt.toISOString(),
        })
        .eq("id", payment.id);
    }

    const now = new Date();
    if (now < reviewWindowEndsAt) {
      return {
        success: true,
        scheduled: true,
        reason: `Review window active until ${reviewWindowEndsAt.toISOString()}`,
        reviewWindowEndsAt,
      };
    }

    console.log(
      `[AutoCapture] Review window expired for booking ${bookingId}. Proceeding with capture.`
    );

    return await captureAndTransferToHost(bookingId, payment, booking);
  } catch (error: any) {
    console.error("[AutoCapture] Error in autoCaptureWithReviewWindow:", error);
    return {
      success: false,
      skipped: false,
      error: error.message || "Unknown error during auto-capture",
    };
  }
}

/**
 * Capture payment (if needed) and transfer funds to host via Stripe Connect
 */
async function captureAndTransferToHost(
  bookingId: string,
  payment: {
    id: string;
    stripe_payment_intent_id: string;
    stripe_deposit_intent_id: string | null;
    amount: number;
    currency?: string;
    dispute_reported_at: string | null;
    deposit_released_at: string | null;
  },
  booking: {
    platform_fee_amount?: number;
    currency?: string;
    listings?: { host_id: string; title?: string } | { host_id: string; title?: string }[];
  }
): Promise<AutoCaptureResult> {
  const supabase = createAdminClient();

  try {
    const listingsRaw = booking.listings as
      | { host_id: string; title?: string }
      | { host_id: string; title?: string }[]
      | undefined;
    const listings = Array.isArray(listingsRaw) ? listingsRaw[0] : listingsRaw;
    const hostId = listings?.host_id;

    if (!hostId) {
      throw new Error("Host ID not found in booking data");
    }

    const { data: host, error: hostError } = await supabase
      .from("hosts")
      .select("stripe_account_id")
      .eq("user_id", hostId)
      .single();

    if (hostError || !host?.stripe_account_id) {
      throw new Error("Host Stripe account not found");
    }

    console.log(
      `[AutoCapture] Ensuring PaymentIntent ${payment.stripe_payment_intent_id} is captured`
    );
    let paymentIntent = await stripe.paymentIntents.retrieve(
      payment.stripe_payment_intent_id
    );

    if (paymentIntent.status === "requires_capture") {
      paymentIntent = await stripe.paymentIntents.capture(
        payment.stripe_payment_intent_id
      );
    }

    if (paymentIntent.status !== "succeeded") {
      throw new Error(
        `PaymentIntent capture failed with status: ${paymentIntent.status}`
      );
    }

    // Charge is on the platform. Do not mark DB captured until Transfer succeeds.
    const { transferId, payout } = await completeHostPayout({
      bookingId,
      paymentId: payment.id,
      paymentIntentId: payment.stripe_payment_intent_id,
      hostUserId: hostId,
      stripeAccountId: host.stripe_account_id,
      totalAmount: payment.amount,
      platformFee: booking.platform_fee_amount || 0,
      currency: payment.currency || booking.currency,
      listingTitle: listings?.title,
    });

    console.log(
      `[AutoCapture] Transfer ${transferId} — host ${payout.hostAmount} (platform ${payout.platformFee}, stripe ${payout.stripeFee})`
    );

    if (
      payment.stripe_deposit_intent_id &&
      !payment.dispute_reported_at &&
      !payment.deposit_released_at
    ) {
      try {
        console.log(
          `[AutoCapture] Auto-releasing deposit ${payment.stripe_deposit_intent_id}`
        );
        const depositIntent = await stripe.paymentIntents.retrieve(
          payment.stripe_deposit_intent_id
        );
        if (
          depositIntent.status !== "canceled" &&
          depositIntent.status !== "succeeded"
        ) {
          await stripe.paymentIntents.cancel(payment.stripe_deposit_intent_id);
        }

        await supabase
          .from("payments")
          .update({
            deposit_released_at: new Date().toISOString(),
          })
          .eq("id", payment.id);

        console.log(`[AutoCapture] Deposit released successfully`);
      } catch (depositError: any) {
        console.error(
          "[AutoCapture] Failed to auto-release deposit:",
          depositError
        );
      }
    }

    return {
      success: true,
      captured: true,
      transferId,
      reason: "Payment captured and transferred to host successfully",
    };
  } catch (error: any) {
    console.error("[AutoCapture] Error capturing and transferring:", error);
    return {
      success: false,
      captured: false,
      error: error.message || "Failed to capture and transfer payment",
    };
  }
}

/**
 * Find payments needing capture and/or host Transfer
 */
export async function findPaymentsReadyForCapture() {
  const supabase = createAdminClient();
  const now = new Date().toISOString();

  // 1) Normal path: authorised, review window ended
  const { data: authorisedReady, error: authError } = await supabase
    .from("payments")
    .select(
      `
      id,
      booking_id,
      status,
      stripe_transfer_id,
      review_window_ends_at,
      dispute_reported_at,
      bookings!inner(
        id,
        status,
        end_at
      )
    `
    )
    .eq("status", "authorised")
    .is("stripe_transfer_id", null)
    .eq("bookings.status", "COMPLETED")
    .is("dispute_reported_at", null)
    .lte("review_window_ends_at", now)
    .order("review_window_ends_at", { ascending: true });

  if (authError) {
    console.error(
      "[AutoCapture] Error finding authorised payments ready for capture:",
      authError
    );
  }

  // 2) Orphans: marked captured (or charge done) but no Connect transfer
  const { data: missingTransfer, error: missError } = await supabase
    .from("payments")
    .select(
      `
      id,
      booking_id,
      status,
      stripe_transfer_id,
      review_window_ends_at,
      dispute_reported_at,
      bookings!inner(
        id,
        status,
        end_at
      )
    `
    )
    .eq("status", "captured")
    .is("stripe_transfer_id", null)
    .eq("bookings.status", "COMPLETED")
    .is("dispute_reported_at", null)
    .order("updated_at", { ascending: true })
    .limit(50);

  if (missError) {
    console.error(
      "[AutoCapture] Error finding payments missing host transfer:",
      missError
    );
  }

  const byId = new Map<string, { id: string; booking_id: string }>();
  for (const row of authorisedReady || []) {
    byId.set(row.id, row);
  }
  for (const row of missingTransfer || []) {
    byId.set(row.id, row);
  }

  return Array.from(byId.values());
}
