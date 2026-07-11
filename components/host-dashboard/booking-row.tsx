"use client";

import { BookingCard, type BookingCardAction } from "@/components/booking-card";
import { HostBooking } from "@/lib/host/dashboard";
import { differenceInMinutes } from "date-fns";

interface BookingRowProps {
  booking: HostBooking;
  variant?: "default" | "request";
  onAccept?: (bookingId: string) => void;
  onDecline?: (bookingId: string) => void;
  processing?: boolean;
}

export function BookingRow({
  booking,
  variant = "default",
  onAccept,
  onDecline,
  processing = false,
}: BookingRowProps) {
  const isPaymentPending = booking.status === "PAYMENT_PENDING";
  const deadline = booking.payment_deadline_at
    ? new Date(booking.payment_deadline_at)
    : null;
  const minutesLeft = deadline
    ? differenceInMinutes(deadline, new Date())
    : null;

  let countdown: string | null = null;
  if (minutesLeft != null && minutesLeft >= 0) {
    if (minutesLeft < 60) countdown = `${minutesLeft}m left`;
    else {
      const hours = Math.floor(minutesLeft / 60);
      const mins = minutesLeft % 60;
      countdown = `${hours}h ${mins}m left`;
    }
  }

  const actions: BookingCardAction[] = [];
  if (variant === "request" && onAccept && onDecline) {
    actions.push({
      label: "Accept",
      primary: true,
      disabled: processing,
      onClick: () => onAccept(booking.id),
    });
    actions.push({
      label: "Decline",
      variant: "destructive",
      disabled: processing,
      onClick: () => onDecline(booking.id),
    });
  } else if (booking.status === "CONFIRMED") {
    actions.push({
      label: "Message guest",
      href: `/bookings/${booking.id}/messages`,
      primary: true,
    });
  }
  actions.push({
    label: "View details",
    href: `/bookings/${booking.id}/confirm`,
    variant: "ghost",
  });

  const guestName = (booking.guest?.full_name || "Guest").toLowerCase();
  const loc = (booking.listing?.location_text || "").toLowerCase();

  return (
    <BookingCard
      id={booking.id}
      title={booking.listing?.title || "Listing unavailable"}
      locationText={booking.listing?.location_text}
      subtitle={
        isPaymentPending && countdown
          ? `${guestName} · expires in ${countdown}`
          : `${guestName}${loc ? ` · ${loc}` : ""}`
      }
      status={booking.status}
      startAt={booking.start_at}
      endAt={booking.end_at}
      guestsCount={booking.guests_count}
      totalAmount={booking.total_amount}
      currency={booking.currency}
      actions={actions}
    />
  );
}
