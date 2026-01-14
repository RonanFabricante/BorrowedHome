import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  computeCancellationPolicy,
  canCancelBooking,
  type CancellationActor,
  type CancellationReason,
} from "@/lib/cancellation/policy";
import { processCancellationPayment } from "@/lib/stripe/cancellation";
import {
  sendGuestBookingCancelledByGuestEmail,
  sendHostBookingCancelledByGuestEmail,
  sendGuestBookingCancelledByHostEmail,
  sendHostBookingCancelledByHostEmail,
  type BookingEmailData,
} from "@/lib/email/send";

export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: bookingId } = await params;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { reason, note } = body;

    // Validate reason
    const validReasons: CancellationReason[] = ["changed_plans", "unavailable", "safety", "other"];
    if (!reason || !validReasons.includes(reason)) {
      return NextResponse.json(
        { error: `Invalid reason. Must be one of: ${validReasons.join(", ")}` },
        { status: 400 }
      );
    }

    // Fetch booking with listing and payment info
    const { data: booking, error: bookingError } = await supabase
      .from("bookings")
      .select(`
        *,
        listings!inner(
          id,
          host_id,
          title
        ),
        payments(
          id,
          stripe_payment_intent_id,
          status
        )
      `)
      .eq("id", bookingId)
      .single();

    if (bookingError || !booking) {
      return NextResponse.json(
        { error: "Booking not found" },
        { status: 404 }
      );
    }

    const listing = (booking.listings as unknown as { id: string; host_id: string; title: string });
    const payments = booking.payments as unknown as Array<{
      id: string;
      stripe_payment_intent_id: string;
      status: string;
    }>;

    // Determine actor (guest or host)
    const isGuest = booking.guest_id === user.id;
    const isHost = listing.host_id === user.id;

    if (!isGuest && !isHost) {
      return NextResponse.json(
        { error: "Only the guest or host can cancel this booking" },
        { status: 403 }
      );
    }

    const actor: CancellationActor = isGuest ? "guest" : "host";

    // Check if booking can be cancelled
    const startTime = new Date(booking.start_at);
    const cancellationCheck = canCancelBooking(booking.status, startTime);

    if (!cancellationCheck.canCancel) {
      return NextResponse.json(
        { error: cancellationCheck.reason || "Cannot cancel this booking" },
        { status: 400 }
      );
    }

    // Compute cancellation policy
    const policyResult = computeCancellationPolicy({
      actor,
      bookingStartTime: startTime,
      cancelledAt: new Date(),
      totalAmountCents: booking.total_amount,
      policyVersion: booking.cancellation_policy_version || "v1",
    });

    // Get PaymentIntent ID (from booking or payment record)
    let stripePaymentIntentId: string | null = null;
    if (booking.stripe_payment_intent_id) {
      stripePaymentIntentId = booking.stripe_payment_intent_id;
    } else if (payments && payments.length > 0) {
      const mainPayment = payments.find((p) => p.stripe_payment_intent_id);
      if (mainPayment) {
        stripePaymentIntentId = mainPayment.stripe_payment_intent_id;
      }
    }

    // Process payment cancellation/refund if PaymentIntent exists
    let paymentResult = null;
    if (stripePaymentIntentId && policyResult.refundableAmountCents > 0) {
      paymentResult = await processCancellationPayment(
        stripePaymentIntentId,
        policyResult.refundableAmountCents
      );

      if (!paymentResult.success) {
        // Log error but continue with cancellation (payment can be retried)
        console.error("[Cancel Booking] Payment processing failed:", paymentResult.error);
      }
    }

    // Determine payment status
    let paymentStatus = booking.payment_status || "NONE";
    if (paymentResult) {
      if (paymentResult.action === "voided") {
        paymentStatus = "VOIDED";
      } else if (paymentResult.action === "refunded") {
        // Check if partial or full
        const payment = payments?.[0];
        if (payment && paymentResult.amountCents && paymentResult.amountCents < booking.total_amount) {
          paymentStatus = "PARTIALLY_REFUNDED";
        } else {
          paymentStatus = "REFUNDED";
        }
      }
    }

    // Update booking atomically
    const updateData: any = {
      status: "CANCELLED",
      cancelled_at: new Date().toISOString(),
      cancelled_by: actor,
      cancellation_reason: reason,
      cancellation_note: note?.trim() || null,
      cancellation_policy_version: "v1",
      refund_amount_cents: policyResult.refundableAmountCents,
      payment_status: paymentStatus,
      cancellation_status: paymentResult?.success !== false ? "RESOLVED" : "PENDING",
    };

    if (paymentResult?.stripeRefundId) {
      updateData.stripe_refund_id = paymentResult.stripeRefundId;
    }

    // Update payment_authorized_at if not set (from payment record)
    if (!booking.payment_authorized_at && payments && payments.length > 0) {
      const payment = payments.find((p) => p.status === "authorised" || p.status === "authorized");
      if (payment) {
        // Try to get from payment record created_at or set now
        updateData.payment_authorized_at = new Date().toISOString();
      }
    }

    const { data: updatedBooking, error: updateError } = await supabase
      .from("bookings")
      .update(updateData)
      .eq("id", bookingId)
      .select()
      .single();

    if (updateError) {
      console.error("[Cancel Booking] Failed to update booking:", updateError);
      return NextResponse.json(
        { error: "Failed to cancel booking" },
        { status: 500 }
      );
    }

    // Log booking event
    try {
      await supabase.rpc("log_booking_event", {
        p_booking_id: bookingId,
        p_event_type: "CANCELLED",
        p_actor_id: user.id,
        p_payload: {
          actor,
          reason,
          note: note?.trim() || null,
          policy_result: policyResult,
          payment_result: paymentResult,
          refund_amount_cents: policyResult.refundableAmountCents,
        },
      });
    } catch (eventError) {
      console.error("[Cancel Booking] Failed to log event:", eventError);
    }

    // Send emails (with deduplication)
    const adminClient = createAdminClient();

    // Fetch guest and host profiles/emails
    const [guestUserResult, hostUserResult] = await Promise.all([
      adminClient.auth.admin.getUserById(booking.guest_id),
      adminClient.auth.admin.getUserById(listing.host_id),
    ]);

    const guestEmail = guestUserResult.data?.user?.email;
    const hostEmail = hostUserResult.data?.user?.email;

    const { data: guestProfile } = await supabase
      .from("profiles")
      .select("full_name")
      .eq("id", booking.guest_id)
      .single();

    const { data: hostProfile } = await supabase
      .from("profiles")
      .select("full_name")
      .eq("id", listing.host_id)
      .single();

    const emailData: BookingEmailData = {
      bookingId,
      guestName: guestProfile?.full_name || "Guest",
      hostName: hostProfile?.full_name || "Host",
      listingTitle: listing.title,
      startTime: booking.start_at,
      endTime: booking.end_at,
      totalAmount: booking.total_amount,
      refundAmount: policyResult.refundableAmountCents,
      paymentAction: paymentResult?.action === "failed" ? "none" : (paymentResult?.action || "none"),
    };

    // Check if notifications were already sent (idempotency)
    const checkNotification = async (email: string, type: string) => {
      const { data } = await supabase.rpc("notification_sent", {
        p_booking_id: bookingId,
        p_recipient_email: email,
        p_notification_type: type,
      });
      return data === true;
    };

    // Send emails based on actor
    if (actor === "guest") {
      // Email to host
      if (hostEmail && !(await checkNotification(hostEmail, "host_booking_cancelled_by_guest"))) {
        sendHostBookingCancelledByGuestEmail(hostEmail, hostProfile?.full_name || "Host", emailData).catch(
          (err) => console.error("[Cancel Booking] Failed to send host email:", err)
        );
        await supabase.rpc("log_notification", {
          p_booking_id: bookingId,
          p_recipient_email: hostEmail,
          p_notification_type: "host_booking_cancelled_by_guest",
        });
      }

      // Email to guest
      if (guestEmail && !(await checkNotification(guestEmail, "guest_booking_cancelled_by_guest"))) {
        sendGuestBookingCancelledByGuestEmail(guestEmail, guestProfile?.full_name || "Guest", emailData).catch(
          (err) => console.error("[Cancel Booking] Failed to send guest email:", err)
        );
        await supabase.rpc("log_notification", {
          p_booking_id: bookingId,
          p_recipient_email: guestEmail,
          p_notification_type: "guest_booking_cancelled_by_guest",
        });
      }
    } else if (actor === "host") {
      // Email to guest
      if (guestEmail && !(await checkNotification(guestEmail, "guest_booking_cancelled_by_host"))) {
        sendGuestBookingCancelledByHostEmail(guestEmail, guestProfile?.full_name || "Guest", emailData).catch(
          (err) => console.error("[Cancel Booking] Failed to send guest email:", err)
        );
        await supabase.rpc("log_notification", {
          p_booking_id: bookingId,
          p_recipient_email: guestEmail,
          p_notification_type: "guest_booking_cancelled_by_host",
        });
      }

      // Email to host
      if (hostEmail && !(await checkNotification(hostEmail, "host_booking_cancelled_by_host"))) {
        sendHostBookingCancelledByHostEmail(hostEmail, hostProfile?.full_name || "Host", emailData).catch(
          (err) => console.error("[Cancel Booking] Failed to send host email:", err)
        );
        await supabase.rpc("log_notification", {
          p_booking_id: bookingId,
          p_recipient_email: hostEmail,
          p_notification_type: "host_booking_cancelled_by_host",
        });
      }
    }

    return NextResponse.json({
      success: true,
      booking: updatedBooking,
      policy_result: policyResult,
      payment_result: paymentResult,
    });
  } catch (error: any) {
    console.error("[Cancel Booking] Unexpected error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to cancel booking" },
      { status: 500 }
    );
  }
}
