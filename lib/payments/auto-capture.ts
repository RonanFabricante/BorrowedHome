/**
 * Automatic payment capture with review window
 * Handles automatic capture of authorised payments after review window expires
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { stripe } from "@/lib/stripe/server";
import { DEFAULT_CURRENCY, normalizeCurrency } from "@/lib/currency";
import {
  bookingPayoutIdempotencyKey,
  resolveHostPayoutFromPaymentIntent,
} from "@/lib/stripe/hostPayout";

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
 * Automatically capture payment after review window if no dispute reported
 */
export async function autoCaptureWithReviewWindow(
  bookingId: string
): Promise<AutoCaptureResult> {
  // Runs from cron with no user session; RLS would hide all rows from the
  // anon client, so the service-role client is required here.
  const supabase = createAdminClient();

  try {
    // Fetch booking and payment with all related data
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

    // Only process if booking is COMPLETED
    if (booking.status !== "COMPLETED") {
      return {
        success: false,
        skipped: true,
        reason: `Booking not completed (status: ${booking.status})`,
      };
    }

    // uniq_payments_booking_id makes PostgREST return payments as an object
    // (one-to-one), not an array — normalize so indexing still works.
    const paymentsRaw = booking.payments as unknown;
    const paymentsList = Array.isArray(paymentsRaw)
      ? paymentsRaw
      : paymentsRaw
        ? [paymentsRaw]
        : [];
    const payment = paymentsList[0];
    if (!payment) {
      return {
        success: false,
        skipped: true,
        reason: "No payment record found for booking",
      };
    }

    // Only process authorised payments
    if (payment.status !== "authorised") {
      return {
        success: false,
        skipped: true,
        reason: `Payment not authorised (status: ${payment.status})`,
      };
    }

    // Check if dispute was reported
    if (payment.dispute_reported_at) {
      return {
        success: false,
        skipped: true,
        reason: "Dispute reported - manual review required",
        error: payment.capture_hold_reason || "Dispute reported",
      };
    }

    // Determine review window end time
    let reviewWindowEndsAt: Date;
    if (payment.review_window_ends_at) {
      reviewWindowEndsAt = new Date(payment.review_window_ends_at);
    } else {
      // Calculate from booking end time if not set
      const bookingEndTime = new Date(booking.end_at);
      reviewWindowEndsAt = new Date(
        bookingEndTime.getTime() + REVIEW_WINDOW_HOURS * 3600000
      );

      // Set review window in database
      await supabase
        .from("payments")
        .update({
          review_window_ends_at: reviewWindowEndsAt.toISOString(),
          auto_capture_scheduled_at: reviewWindowEndsAt.toISOString(),
        })
        .eq("id", payment.id);
    }

    const now = new Date();

    // Check if review window has ended
    if (now < reviewWindowEndsAt) {
      // Review window still active - schedule for later
      return {
        success: true,
        scheduled: true,
        reason: `Review window active until ${reviewWindowEndsAt.toISOString()}`,
        reviewWindowEndsAt,
      };
    }

    // Review window has passed - proceed with automatic capture
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
 * Capture payment and transfer funds to host via Stripe Connect
 */
async function captureAndTransferToHost(
  bookingId: string,
  payment: any,
  booking: any
): Promise<AutoCaptureResult> {
  const supabase = createAdminClient();

  try {
    // Extract host_id - Supabase returns listings as object when using .single()
    // Type assertion needed because TypeScript infers array type from query structure
    const listings = booking.listings as { host_id: string; title?: string } | undefined;
    const hostId = listings?.host_id;
    
    if (!hostId) {
      throw new Error("Host ID not found in booking data");
    }

    // Get host Stripe account
    const { data: host, error: hostError } = await supabase
      .from("hosts")
      .select("stripe_account_id, stripe_charges_enabled, stripe_payouts_enabled")
      .eq("user_id", hostId)
      .single();

    if (hostError || !host) {
      throw new Error("Host Stripe account not found");
    }

    if (!host.stripe_account_id) {
      throw new Error("Host Stripe account ID not set");
    }

    if (!host.stripe_charges_enabled || !host.stripe_payouts_enabled) {
      throw new Error(
        "Host Stripe account not fully enabled (charges or payouts disabled)"
      );
    }

    // Capture the payment intent (main booking payment).
    // If a previous run already captured but failed before updating the DB,
    // treat "already succeeded" as captured so the row can be reconciled.
    console.log(
      `[AutoCapture] Capturing PaymentIntent ${payment.stripe_payment_intent_id}`
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

    // Host payout = guest total − platform fee − actual Stripe processing fee
    const totalAmount = payment.amount;
    const platformFee = booking.platform_fee_amount || 0;
    const payout = await resolveHostPayoutFromPaymentIntent({
      paymentIntentId: payment.stripe_payment_intent_id,
      totalAmount,
      platformFee,
    });

    console.log(
      `[AutoCapture] Amount breakdown - Total: ${payout.totalAmount}, Platform Fee: ${payout.platformFee}, Stripe Fee: ${payout.stripeFee}, Host Amount: ${payout.hostAmount}`
    );

    console.log(
      `[AutoCapture] Transferring ${payout.hostAmount} cents to host ${hostId}`
    );

    // Get listing title
    const listingTitle = listings?.title || "Unknown";

    // Transfer to host's Stripe Connect account. The idempotency key prevents
    // a double payout if a previous run transferred but crashed before
    // updating the payment row.
    const transfer = await stripe.transfers.create(
      {
        amount: payout.hostAmount,
        currency: normalizeCurrency(
          (payment as { currency?: string }).currency ||
            (booking as { currency?: string }).currency ||
            DEFAULT_CURRENCY
        ),
        destination: host.stripe_account_id,
        metadata: {
          booking_id: bookingId,
          type: "booking_payment",
          listing_title: listingTitle,
          platform_fee_cents: String(payout.platformFee),
          stripe_fee_cents: String(payout.stripeFee),
        },
      },
      { idempotencyKey: bookingPayoutIdempotencyKey(bookingId) }
    );

    // Update payment status in database
    const { error: updateError } = await supabase
      .from("payments")
      .update({
        status: "captured",
        auto_capture_scheduled_at: null, // Clear scheduled time
      })
      .eq("id", payment.id);

    if (updateError) {
      console.error(
        "[AutoCapture] Failed to update payment status:",
        updateError
      );
      // Don't throw - transfer succeeded, just log the error
    }

    // Keep the booking's payment fields in sync with the payment record
    await supabase
      .from("bookings")
      .update({
        payment_status: "CAPTURED",
        payment_captured_at: new Date().toISOString(),
      })
      .eq("id", bookingId);

    // Auto-release deposit if no dispute was reported and it wasn't already
    // released or captured for damages
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
        if (depositIntent.status !== "canceled" && depositIntent.status !== "succeeded") {
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
        // Don't fail the whole operation if deposit release fails
      }
    }

    return {
      success: true,
      captured: true,
      transferId: transfer.id,
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
 * Find payments ready for auto-capture (review window expired, no dispute)
 */
export async function findPaymentsReadyForCapture() {
  const supabase = createAdminClient();

  const now = new Date().toISOString();

  const { data: readyPayments, error } = await supabase
    .from("payments")
    .select(
      `
      id,
      booking_id,
      status,
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
    .eq("bookings.status", "COMPLETED")
    .is("dispute_reported_at", null)
    .lte("review_window_ends_at", now)
    .order("review_window_ends_at", { ascending: true });

  if (error) {
    console.error(
      "[AutoCapture] Error finding payments ready for capture:",
      error
    );
    return [];
  }

  return readyPayments || [];
}
