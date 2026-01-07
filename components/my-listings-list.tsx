"use client";

import Link from "next/link";
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
  hostId 
}: { 
  listings: any[];
  pendingBookings: any[];
  hostId: string;
}) {
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
    },
  });
  return (
    <div className="space-y-8">
      {/* Booking Requests Section */}
      {pendingBookings.length > 0 && (
        <div>
          <h2 className="text-2xl font-semibold mb-4">Booking Requests</h2>
          <div className="space-y-4">
            {pendingBookings.map((booking) => {
              const listing = booking.listings;
              const guest = booking.profiles;
              const startDate = new Date(booking.start_at);
              const endDate = new Date(booking.end_at);

              return (
                <Card key={booking.id} className="border-blue-200">
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <div>
                        <CardTitle className="text-lg">{listing.title}</CardTitle>
                        <p className="text-sm text-muted-foreground mt-1">
                          Request from {guest?.full_name || "Guest"}
                        </p>
                      </div>
                      <Badge variant="outline">PENDING</Badge>
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
                    </div>
                  </CardContent>
                </Card>
              );
            })}
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
