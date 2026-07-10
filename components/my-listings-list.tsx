"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/utils";
import { format } from "date-fns";
import { 
  Building2, Calendar, Clock, Users, DollarSign, 
  CheckCircle2, Eye, XCircle, AlertCircle, Edit, ExternalLink, 
  MessageCircle, Inbox, Plus 
} from "lucide-react";

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
      router.refresh(); // Refresh the page to show updated bookings
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
      router.refresh(); // Refresh the page to show updated bookings
    },
  });

  const renderBookingCard = (booking: any, showActions: boolean = true) => {
    const listing = booking.listings;
    const guest = booking.profiles;
    if (!listing) return null;

    const startDate = new Date(booking.start_at);
    const endDate = new Date(booking.end_at);
    // New requests use REQUESTED; PENDING kept for legacy rows
    const isPendingRequest = booking.status === "REQUESTED" || booking.status === "PENDING";

    return (
      <Card 
        key={booking.id} 
        className={
          isPendingRequest ? "border-blue-200" :
          booking.status === "CONFIRMED" ? "border-green-200" :
          booking.status === "DECLINED" ? "border-red-200" :
          "border-gray-200"
        }
      >
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Building2 className="w-5 h-5 text-muted-foreground" />
              <div>
                <CardTitle className="text-lg">{listing.title || "Listing"}</CardTitle>
                <p className="text-sm text-muted-foreground mt-1">
                  {isPendingRequest && `Request from ${guest?.full_name || "Guest"}`}
                  {booking.status === "CONFIRMED" && `Confirmed booking with ${guest?.full_name || "Guest"}`}
                  {booking.status === "DECLINED" && `Declined request from ${guest?.full_name || "Guest"}`}
                  {!isPendingRequest && !["CONFIRMED", "DECLINED"].includes(booking.status) && 
                    `Booking with ${guest?.full_name || "Guest"}`}
                </p>
              </div>
            </div>
            <Badge
              variant={
                booking.status === "CONFIRMED" ? "default" :
                isPendingRequest ? "outline" :
                booking.status === "DECLINED" ? "destructive" :
                "secondary"
              }
              className="flex items-center gap-1"
            >
              {booking.status === "COMPLETED" && <CheckCircle2 className="w-3 h-3" />}
              {isPendingRequest && <AlertCircle className="w-3 h-3" />}
              {booking.status === "DECLINED" && <XCircle className="w-3 h-3" />}
              {booking.status}
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-center gap-4 mb-4">
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-muted-foreground flex-shrink-0" />
              <span className="text-sm">
                <span className="font-semibold">Date:</span>{" "}
                {format(startDate, "EEEE, MMMM d, yyyy")}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-muted-foreground flex-shrink-0" />
              <span className="text-sm">
                <span className="font-semibold">Time:</span>{" "}
                {format(startDate, "h:mm a")} - {format(endDate, "h:mm a")}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 text-muted-foreground flex-shrink-0" />
              <span className="text-sm">
                <span className="font-semibold">Guests:</span> {booking.guests_count}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <DollarSign className="w-4 h-4 text-muted-foreground flex-shrink-0" />
              <span className="text-sm">
                <span className="font-semibold">Total:</span>{" "}
                {formatCurrency(booking.total_amount)}
              </span>
            </div>
            <div className="flex items-center gap-2 ml-auto">
              <Button asChild variant="ghost" size="sm" className="flex items-center gap-2">
                <Link href={`/bookings/${booking.id}/confirm`}>
                  <Eye className="w-4 h-4" />
                  View Details
                </Link>
              </Button>
            </div>
          </div>
          <div className="flex gap-2">
            {showActions && isPendingRequest && (
              <>
                <Button
                  onClick={() => acceptBooking.mutate(booking.id)}
                  disabled={acceptBooking.isPending || declineBooking.isPending}
                  size="sm"
                  className="flex items-center gap-2"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  {acceptBooking.isPending ? "Accepting..." : "Accept"}
                </Button>
                <Button
                  onClick={() => declineBooking.mutate(booking.id)}
                  disabled={acceptBooking.isPending || declineBooking.isPending}
                  variant="destructive"
                  size="sm"
                  className="flex items-center gap-2"
                >
                  <XCircle className="w-4 h-4" />
                  {declineBooking.isPending ? "Declining..." : "Decline"}
                </Button>
              </>
            )}
            {booking.status === "CONFIRMED" && (
              <Button asChild variant="outline" size="sm" className="flex items-center gap-2">
                <Link href={`/bookings/${booking.id}/messages`}>
                  <MessageCircle className="w-4 h-4" />
                  Message Guest
                </Link>
              </Button>
            )}
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
            <Inbox className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-muted-foreground mb-4">
              You don&apos;t have any listings yet.
            </p>
            <Button asChild className="flex items-center gap-2 mx-auto">
              <Link href="/host/onboard">
                <Plus className="w-4 h-4" />
                Create Your First Listing
              </Link>
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            {listings.filter(Boolean).map((listing) => (
        <Card key={listing.id}>
          <CardContent className="p-6">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-2">
                  <Building2 className="w-5 h-5 text-muted-foreground" />
                  <h3 className="text-xl font-semibold">{listing.title || "Untitled listing"}</h3>
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
                <p className="font-semibold flex items-center gap-1">
                  <DollarSign className="w-4 h-4" />
                  From {formatCurrency(listing.hourly_rate)}/hr
                </p>
              </div>
              <div className="flex flex-col gap-2">
                <Button asChild variant="outline" size="sm" className="flex items-center gap-2">
                  <Link href={`/listings/${listing.id}`}>
                    <ExternalLink className="w-4 h-4" />
                    View
                  </Link>
                </Button>
                {listingsWithActiveBookings.has(listing.id) ? (
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    disabled
                    title="Cannot edit listing with active or confirmed bookings"
                    className="flex items-center gap-2"
                  >
                    <Edit className="w-4 h-4" />
                    Edit (Disabled)
                  </Button>
                ) : (
                  <Button asChild variant="ghost" size="sm" className="flex items-center gap-2">
                    <Link href={`/listings/${listing.id}/edit`}>
                      <Edit className="w-4 h-4" />
                      Edit
                    </Link>
                  </Button>
                )}
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
