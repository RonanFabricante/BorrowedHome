import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createNotification } from "@/lib/notifications/create";
import {
  assertNotSuspended,
  suspendedResponse,
} from "@/lib/auth/assertNotSuspended";

export const dynamic = "force-dynamic";

const MAX_MESSAGE_LENGTH = 2000;

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await assertNotSuspended(user.id);

    const body = await request.json();
    const { booking_id, message_body } = body;

    if (!booking_id || !message_body) {
      return NextResponse.json(
        { error: "booking_id and message_body are required" },
        { status: 400 }
      );
    }

    const trimmed = String(message_body).trim();
    if (!trimmed) {
      return NextResponse.json(
        { error: "message_body cannot be empty" },
        { status: 400 }
      );
    }
    if (trimmed.length > MAX_MESSAGE_LENGTH) {
      return NextResponse.json(
        { error: `Messages must be under ${MAX_MESSAGE_LENGTH} characters` },
        { status: 400 }
      );
    }

    // Verify booking exists and user is part of it
    const { data: booking, error: bookingError } = await supabase
      .from("bookings")
      .select(`
        id,
        guest_id,
        status,
        listings!inner(
          id,
          host_id,
          title
        )
      `)
      .eq("id", booking_id)
      .single();

    if (bookingError || !booking) {
      return NextResponse.json(
        { error: "Booking not found" },
        { status: 404 }
      );
    }

    const listing = booking.listings as unknown as { host_id: string; id: string; title: string };
    const isGuest = booking.guest_id === user.id;
    const isHost = listing.host_id === user.id;

    if (!isGuest && !isHost) {
      return NextResponse.json(
        { error: "You are not part of this booking" },
        { status: 403 }
      );
    }

    // Only allow messages for CONFIRMED bookings
    if (booking.status !== "CONFIRMED") {
      return NextResponse.json(
        { error: "Messages are only available for confirmed bookings" },
        { status: 400 }
      );
    }

    // Insert message
    const { data: message, error: messageError } = await supabase
      .from("messages")
      .insert({
        booking_id,
        sender_id: user.id,
        body: trimmed,
      })
      .select()
      .single();

    if (messageError) {
      console.error("[Send Message] Error:", messageError);
      return NextResponse.json(
        { error: "Failed to send message" },
        { status: 500 }
      );
    }

    // Determine recipient
    const recipientId = isGuest ? listing.host_id : booking.guest_id;

    // Anti-spam: Check if there's already an unread MESSAGE_RECEIVED notification
    // for this booking and user created in the last 2 minutes
    const twoMinutesAgo = new Date(Date.now() - 2 * 60 * 1000).toISOString();
    const { data: existingNotification } = await supabase
      .from("notifications")
      .select("id")
      .eq("user_id", recipientId)
      .eq("type", "MESSAGE_RECEIVED")
      .eq("entity_type", "booking")
      .eq("entity_id", booking_id)
      .is("read_at", null)
      .gte("created_at", twoMinutesAgo)
      .limit(1)
      .single();

    // Only create notification if no recent unread notification exists
    if (!existingNotification) {
      // Truncate message body for notification (max 100 chars)
      const truncatedBody = message_body.trim().length > 100
        ? message_body.trim().substring(0, 97) + "..."
        : message_body.trim();

      // Get sender name
      const { data: senderProfile } = await supabase
        .from("profiles")
        .select("full_name")
        .eq("id", user.id)
        .single();

      const senderName = senderProfile?.full_name || "Someone";

      // Create notification for recipient (async - don't wait)
      createNotification({
        userId: recipientId,
        type: "MESSAGE_RECEIVED",
        title: "New message",
        body: `${senderName}: ${truncatedBody}`,
        href: `/bookings/${booking_id}/messages`,
        entityType: "message",
        entityId: message.id,
        dedupeKey: `message:${message.id}:received`,
      }).catch((notifError) => {
        console.error("[Send Message] Failed to create notification:", notifError);
      });
    }

    return NextResponse.json({
      success: true,
      message,
    });
  } catch (error: any) {
    const suspended = suspendedResponse(error);
    if (suspended) return suspended;
    console.error("[Send Message] Unexpected error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
