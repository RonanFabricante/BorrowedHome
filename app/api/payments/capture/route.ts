import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { stripe } from "@/lib/stripe/server";
import { completeHostPayout, needsHostTransfer } from "@/lib/payments/completeHostPayout";
import {
  assertNotSuspended,
  suspendedResponse,
} from "@/lib/auth/assertNotSuspended";

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
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await assertNotSuspended(user.id);

    const { bookingId } = await request.json();

    if (!bookingId) {
      return NextResponse.json({ error: "bookingId is required" }, { status: 400 });
    }

    const { data: payment, error: paymentError } = await supabase
      .from("payments")
      .select(
        `
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
      `
      )
      .eq("booking_id", bookingId)
      .single();

    if (paymentError || !payment) {
      return NextResponse.json(
        { error: "Payment not found" },
        { status: 404 }
      );
    }

    const listings = payment.bookings.listings as
      | { host_id: string; title?: string }
      | undefined;
    if (!listings || listings.host_id !== user.id) {
      return NextResponse.json(
        { error: "Only the host can capture payments" },
        { status: 403 }
      );
    }

    if (payment.stripe_transfer_id) {
      return NextResponse.json({
        success: true,
        alreadyTransferred: true,
        transferId: payment.stripe_transfer_id,
        message: "Host transfer already completed",
      });
    }

    if (!needsHostTransfer(payment)) {
      return NextResponse.json(
        {
          error: `Payment must be authorised (or captured pending transfer). Current status: ${payment.status}`,
        },
        { status: 400 }
      );
    }

    if (payment.bookings.status !== "COMPLETED") {
      return NextResponse.json(
        {
          error: `Payment can only be captured after the booking is completed (current status: ${payment.bookings.status})`,
        },
        { status: 400 }
      );
    }

    if (payment.status === "authorised" && payment.review_window_ends_at) {
      const reviewEnd = new Date(payment.review_window_ends_at);
      if (new Date() < reviewEnd) {
        return NextResponse.json(
          {
            error: `Payment cannot be captured until review window ends at ${reviewEnd.toISOString()}`,
            reviewWindowEndsAt: reviewEnd.toISOString(),
          },
          { status: 400 }
        );
      }
    }

    if (payment.dispute_reported_at) {
      return NextResponse.json(
        {
          error: "Payment cannot be captured while dispute is active",
          disputeReportedAt: payment.dispute_reported_at,
          holdReason: payment.capture_hold_reason,
        },
        { status: 400 }
      );
    }

    const hostId = listings.host_id;
    const { data: host, error: hostError } = await supabase
      .from("hosts")
      .select("stripe_account_id")
      .eq("user_id", hostId)
      .single();

    if (hostError || !host?.stripe_account_id) {
      return NextResponse.json(
        {
          error:
            "Host Stripe account not found. Please complete onboarding at /host/payouts",
        },
        { status: 404 }
      );
    }

    console.log(
      `[Capture] Capturing PaymentIntent ${payment.stripe_payment_intent_id} for booking ${bookingId}`
    );
    let paymentIntent = await stripe.paymentIntents.retrieve(
      payment.stripe_payment_intent_id
    );
    if (paymentIntent.status === "requires_capture") {
      paymentIntent = await stripe.paymentIntents.capture(
        payment.stripe_payment_intent_id
      );
    }

    if (paymentIntent.status !== "succeeded") {
      throw new Error(
        `PaymentIntent capture failed with status: ${paymentIntent.status}`
      );
    }

    let transferId: string;
    let payout;
    try {
      const result = await completeHostPayout({
        bookingId,
        paymentId: payment.id,
        paymentIntentId: payment.stripe_payment_intent_id,
        hostUserId: hostId,
        stripeAccountId: host.stripe_account_id,
        totalAmount: payment.amount,
        platformFee: payment.bookings.platform_fee_amount || 0,
        currency: payment.currency || payment.bookings?.currency,
        listingTitle: listings.title,
      });
      transferId = result.transferId;
      payout = result.payout;
    } catch (transferErr: any) {
      console.error(
        "[Capture] Host transfer failed after charge capture:",
        transferErr
      );
      return NextResponse.json(
        {
          error:
            transferErr.message ||
            "Charge captured on platform but host transfer failed. Will retry when platform balance is available.",
          capturedInStripe: true,
          transferPending: true,
        },
        { status: 502 }
      );
    }

    console.log(`[Capture] Transfer created: ${transferId}`);

    const admin = createAdminClient();
    if (
      payment.stripe_deposit_intent_id &&
      !payment.dispute_reported_at &&
      !payment.deposit_released_at
    ) {
      try {
        console.log(
          `[Capture] Releasing deposit ${payment.stripe_deposit_intent_id}`
        );
        const depositIntent = await stripe.paymentIntents.retrieve(
          payment.stripe_deposit_intent_id
        );
        if (
          depositIntent.status !== "canceled" &&
          depositIntent.status !== "succeeded"
        ) {
          await stripe.paymentIntents.cancel(payment.stripe_deposit_intent_id);
        }

        await admin
          .from("payments")
          .update({
            deposit_released_at: new Date().toISOString(),
          })
          .eq("id", payment.id);
      } catch (depositError: any) {
        console.error("[Capture] Failed to release deposit:", depositError);
      }
    }

    return NextResponse.json({
      success: true,
      transfer: {
        id: transferId,
        amount: payout.hostAmount,
        platformFee: payout.platformFee,
        stripeFee: payout.stripeFee,
      },
      message: "Payment captured and transferred to host successfully",
    });
  } catch (error: any) {
    const suspended = suspendedResponse(error);
    if (suspended) return suspended;
    console.error("[Capture] Payment capture error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to capture payment" },
      { status: 500 }
    );
  }
}
