import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { stripe } from "@/lib/stripe/server";
import {
  assertNotSuspended,
  suspendedResponse,
} from "@/lib/auth/assertNotSuspended";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Confirm a booking after the guest's PaymentIntent is authorised.
 * Uses service role so client booking-status triggers do not block it.
 * Idempotent: safe if the Stripe webhook already confirmed the booking.
 */
async function confirmBookingAfterAuthorization(
  bookingId: string,
  guestId: string,
  paymentIntentId: string
) {
  const admin = createAdminClient();
  const now = new Date();

  const { data: booking } = await admin
    .from("bookings")
    .select(
      "id, status, payment_deadline_at, cancelled_at, payment_authorized_at, guest_id, listing_id, start_at, end_at, total_amount"
    )
    .eq("id", bookingId)
    .single();

  if (!booking || booking.guest_id !== guestId) {
    return { confirmed: false, reason: "not_found" as const };
  }

  if (booking.cancelled_at || booking.status === "CANCELLED") {
    return { confirmed: false, reason: "cancelled" as const };
  }

  if (booking.status === "CONFIRMED" || booking.status === "COMPLETED") {
    return { confirmed: true, reason: "already_confirmed" as const };
  }

  if (booking.status !== "PAYMENT_PENDING") {
    return { confirmed: false, reason: "wrong_status" as const };
  }

  // Honour payments that were authorised before the deadline even if this
  // confirmation runs slightly after (webhook lag).
  const deadline = booking.payment_deadline_at
    ? new Date(booking.payment_deadline_at)
    : null;
  const authorizedAt = booking.payment_authorized_at
    ? new Date(booking.payment_authorized_at)
    : now;

  if (deadline && authorizedAt > deadline && now > deadline) {
    return { confirmed: false, reason: "past_deadline" as const };
  }

  const { error } = await admin
    .from("bookings")
    .update({
      status: "CONFIRMED",
      paid_at: now.toISOString(),
      payment_status: "AUTHORIZED",
      payment_authorized_at:
        booking.payment_authorized_at || now.toISOString(),
    })
    .eq("id", bookingId)
    .eq("status", "PAYMENT_PENDING");

  if (error) {
    console.error("[Authorize] Failed to confirm booking:", error);
    return { confirmed: false, reason: "update_failed" as const };
  }

  try {
    await admin.rpc("log_booking_event", {
      p_booking_id: bookingId,
      p_event_type: "PAID",
      p_actor_id: guestId,
      p_payload: { payment_intent_id: paymentIntentId, source: "authorize_api" },
    });
  } catch (e) {
    console.error("[Authorize] Failed to log PAID event:", e);
  }

  return { confirmed: true, reason: "confirmed" as const };
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await assertNotSuspended(user.id);

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
    const admin = createAdminClient();
    let payment: { stripe_deposit_intent_id: string | null } | null = null;
    if (paymentIntent.status === "requires_capture") {
      const { data, error: updateError } = await admin
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
      const { data } = await admin
        .from("payments")
        .select("stripe_deposit_intent_id")
        .eq("booking_id", bookingId)
        .eq("stripe_payment_intent_id", paymentIntentId)
        .maybeSingle();
      payment = data;
    }

    // Stamp authorization time before confirming so deadline checks use
    // payment time, not webhook lag.
    await admin
      .from("bookings")
      .update({ payment_authorized_at: new Date().toISOString() })
      .eq("id", bookingId)
      .eq("status", "PAYMENT_PENDING")
      .is("payment_authorized_at", null);

    // Place the deposit hold using the card just used for the booking
    // payment. The deposit is a separate manual-capture intent, so it must be
    // confirmed server-side with the saved payment method.
    let depositAuthorized = true;
    let depositErrorMessage: string | undefined;
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
        depositAuthorized = false;
        depositErrorMessage =
          depositError.message || "Failed to hold security deposit";
      }
    }

    const confirmResult = await confirmBookingAfterAuthorization(
      bookingId,
      user.id,
      paymentIntentId
    );

    return NextResponse.json({
      success: true,
      depositAuthorized,
      ...(depositErrorMessage ? { depositError: depositErrorMessage } : {}),
      bookingConfirmed: confirmResult.confirmed,
      confirmReason: confirmResult.reason,
    });
  } catch (error: any) {
    const suspended = suspendedResponse(error);
    if (suspended) return suspended;
    console.error("Payment authorization error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to authorize payment" },
      { status: 500 }
    );
  }
}
