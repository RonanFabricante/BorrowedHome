/**
 * Privileged admin operations — always call via /api/admin/* after requireSuperadminApi.
 * Uses service-role client so booking/payment update triggers allow the write.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { stripe } from "@/lib/stripe/server";
import { DEFAULT_CURRENCY, normalizeCurrency } from "@/lib/currency";
import { logAdminAction } from "@/lib/admin/audit";
import type { BookingStatus } from "@/lib/types";
import {
  bookingPayoutIdempotencyKey,
  resolveHostPayoutFromPaymentIntent,
} from "@/lib/stripe/hostPayout";

function asOne<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? value[0] ?? null : value;
}

export type OpsResult = {
  success: boolean;
  message: string;
  details?: Record<string, unknown>;
  error?: string;
};

async function loadPaymentBundle(bookingId: string) {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("payments")
    .select(
      `
      *,
      bookings!inner(
        id,
        status,
        end_at,
        guest_id,
        total_amount,
        platform_fee_amount,
        deposit_amount,
        currency,
        listing_id,
        listings!inner(
          host_id,
          title,
          published
        )
      )
    `
    )
    .eq("booking_id", bookingId)
    .maybeSingle();

  if (error || !data) {
    return { payment: null as null, error: error?.message || "Payment not found" };
  }

  return { payment: data, error: null as null };
}

/**
 * Align DB payment/booking fields with Stripe PaymentIntent status.
 * Does not transfer funds.
 */
export async function syncPaymentFromStripe(
  actorId: string,
  bookingId: string,
  reason?: string
): Promise<OpsResult> {
  const { payment, error } = await loadPaymentBundle(bookingId);
  if (!payment) {
    return { success: false, message: "Payment not found", error: error || undefined };
  }

  const pi = await stripe.paymentIntents.retrieve(payment.stripe_payment_intent_id);
  const admin = createAdminClient();

  let nextStatus = payment.status as string;
  if (pi.status === "succeeded") nextStatus = "captured";
  else if (pi.status === "requires_capture") nextStatus = "authorised";
  else if (pi.status === "canceled") nextStatus = "released";
  else if (pi.status === "requires_payment_method") nextStatus = "pending";

  const updates: Record<string, unknown> = { status: nextStatus };
  if (nextStatus === "captured") {
    updates.auto_capture_scheduled_at = null;
  }

  await admin.from("payments").update(updates).eq("id", payment.id);

  if (nextStatus === "captured") {
    await admin
      .from("bookings")
      .update({
        payment_status: "CAPTURED",
        payment_captured_at: new Date().toISOString(),
      })
      .eq("id", bookingId);
  }

  let depositStatus: string | null = null;
  if (payment.stripe_deposit_intent_id) {
    const deposit = await stripe.paymentIntents.retrieve(payment.stripe_deposit_intent_id);
    depositStatus = deposit.status;
    if (
      (deposit.status === "canceled" || deposit.status === "succeeded") &&
      !payment.deposit_released_at &&
      deposit.status === "canceled"
    ) {
      await admin
        .from("payments")
        .update({ deposit_released_at: new Date().toISOString() })
        .eq("id", payment.id);
    }
  }

  await logAdminAction({
    actorId,
    action: "sync_payment_from_stripe",
    entityType: "booking",
    entityId: bookingId,
    reason,
    payload: {
      paymentId: payment.id,
      previousStatus: payment.status,
      nextStatus,
      stripeStatus: pi.status,
      depositStatus,
    },
  });

  return {
    success: true,
    message: `Synced payment to "${nextStatus}" (Stripe: ${pi.status})`,
    details: {
      previousStatus: payment.status,
      nextStatus,
      stripeStatus: pi.status,
      depositStatus,
      paymentIntentId: pi.id,
    },
  };
}

/**
 * Capture (if needed) + transfer to host + mark captured.
 * Safe if PI already succeeded (skips capture, still transfers with idempotency key).
 */
