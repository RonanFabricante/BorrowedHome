import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { stripe } from "@/lib/stripe/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkAccountStatus, computeOnboardingStatus } from "@/lib/stripe/connect";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

  // Webhooks have no user session; use the service-role client so RLS
  // doesn't silently block payment/booking updates.
  const supabase = createAdminClient();

  try {
    switch (event.type) {
      case "payment_intent.succeeded":
      case "payment_intent.amount_capturable_updated": {
        const paymentIntent = event.data.object as Stripe.PaymentIntent;
        const bookingId = paymentIntent.metadata.booking_id;
        const paymentType = paymentIntent.metadata.type;

        if (!bookingId) {
          console.error("No booking_id in payment intent metadata");
          break;
        }

        // For manual capture, "requires_capture" or "succeeded" means payment is authorized.
        // Only the main booking intent drives the payment row's status; a deposit
        // authorization must not mark the row 'authorised' while the booking
        // payment is still unpaid.
        if (paymentType === "booking") {
          const { error } = await supabase
            .from("payments")
            .update({ status: "authorised" })
            .eq("stripe_payment_intent_id", paymentIntent.id);

          if (error) {
            console.error("Failed to update payment status:", error);
          }
        }

        // If this is the booking payment (not deposit), confirm the booking
        if (paymentType === "booking") {
          // Check if booking is PAYMENT_PENDING and within deadline
          const { data: booking } = await supabase
            .from("bookings")
            .select("status, payment_deadline_at, guest_id, listing_id, start_at, end_at, total_amount, cancelled_at, payment_authorized_at")
            .eq("id", bookingId)
            .single();

          if (booking) {
            // Safety check: Never confirm a cancelled booking
            if (booking.cancelled_at || booking.status === "CANCELLED") {
              console.warn(`[Webhook] Ignoring payment for cancelled booking ${bookingId}. Manual review may be needed.`);
              break;
            }

            const now = new Date();
            const deadline = booking.payment_deadline_at ? new Date(booking.payment_deadline_at) : null;
            // Prefer authorization time over webhook receipt time so late
            // webhooks don't reject on-time payments.
            const authorizedAt = booking.payment_authorized_at
              ? new Date(booking.payment_authorized_at)
              : now;
            
            // Only confirm if status is PAYMENT_PENDING and payment was
            // authorised within the deadline (or deadline not set)
            if (
              booking.status === "PAYMENT_PENDING" &&
              (!deadline || authorizedAt <= deadline)
            ) {
              // Update payment_authorized_at if not set
              if (!booking.payment_authorized_at) {
                await supabase
                  .from("bookings")
                  .update({ payment_authorized_at: now.toISOString() })
                  .eq("id", bookingId);
              }
              await supabase
                .from("bookings")
                .update({ 
                  status: "CONFIRMED",
                  paid_at: now.toISOString(),
                  payment_status: "AUTHORIZED", // Will be CAPTURED later
                  payment_authorized_at: now.toISOString(),
                })
                .eq("id", bookingId);

              // Log event
              try {
                await supabase.rpc("log_booking_event", {
                  p_booking_id: bookingId,
                  p_event_type: "PAID",
                  p_actor_id: booking.guest_id,
                  p_payload: { payment_intent_id: paymentIntent.id },
                });
              } catch (eventError) {
                console.error("[Webhook] Failed to log PAID event:", eventError);
              }

              // Send confirmation emails (async)
              const { sendGuestBookingConfirmedEmail, sendHostBookingConfirmedEmail } = await import("@/lib/email/send");
              const { createAdminClient } = await import("@/lib/supabase/admin");
              const adminClient = createAdminClient();

              // Fetch guest and host profiles/emails
              Promise.all([
                adminClient.auth.admin.getUserById(booking.guest_id),
                supabase.from("listings").select("host_id, title").eq("id", booking.listing_id).single(),
              ]).then(async ([guestUserResult, listingResult]) => {
                if (guestUserResult.data?.user?.email && listingResult.data) {
                  const guestEmail = guestUserResult.data.user.email;
                  const { data: guestProfile } = await supabase
                    .from("profiles")
                    .select("full_name")
                    .eq("id", booking.guest_id)
                    .single();

                  const { data: hostProfile } = await supabase
                    .from("profiles")
                    .select("full_name")
                    .eq("id", listingResult.data.host_id)
                    .single();

                  const { data: hostUserResult } = await adminClient.auth.admin.getUserById(listingResult.data.host_id);
                  const hostEmail = hostUserResult?.user?.email;

                  const emailData = {
                    bookingId,
                    guestName: guestProfile?.full_name || "Guest",
                    hostName: hostProfile?.full_name || "Host",
                    listingTitle: listingResult.data.title,
                    startTime: booking.start_at,
                    endTime: booking.end_at,
                    totalAmount: booking.total_amount,
                    currency: booking.currency,
                  };

                  // Send emails (don't await - fire and forget)
                  if (guestEmail) {
                    sendGuestBookingConfirmedEmail(guestEmail, guestProfile?.full_name || "Guest", emailData).catch(
                      (err) => console.error("[Webhook] Failed to send guest confirmation email:", err)
                    );
                  }

                  if (hostEmail) {
                    sendHostBookingConfirmedEmail(hostEmail, hostProfile?.full_name || "Host", emailData).catch(
                      (err) => console.error("[Webhook] Failed to send host confirmation email:", err)
                    );
                  }

                  // Create in-app notifications (don't await - fire and forget)
                  const { createNotificationsForUsers } = await import("@/lib/notifications/create");
                  createNotificationsForUsers([
                    {
                      userId: booking.guest_id,
                      type: "BOOKING_CONFIRMED",
                      title: "Booking confirmed",
                      body: `Your booking for "${listingResult.data.title}" is confirmed`,
                      href: `/bookings/${bookingId}/confirm`,
                      entityType: "booking",
                      entityId: bookingId,
                      dedupeKey: `booking:${bookingId}:confirmed:guest`,
                    },
                    {
                      userId: listingResult.data.host_id,
                      type: "BOOKING_CONFIRMED",
                      title: "Booking confirmed",
                      body: `Booking for "${listingResult.data.title}" is confirmed`,
                      href: `/bookings/${bookingId}/confirm`,
                      entityType: "booking",
                      entityId: bookingId,
                      dedupeKey: `booking:${bookingId}:confirmed:host`,
                    },
                  ]).catch((err) => {
                    console.error("[Webhook] Failed to create confirmation notifications:", err);
                  });
                }
              }).catch((err) => {
                console.error("[Webhook] Failed to fetch user data for emails:", err);
              });
            } else if (booking.status === "EXPIRED") {
              // Payment arrived after expiry - release the hold so the guest
              // isn't left with an authorization for a dead booking.
              console.warn(`[Webhook] Payment received for expired booking ${bookingId}. Cancelling the authorization.`);
              try {
                if (paymentIntent.status === "requires_capture") {
                  await stripe.paymentIntents.cancel(paymentIntent.id);
                  await supabase
                    .from("payments")
                    .update({ status: "released" })
                    .eq("stripe_payment_intent_id", paymentIntent.id);
                }
              } catch (cancelError) {
                console.error(`[Webhook] Failed to cancel late authorization for booking ${bookingId}:`, cancelError);
              }
            }
          }
        }

        break;
      }

      case "payment_intent.canceled": {
        const paymentIntent = event.data.object as Stripe.PaymentIntent;
        const bookingId = paymentIntent.metadata.booking_id;

        if (!bookingId) {
          break;
        }

        const paymentType = paymentIntent.metadata.type;

        // If this is a deposit cancellation, update deposit release timestamp
        if (paymentType === "deposit") {
          await supabase
            .from("payments")
            .update({ 
              deposit_released_at: new Date().toISOString()
            })
            .eq("stripe_deposit_intent_id", paymentIntent.id);
        } else {
          // For main payment, update status to released
          await supabase
            .from("payments")
            .update({ status: "released" })
            .eq("stripe_payment_intent_id", paymentIntent.id);
        }

        break;
      }

      case "charge.captured": {
        // Payment was captured (manual capture completed)
        const charge = event.data.object as Stripe.Charge;
        const paymentIntentId = typeof charge.payment_intent === "string" 
          ? charge.payment_intent 
          : charge.payment_intent?.id;

        if (!paymentIntentId) break;

        // Retrieve PaymentIntent to get booking_id
        const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
        const bookingId = paymentIntent.metadata?.booking_id;
        
        if (!bookingId) break;

        // Check if booking is cancelled (safety guard)
        const { data: booking } = await supabase
          .from("bookings")
          .select("status, cancelled_at, payment_status")
          .eq("id", bookingId)
          .single();

        if (booking?.cancelled_at || booking?.status === "CANCELLED") {
          console.warn(`[Webhook] Ignoring capture for cancelled booking ${bookingId}. Manual review may be needed.`);
          break;
        }

        // Only update to CAPTURED if it was previously AUTHORIZED
        if (booking?.payment_status === "AUTHORIZED") {
          // Update payment status to CAPTURED
          await supabase
            .from("bookings")
            .update({
              payment_status: "CAPTURED",
              payment_captured_at: new Date().toISOString(),
            })
            .eq("id", bookingId);

          // Update payment record
          await supabase
            .from("payments")
            .update({ status: "captured" })
            .eq("stripe_payment_intent_id", paymentIntentId);
        }

        break;
      }

      case "transfer.created": {
        // Transfer to host was created (for logging/auditing)
        const transfer = event.data.object as Stripe.Transfer;
        const bookingId = transfer.metadata?.booking_id;

        if (bookingId) {
          console.log(`[Webhook] Transfer created for booking ${bookingId}: ${transfer.id} (${transfer.amount} ${transfer.currency})`);
          // Optionally log transfer to database for auditing
          // For now, we just log it
        }

        break;
      }

      case "account.updated": {
        const account = event.data.object as Stripe.Account;
        
        // Find host by stripe_account_id
        const { data: host } = await supabase
          .from("hosts")
          .select("id")
          .eq("stripe_account_id", account.id)
          .single();

        if (host) {
          const status = await checkAccountStatus({ accountId: account.id });
          const onboardingStatus = computeOnboardingStatus(status);

          await supabase
            .from("hosts")
            .update({
              stripe_charges_enabled: status.charges_enabled,
              stripe_payouts_enabled: status.payouts_enabled,
              stripe_requirements_due: status.currently_due.length > 0 ? status.currently_due : null,
              stripe_onboarding_status: onboardingStatus,
            })
            .eq("stripe_account_id", account.id);
        }

        break;
      }

      case "capability.updated": {
        const capability = event.data.object as Stripe.Capability;
        const accountId = capability.account as string;

        // Find host by stripe_account_id
        const { data: host } = await supabase
          .from("hosts")
          .select("id")
          .eq("stripe_account_id", accountId)
          .single();

        if (host) {
          // Re-check full account status when capability changes
          const status = await checkAccountStatus({ accountId });
          const onboardingStatus = computeOnboardingStatus(status);

          await supabase
            .from("hosts")
            .update({
              stripe_charges_enabled: status.charges_enabled,
              stripe_payouts_enabled: status.payouts_enabled,
              stripe_requirements_due: status.currently_due.length > 0 ? status.currently_due : null,
              stripe_onboarding_status: onboardingStatus,
            })
            .eq("stripe_account_id", accountId);
        }

        break;
      }

      case "account.application.deauthorized": {
        const deauth = event.data.object as Stripe.Application;
        // Log for admin review - account was disconnected
        console.error("Stripe account deauthorized:", deauth.id);
        // TODO: Notify admin, potentially mark host as restricted
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
