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

    // Check PaymentIntent status - should be "requires_capture" or "succeeded" for manual capture
    const isAuthorized = 
      paymentIntent.status === "requires_capture" ||
      paymentIntent.status === "succeeded";

    if (!isAuthorized) {
      return NextResponse.json(
        { error: `PaymentIntent is not authorized. Status: ${paymentIntent.status}` },
        { status: 400 }
      );
    }

    // Update payment status to authorised
    const { error: updateError } = await supabase
      .from("payments")
      .update({ status: "authorised" })
      .eq("booking_id", bookingId)
      .eq("stripe_payment_intent_id", paymentIntentId);

    if (updateError) {
      console.error("Failed to update payment status:", updateError);
      return NextResponse.json(
        { error: "Failed to update payment status" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Payment authorization error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to authorize payment" },
      { status: 500 }
    );
  }
}
