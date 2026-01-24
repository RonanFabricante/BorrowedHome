import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  sendHostBookingRequestedEmail,
  type BookingEmailData,
} from "@/lib/email/send";

export const dynamic = "force-dynamic";

const MINIMUM_LEAD_TIME_HOURS = 4;

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { listing_id, start_time, end_time, guests_count, message } = body;

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

    // Validate minimum lead time (4 hours)
    const hoursUntilStart = (startAt.getTime() - now.getTime()) / (1000 * 60 * 60);
    if (hoursUntilStart < MINIMUM_LEAD_TIME_HOURS) {
      return NextResponse.json(
        {
          error: "MINIMUM_LEAD_TIME_VIOLATION",
          message: `Bookings must be requested at least ${MINIMUM_LEAD_TIME_HOURS} hours before the start time.`,
        },
        { status: 400 }
      );
    }

    // Validate end > start
    if (endAt <= startAt) {
      return NextResponse.json(
        { error: "End time must be after start time" },
        { status: 400 }
      );
    }

    // Validate minimum duration (2 hours)
    const hours = (endAt.getTime() - startAt.getTime()) / (1000 * 60 * 60);
    if (hours < 2) {
      return NextResponse.json(
        { error: "Minimum booking duration is 2 hours" },
        { status: 400 }
      );
    }

    // Validate maximum duration (11 hours)
    if (hours > 11) {
      return NextResponse.json(
        { error: "Maximum booking duration is 11 hours" },
        { status: 400 }
      );
    }

    // Validate start time is at or after 7am
    const startHour = startAt.getHours();
    if (startHour < 7) {
      return NextResponse.json(
        { error: "Earliest start time is 7:00 AM (day-use only)" },
        { status: 400 }
      );
    }

    // Validate day-use constraint (end by 6pm)
    const endHour = endAt.getHours();
    const endMinutes = endAt.getMinutes();
    if (endHour > 18 || (endHour === 18 && endMinutes > 0)) {
      return NextResponse.json(
        { error: "Bookings must end by 6:00 PM (day-use only)" },
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

    // Calculate pricing (hours already calculated above for validation)
    let basePrice = 0;
    if (hours >= 8) {
      basePrice = listing.full_day_rate;
    } else if (hours >= 4) {
      basePrice = listing.half_day_rate;
    } else {
      basePrice = Math.round(listing.hourly_rate * hours);
    }

    const platformFee = Math.round(basePrice * 0.1); // 10% platform fee
    const totalAmount = basePrice + platformFee;
    const depositAmount = listing.deposit_amount || 0;

    // Create booking with REQUESTED status
    const { data: booking, error: bookingError } = await supabase
      .from("bookings")
      .insert({
        listing_id,
        guest_id: user.id,
        start_at: startAt.toISOString(),
        end_at: endAt.toISOString(),
        status: "REQUESTED",
        requested_at: now.toISOString(),
        guests_count,
        total_amount: totalAmount,
        platform_fee_amount: platformFee,
        deposit_amount: depositAmount,
      })
      .select()
      .single();

    if (bookingError) {
      console.error("[Booking Request] Create booking error:", bookingError);
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
          total_amount: totalAmount,
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
        totalAmount,
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
