import Stripe from "stripe";
import { stripe } from "./server";

export interface AccountStatus {
  charges_enabled: boolean;
  payouts_enabled: boolean;
  currently_due: string[];
  disabled_reason?: string | null;
}

/**
 * Get or create a Stripe Connect Express account for a host
 */
export async function getOrCreateConnectedAccount({
  userId,
  email,
}: {
  userId: string;
  email: string;
}): Promise<string> {
  // Check if account already exists (this should be checked in the calling code via DB)
  // This function assumes we're creating a new account
  const account = await stripe.accounts.create({
    type: "express",
    country: "AU",
    email,
    capabilities: {
      card_payments: { requested: true },
      transfers: { requested: true },
    },
    metadata: {
      user_id: userId,
    },
  });

  return account.id;
}

/**
 * Create an Account Link for onboarding
 */
export async function createOnboardingLink({
  accountId,
  returnUrl,
  refreshUrl,
}: {
  accountId: string;
  returnUrl: string;
  refreshUrl: string;
}): Promise<string> {
  const accountLink = await stripe.accountLinks.create({
    account: accountId,
    refresh_url: refreshUrl,
    return_url: returnUrl,
    type: "account_onboarding",
  });

  return accountLink.url;
}

/**
 * Check Stripe account status and return structured data
 */
export async function checkAccountStatus({
  accountId,
}: {
  accountId: string;
}): Promise<AccountStatus> {
  const account = await stripe.accounts.retrieve(accountId);

  const currently_due = account.requirements?.currently_due || [];
  const disabled_reason = account.requirements?.disabled_reason || null;

  return {
    charges_enabled: account.charges_enabled || false,
    payouts_enabled: account.payouts_enabled || false,
    currently_due: currently_due.map((req) => req.toString()),
    disabled_reason: disabled_reason || undefined,
  };
}

/**
 * Determine onboarding status from Stripe account
 */
export function computeOnboardingStatus(
  status: AccountStatus
): "not_started" | "in_progress" | "complete" | "restricted" {
  if (status.disabled_reason) {
    return "restricted";
  }

  if (status.charges_enabled && status.payouts_enabled && status.currently_due.length === 0) {
    return "complete";
  }

  if (status.currently_due.length > 0 || !status.charges_enabled || !status.payouts_enabled) {
    return "in_progress";
  }

  return "not_started";
}
