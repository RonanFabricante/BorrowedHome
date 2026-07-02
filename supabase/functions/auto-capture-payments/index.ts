// Supabase Edge Function: Auto-Capture Payments
// Automatically captures payments after review window expires
// Runs every 30 minutes via Supabase scheduler

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const REVIEW_WINDOW_HOURS = 24;

interface Payment {
  id: string;
  booking_id: string;
  status: string;
  stripe_payment_intent_id: string;
  stripe_deposit_intent_id: string | null;
  amount: number;
  deposit_amount: number;
  review_window_ends_at: string | null;
  dispute_reported_at: string | null;
  auto_capture_scheduled_at: string | null;
  capture_hold_reason: string | null;
}

interface Booking {
  id: string;
  status: string;
  end_at: string;
  total_amount: number;
  platform_fee_amount: number;
  deposit_amount: number;
  listings: {
    host_id: string;
    title: string;
  };
}

interface Host {
  stripe_account_id: string;
  stripe_charges_enabled: boolean;
  stripe_payouts_enabled: boolean;
}

/**
 * Find payments ready for auto-capture
 */
async function findPaymentsReadyForCapture(supabase: any) {
  const now = new Date().toISOString();

  const { data: readyPayments, error } = await supabase
    .from("payments")
    .select(
      `
      id,
      booking_id,
      status,
      review_window_ends_at,
      dispute_reported_at,
      bookings!inner(
        id,
        status,
        end_at
      )
    `
    )
    .eq("status", "authorised")
    .eq("bookings.status", "COMPLETED")
    .is("dispute_reported_at", null)
    .lte("review_window_ends_at", now)
    .order("review_window_ends_at", { ascending: true });

  if (error) {
    console.error("[AutoCapture] Error finding payments:", error);
    return [];
  }

  return readyPayments || [];
}

/**
 * Capture payment and transfer to host via Stripe REST API
 */
