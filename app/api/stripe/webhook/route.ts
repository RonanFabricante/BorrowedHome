import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { stripe } from "@/lib/stripe/server";
import { createClient } from "@/lib/supabase/server";
import { checkAccountStatus, computeOnboardingStatus } from "@/lib/stripe/connect";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

export async function POST(request: NextRequest) {
  if (!webhookSecret) {
    return NextResponse.json(
      { error: "Webhook secret not configured" },
      { status: 500 }
    );
  }

  const body = await request.text();
  const signature = request.headers.get("stripe-signature");

  if (!signature) {
    return NextResponse.json(
      { error: "No signature" },
      { status: 400 }
    );
  }

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
  } catch (err: any) {
    console.error("Webhook signature verification failed:", err.message);
    return NextResponse.json(
      { error: `Webhook Error: ${err.message}` },
      { status: 400 }
    );
  }

  const supabase = await createClient();

  try {
    switch (event.type) {
      case "payment_intent.succeeded": {
        const paymentIntent = event.data.object as Stripe.PaymentIntent;
        const bookingId = paymentIntent.metadata.booking_id;
        const paymentType = paymentIntent.metadata.type;

        if (!bookingId) {
          console.error("No booking_id in payment intent metadata");
          break;
        }

        // Update payment status to authorised
        const { error } = await supabase
          .from("payments")
          .update({ status: "authorised" })
          .or(
            `stripe_payment_intent_id.eq.${paymentIntent.id},stripe_deposit_intent_id.eq.${paymentIntent.id}`
          );

        if (error) {
          console.error("Failed to update payment status:", error);
        }

        // If this is the booking payment (not deposit), update booking status
        if (paymentType === "booking") {
          await supabase
            .from("bookings")
            .update({ status: "CONFIRMED" })
            .eq("id", bookingId);
        }

        break;
      }

      case "payment_intent.canceled": {
        const paymentIntent = event.data.object as Stripe.PaymentIntent;
        const bookingId = paymentIntent.metadata.booking_id;

        if (!bookingId) {
          break;
        }

        // Update payment status
        await supabase
          .from("payments")
          .update({ status: "released" })
          .or(
            `stripe_payment_intent_id.eq.${paymentIntent.id},stripe_deposit_intent_id.eq.${paymentIntent.id}`
          );

        break;
      }

      case "account.updated": {
        const account = event.data.object as Stripe.Account;
        
        // Find host by stripe_account_id
        const { data: host } = await supabase
          .from("hosts")
          .select("id")
          .eq("stripe_account_id", account.id)
          .single();

        if (host) {
          const status = await checkAccountStatus({ accountId: account.id });
          const onboardingStatus = computeOnboardingStatus(status);

          await supabase
            .from("hosts")
            .update({
              stripe_charges_enabled: status.charges_enabled,
              stripe_payouts_enabled: status.payouts_enabled,
              stripe_requirements_due: status.currently_due.length > 0 ? status.currently_due : null,
              stripe_onboarding_status: onboardingStatus,
            })
            .eq("stripe_account_id", account.id);
        }

        break;
      }

      case "capability.updated": {
        const capability = event.data.object as Stripe.Capability;
        const accountId = capability.account as string;

        // Find host by stripe_account_id
        const { data: host } = await supabase
          .from("hosts")
          .select("id")
          .eq("stripe_account_id", accountId)
          .single();

        if (host) {
          // Re-check full account status when capability changes
          const status = await checkAccountStatus({ accountId });
          const onboardingStatus = computeOnboardingStatus(status);

          await supabase
            .from("hosts")
            .update({
              stripe_charges_enabled: status.charges_enabled,
              stripe_payouts_enabled: status.payouts_enabled,
              stripe_requirements_due: status.currently_due.length > 0 ? status.currently_due : null,
              stripe_onboarding_status: onboardingStatus,
            })
            .eq("stripe_account_id", accountId);
        }

        break;
      }

      case "account.application.deauthorized": {
        const deauth = event.data.object as Stripe.Application;
        // Log for admin review - account was disconnected
        console.error("Stripe account deauthorized:", deauth.id);
        // TODO: Notify admin, potentially mark host as restricted
        break;
      }

      case "charge.dispute.created": {
        // Handle disputes - log for admin review
        const dispute = event.data.object as Stripe.Dispute;
        console.error("Dispute created:", dispute.id);
        // TODO: Notify admin, update payment status
        break;
      }

      default:
        console.log(`Unhandled event type: ${event.type}`);
    }

    return NextResponse.json({ received: true });
  } catch (error: any) {
    console.error("Webhook handler error:", error);
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}
