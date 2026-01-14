"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatCurrency } from "@/lib/utils";
import { format, differenceInMinutes } from "date-fns";
import { 
  MessageCircle, 
  Eye,
  Clock,
  Building2,
  Users,
  Search,
  AlertCircle
} from "lucide-react";
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
  const [bookings, setBookings] = useState<HostBooking[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    loadBookings();
  }, [hostId, statusFilter, searchQuery]);

  const loadBookings = async () => {
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
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
      CONFIRMED: "default",
      PAYMENT_PENDING: "outline",
      COMPLETED: "secondary",
      CANCELLED: "destructive",
      EXPIRED: "destructive",
      REQUESTED: "outline",
    };

    return (
      <Badge variant={variants[status] || "outline"}>
        {status.replace("_", " ")}
      </Badge>
    );
  };

  const getPaymentDeadlineCountdown = (deadlineAt: string | null) => {
    if (!deadlineAt) return null;
    
    const deadline = new Date(deadlineAt);
    const now = new Date();
    const minutesLeft = differenceInMinutes(deadline, now);

    if (minutesLeft < 0) return "Expired";
    if (minutesLeft < 60) return `${minutesLeft}m left`;
    const hoursLeft = Math.floor(minutesLeft / 60);
    return `${hoursLeft}h ${minutesLeft % 60}m left`;
  };

  if (loading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map((i) => (
          <Card key={i} className="animate-pulse">
            <CardContent className="p-6">
              <div className="h-4 bg-muted rounded w-1/4 mb-4"></div>
              <div className="h-4 bg-muted rounded w-1/2"></div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by listing or guest name..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
        <div className="flex gap-2 flex-wrap">
          {STATUS_FILTERS.map((filter) => (
            <Button
              key={filter.value}
              variant={statusFilter === filter.value ? "default" : "outline"}
              size="sm"
              onClick={() => setStatusFilter(filter.value)}
            >
              {filter.label}
            </Button>
          ))}
        </div>
      </div>

      {/* Bookings List */}
      {bookings.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center">
            <Building2 className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-semibold mb-2">No Bookings Found</h3>
            <p className="text-muted-foreground">
              {searchQuery || statusFilter !== "ALL"
                ? "Try adjusting your filters"
                : "You don't have any bookings yet."}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {bookings.map((booking) => {
            const startDate = new Date(booking.start_at);
            const endDate = new Date(booking.end_at);
            const countdown = getPaymentDeadlineCountdown(booking.payment_deadline_at);

            return (
              <Card key={booking.id}>
                <CardContent className="p-6">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-3">
                        <Building2 className="h-5 w-5 text-muted-foreground" />
                        <h3 className="text-lg font-semibold">{booking.listing.title}</h3>
                        {getStatusBadge(booking.status)}
                        {booking.status === "PAYMENT_PENDING" && countdown && (
                          <Badge variant="outline" className="border-amber-200 bg-amber-50">
                            <AlertCircle className="h-3 w-3 mr-1" />
                            {countdown}
                          </Badge>
                        )}
                      </div>

                      <div className="space-y-2 text-sm text-muted-foreground">
                        <div className="flex items-center gap-2">
                          <Users className="h-4 w-4" />
                          <span>
                            {booking.guest.full_name || "Guest"} • {booking.guests_count} guest{booking.guests_count !== 1 ? "s" : ""}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Clock className="h-4 w-4" />
                          <span>
                            {format(startDate, "EEEE, MMMM d, yyyy")} • {format(startDate, "h:mm a")} - {format(endDate, "h:mm a")}
                          </span>
                        </div>
                        <div>
                          <span className="font-semibold text-foreground">
                            {formatCurrency(booking.total_amount)}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="flex gap-2 ml-4">
                      <Button
                        size="sm"
                        variant="outline"
                        asChild
                        className="flex items-center gap-2"
                      >
                        <Link href={`/bookings/${booking.id}/messages`}>
                          <MessageCircle className="h-4 w-4" />
                          Message
                        </Link>
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        asChild
                        className="flex items-center gap-2"
                      >
                        <Link href={`/bookings/${booking.id}/confirm`}>
                          <Eye className="h-4 w-4" />
                          View
                        </Link>
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