async function captureAndTransferToHost(
  supabase: any,
  bookingId: string,
  payment: Payment,
  booking: Booking,
  stripeSecretKey: string
): Promise<{
  success: boolean;
  captured?: boolean;
  transferId?: string;
  error?: string;
}> {
  try {
    const hostId = booking.listings.host_id;

    if (!hostId) {
      throw new Error("Host ID not found in booking data");
    }

    // Get host Stripe account
    const { data: host, error: hostError } = await supabase
      .from("hosts")
      .select("stripe_account_id, stripe_charges_enabled, stripe_payouts_enabled")
      .eq("user_id", hostId)
      .single();

    if (hostError || !host) {
      throw new Error("Host Stripe account not found");
    }

    const hostData = host as Host;

    if (!hostData.stripe_account_id) {
      throw new Error("Host Stripe account ID not set");
    }

    if (!hostData.stripe_charges_enabled || !hostData.stripe_payouts_enabled) {
      throw new Error(
        "Host Stripe account not fully enabled (charges or payouts disabled)"
      );
    }

    // Capture the payment intent using Stripe REST API
    console.log(
      `[AutoCapture] Capturing PaymentIntent ${payment.stripe_payment_intent_id}`
    );

    const captureResponse = await fetch(
      `https://api.stripe.com/v1/payment_intents/${payment.stripe_payment_intent_id}/capture`,
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${stripeSecretKey}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
      }
    );

    if (!captureResponse.ok) {
      const errorData = await captureResponse.json();
      throw new Error(
        `PaymentIntent capture failed: ${errorData.error?.message || captureResponse.statusText}`
      );
    }

    const paymentIntent = await captureResponse.json();

    if (paymentIntent.status !== "succeeded") {
      throw new Error(
        `PaymentIntent capture failed with status: ${paymentIntent.status}`
      );
    }

    // Calculate amounts
    const totalAmount = payment.amount; // Total charged to guest in cents
    const platformFee = booking.platform_fee_amount || 0;
    const hostAmount = totalAmount - platformFee;

    if (hostAmount <= 0) {
      throw new Error(
        `Invalid host amount calculated: ${hostAmount} (total: ${totalAmount}, fee: ${platformFee})`
      );
    }

    console.log(
      `[AutoCapture] Amount breakdown - Total: ${totalAmount}, Platform Fee: ${platformFee}, Host Amount: ${hostAmount}`
    );

    // Transfer to host's Stripe Connect account
    const listingTitle = booking.listings.title || "Unknown";

    const transferParams = new URLSearchParams({
      amount: hostAmount.toString(),
      currency: "aud",
      destination: hostData.stripe_account_id,
      "metadata[booking_id]": bookingId,
      "metadata[type]": "booking_payment",
      "metadata[listing_title]": listingTitle,
    });

    const transferResponse = await fetch("https://api.stripe.com/v1/transfers", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${stripeSecretKey}`,
        "Content-Type": "application/x-www-form-urlencoded",
        // Shared with the Next.js capture paths so the host can never be
        // paid out twice for the same booking.
        "Idempotency-Key": `booking-payout-${bookingId}`,
      },
      body: transferParams.toString(),
    });

    if (!transferResponse.ok) {
      const errorData = await transferResponse.json();
      throw new Error(
        `Transfer failed: ${errorData.error?.message || transferResponse.statusText}`
      );
    }

    const transfer = await transferResponse.json();

    // Update payment status in database
    const { error: updateError } = await supabase
      .from("payments")
      .update({
        status: "captured",
        auto_capture_scheduled_at: null,
      })
      .eq("id", payment.id);

    if (updateError) {
      console.error("[AutoCapture] Failed to update payment status:", updateError);
      // Don't throw - transfer succeeded
    }

    // Auto-release deposit if no dispute was reported
    if (payment.stripe_deposit_intent_id && !payment.dispute_reported_at) {
      try {
        console.log(
          `[AutoCapture] Auto-releasing deposit ${payment.stripe_deposit_intent_id}`
        );

        const cancelResponse = await fetch(
          `https://api.stripe.com/v1/payment_intents/${payment.stripe_deposit_intent_id}/cancel`,
          {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${stripeSecretKey}`,
              "Content-Type": "application/x-www-form-urlencoded",
            },
          }
        );

        if (cancelResponse.ok) {
          await supabase
            .from("payments")
            .update({
              deposit_released_at: new Date().toISOString(),
            })
            .eq("id", payment.id);

          console.log("[AutoCapture] Deposit released successfully");
        } else {
          console.error("[AutoCapture] Failed to cancel deposit intent");
        }
      } catch (depositError: any) {
        console.error("[AutoCapture] Failed to auto-release deposit:", depositError);
        // Don't fail the whole operation
      }
    }

    return {
      success: true,
      captured: true,
      transferId: transfer.id,
    };
  } catch (error: any) {
    console.error("[AutoCapture] Error capturing and transferring:", error);
    return {
      success: false,
      captured: false,
      error: error.message || "Failed to capture and transfer payment",
    };
  }
}

/**
 * Process a single booking's payment
 */
async function autoCaptureWithReviewWindow(
  supabase: any,
  bookingId: string,
  stripeSecretKey: string
): Promise<{
  success: boolean;
  skipped?: boolean;
  captured?: boolean;
  transferId?: string;
  reason?: string;
  error?: string;
}> {
  try {
    // Fetch booking and payment with all related data
    const { data: booking, error: bookingError } = await supabase
      .from("bookings")
      .select(
        `
        id,
        status,
        end_at,
        total_amount,
        platform_fee_amount,
        deposit_amount,
        listings!inner(
          host_id,
          title
        ),
        payments!inner(
          id,
          status,
          stripe_payment_intent_id,
          stripe_deposit_intent_id,
          amount,
          deposit_amount,
          review_window_ends_at,
          dispute_reported_at,
          auto_capture_scheduled_at,
          capture_hold_reason
        )
      `
      )
      .eq("id", bookingId)
      .single();

    if (bookingError || !booking) {
      return {
        success: false,
        skipped: true,
        reason: "Booking not found",
        error: bookingError?.message,
      };
    }

    const bookingData = booking as Booking & { payments: Payment[] };

    // Only process if booking is COMPLETED
    if (bookingData.status !== "COMPLETED") {
      return {
        success: false,
        skipped: true,
        reason: `Booking not completed (status: ${bookingData.status})`,
      };
    }

    const payment = bookingData.payments[0];
    if (!payment) {
      return {
        success: false,
        skipped: true,
        reason: "No payment record found for booking",
      };
    }

    // Only process authorised payments
    if (payment.status !== "authorised") {
      return {
        success: false,
        skipped: true,
        reason: `Payment not authorised (status: ${payment.status})`,
      };
    }

    // Check if dispute was reported
    if (payment.dispute_reported_at) {
      return {
        success: false,
        skipped: true,
        reason: "Dispute reported - manual review required",
        error: payment.capture_hold_reason || "Dispute reported",
      };
    }

    // Determine review window end time
    let reviewWindowEndsAt: Date;
    if (payment.review_window_ends_at) {
      reviewWindowEndsAt = new Date(payment.review_window_ends_at);
    } else {
      // Calculate from booking end time if not set
      const bookingEndTime = new Date(bookingData.end_at);
      reviewWindowEndsAt = new Date(
        bookingEndTime.getTime() + REVIEW_WINDOW_HOURS * 3600000
      );

      // Set review window in database
      await supabase
        .from("payments")
        .update({
          review_window_ends_at: reviewWindowEndsAt.toISOString(),
          auto_capture_scheduled_at: reviewWindowEndsAt.toISOString(),
        })
        .eq("id", payment.id);
    }

    const now = new Date();

    // Check if review window has ended
    if (now < reviewWindowEndsAt) {
      return {
        success: true,
        skipped: true,
        reason: `Review window active until ${reviewWindowEndsAt.toISOString()}`,
      };
    }

    // Review window has passed - proceed with automatic capture
    console.log(
      `[AutoCapture] Review window expired for booking ${bookingId}. Proceeding with capture.`
    );

    const result = await captureAndTransferToHost(
      supabase,
      bookingId,
      payment,
      bookingData,
      stripeSecretKey
    );

    return {
      ...result,
      reason: result.success
        ? "Payment captured and transferred to host successfully"
        : result.error,
    };
  } catch (error: any) {
    console.error("[AutoCapture] Error in autoCaptureWithReviewWindow:", error);
    return {
      success: false,
      skipped: false,
      error: error.message || "Unknown error during auto-capture",
    };
  }
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Verify authentication
    const authHeader = req.headers.get("authorization") ?? "";
    const cronSecret = Deno.env.get("CRON_SECRET") ?? "";

    if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
      console.error("[CRON] Unauthorized request");
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const stripeSecretKey = Deno.env.get("STRIPE_SECRET_KEY");

    if (!supabaseUrl || !supabaseServiceRoleKey || !stripeSecretKey) {
      throw new Error(
        "Missing required environment variables (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, or STRIPE_SECRET_KEY)"
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    console.log("[AutoCapture] Starting auto-capture check");

    // Find payments ready for capture
    const readyPayments = await findPaymentsReadyForCapture(supabase);

    if (readyPayments.length === 0) {
      console.log("[AutoCapture] No payments ready for capture");
      return new Response(
        JSON.stringify({
          success: true,
          processed: 0,
          results: [],
          message: "No payments ready for capture",
          timestamp: new Date().toISOString(),
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    console.log(
      `[AutoCapture] Found ${readyPayments.length} payments ready for capture`
    );

    // Process each payment
    const results = [];
    for (const payment of readyPayments) {
      try {
        const result = await autoCaptureWithReviewWindow(
          supabase,
          payment.booking_id,
          stripeSecretKey
        );
        results.push({
          bookingId: payment.booking_id,
          paymentId: payment.id,
          ...result,
        });

        if (result.captured) {
          console.log(
            `[AutoCapture] Successfully captured payment for booking ${payment.booking_id}`
          );
        } else if (result.skipped) {
          console.log(
            `[AutoCapture] Skipped booking ${payment.booking_id}: ${result.reason}`
          );
        }
      } catch (error: any) {
        console.error(
          `[AutoCapture] Error processing booking ${payment.booking_id}:`,
          error
        );
        results.push({
          bookingId: payment.booking_id,
          paymentId: payment.id,
          success: false,
          error: error.message || "Unknown error",
        });
      }
    }

    const successCount = results.filter(
      (r) => r.success && "captured" in r && r.captured
    ).length;
    const skippedCount = results.filter(
      (r) => "skipped" in r && r.skipped
    ).length;
    const errorCount = results.filter(
      (r) => !r.success && !("skipped" in r && r.skipped)
    ).length;

    console.log(
      `[AutoCapture] Completed: ${successCount} captured, ${skippedCount} skipped, ${errorCount} errors`
    );

    return new Response(
      JSON.stringify({
        success: true,
        processed: readyPayments.length,
        captured: successCount,
        skipped: skippedCount,
        errors: errorCount,
        results,
        timestamp: new Date().toISOString(),
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error: any) {
    console.error("[AutoCapture] Unexpected error:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message || "Internal server error",
        timestamp: new Date().toISOString(),
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
