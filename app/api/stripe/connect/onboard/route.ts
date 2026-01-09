import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getOrCreateConnectedAccount, createOnboardingLink } from "@/lib/stripe/connect";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!user.email) {
      return NextResponse.json(
        { error: "User email is required for Stripe onboarding" },
        { status: 400 }
      );
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    const returnUrl = `${appUrl}/host/payouts?return=1`;
    const refreshUrl = `${appUrl}/host/payouts?refresh=1`;

    // Find or create host record
    let { data: host, error: hostError } = await supabase
      .from("hosts")
      .select("*")
      .eq("user_id", user.id)
      .single();

    if (hostError && hostError.code === "PGRST116") {
      // Host record doesn't exist, create it
      const { data: newHost, error: createError } = await supabase
        .from("hosts")
        .insert({
          user_id: user.id,
          stripe_onboarding_status: "not_started",
        })
        .select()
        .single();

      if (createError) {
        throw createError;
      }

      host = newHost;
    } else if (hostError) {
      throw hostError;
    }

    // If host already has a Stripe account, create a new onboarding link
    if (host.stripe_account_id) {
      const onboardingUrl = await createOnboardingLink({
        accountId: host.stripe_account_id,
        returnUrl,
        refreshUrl,
      });

      // Update status to in_progress
      await supabase
        .from("hosts")
        .update({ stripe_onboarding_status: "in_progress" })
        .eq("user_id", user.id);

      return NextResponse.json({ url: onboardingUrl });
    }

    // Create new Stripe Connect Express account
    const stripeAccountId = await getOrCreateConnectedAccount({
      userId: user.id,
      email: user.email,
    });

    // Create onboarding link
    const onboardingUrl = await createOnboardingLink({
      accountId: stripeAccountId,
      returnUrl,
      refreshUrl,
    });

    // Update host record with Stripe account ID and set status to in_progress
    const { error: updateError } = await supabase
      .from("hosts")
      .update({
        stripe_account_id: stripeAccountId,
        stripe_onboarding_status: "in_progress",
      })
      .eq("user_id", user.id);

    if (updateError) {
      // Clean up Stripe account if DB update fails
      try {
        const { stripe } = await import("@/lib/stripe/server");
        await stripe.accounts.del(stripeAccountId);
      } catch (cleanupError) {
        console.error("Failed to cleanup Stripe account:", cleanupError);
      }
      throw updateError;
    }

    return NextResponse.json({ url: onboardingUrl });
  } catch (error: any) {
    console.error("Stripe Connect onboarding error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to start Stripe onboarding" },
      { status: 500 }
    );
  }
}
