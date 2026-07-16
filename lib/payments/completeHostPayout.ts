/**
 * Complete host payout after a booking charge has been captured on the platform.
 * Separate Charges and Transfers: money sits on the platform until this Transfer runs.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { stripe } from "@/lib/stripe/server";
import { DEFAULT_CURRENCY, normalizeCurrency } from "@/lib/currency";
import {
  bookingPayoutIdempotencyKey,
  resolveHostPayoutFromPaymentIntent,
  type HostPayoutBreakdown,
} from "@/lib/stripe/hostPayout";
import { requireHostStripeReady } from "@/lib/stripe/refreshHostStatus";

export type CompleteHostPayoutParams = {
  bookingId: string;
  paymentId: string;
  paymentIntentId: string;
  hostUserId: string;
  stripeAccountId: string;
  totalAmount: number;
  platformFee: number;
  currency?: string | null;
  listingTitle?: string;
  /** Extra transfer metadata (e.g. admin_retry) */
  transferMetadata?: Record<string, string>;
};

export type CompleteHostPayoutResult = {
  transferId: string;
  payout: HostPayoutBreakdown;
};

/**
 * Create (or idempotently replay) the host Transfer, then mark payment settled.
 * Call only after the PaymentIntent has status `succeeded`.
 */
export async function completeHostPayout(
  params: CompleteHostPayoutParams
): Promise<CompleteHostPayoutResult> {
  const {
    bookingId,
    paymentId,
    paymentIntentId,
    hostUserId,
    stripeAccountId,
    totalAmount,
    platformFee,
    currency,
    listingTitle,
    transferMetadata,
  } = params;

  await requireHostStripeReady(hostUserId, stripeAccountId);

  const payout = await resolveHostPayoutFromPaymentIntent({
    paymentIntentId,
    totalAmount,
    platformFee,
  });

  const transfer = await stripe.transfers.create(
    {
      amount: payout.hostAmount,
      currency: normalizeCurrency(currency || DEFAULT_CURRENCY),
      destination: stripeAccountId,
      metadata: {
        booking_id: bookingId,
        type: "booking_payment",
        listing_title: listingTitle || "Unknown",
        platform_fee_cents: String(payout.platformFee),
        stripe_fee_cents: String(payout.stripeFee),
        ...transferMetadata,
      },
    },
    { idempotencyKey: bookingPayoutIdempotencyKey(bookingId) }
  );

  const admin = createAdminClient();
  const { error: updateError } = await admin
    .from("payments")
    .update({
      status: "captured",
      stripe_transfer_id: transfer.id,
      auto_capture_scheduled_at: null,
    })
    .eq("id", paymentId);

  if (updateError) {
    console.error(
      "[completeHostPayout] Transfer succeeded but DB update failed:",
      updateError
    );
    // Transfer is durable via idempotency key; surface so callers can alert
    throw new Error(
      `Transfer ${transfer.id} created but failed to persist: ${updateError.message}`
    );
  }

  await admin
    .from("bookings")
    .update({
      payment_status: "CAPTURED",
      payment_captured_at: new Date().toISOString(),
    })
    .eq("id", bookingId);

  return { transferId: transfer.id, payout };
}

/**
 * True when Stripe charge is done but host Transfer is still missing.
 */
export function needsHostTransfer(payment: {
  status: string;
  stripe_transfer_id?: string | null;
}): boolean {
  if (payment.stripe_transfer_id) return false;
  return payment.status === "authorised" || payment.status === "captured";
}
