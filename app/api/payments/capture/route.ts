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

    const { bookingId } = await request.json();

    if (!bookingId) {
      return NextResponse.json({ error: "bookingId is required" }, { status: 400 });
    }

    // Fetch payment
    const { data: payment, error: paymentError } = await supabase
      .from("payments")
      .select(`
        *,
        bookings!inner(
          id,
          listing_id,
          guest_id,
          listings!inner(host_id)
        )
      `)
      .eq("booking_id", bookingId)
      .single();

    if (paymentError || !payment) {
      return NextResponse.json(
        { error: "Payment not found" },
        { status: 404 }
      );
    }

    // Verify user is the host
    if (payment.bookings.listings.host_id !== user.id) {
      return NextResponse.json(
        { error: "Only the host can capture payments" },
        { status: 403 }
      );
    }

    // Verify payment is authorised
    if (payment.status !== "authorised") {
      return NextResponse.json(
        { error: "Payment must be authorised before capture" },
        { status: 400 }
      );
    }

    // Capture the payment intent
    const paymentIntent = await stripe.paymentIntents.capture(
      payment.stripe_payment_intent_id
    );

    // Update payment status
    const { error: updateError } = await supabase
      .from("payments")
      .update({ status: "captured" })
      .eq("id", payment.id);

    if (updateError) {
      throw updateError;
    }

    // TODO: Schedule host payout via Stripe Connect (implement after webhook setup)

    return NextResponse.json({ success: true, paymentIntent });
  } catch (error: any) {
    console.error("Payment capture error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to capture payment" },
      { status: 500 }
    );
  }
}
