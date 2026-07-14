import { createAdminClient } from "@/lib/supabase/admin";
import {
  checkAccountStatus,
  computeOnboardingStatus,
  type AccountStatus,
} from "@/lib/stripe/connect";

export function isHostStripeReady(status: AccountStatus): boolean {
  return (
    status.charges_enabled &&
    status.payouts_enabled &&
    status.currently_due.length === 0
  );
}

/**
 * Fetch live Stripe Connect status and persist via service role
 * (hosts Stripe columns are locked from authenticated client writes).
 */
export async function refreshHostStripeStatus(
  userId: string,
  accountId: string
): Promise<AccountStatus> {
  const status = await checkAccountStatus({ accountId });
  const admin = createAdminClient();
  const { error } = await admin
    .from("hosts")
    .update({
      stripe_charges_enabled: status.charges_enabled,
      stripe_payouts_enabled: status.payouts_enabled,
      stripe_requirements_due:
        status.currently_due.length > 0 ? status.currently_due : null,
      stripe_onboarding_status: computeOnboardingStatus(status),
    })
    .eq("user_id", userId);

  if (error) {
    console.error("[refreshHostStripeStatus] DB update failed:", error);
  }

  return status;
}

export async function requireHostStripeReady(
  userId: string,
  accountId: string | null | undefined
): Promise<AccountStatus> {
  if (!accountId) {
    const err = new Error("STRIPE_ONBOARDING_REQUIRED") as Error & {
      code?: string;
    };
    err.code = "STRIPE_ONBOARDING_REQUIRED";
    err.message =
      "You must complete Stripe onboarding before accepting bookings or receiving payouts";
    throw err;
  }

  const status = await refreshHostStripeStatus(userId, accountId);
  if (!isHostStripeReady(status)) {
    const err = new Error("STRIPE_ONBOARDING_REQUIRED") as Error & {
      code?: string;
      details?: string;
    };
    err.code = "STRIPE_ONBOARDING_REQUIRED";
    err.message =
      "Host Stripe account is not fully enabled. Complete onboarding at /host/payouts.";
    err.details =
      status.currently_due.length > 0
        ? `Requirements due: ${status.currently_due.join(", ")}`
        : `charges=${status.charges_enabled}, payouts=${status.payouts_enabled}`;
    throw err;
  }

  return status;
}