export async function retryCaptureAndTransfer(
  actorId: string,
  bookingId: string,
  reason?: string
): Promise<OpsResult> {
  const { payment, error } = await loadPaymentBundle(bookingId);
  if (!payment) {
    return { success: false, message: "Payment not found", error: error || undefined };
  }

  const booking = asOne(payment.bookings as any);
  if (!booking) {
    return { success: false, message: "Booking not found on payment" };
  }

  const listing = asOne(booking.listings as any);
  const hostId = listing?.host_id as string | undefined;
  if (!hostId) {
    return { success: false, message: "Host not found on listing" };
  }

  if (payment.dispute_reported_at) {
    return {
      success: false,
      message: "Dispute active — clear dispute / hold before capture",
      error: payment.capture_hold_reason || "Dispute reported",
    };
  }

  const admin = createAdminClient();
  const { data: host, error: hostError } = await admin
    .from("hosts")
    .select("stripe_account_id, stripe_charges_enabled, stripe_payouts_enabled")
    .eq("user_id", hostId)
    .maybeSingle();

  if (hostError || !host?.stripe_account_id) {
    return { success: false, message: "Host Stripe account not found or incomplete" };
  }

  if (!host.stripe_charges_enabled || !host.stripe_payouts_enabled) {
    return {
      success: false,
      message: "Host Stripe account not fully enabled (charges or payouts disabled)",
    };
  }

  let paymentIntent = await stripe.paymentIntents.retrieve(
    payment.stripe_payment_intent_id
  );

  if (paymentIntent.status === "requires_capture") {
    paymentIntent = await stripe.paymentIntents.capture(payment.stripe_payment_intent_id);
  }

  if (paymentIntent.status !== "succeeded") {
    return {
      success: false,
      message: `PaymentIntent not capturable (status: ${paymentIntent.status})`,
      error: paymentIntent.status,
    };
  }

  const totalAmount = payment.amount as number;
  const platformFee = (booking.platform_fee_amount as number) || 0;

  let payout;
  try {
    payout = await resolveHostPayoutFromPaymentIntent({
      paymentIntentId: payment.stripe_payment_intent_id,
      totalAmount,
      platformFee,
    });
  } catch (feeErr: any) {
    return {
      success: false,
      message: feeErr.message || "Failed to calculate host payout",
      error: feeErr.message,
    };
  }

  let transferId: string | undefined;
  try {
    const transfer = await stripe.transfers.create(
      {
        amount: payout.hostAmount,
        currency: normalizeCurrency(
          (payment.currency as string) ||
            (booking.currency as string) ||
            DEFAULT_CURRENCY
        ),
        destination: host.stripe_account_id,
        metadata: {
          booking_id: bookingId,
          type: "booking_payment",
          listing_title: (listing?.title as string) || "Unknown",
          admin_retry: "true",
          platform_fee_cents: String(payout.platformFee),
          stripe_fee_cents: String(payout.stripeFee),
        },
      },
      { idempotencyKey: bookingPayoutIdempotencyKey(bookingId) }
    );
    transferId = transfer.id;
  } catch (err: any) {
    await logAdminAction({
      actorId,
      action: "retry_capture_transfer_failed",
      entityType: "booking",
      entityId: bookingId,
      reason,
      payload: {
        stripeStatus: paymentIntent.status,
        error: err.message,
        hostAmount: payout.hostAmount,
        stripeFee: payout.stripeFee,
        platformFee: payout.platformFee,
      },
    });
    return {
      success: false,
      message: `Transfer failed: ${err.message}`,
      error: err.message,
      details: {
        stripeStatus: paymentIntent.status,
        capturedInStripe: true,
        hostAmount: payout.hostAmount,
        stripeFee: payout.stripeFee,
        platformFee: payout.platformFee,
      },
    };
  }

  await admin
    .from("payments")
    .update({
      status: "captured",
      auto_capture_scheduled_at: null,
    })
    .eq("id", payment.id);

  await admin
    .from("bookings")
    .update({
      payment_status: "CAPTURED",
      payment_captured_at: new Date().toISOString(),
    })
    .eq("id", bookingId);

  if (
    payment.stripe_deposit_intent_id &&
    !payment.dispute_reported_at &&
    !payment.deposit_released_at
  ) {
    try {
      const deposit = await stripe.paymentIntents.retrieve(
        payment.stripe_deposit_intent_id
      );
      if (deposit.status !== "canceled" && deposit.status !== "succeeded") {
        await stripe.paymentIntents.cancel(payment.stripe_deposit_intent_id);
      }
      await admin
        .from("payments")
        .update({ deposit_released_at: new Date().toISOString() })
        .eq("id", payment.id);
    } catch (depositErr: any) {
      console.error("[AdminOps] Deposit release failed:", depositErr);
    }
  }

  await logAdminAction({
    actorId,
    action: "retry_capture_and_transfer",
    entityType: "booking",
    entityId: bookingId,
    reason,
    payload: {
      transferId,
      hostAmount: payout.hostAmount,
      platformFee: payout.platformFee,
      stripeFee: payout.stripeFee,
      stripeStatus: paymentIntent.status,
    },
  });

  return {
    success: true,
    message: `Captured and transferred ${payout.hostAmount} cents to host (Stripe fee ${payout.stripeFee} deducted)`,
    details: {
      transferId,
      hostAmount: payout.hostAmount,
      platformFee: payout.platformFee,
      stripeFee: payout.stripeFee,
    },
  };
}

