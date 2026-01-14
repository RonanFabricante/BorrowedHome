"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { BookingList } from "@/components/host-dashboard/booking-list";
import { HostBooking } from "@/lib/host/dashboard";

interface HostDashboardRequestsProps {
  hostId: string;
  initialRequests?: HostBooking[];
}

export function HostDashboardRequests({ hostId, initialRequests = [] }: HostDashboardRequestsProps) {
  const router = useRouter();
  const [bookings, setBookings] = useState<HostBooking[]>(initialRequests);
  const [loading, setLoading] = useState(false);
  const [processing, setProcessing] = useState<string | null>(null);

  const loadRequests = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/host/bookings?status=REQUESTED`);
      if (response.ok) {
        const data = await response.json();
        setBookings(data);
      }
    } catch (error) {
      console.error("Failed to load requests:", error);
    } finally {
      setLoading(false);
    }
  }, [hostId]);

  useEffect(() => {
    // Only load if no initial data provided
    if (!initialRequests || initialRequests.length === 0) {
      loadRequests();
    }
  }, [hostId, initialRequests, loadRequests]);

  const handleAccept = async (bookingId: string) => {
    setProcessing(bookingId);
    try {
      const response = await fetch("/api/bookings/respond", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ booking_id: bookingId, action: "accept" }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to accept booking");
      }

      // Remove from list and refresh
      setBookings((prev) => prev.filter((b) => b.id !== bookingId));
      router.refresh();
    } catch (error: any) {
      alert(error.message || "Failed to accept booking");
    } finally {
      setProcessing(null);
    }
  };

  const handleDecline = async (bookingId: string) => {
    setProcessing(bookingId);
    try {
      const response = await fetch("/api/bookings/respond", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ booking_id: bookingId, action: "reject" }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to decline booking");
      }

      // Remove from list and refresh
      setBookings((prev) => prev.filter((b) => b.id !== bookingId));
      router.refresh();
      // Also reload requests to get updated data
      loadRequests();
    } catch (error: any) {
      alert(error.message || "Failed to decline booking");
    } finally {
      setProcessing(null);
    }
  };

  return (
    <BookingList
      bookings={bookings}
      loading={loading}
      variant="request"
      onAccept={handleAccept}
      onDecline={handleDecline}
      processing={processing}
    />
  );
}
