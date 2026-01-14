// API route to send expiry notifications for bookings
// Called by the expiry cron job or can be called manually
// Sends emails to guests whose bookings expired

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendGuestPaymentExpiredEmail, type BookingEmailData } from "@/lib/email/send";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    // Verify authentication (can be called by cron job with CRON_SECRET)
    const authHeader = request.headers.get("authorization") ?? "";
    const cronSecret = process.env.CRON_SECRET ?? "";

    if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const supabase = await createClient();
    const adminClient = createAdminClient();

    // Find recently expired bookings (within last hour) that haven't had emails sent
    const oneHourAgo = new Date();
    oneHourAgo.setHours(oneHourAgo.getHours() - 1);

    const { data: expiredBookings, error } = await supabase
      .from("bookings")
      .select(`
        id,
        guest_id,
        start_at,
        end_at,
        total_amount,
        expired_at,
        listings!inner(
          id,
          title
        )
      `)
      .eq("status", "EXPIRED")
      .gte("expired_at", oneHourAgo.toISOString())
      .order("expired_at", { ascending: false });

    if (error) {
      console.error("[ExpireNotifications] Error fetching expired bookings:", error);
      return NextResponse.json(
        { error: "Failed to fetch expired bookings" },
        { status: 500 }
      );
    }

    if (!expiredBookings || expiredBookings.length === 0) {
      return NextResponse.json({
        success: true,
        processed: 0,
        message: "No expired bookings to notify",
      });
    }

    const results = [];

    for (const booking of expiredBookings) {
      try {
        const listing = (booking.listings as unknown as { id: string; title: string });

        // Fetch guest profile and email
        const { data: guestProfile } = await supabase
          .from("profiles")
          .select("full_name")
          .eq("id", booking.guest_id)
          .single();

        const { data: guestUser } = await adminClient.auth.admin.getUserById(booking.guest_id);
        const guestEmail = guestUser?.user?.email;

        if (guestEmail) {
          const emailData: BookingEmailData = {
            bookingId: booking.id,
            guestName: guestProfile?.full_name || "Guest",
            hostName: "Host",
            listingTitle: listing.title,
            startTime: booking.start_at,
            endTime: booking.end_at,
            totalAmount: booking.total_amount,
          };

          await sendGuestPaymentExpiredEmail(guestEmail, guestProfile?.full_name || "Guest", emailData);
          results.push({ bookingId: booking.id, emailSent: true });
        } else {
          results.push({ bookingId: booking.id, emailSent: false, reason: "No email found" });
        }
      } catch (err: any) {
        console.error(`[ExpireNotifications] Error processing booking ${booking.id}:`, err);
        results.push({ bookingId: booking.id, emailSent: false, error: err.message });
      }
    }

    return NextResponse.json({
      success: true,
      processed: expiredBookings.length,
      results,
    });
  } catch (error: any) {
    console.error("[ExpireNotifications] Unexpected error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to send expiry notifications" },
      { status: 500 }
    );
  }
}
