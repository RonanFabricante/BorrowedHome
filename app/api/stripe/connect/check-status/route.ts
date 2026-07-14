import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkAccountStatus, computeOnboardingStatus } from "@/lib/stripe/connect";
import { stripe } from "@/lib/stripe/server";
import Stripe from "stripe";
import {
  assertNotSuspended,
  suspendedResponse,
} from "@/lib/auth/assertNotSuspended";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: NextRequest) {
  try {
    const stripeKey = process.env.STRIPE_SECRET_KEY;
    if (!stripeKey) {
      console.error("STRIPE_SECRET_KEY is not set");
      return NextResponse.json(
        { error: "Stripe configuration error" },
        { status: 500 }
      );
    }

    if (process.env.NODE_ENV === "production" && stripeKey.startsWith("sk_test_")) {
      console.error("ERROR: Using test Stripe key in production!");
      return NextResponse.json(
        { error: "Stripe configuration error: test key in production" },
        { status: 500 }
      );
    }

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await assertNotSuspended(user.id);

    const admin = createAdminClient();

    let { data: host, error: hostError } = await admin
      .from("hosts")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle();

    if (hostError) {
      throw hostError;
    }

    if (!host || !host.stripe_account_id) {
      console.log(
        `[Stripe Connect Check Status] Host record missing or stripe_account_id not found for user ${user.id}, searching Stripe...`
      );

      try {
        const accounts = await stripe.accounts.list({
          limit: 100,
        });

        const matchingAccount = accounts.data.find(
          (acc: Stripe.Account) => acc.metadata?.user_id === user.id
        );

        if (matchingAccount) {
          console.log(
            `[Stripe Connect Check Status] Found Stripe account ${matchingAccount.id} for user ${user.id}`
          );

          if (!host) {
            const { data: newHost, error: createError } = await admin
              .from("hosts")
              .insert({
                user_id: user.id,
                stripe_account_id: matchingAccount.id,
                stripe_onboarding_status: "in_progress",
              })
              .select()
              .single();

            if (createError) {
              console.error(
                "[Stripe Connect Check Status] Failed to create host record:",
                createError
              );
            } else {
              host = newHost;
            }
          } else {
            const { data: updatedHost, error: updateError } = await admin
              .from("hosts")
              .update({
                stripe_account_id: matchingAccount.id,
              })
              .eq("user_id", user.id)
              .select()
              .single();

            if (updateError) {
              console.error(
                "[Stripe Connect Check Status] Failed to update host record:",
                updateError
              );
            } else if (updatedHost) {
              host = updatedHost;
            }
          }
        } else {
          console.log(
            `[Stripe Connect Check Status] No Stripe account found with metadata.user_id = ${user.id}`
          );
          return NextResponse.json({
            hasAccount: false,
            stripe_onboarding_status: host?.stripe_onboarding_status || "not_started",
          });
        }
      } catch (stripeError: any) {
        console.error(
          "[Stripe Connect Check Status] Error searching Stripe accounts:",
          stripeError
        );
        return NextResponse.json({
          hasAccount: false,
          stripe_onboarding_status: host?.stripe_onboarding_status || "not_started",
          error: "Unable to verify Stripe account",
        });
      }
    }

    if (!host || !host.stripe_account_id) {
      return NextResponse.json({
        hasAccount: false,
        stripe_onboarding_status: "not_started",
      });
    }

    console.log(
      `[Stripe Connect] Checking status for user ${user.id}, account ${host.stripe_account_id}`
    );

    const status = await checkAccountStatus({
      accountId: host.stripe_account_id,
    });

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

    const { error: updateError } = await admin
      .from("hosts")
      .update({
        stripe_charges_enabled: status.charges_enabled,
        stripe_payouts_enabled: status.payouts_enabled,
        stripe_requirements_due:
          status.currently_due.length > 0 ? status.currently_due : null,
        stripe_onboarding_status: onboardingStatus,
      })
      .eq("user_id", user.id);

    if (updateError) {
      console.error("Failed to update host status:", updateError);
    }

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
      stripe_account_id: host.stripe_account_id,
      stripe_charges_enabled: status.charges_enabled,
      stripe_payouts_enabled: status.payouts_enabled,
      stripe_requirements_due: status.currently_due,
      stripe_onboarding_status: onboardingStatus,
      stripe_disabled_reason: status.disabled_reason || undefined,
      ready:
        status.charges_enabled &&
        status.payouts_enabled &&
        status.currently_due.length === 0,
    });
  } catch (error: any) {
    const suspended = suspendedResponse(error);
    if (suspended) return suspended;
    console.error("Stripe Connect status check error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to check status" },
      { status: 500 }
    );
  }
}
