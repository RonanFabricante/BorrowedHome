import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { checkAccountStatus, computeOnboardingStatus } from "@/lib/stripe/connect";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
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

    // Check Stripe account status
    const status = await checkAccountStatus({
      accountId: host.stripe_account_id,
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
    
    // Store disabled_reason in a separate field if needed (for now, we'll return it in the response)

    if (updateError) {
      console.error("Failed to update host status:", updateError);
    }

    return NextResponse.json({
      hasAccount: true,
      stripe_account_id: host.stripe_account_id,
      stripe_charges_enabled: status.charges_enabled,
      stripe_payouts_enabled: status.payouts_enabled,
      stripe_requirements_due: status.currently_due,
      stripe_onboarding_status: onboardingStatus,
      stripe_disabled_reason: status.disabled_reason || undefined,
      ready: onboardingStatus === "complete",
    });
  } catch (error: any) {
    console.error("Stripe Connect status check error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to check status" },
      { status: 500 }
    );
  }
}
