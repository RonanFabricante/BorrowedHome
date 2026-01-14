"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/utils";
import { format } from "date-fns";
import { 
  CheckCircle2, 
  XCircle, 
  MessageCircle, 
  Eye,
  Clock,
  Building2,
  Users
} from "lucide-react";
import { HostBooking } from "@/lib/host/dashboard";
import { getHostBookings } from "@/lib/host/dashboard";

interface HostDashboardRequestsProps {
  hostId: string;
  initialRequests?: HostBooking[];
}

export function HostDashboardRequests({ hostId, initialRequests = [] }: HostDashboardRequestsProps) {
  const router = useRouter();
  const [bookings, setBookings] = useState<HostBooking[]>(initialRequests);
  const [loading, setLoading] = useState(false);
  const [processing, setProcessing] = useState<string | null>(null);

  useEffect(() => {
    // Only load if no initial data provided
    if (!initialRequests || initialRequests.length === 0) {
      loadRequests();
    }
  }, [hostId]);

  const loadRequests = async () => {
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
  };

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

  if (bookings.length === 0) {
    return (
      <Card>
        <CardContent className="p-12 text-center">
          <Clock className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <h3 className="text-lg font-semibold mb-2">No Pending Requests</h3>
          <p className="text-muted-foreground">
            You don't have any pending booking requests at the moment.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {bookings.map((booking) => {
        const startDate = new Date(booking.start_at);
        const endDate = new Date(booking.end_at);

        return (
          <Card key={booking.id}>
            <CardContent className="p-6">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-3">
                    <Building2 className="h-5 w-5 text-muted-foreground" />
                    <h3 className="text-lg font-semibold">{booking.listing.title}</h3>
                    <Badge variant="outline">REQUESTED</Badge>
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
                    <div>
                      <span className="text-xs">
                        Requested {format(new Date(booking.created_at), "MMM d, h:mm a")}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex gap-2 ml-4">
                  <Button
                    size="sm"
                    onClick={() => handleAccept(booking.id)}
                    disabled={processing === booking.id}
                    className="flex items-center gap-2"
                  >
                    <CheckCircle2 className="h-4 w-4" />
                    {processing === booking.id ? "Accepting..." : "Accept"}
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() => handleDecline(booking.id)}
                    disabled={processing === booking.id}
                    className="flex items-center gap-2"
                  >
                    <XCircle className="h-4 w-4" />
                    {processing === booking.id ? "Declining..." : "Decline"}
                  </Button>
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
  );
}
