import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { stripe, PLATFORM_FEE_PERCENTAGE } from "@/lib/stripe/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

    // Fetch booking and listing
    const { data: booking, error: bookingError } = await supabase
      .from("bookings")
      .select(`
        *,
        listings!inner(
          id,
          host_id,
          deposit_amount
        )
      `)
      .eq("id", bookingId)
      .eq("status", "CONFIRMED")
      .single();

    if (bookingError || !booking) {
      return NextResponse.json(
        { error: "Booking not found or not confirmed" },
        { status: 404 }
      );
    }

    // Check if payment already exists
    const { data: existingPayment } = await supabase
      .from("payments")
      .select("*")
      .eq("booking_id", bookingId)
      .single();

    if (existingPayment) {
      return NextResponse.json({
        paymentIntentId: existingPayment.stripe_payment_intent_id,
        depositIntentId: existingPayment.stripe_deposit_intent_id,
        clientSecret: null, // Payment already initiated
      });
    }

    // Check if host has completed Stripe onboarding
    const { data: host } = await supabase
      .from("hosts")
      .select("*")
      .eq("user_id", booking.listings.host_id)
      .single();

    if (!host || host.stripe_onboarding_status !== "complete") {
      return NextResponse.json(
        { error: "Host must complete Stripe onboarding before accepting bookings" },
        { status: 400 }
      );
    }

    if (!host.stripe_account_id) {
      return NextResponse.json(
        { error: "Host Stripe account not found" },
        { status: 400 }
      );
    }

    // Calculate amounts
    const bookingAmount = booking.total_amount - booking.platform_fee_amount; // Base amount
    const platformFee = booking.platform_fee_amount;
    const totalAmount = bookingAmount + platformFee;
    const depositAmount = booking.deposit_amount || 0;

    // Create PaymentIntent for booking + platform fee
    const paymentIntent = await stripe.paymentIntents.create({
      amount: totalAmount,
      currency: "aud",
      capture_method: "manual",
      payment_method_types: ["card"],
      metadata: {
        booking_id: bookingId,
        listing_id: booking.listings.id,
        host_id: booking.listings.host_id,
        guest_id: booking.guest_id,
        type: "booking",
      },
    });

    let depositIntentId: string | null = null;

    // Create deposit PaymentIntent if deposit is required
    if (depositAmount > 0) {
      const depositIntent = await stripe.paymentIntents.create({
        amount: depositAmount,
        currency: "aud",
        capture_method: "manual",
        payment_method_types: ["card"],
        metadata: {
          booking_id: bookingId,
          listing_id: booking.listings.id,
          host_id: booking.listings.host_id,
          guest_id: booking.guest_id,
          type: "deposit",
        },
      });
      depositIntentId = depositIntent.id;
    }

    // Store payment record
    const { error: paymentError } = await supabase
      .from("payments")
      .insert({
        booking_id: bookingId,
        stripe_payment_intent_id: paymentIntent.id,
        stripe_deposit_intent_id: depositIntentId,
        amount: totalAmount,
        deposit_amount: depositAmount,
        status: "pending",
      });

    if (paymentError) {
      // Clean up Stripe intents if DB insert fails
      await stripe.paymentIntents.cancel(paymentIntent.id);
      if (depositIntentId) {
        await stripe.paymentIntents.cancel(depositIntentId);
      }
      throw paymentError;
    }

    return NextResponse.json({
      paymentIntentId: paymentIntent.id,
      depositIntentId,
      clientSecret: paymentIntent.client_secret,
      depositClientSecret: depositIntentId
        ? (await stripe.paymentIntents.retrieve(depositIntentId)).client_secret
        : null,
    });
  } catch (error: any) {
    console.error("Payment initiation error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to initiate payment" },
      { status: 500 }
    );
  }
}
