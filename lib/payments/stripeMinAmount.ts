/** Stripe's minimum charge for AUD (cents). */
export const STRIPE_MIN_AMOUNT_CENTS = 50;

/** Same minimum in dollars for host pricing forms. */
export const STRIPE_MIN_AMOUNT_DOLLARS = 0.5;

export const STRIPE_MIN_AMOUNT_MESSAGE =
  "Amount must be at least $0.50 AUD";

/** True when amountCents is chargeable via Stripe (AUD). */
export function meetsStripeMinAmount(amountCents: number): boolean {
  return Number.isFinite(amountCents) && amountCents >= STRIPE_MIN_AMOUNT_CENTS;
}

/**
 * Validate a Stripe charge amount in cents.
 * Returns an error message or null if valid.
 * Pass `allowZero` for optional deposits (0 = no deposit).
 */
export function validateStripeAmountCents(
  amountCents: number,
  options: { allowZero?: boolean } = {}
): string | null {
  if (!Number.isFinite(amountCents) || amountCents < 0) {
    return STRIPE_MIN_AMOUNT_MESSAGE;
  }
  if (options.allowZero && amountCents === 0) {
    return null;
  }
  if (amountCents < STRIPE_MIN_AMOUNT_CENTS) {
    return STRIPE_MIN_AMOUNT_MESSAGE;
  }
  return null;
}

/** Validate a dollar amount from host pricing forms. */
export function validateStripeAmountDollars(
  amountDollars: number,
  options: { allowZero?: boolean } = {}
): string | null {
  if (!Number.isFinite(amountDollars) || amountDollars < 0) {
    return STRIPE_MIN_AMOUNT_MESSAGE;
  }
  if (options.allowZero && amountDollars === 0) {
    return null;
  }
  if (amountDollars < STRIPE_MIN_AMOUNT_DOLLARS) {
    return STRIPE_MIN_AMOUNT_MESSAGE;
  }
  return null;
}