export async function releaseDepositAdmin(
  actorId: string,
  bookingId: string,
  reason?: string
): Promise<OpsResult> {
  const { payment, error } = await loadPaymentBundle(bookingId);
  if (!payment) {
    return { success: false, message: "Payment not found", error: error || undefined };
  }

  if (!payment.stripe_deposit_intent_id) {
    return { success: false, message: "No deposit PaymentIntent on this payment" };
  }

  if (payment.deposit_released_at) {
    return { success: true, message: "Deposit already marked released" };
  }

  const deposit = await stripe.paymentIntents.retrieve(
    payment.stripe_deposit_intent_id
  );

  if (deposit.status !== "canceled" && deposit.status !== "succeeded") {
    await stripe.paymentIntents.cancel(payment.stripe_deposit_intent_id);
  }

  const admin = createAdminClient();
  await admin
    .from("payments")
    .update({ deposit_released_at: new Date().toISOString() })
    .eq("id", payment.id);

  await logAdminAction({
    actorId,
    action: "release_deposit",
    entityType: "booking",
    entityId: bookingId,
    reason,
    payload: {
      depositIntentId: payment.stripe_deposit_intent_id,
      previousStripeStatus: deposit.status,
    },
  });

  return {
    success: true,
    message: "Deposit released (PaymentIntent canceled)",
    details: { depositIntentId: payment.stripe_deposit_intent_id },
  };
}

const ALLOWED_ADMIN_STATUSES: BookingStatus[] = [
  "COMPLETED",
  "CANCELLED",
  "EXPIRED",
  "CONFIRMED",
  "DECLINED",
];

export async function setBookingStatusAdmin(
  actorId: string,
  bookingId: string,
  status: BookingStatus,
  reason: string
): Promise<OpsResult> {
  if (!reason?.trim()) {
    return { success: false, message: "Reason is required for status changes" };
  }
  if (!ALLOWED_ADMIN_STATUSES.includes(status)) {
    return {
      success: false,
      message: `Status ${status} is not allowed via admin console`,
    };
  }

  const admin = createAdminClient();
  const { data: booking, error } = await admin
    .from("bookings")
    .select("id, status")
    .eq("id", bookingId)
    .maybeSingle();

  if (error || !booking) {
    return { success: false, message: "Booking not found" };
  }

  const previous = booking.status as string;
  const { error: updateError } = await admin
    .from("bookings")
    .update({ status })
    .eq("id", bookingId);

  if (updateError) {
    return { success: false, message: updateError.message, error: updateError.message };
  }

  await logAdminAction({
    actorId,
    action: "set_booking_status",
    entityType: "booking",
    entityId: bookingId,
    reason,
    payload: { previous, next: status },
  });

  return {
    success: true,
    message: `Booking status ${previous} → ${status}`,
    details: { previous, next: status },
  };
}

