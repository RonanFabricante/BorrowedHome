import { NextRequest, NextResponse } from "next/server";
import { expireUnpaidBookings } from "@/lib/bookings/expireUnpaid";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Cron: expire unpaid PAYMENT_PENDING bookings past payment_deadline_at.
 *
 * Backup for the Supabase Edge Function `expire-bookings` (pg_cron).
 * Configure in Vercel Dashboard:
 * - Path: /api/cron/expire-bookings
 * - Schedule: every 5 minutes (cron: star-slash-5 * * * *)
 * - Authorization: Bearer {CRON_SECRET}
 */
export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get("authorization");
    const cronSecret = process.env.CRON_SECRET;

    if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
      console.error("[ExpireBookings Cron] Unauthorized");
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    console.log("[ExpireBookings Cron] Starting expiry check");
    const { expiredCount, expiredIds } = await expireUnpaidBookings();
    console.log(
      `[ExpireBookings Cron] Expired ${expiredCount} bookings:`,
      expiredIds
    );

    let notifications: unknown = null;
    if (expiredCount > 0) {
      try {
        const origin = request.nextUrl.origin;
        const cleanupRes = await fetch(
          `${origin}/api/bookings/expire-notifications`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${cronSecret}`,
              "Content-Type": "application/json",
            },
          }
        );
        notifications = await cleanupRes.json().catch(() => null);
        if (!cleanupRes.ok) {
          console.error(
            "[ExpireBookings Cron] expire-notifications failed:",
            notifications
          );
        }
      } catch (cleanupError) {
        console.error(
          "[ExpireBookings Cron] expire-notifications error:",
          cleanupError
        );
      }
    }

    return NextResponse.json({
      success: true,
      expired_count: expiredCount,
      expired_ids: expiredIds,
      notifications,
      timestamp: new Date().toISOString(),
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Internal error";
    console.error("[ExpireBookings Cron] Unexpected error:", error);
    return NextResponse.json(
      { error: message, success: false },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  return GET(request);
}
