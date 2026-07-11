"use client";

import {
  BookingCard,
  guestBookingActions,
} from "@/components/booking-card";
import { EmptyState } from "@/components/empty-state";
import { bookingSection } from "@/lib/bookings/grouping";

export type BookingRow = {
  id: string;
  status: string;
  start_at: string;
  end_at: string;
  guests_count: number;
  total_amount: number;
  currency?: string;
  listings?: {
    id: string;
    title: string;
    location_text?: string;
    photo_url?: string | null;
  } | null;
};

export function MyBookingsList({ bookings }: { bookings: BookingRow[] }) {
  const safe = (bookings || []).filter((b) => b?.listings);

  if (safe.length === 0) {
    return (
      <EmptyState
        title="no bookings yet — borrow your first space"
        description="Find a kitchen, living room, or garden for the day. No overnight stays."
        actionLabel="Browse homes"
        actionHref="/listings"
      />
    );
  }

  const awaiting = safe
    .filter((b) => bookingSection(b) === "awaiting")
    .sort((a, b) => +new Date(a.start_at) - +new Date(b.start_at));
  const upcoming = safe
    .filter((b) => bookingSection(b) === "upcoming")
    .sort((a, b) => +new Date(a.start_at) - +new Date(b.start_at));
  const past = safe
    .filter((b) => bookingSection(b) === "past")
    .sort((a, b) => +new Date(b.start_at) - +new Date(a.start_at));

  return (
    <div className="space-y-10">
      <Section label="awaiting payment" items={awaiting} />
      <Section label="upcoming" items={upcoming} />
      <Section label="past" items={past} />
    </div>
  );
}

function Section({ label, items }: { label: string; items: BookingRow[] }) {
  if (!items.length) return null;
  return (
    <section>
      <div className="mb-4 flex items-center gap-3">
        <h2 className="bh-micro">{label}</h2>
        <div className="h-px flex-1 bg-border" aria-hidden />
        <span className="bh-data text-xs text-muted-foreground">{items.length}</span>
      </div>
      <ul className="space-y-3">
        {items.map((booking) => {
          const listing = booking.listings!;
          return (
            <li key={booking.id}>
              <BookingCard
                id={booking.id}
                title={listing.title || "Listing unavailable"}
                locationText={listing.location_text}
                status={booking.status}
                startAt={booking.start_at}
                endAt={booking.end_at}
                guestsCount={booking.guests_count}
                totalAmount={booking.total_amount}
                currency={booking.currency}
                photoUrl={listing.photo_url}
                actions={guestBookingActions(booking)}
              />
            </li>
          );
        })}
      </ul>
    </section>
  );
}
