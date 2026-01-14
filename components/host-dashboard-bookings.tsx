"use client";

import { useState, useEffect, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { FilterBar } from "@/components/host-dashboard/filter-bar";
import { BookingList } from "@/components/host-dashboard/booking-list";
import { HostBooking } from "@/lib/host/dashboard";

interface HostDashboardBookingsProps {
  hostId: string;
}

const STATUS_FILTERS = [
  { value: "ALL", label: "All" },
  { value: "PAYMENT_PENDING", label: "Awaiting Payment" },
  { value: "CONFIRMED", label: "Confirmed" },
  { value: "COMPLETED", label: "Completed" },
  { value: "CANCELLED", label: "Cancelled" },
  { value: "EXPIRED", label: "Expired" },
];

export function HostDashboardBookings({ hostId }: HostDashboardBookingsProps) {
  const searchParams = useSearchParams();
  const [bookings, setBookings] = useState<HostBooking[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>(
    searchParams.get("status") || "ALL"
  );
  const [searchQuery, setSearchQuery] = useState("");

  const loadBookings = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (statusFilter !== "ALL") {
        params.set("status", statusFilter);
      }
      if (searchQuery) {
        params.set("q", searchQuery);
      }

      const response = await fetch(`/api/host/bookings?${params.toString()}`);
      if (response.ok) {
        const data = await response.json();
        setBookings(data);
      }
    } catch (error) {
      console.error("Failed to load bookings:", error);
    } finally {
      setLoading(false);
    }
  }, [hostId, statusFilter, searchQuery]);

  useEffect(() => {
    loadBookings();
  }, [loadBookings]);

  const handleClearFilters = () => {
    setStatusFilter("ALL");
    setSearchQuery("");
  };

  return (
    <div className="space-y-6">
      {/* Filter Bar */}
      <FilterBar
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        statusFilter={statusFilter}
        onStatusChange={setStatusFilter}
        statusOptions={STATUS_FILTERS}
        showClear={true}
        onClear={handleClearFilters}
      />

      {/* Booking List */}
      <BookingList
        bookings={bookings}
        loading={loading}
        variant="default"
        searchQuery={searchQuery}
        statusFilter={statusFilter}
      />
    </div>
  );
}
