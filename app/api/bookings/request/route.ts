import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  sendHostBookingRequestedEmail,
  type BookingEmailData,
} from "@/lib/email/send";
import { validate as validateBookingTime } from "@/lib/bookingTimeRules";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const {
      listing_id,
      start_time,
      end_time,
      guests_count,
      guest_ack_toilet_access,
      guest_ack_consumables_policy,
    } = body;

    // Validation
    if (!listing_id || !start_time || !end_time || !guests_count) {
      return NextResponse.json(
        { error: "Missing required fields: listing_id, start_time, end_time, guests_count" },
        { status: 400 }
      );
    }

    const startAt = new Date(start_time);
    const endAt = new Date(end_time);
    const now = new Date();

    // Validate wall-clock times in the listing timezone (Australia/Sydney),
    // matching the database's create_booking_request checks. Using the
    // server's local timezone here (e.g. UTC on Vercel) rejected valid
    // bookings and passed invalid ones.
    const TIMEZONE = "Australia/Sydney";
    const zonedParts = (date: Date) => {
      const formatter = new Intl.DateTimeFormat("en-CA", {
        timeZone: TIMEZONE,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      });
      const parts = Object.fromEntries(
        formatter.formatToParts(date).map((p) => [p.type, p.value])
      );
      return {
        date: `${parts.year}-${parts.month}-${parts.day}`,
        // Intl can render midnight as "24"
        minutes: (parseInt(parts.hour, 10) % 24) * 60 + parseInt(parts.minute, 10),
      };
    };

    const startLocal = zonedParts(startAt);
    const endLocal = zonedParts(endAt);

    // Day-use only: same local calendar date
    if (startLocal.date !== endLocal.date) {
      return NextResponse.json(
        {
          error: "Overnight bookings are not permitted",
          errors: ["Bookings must start and end on the same day (day-use only, no overnight)"],
        },
        { status: 400 }
      );
    }

    const startMinutes = startLocal.minutes;
    const endMinutes = endLocal.minutes;
    const validationResult = validateBookingTime({
      date: startLocal.date,
      startMinutes,
      endMinutes,
      now,
      startAt,
    });
    
    if (!validationResult.ok) {
      return NextResponse.json(
        {
          error: validationResult.errors[0] || "Invalid booking request",
          errors: validationResult.errors,
        },
        { status: 400 }
      );
    }

    // Fetch listing to get pricing and host info
    const { data: listing, error: listingError } = await supabase
      .from("listings")
      .select("id, host_id, title, hourly_rate, half_day_rate, full_day_rate, deposit_amount")
      .eq("id", listing_id)
      .single();

    if (listingError || !listing) {
      return NextResponse.json(
        { error: "Listing not found" },
        { status: 404 }
      );
    }

    // Check availability (no conflicts with PAYMENT_PENDING or CONFIRMED)
    const { data: isAvailable, error: availabilityError } = await supabase.rpc(
      "is_time_slot_available",
      {
        p_listing_id: listing_id,
        p_start_at: startAt.toISOString(),
        p_end_at: endAt.toISOString(),
        p_booking_id: null,
      }
    );

    if (availabilityError) {
      console.error("[Booking Request] Availability check error:", availabilityError);
      return NextResponse.json(
        { error: "Failed to check availability" },
        { status: 500 }
      );
    }

    if (!isAvailable) {
      return NextResponse.json(
        {
          error: "TIME_SLOT_UNAVAILABLE",
          message: "This time slot is no longer available",
        },
        { status: 409 }
      );
    }

    // Guests must acknowledge the toilet access and consumables policies.
    // These are persisted on the booking; the DB CHECK constraint requires
    // them before a booking can be CONFIRMED.
    if (!guest_ack_toilet_access || !guest_ack_consumables_policy) {
      return NextResponse.json(
        { error: "You must acknowledge the toilet access and consumables policies" },
        { status: 400 }
      );
    }

    // Create booking via RPC (derives host/listing, enforces rules, computes pricing)
    const { data: booking, error: bookingError } = await supabase.rpc(
      "create_booking_request",
      {
        p_listing_id: listing_id,
        p_start_at: startAt.toISOString(),
        p_end_at: endAt.toISOString(),
        p_guests_count: guests_count,
        p_guest_ack_toilet_access: true,
        p_guest_ack_consumables_policy: true,
      }
    );

    if (bookingError) {
      console.error("[Booking Request] Create booking error:", bookingError);
      // Preserve the existing UI contract for availability conflicts
      if (bookingError.message?.includes("TIME_SLOT_UNAVAILABLE")) {
        return NextResponse.json(
          {
            error: "TIME_SLOT_UNAVAILABLE",
            message: "This time slot is no longer available",
          },
          { status: 409 }
        );
      }
      return NextResponse.json(
        { error: bookingError.message || "Failed to create booking" },
        { status: 500 }
      );
    }

    // Log booking event
    try {
      await supabase.rpc("log_booking_event", {
        p_booking_id: booking.id,
        p_event_type: "REQUESTED",
        p_actor_id: user.id,
        p_payload: {
          listing_id,
          start_time: startAt.toISOString(),
          end_time: endAt.toISOString(),
          guests_count,
          total_amount: booking.total_amount,
        },
      });
    } catch (eventError) {
      // Log but don't fail - event logging is best effort
      console.error("[Booking Request] Failed to log event:", eventError);
    }

    // Fetch host profile for email
    const { data: hostProfile } = await supabase
      .from("profiles")
      .select("id, full_name")
      .eq("id", listing.host_id)
      .single();

    // Fetch guest profile for email
    const { data: guestProfile } = await supabase
      .from("profiles")
      .select("id, full_name")
      .eq("id", user.id)
      .single();

    // Fetch host user email from auth (using admin client)
    const { createAdminClient } = await import("@/lib/supabase/admin");
    const adminClient = createAdminClient();
    const { data: hostUser } = await adminClient.auth.admin.getUserById(listing.host_id);
    const hostEmail = hostUser?.user?.email;

    // Send email to host (async - don't wait)
    if (hostEmail) {
      const emailData: BookingEmailData = {
        bookingId: booking.id,
        guestName: guestProfile?.full_name || "Guest",
        hostName: hostProfile?.full_name || "Host",
        listingTitle: listing.title,
        startTime: startAt.toISOString(),
        endTime: endAt.toISOString(),
        totalAmount: booking.total_amount,
      };

      sendHostBookingRequestedEmail(hostEmail, hostProfile?.full_name || "Host", emailData).catch(
        (emailError) => {
          console.error("[Booking Request] Failed to send email:", emailError);
          // Don't fail the request if email fails
        }
      );
    }

    // Create in-app notification for host (async - don't wait)
    const { createNotification } = await import("@/lib/notifications/create");
    createNotification({
      userId: listing.host_id,
      type: "BOOKING_REQUESTED",
      title: "New booking request",
      body: `${guestProfile?.full_name || "A guest"} requested to book "${listing.title}"`,
      href: `/host/dashboard?tab=requests`,
      entityType: "booking",
      entityId: booking.id,
      dedupeKey: `booking:${booking.id}:requested`,
    }).catch((notifError) => {
      console.error("[Booking Request] Failed to create notification:", notifError);
      // Don't fail the request if notification fails
    });

    return NextResponse.json({
      success: true,
      booking,
    });
  } catch (error: any) {
    console.error("[Booking Request] Unexpected error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to create booking request" },
      { status: 500 }
    );
  }
}
