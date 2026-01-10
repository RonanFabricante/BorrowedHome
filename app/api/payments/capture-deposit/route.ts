import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { stripe } from "@/lib/stripe/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Capture deposit (for damage claims)
 * Can capture full or partial deposit amount
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { bookingId, amount, reason } = await request.json();

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

    // Verify user is the host (or admin in future)
    if (payment.bookings.listings.host_id !== user.id) {
      return NextResponse.json(
        { error: "Only the host can capture deposits" },
        { status: 403 }
      );
    }

    if (!payment.stripe_deposit_intent_id) {
      return NextResponse.json(
        { error: "No deposit to capture" },
        { status: 400 }
      );
    }

    // Verify deposit hasn't been released already
    if (payment.deposit_released_at) {
      return NextResponse.json(
        { error: "Deposit has already been released" },
        { status: 400 }
      );
    }

    // Capture the deposit (full or partial)
    const captureAmount = amount ? Math.round(amount) : undefined;
    
    console.log(`[CaptureDeposit] Capturing deposit ${payment.stripe_deposit_intent_id} for booking ${bookingId}${captureAmount ? ` (amount: ${captureAmount} cents)` : " (full amount)"}`);
    
    await stripe.paymentIntents.capture(
      payment.stripe_deposit_intent_id,
      captureAmount ? { amount_to_capture: captureAmount } : {}
    );

    // Update payment record with deposit capture info
    const { error: updateError } = await supabase
      .from("payments")
      .update({
        capture_hold_reason: reason || "Deposit captured for damages",
      })
      .eq("id", payment.id);

    if (updateError) {
      console.error("[CaptureDeposit] Failed to update payment:", updateError);
      // Don't fail - deposit was captured successfully
    }

    console.log(`[CaptureDeposit] Deposit captured successfully for booking ${bookingId}`);
    
    return NextResponse.json({ 
      success: true,
      message: captureAmount 
        ? `Deposit partially captured: ${captureAmount} cents` 
        : "Deposit fully captured",
      capturedAmount: captureAmount || payment.deposit_amount
    });
  } catch (error: any) {
    console.error("Deposit capture error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to capture deposit" },
      { status: 500 }
    );
  }
}
