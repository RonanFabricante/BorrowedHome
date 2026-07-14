import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getOrCreateConnectedAccount, createOnboardingLink } from "@/lib/stripe/connect";
import {
  assertNotSuspended,
  suspendedResponse,
} from "@/lib/auth/assertNotSuspended";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await assertNotSuspended(user.id);

    if (!user.email) {
      return NextResponse.json(
        { error: "User email is required for Stripe onboarding" },
        { status: 400 }
      );
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    const returnUrl = `${appUrl}/host/payouts?return=1`;
    const refreshUrl = `${appUrl}/host/payouts?refresh=1`;
    const admin = createAdminClient();

    // Find or create host record (Stripe fields locked from client role)
    let { data: host, error: hostError } = await admin
      .from("hosts")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle();

    if (hostError) {
      throw hostError;
    }

    if (!host) {
      const { data: newHost, error: createError } = await admin
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
    }

    if (host.stripe_account_id) {
      const onboardingUrl = await createOnboardingLink({
        accountId: host.stripe_account_id,
        returnUrl,
        refreshUrl,
      });

      await admin
        .from("hosts")
        .update({ stripe_onboarding_status: "in_progress" })
        .eq("user_id", user.id);

      return NextResponse.json({ url: onboardingUrl });
    }

    const stripeAccountId = await getOrCreateConnectedAccount({
      userId: user.id,
      email: user.email,
    });

    const onboardingUrl = await createOnboardingLink({
      accountId: stripeAccountId,
      returnUrl,
      refreshUrl,
    });

    const { error: updateError } = await admin
      .from("hosts")
      .update({
        stripe_account_id: stripeAccountId,
        stripe_onboarding_status: "in_progress",
      })
      .eq("user_id", user.id);

    if (updateError) {
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
    const suspended = suspendedResponse(error);
    if (suspended) return suspended;
    console.error("Stripe Connect onboarding error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to start Stripe onboarding" },
      { status: 500 }
    );
  }
}
