"use client";

import Link from "next/link";
import { Booking } from "@/lib/types";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/utils";
import { format } from "date-fns";

export function MyBookingsList({ bookings }: { bookings: any[] }) {
  if (bookings.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground mb-4">You don&apos;t have any bookings yet.</p>
        <Button asChild>
          <Link href="/listings">Browse Homes</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {bookings.map((booking) => {
        const listing = booking.listings;
        const startDate = new Date(booking.start_at);
        const endDate = new Date(booking.end_at);
        const isPast = endDate < new Date();

        return (
          <Card key={booking.id}>
            <CardContent className="p-6">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <h3 className="text-xl font-semibold">{listing.title}</h3>
                    <Badge
                      variant={
                        booking.status === "CONFIRMED"
                          ? "default"
                          : booking.status === "COMPLETED"
                          ? "secondary"
                          : "outline"
                      }
                    >
                      {booking.status}
                    </Badge>
                  </div>
                  <p className="text-muted-foreground mb-2">
                    {listing.location_text}
                  </p>
                  <p className="text-sm mb-1">
                    <span className="font-semibold">Date:</span>{" "}
                    {format(startDate, "EEEE, MMMM d, yyyy")}
                  </p>
                  <p className="text-sm mb-1">
                    <span className="font-semibold">Time:</span>{" "}
                    {format(startDate, "h:mm a")} - {format(endDate, "h:mm a")}
                  </p>
                  <p className="text-sm mb-2">
                    <span className="font-semibold">Guests:</span> {booking.guests_count}
                  </p>
                  <p className="font-semibold text-lg">
                    {formatCurrency(booking.total_amount)}
                  </p>
                </div>
                <div className="flex flex-col gap-2">
                  {booking.status === "CONFIRMED" && (
                    <Button asChild variant="outline" size="sm">
                      <Link href={`/bookings/${booking.id}/messages`}>
                        Message Host
                      </Link>
                    </Button>
                  )}
                  {isPast && booking.status === "COMPLETED" && (
                    <Button asChild variant="outline" size="sm">
                      <Link href={`/bookings/${booking.id}/review`}>
                        Leave Review
                      </Link>
                    </Button>
                  )}
                  <Button asChild variant="ghost" size="sm">
                    <Link href={`/bookings/${booking.id}/confirm`}>
                      View Details
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
