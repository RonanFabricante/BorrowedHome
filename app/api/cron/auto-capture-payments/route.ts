import { NextRequest, NextResponse } from "next/server";
import {
  autoCaptureWithReviewWindow,
  findPaymentsReadyForCapture,
} from "@/lib/payments/auto-capture";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Cron job: Auto-capture payments after review window expires
 * Runs every 30 minutes to check for payments ready for capture
 * Configure in Vercel Dashboard or vercel.json crons array
 * Path: /api/cron/auto-capture-payments
 * Schedule: every 30 minutes
 */
export async function GET(request: NextRequest) {
  try {
    // Verify cron secret for security
    const authHeader = request.headers.get("authorization");
    const cronSecret = process.env.CRON_SECRET;

    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      console.error("[AutoCapture Cron] Unauthorized cron request");
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    console.log("[AutoCapture Cron] Starting auto-capture check");

    // Find payments ready for capture
    const readyPayments = await findPaymentsReadyForCapture();

    if (readyPayments.length === 0) {
      console.log("[AutoCapture Cron] No payments ready for capture");
      return NextResponse.json({
        success: true,
        processed: 0,
        results: [],
        message: "No payments ready for capture",
      });
    }

    console.log(
      `[AutoCapture Cron] Found ${readyPayments.length} payments ready for capture`
    );

    // Process each payment
    const results = [];
    for (const payment of readyPayments) {
      try {
        const result = await autoCaptureWithReviewWindow(payment.booking_id);
        results.push({
          bookingId: payment.booking_id,
          paymentId: payment.id,
          ...result,
        });

        if (result.captured) {
          console.log(
            `[AutoCapture Cron] Successfully captured payment for booking ${payment.booking_id}`
          );
        } else if (result.skipped) {
          console.log(
            `[AutoCapture Cron] Skipped booking ${payment.booking_id}: ${result.reason}`
          );
        }
      } catch (error: any) {
        console.error(
          `[AutoCapture Cron] Error processing booking ${payment.booking_id}:`,
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

    const successCount = results.filter((r) => r.success && 'captured' in r && r.captured).length;
    const skippedCount = results.filter((r) => 'skipped' in r && r.skipped).length;
    const errorCount = results.filter((r) => !r.success && !('skipped' in r && r.skipped)).length;

    console.log(
      `[AutoCapture Cron] Completed: ${successCount} captured, ${skippedCount} skipped, ${errorCount} errors`
    );

    return NextResponse.json({
      success: true,
      processed: readyPayments.length,
      captured: successCount,
      skipped: skippedCount,
      errors: errorCount,
      results,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error("[AutoCapture Cron] Unexpected error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || "Internal server error",
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}
