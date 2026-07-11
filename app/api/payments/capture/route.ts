import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { stripe } from "@/lib/stripe/server";
import { PLATFORM_FEE_PERCENTAGE } from "@/lib/stripe/server";
import { DEFAULT_CURRENCY, normalizeCurrency } from "@/lib/currency";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Manual payment capture endpoint (host-triggered)
 * Captures payment and transfers funds to host via Stripe Connect
 * Note: Automatic capture happens via cron job after review window
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

    // Fetch payment with booking and listing details
    const { data: payment, error: paymentError } = await supabase
      .from("payments")
      .select(`
        *,
        bookings!inner(
          id,
          status,
          end_at,
          listing_id,
          guest_id,
          total_amount,
          platform_fee_amount,
          currency,
          listings!inner(
            host_id,
            title
          )
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
    const listings = payment.bookings.listings as { host_id: string; title?: string } | undefined;
    if (!listings || listings.host_id !== user.id) {
      return NextResponse.json(
        { error: "Only the host can capture payments" },
        { status: 403 }
      );
    }

    // Verify payment is authorised
    if (payment.status !== "authorised") {
      return NextResponse.json(
        { error: `Payment must be authorised before capture (current status: ${payment.status})` },
        { status: 400 }
      );
    }

    // Only allow capture after the booking has completed. Before completion
    // review_window_ends_at is NULL, so without this check a host could
    // capture funds before the guest's visit even happens.
    if (payment.bookings.status !== "COMPLETED") {
      return NextResponse.json(
        { error: `Payment can only be captured after the booking is completed (current status: ${payment.bookings.status})` },
        { status: 400 }
      );
    }

    // Check if review window has ended (if set)
    if (payment.review_window_ends_at) {
      const reviewEnd = new Date(payment.review_window_ends_at);
      const now = new Date();
      
      if (now < reviewEnd) {
        return NextResponse.json(
          { 
            error: `Payment cannot be captured until review window ends at ${reviewEnd.toISOString()}`,
            reviewWindowEndsAt: reviewEnd.toISOString()
          },
          { status: 400 }
        );
      }
    }

    // Check if dispute was reported
    if (payment.dispute_reported_at) {
      return NextResponse.json(
        { 
          error: "Payment cannot be captured while dispute is active",
          disputeReportedAt: payment.dispute_reported_at,
          holdReason: payment.capture_hold_reason
        },
        { status: 400 }
      );
    }

    // Get host Stripe account
    const hostId = listings.host_id;
    const { data: host, error: hostError } = await supabase
      .from("hosts")
      .select("stripe_account_id, stripe_charges_enabled, stripe_payouts_enabled")
      .eq("user_id", hostId)
      .single();

    if (hostError || !host) {
      return NextResponse.json(
        { error: "Host Stripe account not found. Please complete onboarding at /host/payouts" },
        { status: 404 }
      );
    }

    if (!host.stripe_account_id) {
      return NextResponse.json(
        { error: "Host Stripe account ID not set. Please complete onboarding." },
        { status: 400 }
      );
    }

    if (!host.stripe_charges_enabled || !host.stripe_payouts_enabled) {
      return NextResponse.json(
        { error: "Host Stripe account not fully enabled. Please complete onboarding." },
        { status: 400 }
      );
    }

    // Capture the payment intent
    console.log(`[Capture] Capturing PaymentIntent ${payment.stripe_payment_intent_id} for booking ${bookingId}`);
    const paymentIntent = await stripe.paymentIntents.capture(
      payment.stripe_payment_intent_id
    );

    if (paymentIntent.status !== "succeeded") {
      throw new Error(`PaymentIntent capture failed with status: ${paymentIntent.status}`);
    }

    // Calculate amounts for transfer
    // payment.amount = totalAmount charged to guest (includes booking amount + platform fee)
    // payment.bookings.platform_fee_amount = platform fee (already stored in booking)
    // Host receives: total - platform fee
    const totalAmount = payment.amount; // Total charged to guest in cents
    const platformFee = payment.bookings.platform_fee_amount || 0; // Use stored platform fee from booking
    const hostAmount = totalAmount - platformFee; // Host receives total minus platform fee
    
    // Ensure host amount is positive
    if (hostAmount <= 0) {
      return NextResponse.json(
        { error: `Invalid host amount calculated: ${hostAmount} (total: ${totalAmount}, fee: ${platformFee}). Check booking.platform_fee_amount.` },
        { status: 500 }
      );
    }
    
    // Log for debugging
    console.log(`[Capture] Amount breakdown - Total: ${totalAmount}, Platform Fee: ${platformFee}, Host Amount: ${hostAmount}`);

    console.log(`[Capture] Transferring ${hostAmount} cents to host ${hostId} (platform fee: ${platformFee}, total: ${totalAmount})`);

    // Transfer to host's Stripe Connect account (idempotency key shared with
    // auto-capture so the host can never be paid out twice for one booking)
    const transfer = await stripe.transfers.create(
      {
        amount: hostAmount,
        currency: normalizeCurrency(
          payment.currency || payment.bookings?.currency || DEFAULT_CURRENCY
        ),
        destination: host.stripe_account_id,
        metadata: {
          booking_id: bookingId,
          type: "booking_payment",
          listing_title: listings.title || "Unknown",
        },
      },
      { idempotencyKey: `booking-payout-${bookingId}` }
    );

    console.log(`[Capture] Transfer created: ${transfer.id}`);

    // Update payment status (service role — client updates are locked)
    const admin = createAdminClient();
    const { error: updateError } = await admin
      .from("payments")
      .update({ 
        status: "captured",
        auto_capture_scheduled_at: null // Clear scheduled time if set
      })
      .eq("id", payment.id);

    if (updateError) {
      console.error("[Capture] Failed to update payment status:", updateError);
      // Don't throw - transfer succeeded, just log the error
    }

    // Keep the booking's payment fields in sync with the payment record
    const { error: bookingSyncError } = await admin
      .from("bookings")
      .update({
        payment_status: "CAPTURED",
        payment_captured_at: new Date().toISOString(),
      })
      .eq("id", bookingId);

    if (bookingSyncError) {
      console.error("[Capture] Failed to sync booking payment status:", bookingSyncError);
    }

    // Auto-release deposit if no dispute and not already released/captured
    if (
      payment.stripe_deposit_intent_id &&
      !payment.dispute_reported_at &&
      !payment.deposit_released_at
    ) {
      try {
        console.log(`[Capture] Releasing deposit ${payment.stripe_deposit_intent_id}`);
        const depositIntent = await stripe.paymentIntents.retrieve(payment.stripe_deposit_intent_id);
        if (depositIntent.status !== "canceled" && depositIntent.status !== "succeeded") {
          await stripe.paymentIntents.cancel(payment.stripe_deposit_intent_id);
        }
        
        await admin
          .from("payments")
          .update({
            deposit_released_at: new Date().toISOString(),
          })
          .eq("id", payment.id);
        
        console.log(`[Capture] Deposit released successfully`);
      } catch (depositError: any) {
        console.error("[Capture] Failed to release deposit:", depositError);
        // Don't fail the whole operation if deposit release fails
      }
    }

    return NextResponse.json({ 
      success: true, 
      paymentIntent,
      transfer: {
        id: transfer.id,
        amount: hostAmount,
        currency: transfer.currency,
      },
      message: "Payment captured and transferred to host successfully"
    });
  } catch (error: any) {
    console.error("[Capture] Payment capture error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to capture payment" },
      { status: 500 }
    );
  }
}
