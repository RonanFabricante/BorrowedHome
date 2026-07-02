import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Cron job: Mark past CONFIRMED bookings as COMPLETED
 * Runs every hour to catch any bookings that need completion
 * 
 * Set up in Vercel Dashboard or vercel.json crons array:
 * - Path: /api/cron/complete-bookings
 * - Schedule: 0 * * * * (every hour at minute 0)
 */
export async function GET(request: NextRequest) {
  try {
    // Verify cron secret for security (fail closed if not configured)
    const authHeader = request.headers.get("authorization");
    const cronSecret = process.env.CRON_SECRET;

    if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
      console.error("[Cron] Unauthorized cron request");
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // No user session in cron; use service-role client
    const supabase = createAdminClient();

    // Mark completed bookings
    const { error } = await supabase.rpc("mark_past_bookings_completed");

    if (error) {
      console.error("[Cron] Error marking bookings as completed:", error);
      return NextResponse.json(
        { error: error.message, success: false },
        { status: 500 }
      );
    }

    console.log("[Cron] Successfully completed past bookings check");

    return NextResponse.json({
      success: true,
      message: "Bookings completion check completed",
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error("[Cron] Unexpected error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error", success: false },
      { status: 500 }
    );
  }
}
