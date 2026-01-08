import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { stripe } from "@/lib/stripe/server";
import { createClient } from "@/lib/supabase/server";

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
