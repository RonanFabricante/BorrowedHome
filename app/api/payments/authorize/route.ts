import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { stripe } from "@/lib/stripe/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { bookingId, paymentIntentId } = await request.json();

    if (!bookingId || !paymentIntentId) {
      return NextResponse.json(
        { error: "bookingId and paymentIntentId are required" },
        { status: 400 }
      );
    }

    // Verify the PaymentIntent belongs to this booking
    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
    
    if (paymentIntent.metadata.booking_id !== bookingId) {
      return NextResponse.json(
        { error: "PaymentIntent does not match booking" },
        { status: 400 }
      );
    }

    // Verify user is the guest for this booking
    const { data: booking, error: bookingError } = await supabase
      .from("bookings")
      .select("guest_id")
      .eq("id", bookingId)
      .single();

    if (bookingError || !booking) {
      return NextResponse.json(
        { error: "Booking not found" },
        { status: 404 }
      );
    }

    if (booking.guest_id !== user.id) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 403 }
      );
    }

    // With manual capture, "requires_capture" means authorized (funds held);
    // "succeeded" means the intent was already captured.
    const isAuthorized =
      paymentIntent.status === "requires_capture" ||
      paymentIntent.status === "succeeded";

    if (!isAuthorized) {
      return NextResponse.json(
        { error: `PaymentIntent is not authorized. Status: ${paymentIntent.status}` },
        { status: 400 }
      );
    }

    // Mark pending payments as authorised. An intent that is already
    // "succeeded" was captured; that state is owned by the capture flow and
    // webhooks, so don't overwrite it here.
    let payment: { stripe_deposit_intent_id: string | null } | null = null;
    if (paymentIntent.status === "requires_capture") {
      const { data, error: updateError } = await supabase
        .from("payments")
        .update({ status: "authorised" })
        .eq("booking_id", bookingId)
        .eq("stripe_payment_intent_id", paymentIntentId)
        .eq("status", "pending")
        .select("stripe_deposit_intent_id")
        .maybeSingle();

      if (updateError) {
        console.error("Failed to update payment status:", updateError);
        return NextResponse.json(
          { error: "Failed to update payment status" },
          { status: 500 }
        );
      }
      payment = data;
    }

    if (!payment) {
      const { data } = await supabase
        .from("payments")
        .select("stripe_deposit_intent_id")
        .eq("booking_id", bookingId)
        .eq("stripe_payment_intent_id", paymentIntentId)
        .maybeSingle();
      payment = data;
    }

    // Place the deposit hold using the card just used for the booking
    // payment. The deposit is a separate manual-capture intent, so it must be
    // confirmed server-side with the saved payment method.
    if (payment?.stripe_deposit_intent_id) {
      try {
        const depositIntent = await stripe.paymentIntents.retrieve(
          payment.stripe_deposit_intent_id
        );

        if (
          (depositIntent.status === "requires_payment_method" ||
            depositIntent.status === "requires_confirmation") &&
          paymentIntent.payment_method
        ) {
          await stripe.paymentIntents.confirm(payment.stripe_deposit_intent_id, {
            payment_method:
              typeof paymentIntent.payment_method === "string"
                ? paymentIntent.payment_method
                : paymentIntent.payment_method.id,
            off_session: true,
          });
        }
      } catch (depositError: any) {
        // The booking payment succeeded; surface the deposit failure without
        // undoing the authorization. The host sees the deposit as not held.
        console.error("Failed to authorize deposit hold:", depositError);
        return NextResponse.json({
          success: true,
          depositAuthorized: false,
          depositError: depositError.message || "Failed to hold security deposit",
        });
      }
    }

    return NextResponse.json({ success: true, depositAuthorized: true });
  } catch (error: any) {
    console.error("Payment authorization error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to authorize payment" },
      { status: 500 }
    );
  }
}
