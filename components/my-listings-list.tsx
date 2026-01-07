"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { Listing } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/utils";
import { format } from "date-fns";

export function MyListingsList({ 
  listings, 
  pendingBookings,
  confirmedBookings,
  declinedBookings,
  otherBookings,
  hostId 
}: { 
  listings: any[];
  pendingBookings: any[];
  confirmedBookings: any[];
  declinedBookings: any[];
  otherBookings: any[];
  hostId: string;
}) {
  const router = useRouter();
  const supabase = createClient();
  const queryClient = useQueryClient();

  const acceptBooking = useMutation({
    mutationFn: async (bookingId: string) => {
      const { data, error } = await supabase.rpc("accept_booking", {
        p_booking_id: bookingId,
        p_host_id: hostId,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["bookings"] });
      queryClient.invalidateQueries({ queryKey: ["listings"] });
      router.refresh(); // Refresh the page to show updated bookings
    },
  });

  const declineBooking = useMutation({
    mutationFn: async (bookingId: string) => {
      const { data, error } = await supabase.rpc("decline_booking", {
        p_booking_id: bookingId,
        p_host_id: hostId,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["bookings"] });
      queryClient.invalidateQueries({ queryKey: ["listings"] });
      router.refresh(); // Refresh the page to show updated bookings
    },
  });

  const renderBookingCard = (booking: any, showActions: boolean = true) => {
    const listing = booking.listings;
    const guest = booking.profiles;
    const startDate = new Date(booking.start_at);
    const endDate = new Date(booking.end_at);

    return (
      <Card 
        key={booking.id} 
        className={
          booking.status === "PENDING" ? "border-blue-200" :
          booking.status === "CONFIRMED" ? "border-green-200" :
          booking.status === "DECLINED" ? "border-red-200" :
          "border-gray-200"
        }
      >
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-lg">{listing.title}</CardTitle>
              <p className="text-sm text-muted-foreground mt-1">
                {booking.status === "PENDING" && `Request from ${guest?.full_name || "Guest"}`}
                {booking.status === "CONFIRMED" && `Confirmed booking with ${guest?.full_name || "Guest"}`}
                {booking.status === "DECLINED" && `Declined request from ${guest?.full_name || "Guest"}`}
                {!["PENDING", "CONFIRMED", "DECLINED"].includes(booking.status) && 
                  `Booking with ${guest?.full_name || "Guest"}`}
              </p>
            </div>
            <Badge
              variant={
                booking.status === "CONFIRMED" ? "default" :
                booking.status === "PENDING" ? "outline" :
                booking.status === "DECLINED" ? "destructive" :
                "secondary"
              }
            >
              {booking.status}
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-2 mb-4">
            <p className="text-sm">
              <span className="font-semibold">Date:</span>{" "}
              {format(startDate, "EEEE, MMMM d, yyyy")}
            </p>
            <p className="text-sm">
              <span className="font-semibold">Time:</span>{" "}
              {format(startDate, "h:mm a")} - {format(endDate, "h:mm a")}
            </p>
            <p className="text-sm">
              <span className="font-semibold">Guests:</span> {booking.guests_count}
            </p>
            <p className="text-sm">
              <span className="font-semibold">Total:</span>{" "}
              {formatCurrency(booking.total_amount)}
            </p>
          </div>
          <div className="flex gap-2">
            {showActions && booking.status === "PENDING" && (
              <>
                <Button
                  onClick={() => acceptBooking.mutate(booking.id)}
                  disabled={acceptBooking.isPending || declineBooking.isPending}
                  size="sm"
                >
                  {acceptBooking.isPending ? "Accepting..." : "Accept"}
                </Button>
                <Button
                  onClick={() => declineBooking.mutate(booking.id)}
                  disabled={acceptBooking.isPending || declineBooking.isPending}
                  variant="destructive"
                  size="sm"
                >
                  {declineBooking.isPending ? "Declining..." : "Decline"}
                </Button>
              </>
            )}
            {booking.status === "CONFIRMED" && (
              <Button asChild variant="outline" size="sm">
                <Link href={`/bookings/${booking.id}/messages`}>
                  Message Guest
                </Link>
              </Button>
            )}
            <Button asChild variant="ghost" size="sm">
              <Link href={`/bookings/${booking.id}/confirm`}>
                View Details
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  };
  return (
    <div className="space-y-8">
      {/* Booking Requests Section */}
      {pendingBookings.length > 0 && (
        <div>
          <h2 className="text-2xl font-semibold mb-4">Booking Requests</h2>
          <div className="space-y-4">
            {pendingBookings.map((booking) => renderBookingCard(booking, true))}
          </div>
        </div>
      )}

      {/* Confirmed Bookings Section */}
      {confirmedBookings.length > 0 && (
        <div>
          <h2 className="text-2xl font-semibold mb-4">Confirmed Bookings</h2>
          <div className="space-y-4">
            {confirmedBookings.map((booking) => renderBookingCard(booking, false))}
          </div>
        </div>
      )}

      {/* Declined Bookings Section */}
      {declinedBookings.length > 0 && (
        <div>
          <h2 className="text-2xl font-semibold mb-4">Declined Bookings</h2>
          <div className="space-y-4">
            {declinedBookings.map((booking) => renderBookingCard(booking, false))}
          </div>
        </div>
      )}

      {/* Other Bookings Section (CANCELLED, COMPLETED, etc.) */}
      {otherBookings.length > 0 && (
        <div>
          <h2 className="text-2xl font-semibold mb-4">Other Bookings</h2>
          <div className="space-y-4">
            {otherBookings.map((booking) => renderBookingCard(booking, false))}
          </div>
        </div>
      )}

      {/* Listings Section */}
      <div>
        <h2 className="text-2xl font-semibold mb-4">My Listings</h2>
        {listings.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-muted-foreground mb-4">
              You don&apos;t have any listings yet.
            </p>
            <Button asChild>
              <Link href="/host/onboard">Create Your First Listing</Link>
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            {listings.map((listing) => (
        <Card key={listing.id}>
          <CardContent className="p-6">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-2">
                  <h3 className="text-xl font-semibold">{listing.title}</h3>
                  {listing.published ? (
                    <Badge>Published</Badge>
                  ) : (
                    <Badge variant="outline">Draft</Badge>
                  )}
                </div>
                <p className="text-muted-foreground mb-2">
                  {listing.location_text}
                </p>
                <p className="text-sm mb-1">
                  <span className="font-semibold">Spaces:</span>{" "}
                  {listing.listing_spaces
                    ?.map((s: any) => s.space_type)
                    .join(", ")}
                </p>
                <p className="text-sm mb-1">
                  <span className="font-semibold">Max guests:</span>{" "}
                  {listing.max_guests}
                </p>
                <p className="font-semibold">
                  From {formatCurrency(listing.hourly_rate)}/hr
                </p>
              </div>
              <div className="flex flex-col gap-2">
                <Button asChild variant="outline" size="sm">
                  <Link href={`/listings/${listing.id}`}>View</Link>
                </Button>
                <Button asChild variant="ghost" size="sm">
                  <Link href={`/listings/${listing.id}/edit`}>Edit</Link>
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
