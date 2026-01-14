"use client";

import { BookingRow } from "./booking-row";
import { EmptyState } from "./empty-state";
import { LoadingSkeleton } from "./loading-skeleton";
import { Building2 } from "lucide-react";
import { HostBooking } from "@/lib/host/dashboard";

interface BookingListProps {
  bookings: HostBooking[];
  loading: boolean;
  variant?: "default" | "request";
  onAccept?: (bookingId: string) => void;
  onDecline?: (bookingId: string) => void;
  processing?: string | null;
  searchQuery?: string;
  statusFilter?: string;
}

export function BookingList({
  bookings,
  loading,
  variant = "default",
  onAccept,
  onDecline,
  processing,
  searchQuery,
  statusFilter,
}: BookingListProps) {
  if (loading) {
    return <LoadingSkeleton count={5} />;
  }

  if (bookings.length === 0) {
    const hasFilters = searchQuery || (statusFilter && statusFilter !== "ALL");
    
    return (
      <EmptyState
        icon={Building2}
        title={hasFilters ? "No bookings found" : variant === "request" ? "No pending requests" : "No bookings yet"}
        description={
          hasFilters
            ? "Try adjusting your filters to see more results."
            : variant === "request"
            ? "You don't have any pending booking requests at the moment."
            : "Your bookings will appear here once guests make reservations."
        }
      />
    );
  }

  return (
    <div className="space-y-3">
      {bookings.map((booking) => (
        <BookingRow
          key={booking.id}
          booking={booking}
          variant={variant}
          onAccept={onAccept}
          onDecline={onDecline}
          processing={processing === booking.id}
        />
      ))}
    </div>
  );
}
