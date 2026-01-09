import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { checkAccountStatus, computeOnboardingStatus } from "@/lib/stripe/connect";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: NextRequest) {
  try {
    // Ensure we're using LIVE keys in production
    const stripeKey = process.env.STRIPE_SECRET_KEY;
    if (!stripeKey) {
      console.error("STRIPE_SECRET_KEY is not set");
      return NextResponse.json(
        { error: "Stripe configuration error" },
        { status: 500 }
      );
    }

    // In production, fail fast if using test keys
    if (process.env.NODE_ENV === "production" && stripeKey.startsWith("sk_test_")) {
      console.error("ERROR: Using test Stripe key in production!");
      return NextResponse.json(
        { error: "Stripe configuration error: test key in production" },
        { status: 500 }
      );
    }

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: host } = await supabase
      .from("hosts")
      .select("*")
      .eq("user_id", user.id)
      .single();

    if (!host || !host.stripe_account_id) {
      return NextResponse.json({
        hasAccount: false,
        stripe_onboarding_status: host?.stripe_onboarding_status || "not_started",
      });
    }

    // Log for debugging
    console.log(`[Stripe Connect] Checking status for user ${user.id}, account ${host.stripe_account_id}`);

    // Check Stripe account status - always fetch fresh from Stripe API
    const status = await checkAccountStatus({
      accountId: host.stripe_account_id,
    });

    // Log key status flags
    console.log(`[Stripe Connect] Account ${host.stripe_account_id} status:`, {
      charges_enabled: status.charges_enabled,
      payouts_enabled: status.payouts_enabled,
      details_submitted: status.details_submitted,
      currently_due_count: status.currently_due.length,
      past_due_count: status.past_due.length,
      pending_verification_count: status.pending_verification.length,
      disabled_reason: status.disabled_reason,
    });

    const onboardingStatus = computeOnboardingStatus(status);

    // Update database with latest status
    const { error: updateError } = await supabase
      .from("hosts")
      .update({
        stripe_charges_enabled: status.charges_enabled,
        stripe_payouts_enabled: status.payouts_enabled,
        stripe_requirements_due: status.currently_due.length > 0 ? status.currently_due : null,
        stripe_onboarding_status: onboardingStatus,
      })
      .eq("user_id", user.id);

    if (updateError) {
      console.error("Failed to update host status:", updateError);
    }

    // Return comprehensive status information
    return NextResponse.json({
      hasAccount: true,
      connectedAccountId: host.stripe_account_id,
      chargesEnabled: status.charges_enabled,
      payoutsEnabled: status.payouts_enabled,
      detailsSubmitted: status.details_submitted,
      requirements: {
        currently_due: status.currently_due,
        eventually_due: status.eventually_due,
        past_due: status.past_due,
        pending_verification: status.pending_verification,
      },
      // Legacy fields for backward compatibility
      stripe_account_id: host.stripe_account_id,
      stripe_charges_enabled: status.charges_enabled,
      stripe_payouts_enabled: status.payouts_enabled,
      stripe_requirements_due: status.currently_due,
      stripe_onboarding_status: onboardingStatus,
      stripe_disabled_reason: status.disabled_reason || undefined,
      ready: status.charges_enabled && status.payouts_enabled && status.currently_due.length === 0,
    });
  } catch (error: any) {
    console.error("Stripe Connect status check error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to check status" },
      { status: 500 }
    );
  }
}