export async function setListingPublishedAdmin(
  actorId: string,
  listingId: string,
  published: boolean,
  reason?: string
): Promise<OpsResult> {
  const admin = createAdminClient();
  const { data: listing, error } = await admin
    .from("listings")
    .select("id, published, title")
    .eq("id", listingId)
    .maybeSingle();

  if (error || !listing) {
    return { success: false, message: "Listing not found" };
  }

  const { error: updateError } = await admin
    .from("listings")
    .update({ published })
    .eq("id", listingId);

  if (updateError) {
    return { success: false, message: updateError.message, error: updateError.message };
  }

  await logAdminAction({
    actorId,
    action: published ? "publish_listing" : "unpublish_listing",
    entityType: "listing",
    entityId: listingId,
    reason,
    payload: {
      title: listing.title,
      previous: listing.published,
      next: published,
    },
  });

  return {
    success: true,
    message: published ? "Listing published" : "Listing unpublished",
    details: { title: listing.title, published },
  };
}

/**
 * Suspend or unsuspend a user. On suspend, unpublish all of their listings.
 */
export async function setUserSuspendedAdmin(
  actorId: string,
  userId: string,
  suspended: boolean,
  reason?: string
): Promise<OpsResult> {
  if (!reason?.trim()) {
    return { success: false, message: "Reason is required" };
  }

  const admin = createAdminClient();
  const { data: profile, error } = await admin
    .from("profiles")
    .select("id, is_suspended, full_name")
    .eq("id", userId)
    .maybeSingle();

  if (error || !profile) {
    return { success: false, message: "User not found" };
  }

  const { error: updateError } = await admin
    .from("profiles")
    .update({ is_suspended: suspended })
    .eq("id", userId);

  if (updateError) {
    return {
      success: false,
      message: updateError.message,
      error: updateError.message,
    };
  }

  let unpublishedCount = 0;
  if (suspended) {
    const { data: listings } = await admin
      .from("listings")
      .select("id")
      .eq("host_id", userId)
      .eq("published", true);

    if (listings?.length) {
      const { error: unpublishError } = await admin
        .from("listings")
        .update({ published: false })
        .eq("host_id", userId)
        .eq("published", true);

      if (!unpublishError) {
        unpublishedCount = listings.length;
      }
    }
  }

  await logAdminAction({
    actorId,
    action: suspended ? "suspend_user" : "unsuspend_user",
    entityType: "profile",
    entityId: userId,
    reason,
    payload: {
      full_name: profile.full_name,
      previous: profile.is_suspended,
      next: suspended,
      unpublishedCount,
    },
  });

  return {
    success: true,
    message: suspended
      ? `User suspended${unpublishedCount ? `; ${unpublishedCount} listing(s) unpublished` : ""}`
      : "User unsuspended",
    details: { suspended, unpublishedCount },
  };
}

export async function clearDisputeHoldAdmin(
  actorId: string,
  bookingId: string,
  reason: string
): Promise<OpsResult> {
  if (!reason?.trim()) {
    return { success: false, message: "Reason is required to clear a dispute hold" };
  }

  const { payment, error } = await loadPaymentBundle(bookingId);
  if (!payment) {
    return { success: false, message: "Payment not found", error: error || undefined };
  }

  const admin = createAdminClient();
  await admin
    .from("payments")
    .update({
      dispute_reported_at: null,
      capture_hold_reason: null,
    })
    .eq("id", payment.id);

  await logAdminAction({
    actorId,
    action: "clear_dispute_hold",
    entityType: "booking",
    entityId: bookingId,
    reason,
    payload: {
      previousDisputeAt: payment.dispute_reported_at,
      previousHoldReason: payment.capture_hold_reason,
    },
  });

  return { success: true, message: "Dispute hold cleared" };
}
