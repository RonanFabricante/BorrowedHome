"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { BookingCard, type BookingCardAction } from "@/components/booking-card";
import { BookingThumb } from "@/components/booking-thumb";
import { StatusChip } from "@/components/status-chip";
import { EmptyState } from "@/components/empty-state";
import { formatCurrency, cn } from "@/lib/utils";
import { normalizeBookingStatus } from "@/lib/bookingStatus";

export function MyListingsList({
  listings,
  pendingBookings,
  confirmedBookings,
  declinedBookings,
  otherBookings,
  listingsWithActiveBookings,
}: {
  listings: any[];
  pendingBookings: any[];
  confirmedBookings: any[];
  declinedBookings: any[];
  otherBookings: any[];
  listingsWithActiveBookings: Set<string>;
  hostId?: string;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();

  const acceptBooking = useMutation({
    mutationFn: async (bookingId: string) => {
      const response = await fetch("/api/bookings/respond", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ booking_id: bookingId, action: "accept" }),
      });
      const data = await response.json();
      if (!response.ok) {
        if (data.error === "STRIPE_ONBOARDING_REQUIRED") {
          throw new Error("STRIPE_ONBOARDING_REQUIRED");
        }
        throw new Error(data.message || data.error || "Failed to accept booking");
      }
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["bookings"] });
      queryClient.invalidateQueries({ queryKey: ["listings"] });
      router.refresh();
    },
    onError: (error: any) => {
      if (error.message === "STRIPE_ONBOARDING_REQUIRED") {
        router.push("/host/payouts");
      }
    },
  });

  const declineBooking = useMutation({
    mutationFn: async (bookingId: string) => {
      const response = await fetch("/api/bookings/respond", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ booking_id: bookingId, action: "reject" }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message || data.error || "Failed to decline booking");
      }
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["bookings"] });
      queryClient.invalidateQueries({ queryKey: ["listings"] });
      router.refresh();
    },
  });

  const hostActions = (booking: any, showAcceptDecline: boolean): BookingCardAction[] => {
    const status = normalizeBookingStatus(booking.status);
    const actions: BookingCardAction[] = [];
    const busy = acceptBooking.isPending || declineBooking.isPending;

    if (showAcceptDecline && (status === "REQUESTED" || status === "PENDING")) {
      actions.push({
        label: acceptBooking.isPending ? "Accepting…" : "Accept",
        primary: true,
        disabled: busy,
        onClick: () => acceptBooking.mutate(booking.id),
      });
      actions.push({
        label: declineBooking.isPending ? "Declining…" : "Decline",
        variant: "destructive",
        disabled: busy,
        onClick: () => declineBooking.mutate(booking.id),
      });
    } else if (status === "CONFIRMED") {
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
    return actions;
  };

  const toCard = (booking: any, showAcceptDecline: boolean) => {
    const listing = booking.listings;
    const guest = booking.profiles;
    if (!listing) return null;
    return (
      <BookingCard
        key={booking.id}
        id={booking.id}
        title={listing.title || "Listing"}
        locationText={listing.location_text}
        subtitle={`${(guest?.full_name || "Guest").toLowerCase()} · ${(listing.location_text || "").toLowerCase()}`}
        status={booking.status}
        startAt={booking.start_at}
        endAt={booking.end_at}
        guestsCount={booking.guests_count}
        totalAmount={booking.total_amount}
        currency={booking.currency}
        photoUrl={listing.photo_url}
        actions={hostActions(booking, showAcceptDecline)}
      />
    );
  };

  return (
    <div className="space-y-10">
      <BookingSection label="booking requests" items={pendingBookings.map((b) => toCard(b, true))} />
      <BookingSection label="confirmed" items={confirmedBookings.map((b) => toCard(b, false))} />
      <BookingSection label="awaiting payment & other" items={otherBookings.map((b) => toCard(b, false))} />
      <BookingSection label="declined" items={declinedBookings.map((b) => toCard(b, false))} />

      <section>
        <div className="mb-4 flex items-center gap-3">
          <h2 className="bh-micro">my listings</h2>
          <div className="h-px flex-1 bg-border" aria-hidden />
          <span className="bh-data text-xs text-muted-foreground">{listings.length}</span>
        </div>

        {listings.length === 0 ? (
          <EmptyState
            title="no listings yet — share a spare kitchen"
            description="List day-use spaces in your home. Guests book by the hour; you host on your terms."
            actionLabel="Create listing"
            actionHref="/host/onboard"
          />
        ) : (
          <ul className="space-y-3">
            {listings.filter(Boolean).map((listing) => (
              <li key={listing.id}>
                <ListingCard
                  listing={listing}
                  canEdit={!listingsWithActiveBookings.has(listing.id)}
                />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function BookingSection({
  label,
  items,
}: {
  label: string;
  items: (React.ReactNode | null)[];
}) {
  const filtered = items.filter(Boolean);
  if (!filtered.length) return null;
  return (
    <section>
      <div className="mb-4 flex items-center gap-3">
        <h2 className="bh-micro">{label}</h2>
        <div className="h-px flex-1 bg-border" aria-hidden />
        <span className="bh-data text-xs text-muted-foreground">{filtered.length}</span>
      </div>
      <ul className="space-y-3">
        {filtered.map((node, i) => (
          <li key={i}>{node}</li>
        ))}
      </ul>
    </section>
  );
}

function ListingCard({
  listing,
  canEdit,
}: {
  listing: any;
  canEdit: boolean;
}) {
  const spaces =
    listing.listing_spaces
      ?.map((s: any) => String(s.space_type).toLowerCase())
      .join(" · ") || "spaces tbd";

  return (
    <article
      className={cn(
        "group relative flex flex-col gap-4 rounded-[var(--radius-lg)] border border-border bg-card p-4",
        "transition-[border-color,box-shadow,transform] duration-200",
        "hover:border-[hsl(var(--color-accent-ink)/0.45)] hover:shadow-elevated hover:-translate-y-0.5",
        "focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2",
        "motion-reduce:transform-none sm:flex-row sm:items-center"
      )}
    >
      <Link
        href={`/listings/${listing.id}`}
        className="absolute inset-0 z-0 rounded-[var(--radius-lg)]"
        aria-label={`View listing: ${listing.title}`}
      />
      <BookingThumb
        src={listing.photo_url}
        alt=""
        className="relative z-[1] pointer-events-none"
      />
      <div className="relative z-[1] min-w-0 flex-1 pointer-events-none">
        <div className="mb-1 flex flex-wrap items-center gap-2">
          <h3 className="font-display text-xl font-bold lowercase tracking-tight line-clamp-1">
            {listing.title || "Untitled listing"}
          </h3>
          <StatusChip
            status={listing.published ? "published" : "draft"}
            kind="listing"
          />
        </div>
        <p className="bh-caption mb-3">
          {(listing.location_text || "").toLowerCase()}
        </p>
        <div className="flex flex-wrap gap-x-5 gap-y-2">
          <div>
            <div className="bh-micro mb-0.5">spaces</div>
            <div className="bh-data text-sm">{spaces}</div>
          </div>
          <div>
            <div className="bh-micro mb-0.5">guests</div>
            <div className="bh-data text-sm">up to {listing.max_guests}</div>
          </div>
          <div>
            <div className="bh-micro mb-0.5">from</div>
            <div className="bh-data text-sm font-semibold text-accent-ink">
              {formatCurrency(listing.hourly_rate, listing.currency)}/hr
            </div>
          </div>
        </div>
      </div>
      <div className="relative z-[2] flex w-full flex-row gap-2 sm:w-auto sm:flex-col">
        <Button asChild size="sm" className="w-full sm:w-auto">
          <Link href={`/listings/${listing.id}`}>View</Link>
        </Button>
        {canEdit ? (
          <Button asChild variant="ghost" size="sm" className="w-full sm:w-auto">
            <Link href={`/listings/${listing.id}/edit`}>Edit</Link>
          </Button>
        ) : (
          <Button variant="ghost" size="sm" disabled title="Active bookings block edits">
            Edit locked
          </Button>
        )}
      </div>
    </article>
  );
}
