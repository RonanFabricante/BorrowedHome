import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { stripe } from "@/lib/stripe/server";

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: account } = await supabase
      .from("host_stripe_accounts")
      .select("*")
      .eq("user_id", user.id)
      .single();

    if (!account) {
      return NextResponse.json({ hasAccount: false });
    }

    // Check Stripe account status
    const stripeAccount = await stripe.accounts.retrieve(account.stripe_account_id);

    const onboardingCompleted =
      stripeAccount.details_submitted &&
      stripeAccount.charges_enabled &&
      stripeAccount.payouts_enabled;

    // Update database if status changed
    if (onboardingCompleted !== account.onboarding_completed) {
      await supabase
        .from("host_stripe_accounts")
        .update({ onboarding_completed: onboardingCompleted })
        .eq("user_id", user.id);
    }

    return NextResponse.json({
      hasAccount: true,
      onboardingCompleted,
      accountId: account.stripe_account_id,
    });
  } catch (error: any) {
    console.error("Stripe Connect status check error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to check status" },
      { status: 500 }
    );
  }
}
