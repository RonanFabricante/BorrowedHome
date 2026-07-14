import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { stripe } from "@/lib/stripe/server";
import {
  stripeMinAmountMessage,
  stripeMinAmountMinor,
} from "@/lib/payments/stripeMinAmount";
import { DEFAULT_CURRENCY, normalizeCurrency } from "@/lib/currency";
import {
  depositPayoutIdempotencyKey,
  resolveHostPayoutFromPaymentIntent,
} from "@/lib/stripe/hostPayout";
import { requireHostStripeReady } from "@/lib/stripe/refreshHostStatus";
import {
  assertNotSuspended,
  suspendedResponse,
} from "@/lib/auth/assertNotSuspended";

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

    await assertNotSuspended(user.id);

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
          status,
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

    // Extract listings with type assertion (cast through unknown for safety)
    const listings = payment.bookings.listings as unknown as { host_id: string };
    if (!listings || listings.host_id !== user.id) {
      return NextResponse.json(
        { error: "Only the host can capture deposits" },
        { status: 403 }
      );
    }

    const bookingStatus = (payment.bookings as { status?: string }).status;
    if (bookingStatus !== "COMPLETED") {
      return NextResponse.json(
        {
          error:
            "Deposits can only be captured after the booking is completed. Report a dispute first if needed.",
        },
        { status: 400 }
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

    // Only capture a deposit that is actually held (authorized)
    let depositIntent = await stripe.paymentIntents.retrieve(
      payment.stripe_deposit_intent_id
    );
    if (depositIntent.status !== "requires_capture") {
      return NextResponse.json(
        { error: `Deposit is not capturable (status: ${depositIntent.status})` },
        { status: 400 }
      );
    }

    // Capture the deposit (full or partial)
    const captureAmount = amount ? Math.round(amount) : undefined;
    const currency = normalizeCurrency(payment.currency || DEFAULT_CURRENCY);
    const minMinor = stripeMinAmountMinor(currency);

    if (
      captureAmount !== undefined &&
      (captureAmount < minMinor || captureAmount > payment.deposit_amount)
    ) {
      return NextResponse.json(
        {
          error:
            captureAmount < minMinor
              ? stripeMinAmountMessage(currency)
              : `Capture amount must be between ${minMinor} and ${payment.deposit_amount} (minor units)`,
        },
        { status: 400 }
      );
    }

    console.log(`[CaptureDeposit] Capturing deposit ${payment.stripe_deposit_intent_id} for booking ${bookingId}${captureAmount ? ` (amount: ${captureAmount} cents)` : " (full amount)"}`);

    depositIntent = await stripe.paymentIntents.capture(
      payment.stripe_deposit_intent_id,
      captureAmount ? { amount_to_capture: captureAmount } : {}
    );

    if (depositIntent.status !== "succeeded") {
      return NextResponse.json(
        { error: `Deposit capture failed with status: ${depositIntent.status}` },
        { status: 500 }
      );
    }

    const capturedDepositCents = captureAmount || payment.deposit_amount;

    // Transfer captured deposit funds to the host's Connect account (they
    // otherwise land on the platform balance). Deduct Stripe processing fee.
    const { data: host } = await supabase
      .from("hosts")
      .select("stripe_account_id")
      .eq("user_id", listings.host_id)
      .single();

    let transferId: string | null = null;
    let hostReady = false;
    if (host?.stripe_account_id) {
      try {
        await requireHostStripeReady(listings.host_id, host.stripe_account_id);
        hostReady = true;
      } catch {
        hostReady = false;
      }
    }

    if (host?.stripe_account_id && hostReady) {
      try {
        const payout = await resolveHostPayoutFromPaymentIntent({
          paymentIntentId: payment.stripe_deposit_intent_id,
          totalAmount: capturedDepositCents,
          platformFee: 0,
        });
        const transfer = await stripe.transfers.create(
          {
            amount: payout.hostAmount,
            currency: normalizeCurrency(
              payment.currency || DEFAULT_CURRENCY
            ),
            destination: host.stripe_account_id,
            metadata: {
              booking_id: bookingId,
              type: "deposit_capture",
              stripe_fee_cents: String(payout.stripeFee),
            },
          },
          { idempotencyKey: depositPayoutIdempotencyKey(bookingId) }
        );
        transferId = transfer.id;
      } catch (transferError: any) {
        console.error("[CaptureDeposit] Transfer to host failed:", transferError);
        // Funds stay on the platform balance; needs manual payout
      }
    } else {
      console.error("[CaptureDeposit] Host Connect account not ready; deposit funds remain on platform balance");
    }

    // Update payment record with deposit capture info. A captured deposit is
    // no longer a hold, so mark it resolved.
    const { error: updateError } = await createAdminClient()
      .from("payments")
      .update({
        capture_hold_reason: reason || "Deposit captured for damages",
        deposit_released_at: new Date().toISOString(),
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
      capturedAmount: captureAmount || payment.deposit_amount,
      transferId,
    });
  } catch (error: any) {
    const suspended = suspendedResponse(error);
    if (suspended) return suspended;
    console.error("Deposit capture error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to capture deposit" },
      { status: 500 }
    );
  }
}
