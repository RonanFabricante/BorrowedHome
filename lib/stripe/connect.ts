import Stripe from "stripe";
import { stripe } from "./server";

export interface AccountStatus {
  charges_enabled: boolean;
  payouts_enabled: boolean;
  currently_due: string[];
  eventually_due: string[];
  past_due: string[];
  pending_verification: string[];
  disabled_reason?: string | null;
  details_submitted: boolean;
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
  const eventually_due = account.requirements?.eventually_due || [];
  const past_due = account.requirements?.past_due || [];
  const pending_verification = account.requirements?.pending_verification || [];
  const disabled_reason = account.requirements?.disabled_reason || null;
  const details_submitted = account.details_submitted || false;

  return {
    charges_enabled: account.charges_enabled || false,
    payouts_enabled: account.payouts_enabled || false,
    currently_due: currently_due.map((req) => req.toString()),
    eventually_due: eventually_due.map((req) => req.toString()),
    past_due: past_due.map((req) => req.toString()),
    pending_verification: pending_verification.map((req) => req.toString()),
    disabled_reason: disabled_reason || undefined,
    details_submitted,
  };
}

/**
 * Find a Stripe Connect account for a user by searching with multiple strategies
 * Returns the account ID if found, null otherwise
 */
export async function findStripeAccountByUserId(userId: string): Promise<string | null> {
  try {
    // Strategy 1: Search by metadata.user_id (most reliable if metadata was set)
    let allAccounts: Stripe.Account[] = [];
    let hasMore = true;
    let startingAfter: string | undefined = undefined;

    // Paginate through accounts to find the one matching our userId
    // We'll check up to 500 accounts (5 pages of 100) - increase if needed
    const maxPages = 10; // Increased to check more accounts
    let pageCount = 0;

    console.log(`[findStripeAccountByUserId] Searching for account with user_id: ${userId}`);

    while (hasMore && pageCount < maxPages) {
      const response: Stripe.Response<Stripe.ApiList<Stripe.Account>> = await stripe.accounts.list({
        limit: 100,
        starting_after: startingAfter,
      });

      allAccounts = allAccounts.concat(response.data);
      hasMore = response.has_more;
      startingAfter = response.data.length > 0 ? response.data[response.data.length - 1].id : undefined;
      pageCount++;
      
      console.log(`[findStripeAccountByUserId] Searched ${allAccounts.length} accounts so far (page ${pageCount})`);
    }

    // Find account matching user_id in metadata
    const matchingAccount = allAccounts.find(
      (acc) => acc.metadata?.user_id === userId
    );

    if (matchingAccount) {
      console.log(`[findStripeAccountByUserId] Found account ${matchingAccount.id} with metadata.user_id = ${userId}`);
      return matchingAccount.id;
    }

    // Log accounts that don't have metadata set for debugging
    const accountsWithoutMetadata = allAccounts.filter(acc => !acc.metadata || !acc.metadata.user_id);
    if (accountsWithoutMetadata.length > 0) {
      console.log(`[findStripeAccountByUserId] Found ${accountsWithoutMetadata.length} accounts without metadata.user_id set. Cannot match by user_id.`);
      // Log first few account IDs for debugging (without exposing sensitive data)
      console.log(`[findStripeAccountByUserId] Sample account IDs without metadata: ${accountsWithoutMetadata.slice(0, 3).map(a => a.id).join(", ")}`);
    }

    console.log(`[findStripeAccountByUserId] No account found with metadata.user_id = ${userId} after searching ${allAccounts.length} accounts`);
    return null;
  } catch (error: any) {
    console.error(`[findStripeAccountByUserId] Error searching for account:`, error);
    return null;
  }
}

/**
 * Determine onboarding status from Stripe account
 */
export function computeOnboardingStatus(
  status: AccountStatus
): "not_started" | "in_progress" | "complete" | "restricted" {
  // Only mark as restricted if there's a serious disabled reason
  // Some disabled_reasons are temporary and should be treated as "in_progress"
  if (status.disabled_reason) {
    // Check if it's a serious restriction (not just pending verification)
    // Serious restrictions typically mean the account cannot be used at all
    const seriousRestrictionPatterns = [
      'requirements.past_due',
      'listed',
      'platform_paused',
      'rejected.fraud',
      'rejected.terms_of_service',
    ];
    
    // Pending verification is normal during onboarding - don't treat as restricted
    const isPendingVerification = status.disabled_reason.toLowerCase().includes('pending_verification');
    
    const isSerious = seriousRestrictionPatterns.some(pattern => 
      status.disabled_reason?.toLowerCase().includes(pattern.toLowerCase())
    );
    
    // If it's a serious restriction AND capabilities are disabled, mark as restricted
    if (isSerious && !status.charges_enabled && !status.payouts_enabled) {
      return "restricted";
    }
    
    // For pending verification or other temporary states, treat as in_progress
    // if there are requirements due or capabilities aren't enabled yet
    if (isPendingVerification || status.currently_due.length > 0 || !status.charges_enabled || !status.payouts_enabled) {
      return "in_progress";
    }
  }

  if (status.charges_enabled && status.payouts_enabled && status.currently_due.length === 0) {
    return "complete";
  }

  if (status.currently_due.length > 0 || !status.charges_enabled || !status.payouts_enabled) {
    return "in_progress";
  }

  return "not_started";
}
