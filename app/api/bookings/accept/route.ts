import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireHostStripeReady } from "@/lib/stripe/refreshHostStatus";
import {
  assertNotSuspended,
  suspendedResponse,
} from "@/lib/auth/assertNotSuspended";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

    if (process.env.NODE_ENV !== "production") {
      console.log("[Accept Booking] Request:", { bookingId, hostId: user.id });
    }

    const { data: host } = await supabase
      .from("hosts")
      .select("stripe_account_id")
      .eq("user_id", user.id)
      .single();

    try {
      await requireHostStripeReady(user.id, host?.stripe_account_id);
    } catch (stripeErr: any) {
      return NextResponse.json(
        {
          error: stripeErr.code || "STRIPE_ONBOARDING_REQUIRED",
          message:
            stripeErr.message ||
            "You must complete Stripe onboarding before accepting bookings",
          details: stripeErr.details,
        },
        { status: 400 }
      );
    }

    const { data: booking, error: bookingError } = await supabase.rpc(
      "accept_booking",
      {
        p_booking_id: bookingId,
        p_host_id: user.id,
      }
    );

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

    return NextResponse.json({ success: true, booking });
  } catch (error: any) {
    const suspended = suspendedResponse(error);
    if (suspended) return suspended;
    console.error("Accept booking error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to accept booking" },
      { status: 500 }
    );
  }
}
