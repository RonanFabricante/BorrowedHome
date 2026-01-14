import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { stripe } from "@/lib/stripe/server";
import {
  sendGuestPaymentRequiredEmail,
  sendGuestRequestRejectedEmail,
  type BookingEmailData,
} from "@/lib/email/send";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { booking_id, action } = body;

    if (!booking_id || !action) {
      return NextResponse.json(
        { error: "booking_id and action are required" },
        { status: 400 }
      );
    }

    if (!["accept", "reject"].includes(action)) {
      return NextResponse.json(
        { error: "action must be 'accept' or 'reject'" },
        { status: 400 }
      );
    }

    // Fetch booking with listing info
    const { data: booking, error: bookingError } = await supabase
      .from("bookings")
      .select(`
        *,
        listings!inner(
          id,
          host_id,
          title,
          deposit_amount
        )
      `)
      .eq("id", booking_id)
      .single();

    if (bookingError || !booking) {
      return NextResponse.json(
        { error: "Booking not found" },
        { status: 404 }
      );
    }

    const listing = (booking.listings as unknown as { host_id: string; id: string; title: string; deposit_amount: number });

    // Verify user is the host
    if (listing.host_id !== user.id) {
      return NextResponse.json(
        { error: "Only the listing host can respond to bookings" },
        { status: 403 }
      );
    }

    // Handle rejection
    if (action === "reject") {
      const { data: declinedBooking, error: declineError } = await supabase.rpc(
        "decline_booking",
        {
          p_booking_id: booking_id,
          p_host_id: user.id,
        }
      );

      if (declineError) {
        return NextResponse.json(
          { error: declineError.message },
          { status: 400 }
        );
      }

      // Log event
      try {
        await supabase.rpc("log_booking_event", {
          p_booking_id: booking_id,
          p_event_type: "REJECTED",
          p_actor_id: user.id,
          p_payload: { reason: "host_declined" },
        });
      } catch (eventError) {
        console.error("[Booking Respond] Failed to log event:", eventError);
      }

      // Fetch guest profile and email
      const { data: guestProfile } = await supabase
        .from("profiles")
        .select("id, full_name")
        .eq("id", booking.guest_id)
        .single();

      // Fetch guest email using admin client
      const { createAdminClient } = await import("@/lib/supabase/admin");
      const adminClient = createAdminClient();
      const { data: guestUser } = await adminClient.auth.admin.getUserById(booking.guest_id);
      const guestEmail = guestUser?.user?.email;

      // Send rejection email
      if (guestEmail) {
        const emailData: BookingEmailData = {
          bookingId: booking_id,
          guestName: guestProfile?.full_name || "Guest",
          hostName: user.user_metadata?.full_name || "Host",
          listingTitle: listing.title,
          startTime: booking.start_at,
          endTime: booking.end_at,
          totalAmount: booking.total_amount,
        };

        sendGuestRequestRejectedEmail(guestEmail, guestProfile?.full_name || "Guest", emailData).catch(
          (emailError) => {
            console.error("[Booking Respond] Failed to send rejection email:", emailError);
          }
        );
      }

      return NextResponse.json({
        success: true,
        booking: declinedBooking,
      });
    }

    // Handle acceptance
    if (action === "accept") {
      // Check if host has completed Stripe onboarding
      const { data: host } = await supabase
        .from("hosts")
        .select("*")
        .eq("user_id", user.id)
        .single();

      if (!host || host.stripe_onboarding_status !== "complete") {
        return NextResponse.json(
          {
            error: "STRIPE_ONBOARDING_REQUIRED",
            message: "You must complete Stripe onboarding before accepting bookings",
          },
          { status: 400 }
        );
      }

      // Accept booking (this validates lead time and availability)
      const { data: acceptedBooking, error: acceptError } = await supabase.rpc(
        "accept_booking",
        {
          p_booking_id: booking_id,
          p_host_id: user.id,
        }
      );

      if (acceptError) {
        return NextResponse.json(
          { error: acceptError.message },
          { status: 400 }
        );
      }

      // Log event
      try {
        await supabase.rpc("log_booking_event", {
          p_booking_id: booking_id,
          p_event_type: "ACCEPTED",
          p_actor_id: user.id,
          p_payload: {
            payment_deadline: acceptedBooking.payment_deadline_at,
          },
        });
      } catch (eventError) {
        console.error("[Booking Respond] Failed to log event:", eventError);
      }

      // Create Stripe Payment Intent
      const bookingAmount = acceptedBooking.total_amount - acceptedBooking.platform_fee_amount;
      const platformFee = acceptedBooking.platform_fee_amount;
      const totalAmount = bookingAmount + platformFee;
      const depositAmount = acceptedBooking.deposit_amount || 0;

      const paymentIntent = await stripe.paymentIntents.create({
        amount: totalAmount,
        currency: "aud",
        capture_method: "manual",
        payment_method_types: ["card"],
        metadata: {
          booking_id: booking_id,
          listing_id: listing.id,
          host_id: listing.host_id,
          guest_id: acceptedBooking.guest_id,
          type: "booking",
        },
      });

      let depositIntentId: string | null = null;
      if (depositAmount > 0) {
        const depositIntent = await stripe.paymentIntents.create({
          amount: depositAmount,
          currency: "aud",
          capture_method: "manual",
          payment_method_types: ["card"],
          metadata: {
            booking_id: booking_id,
            listing_id: listing.id,
            host_id: listing.host_id,
            guest_id: acceptedBooking.guest_id,
            type: "deposit",
          },
        });
        depositIntentId = depositIntent.id;
      }

      // Store payment record
      const { error: paymentError } = await supabase
        .from("payments")
        .insert({
          booking_id: booking_id,
          stripe_payment_intent_id: paymentIntent.id,
          stripe_deposit_intent_id: depositIntentId,
          amount: totalAmount,
          deposit_amount: depositAmount,
          status: "pending",
        });

      if (paymentError) {
        // Clean up Stripe intents
        await stripe.paymentIntents.cancel(paymentIntent.id);
        if (depositIntentId) {
          await stripe.paymentIntents.cancel(depositIntentId);
        }
        throw paymentError;
      }

      // Update booking with payment intent ID
      await supabase
        .from("bookings")
        .update({ stripe_payment_intent_id: paymentIntent.id })
        .eq("id", booking_id);

      // Fetch guest profile and email
      const { data: guestProfile } = await supabase
        .from("profiles")
        .select("id, full_name")
        .eq("id", acceptedBooking.guest_id)
        .single();

      // Fetch guest email using admin client
      const { createAdminClient } = await import("@/lib/supabase/admin");
      const adminClient = createAdminClient();
      const { data: guestUser } = await adminClient.auth.admin.getUserById(acceptedBooking.guest_id);
      const guestEmail = guestUser?.user?.email;

      // Send payment required email
      if (guestEmail && acceptedBooking.payment_deadline_at) {
        const emailData: BookingEmailData = {
          bookingId: booking_id,
          guestName: guestProfile?.full_name || "Guest",
          hostName: user.user_metadata?.full_name || "Host",
          listingTitle: listing.title,
          startTime: acceptedBooking.start_at,
          endTime: acceptedBooking.end_at,
          totalAmount,
          paymentDeadline: acceptedBooking.payment_deadline_at,
        };

        sendGuestPaymentRequiredEmail(guestEmail, guestProfile?.full_name || "Guest", emailData).catch(
          (emailError) => {
            console.error("[Booking Respond] Failed to send payment email:", emailError);
          }
        );
      }

      return NextResponse.json({
        success: true,
        booking: acceptedBooking,
        paymentIntentId: paymentIntent.id,
        depositIntentId,
        clientSecret: paymentIntent.client_secret,
        depositClientSecret: depositIntentId
          ? (await stripe.paymentIntents.retrieve(depositIntentId)).client_secret
          : null,
      });
    }

    return NextResponse.json(
      { error: "Invalid action" },
      { status: 400 }
    );
  } catch (error: any) {
    console.error("[Booking Respond] Error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to respond to booking" },
      { status: 500 }
    );
  }
}
