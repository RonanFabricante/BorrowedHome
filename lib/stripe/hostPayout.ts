/**
 * Host payout amounts: guest total − platform fee − actual Stripe processing fee.
 * Stripe fees are charged to the platform account; we deduct them from the host
 * transfer so the host effectively covers payment processing.
 */

import { stripe } from "@/lib/stripe/server";
import type Stripe from "stripe";

export type HostPayoutBreakdown = {
  totalAmount: number;
  platformFee: number;
  stripeFee: number;
  hostAmount: number;
};

/**
 * Idempotency key for booking rental transfers.
 * v2 = host payout nets out Stripe processing fee (invalidates pre-fee keys).
 */
export function bookingPayoutIdempotencyKey(bookingId: string): string {
  return `booking-payout-${bookingId}-v2`;
}

export function depositPayoutIdempotencyKey(bookingId: string): string {
  return `deposit-payout-${bookingId}-v2`;
}

/**
 * Read Stripe's processing fee (minor units) from a succeeded PaymentIntent's charge.
 */
export async function getStripeProcessingFeeCents(
  paymentIntentId: string
): Promise<number> {
  const pi = await stripe.paymentIntents.retrieve(paymentIntentId, {
    expand: ["latest_charge.balance_transaction"],
  });

  if (pi.status !== "succeeded") {
    throw new Error(
      `Cannot read Stripe fee: PaymentIntent status is ${pi.status}`
    );
  }

  const charge = pi.latest_charge;
  if (!charge || typeof charge === "string") {
    throw new Error("Cannot read Stripe fee: latest_charge missing on PaymentIntent");
  }

  const bt = (charge as Stripe.Charge).balance_transaction;
  if (!bt) {
    throw new Error(
      "Cannot read Stripe fee: balance_transaction not available yet — retry shortly"
    );
  }

  if (typeof bt === "string") {
    const full = await stripe.balanceTransactions.retrieve(bt);
    return full.fee;
  }

  return bt.fee;
}

/**
 * Host receives: guest total − platform fee − Stripe processing fee.
 */
export function calculateHostPayout(params: {
  totalAmount: number;
  platformFee: number;
  stripeFee: number;
}): HostPayoutBreakdown {
  const { totalAmount, platformFee, stripeFee } = params;
  const hostAmount = totalAmount - platformFee - stripeFee;

  if (hostAmount <= 0) {
    throw new Error(
      `Host payout would be ${hostAmount} (total ${totalAmount} − platform ${platformFee} − Stripe ${stripeFee}). Increase booking amount or adjust fees.`
    );
  }

  return {
    totalAmount,
    platformFee,
    stripeFee,
    hostAmount,
  };
}

/**
 * Convenience: load Stripe fee from PI and compute host transfer amount.
 */
export async function resolveHostPayoutFromPaymentIntent(params: {
  paymentIntentId: string;
  totalAmount: number;
  platformFee: number;
}): Promise<HostPayoutBreakdown> {
  const stripeFee = await getStripeProcessingFeeCents(params.paymentIntentId);
  return calculateHostPayout({
    totalAmount: params.totalAmount,
    platformFee: params.platformFee,
    stripeFee,
  });
}
