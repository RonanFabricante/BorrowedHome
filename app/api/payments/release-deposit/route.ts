import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { stripe } from "@/lib/stripe/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Release deposit (after booking completion with no damage)
 * Cancels the deposit PaymentIntent and updates payment record
 */
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

    // Fetch payment with deposit info
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
        { error: "Only the host can release deposits" },
        { status: 403 }
      );
    }

    if (!payment.stripe_deposit_intent_id) {
      return NextResponse.json(
        { error: "No deposit to release" },
        { status: 400 }
      );
    }

    // Check if deposit has already been released
    if (payment.deposit_released_at) {
      return NextResponse.json(
        { error: "Deposit has already been released" },
        { status: 400 }
      );
    }

    // Cancel (release) the deposit intent
    console.log(`[ReleaseDeposit] Canceling deposit PaymentIntent ${payment.stripe_deposit_intent_id} for booking ${bookingId}`);
    await stripe.paymentIntents.cancel(payment.stripe_deposit_intent_id);

    // Update payment record with deposit release timestamp
    const { error: updateError } = await supabase
      .from("payments")
      .update({ 
        deposit_released_at: new Date().toISOString()
      })
      .eq("id", payment.id);

    if (updateError) {
      console.error("[ReleaseDeposit] Failed to update payment:", updateError);
      throw updateError;
    }

    console.log(`[ReleaseDeposit] Deposit released successfully for booking ${bookingId}`);
    return NextResponse.json({ 
      success: true,
      message: "Deposit released successfully",
      releasedAt: new Date().toISOString()
    });
  } catch (error: any) {
    console.error("Deposit release error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to release deposit" },
      { status: 500 }
    );
  }
}
