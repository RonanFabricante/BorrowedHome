import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { stripe } from "@/lib/stripe/server";

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Check if account already exists
    const { data: existingAccount } = await supabase
      .from("host_stripe_accounts")
      .select("*")
      .eq("user_id", user.id)
      .single();

    if (existingAccount) {
      // Return existing account link if onboarding not completed
      if (!existingAccount.onboarding_completed) {
        const accountLink = await stripe.accountLinks.create({
          account: existingAccount.stripe_account_id,
          refresh_url: `${process.env.NEXT_PUBLIC_APP_URL}/host/stripe/onboarding`,
          return_url: `${process.env.NEXT_PUBLIC_APP_URL}/host/stripe/onboarding?success=true`,
          type: "account_onboarding",
        });

        return NextResponse.json({
          accountId: existingAccount.stripe_account_id,
          onboardingUrl: accountLink.url,
        });
      }

      return NextResponse.json({
        accountId: existingAccount.stripe_account_id,
        onboardingCompleted: true,
      });
    }

    // Create Stripe Express account
    const account = await stripe.accounts.create({
      type: "express",
      country: "AU",
      email: user.email,
      capabilities: {
        card_payments: { requested: true },
        transfers: { requested: true },
      },
      metadata: {
        user_id: user.id,
      },
    });

    // Create account link for onboarding
    const accountLink = await stripe.accountLinks.create({
      account: account.id,
      refresh_url: `${process.env.NEXT_PUBLIC_APP_URL}/host/stripe/onboarding`,
      return_url: `${process.env.NEXT_PUBLIC_APP_URL}/host/stripe/onboarding?success=true`,
      type: "account_onboarding",
    });

    // Store account in database
    const { error } = await supabase
      .from("host_stripe_accounts")
      .insert({
        user_id: user.id,
        stripe_account_id: account.id,
        onboarding_completed: false,
      });

    if (error) {
      // Clean up Stripe account if DB insert fails
      await stripe.accounts.del(account.id);
      throw error;
    }

    return NextResponse.json({
      accountId: account.id,
      onboardingUrl: accountLink.url,
    });
  } catch (error: any) {
    console.error("Stripe Connect account creation error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to create Stripe account" },
      { status: 500 }
    );
  }
}
