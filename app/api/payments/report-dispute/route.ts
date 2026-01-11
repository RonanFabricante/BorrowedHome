import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DISPUTE_EXTENSION_HOURS = 48; // Extend review window by 48 hours when dispute reported

/**
 * Report a dispute for a booking
 * Extends review window and holds automatic payment capture
 * Can be called by either guest or host
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { bookingId, reason } = await request.json();

    if (!bookingId) {
      return NextResponse.json(
        { error: "bookingId is required" },
        { status: 400 }
      );
    }

    if (!reason || reason.trim().length === 0) {
      return NextResponse.json(
        { error: "Dispute reason is required" },
        { status: 400 }
      );
    }

    // Verify user is either guest or host for this booking
    const { data: booking, error: bookingError } = await supabase
      .from("bookings")
      .select(
        `
        id,
        guest_id,
        status,
        listings!inner(host_id)
      `
      )
      .eq("id", bookingId)
      .single();

    if (bookingError || !booking) {
      return NextResponse.json(
        { error: "Booking not found" },
        { status: 404 }
      );
    }

    // Extract listings with type assertion (cast through unknown for safety)
    const listings = booking.listings as unknown as { host_id: string };

    const isGuest = booking.guest_id === user.id;
    const isHost = listings.host_id === user.id;

    if (!isGuest && !isHost) {
      return NextResponse.json(
        { error: "Unauthorized - must be guest or host for this booking" },
        { status: 403 }
      );
    }

    // Only allow disputes for COMPLETED bookings with authorised payments
    if (booking.status !== "COMPLETED") {
      return NextResponse.json(
        { error: "Disputes can only be reported for completed bookings" },
        { status: 400 }
      );
    }

    // Get payment record
    const { data: payment, error: paymentError } = await supabase
      .from("payments")
      .select("id, status, review_window_ends_at, dispute_reported_at")
      .eq("booking_id", bookingId)
      .single();

    if (paymentError || !payment) {
      return NextResponse.json(
        { error: "Payment record not found" },
        { status: 404 }
      );
    }

    if (payment.status !== "authorised") {
      return NextResponse.json(
        {
          error: `Disputes can only be reported for authorised payments (current status: ${payment.status})`,
        },
        { status: 400 }
      );
    }

    // Check if dispute already reported
    if (payment.dispute_reported_at) {
      return NextResponse.json(
        {
          error: "Dispute already reported for this booking",
          reportedAt: payment.dispute_reported_at,
        },
        { status: 400 }
      );
    }

    // Calculate extended review window
    const currentWindowEnd = payment.review_window_ends_at
      ? new Date(payment.review_window_ends_at)
      : new Date(Date.now() + 24 * 3600000); // Default 24 hours if not set

    const extendedWindowEnd = new Date(
      currentWindowEnd.getTime() + DISPUTE_EXTENSION_HOURS * 3600000
    );

    // Update payment record
    const { error: updateError } = await supabase
      .from("payments")
      .update({
        dispute_reported_at: new Date().toISOString(),
        review_window_ends_at: extendedWindowEnd.toISOString(),
        auto_capture_scheduled_at: extendedWindowEnd.toISOString(),
        capture_hold_reason: reason.trim().substring(0, 500), // Limit length
      })
      .eq("id", payment.id);

    if (updateError) {
      console.error("[Dispute] Failed to update payment:", updateError);
      return NextResponse.json(
        { error: "Failed to report dispute" },
        { status: 500 }
      );
    }

    // TODO: Send notification to admin/staff for review
    // TODO: Send notification to the other party (guest/host)

    console.log(
      `[Dispute] Dispute reported for booking ${bookingId} by user ${user.id}. Extended review window to ${extendedWindowEnd.toISOString()}`
    );

    return NextResponse.json({
      success: true,
      message: "Dispute reported successfully",
      extendedReviewWindowEnd: extendedWindowEnd.toISOString(),
      reportedBy: isGuest ? "guest" : "host",
    });
  } catch (error: any) {
    console.error("[Dispute] Error reporting dispute:", error);
    return NextResponse.json(
      { error: error.message || "Failed to report dispute" },
      { status: 500 }
    );
  }
}
