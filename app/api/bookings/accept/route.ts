import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

    if (process.env.NODE_ENV !== "production") {
      console.log("[Accept Booking] Request:", { bookingId, hostId: user.id });
    }

    // Check if host has completed Stripe onboarding
    const { data: host } = await supabase
      .from("hosts")
      .select("*")
      .eq("user_id", user.id)
      .single();

    if (!host || host.stripe_onboarding_status !== "complete") {
      return NextResponse.json(
        {
          error: "STRIPE_ONBOARDING_REQUIRED",
          message: "You must complete Stripe onboarding before accepting bookings",
        },
        { status: 400 }
      );
    }

    // Accept booking using existing function
    const { data: booking, error: bookingError } = await supabase.rpc("accept_booking", {
      p_booking_id: bookingId,
      p_host_id: user.id,
    });

    if (bookingError) {
      return NextResponse.json(
        { error: bookingError.message },
        { status: 400 }
      );
    }

    if (process.env.NODE_ENV !== "production") {
      console.log("[Accept Booking] Accepted:", {
        bookingId,
        status: booking?.status,
        payment_deadline_at: booking?.payment_deadline_at,
      });
    }

    // Payment initiation will be handled by frontend calling /api/payments/initiate
    // This keeps the accept flow separate from payment processing

    return NextResponse.json({ success: true, booking });
  } catch (error: any) {
    console.error("Accept booking error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to accept booking" },
      { status: 500 }
    );
  }
}
