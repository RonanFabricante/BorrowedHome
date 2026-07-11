/**
 * Stripe minimum charge helpers (currency-aware).
 * Prefer importing from @/lib/currency for new code.
 */

import {
  DEFAULT_CURRENCY,
  stripeMinAmountMajor,
  stripeMinAmountMessage,
  stripeMinAmountMinor,
  validateStripeAmountMajor,
  validateStripeAmountMinor,
} from "@/lib/currency";

/** @deprecated Use stripeMinAmountMinor(currency) — AUD default for legacy callers. */
export const STRIPE_MIN_AMOUNT_CENTS = stripeMinAmountMinor(DEFAULT_CURRENCY);

/** @deprecated Use stripeMinAmountMajor(currency) */
export const STRIPE_MIN_AMOUNT_DOLLARS = stripeMinAmountMajor(DEFAULT_CURRENCY);

/** @deprecated Use stripeMinAmountMessage(currency) */
export const STRIPE_MIN_AMOUNT_MESSAGE = stripeMinAmountMessage(DEFAULT_CURRENCY);

export function meetsStripeMinAmount(
  amountCents: number,
  currency: string = DEFAULT_CURRENCY
): boolean {
  return (
    Number.isFinite(amountCents) &&
    amountCents >= stripeMinAmountMinor(currency)
  );
}

export function validateStripeAmountCents(
  amountCents: number,
  options: { allowZero?: boolean; currency?: string } = {}
): string | null {
  return validateStripeAmountMinor(
    amountCents,
    options.currency ?? DEFAULT_CURRENCY,
    { allowZero: options.allowZero }
  );
}

export function validateStripeAmountDollars(
  amountDollars: number,
  options: { allowZero?: boolean; currency?: string } = {}
): string | null {
  return validateStripeAmountMajor(
    amountDollars,
    options.currency ?? DEFAULT_CURRENCY,
    { allowZero: options.allowZero }
  );
}

export {
  stripeMinAmountMinor,
  stripeMinAmountMajor,
  stripeMinAmountMessage,
};
