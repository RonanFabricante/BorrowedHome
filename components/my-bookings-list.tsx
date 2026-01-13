"use client";

import Link from "next/link";
import { Booking } from "@/lib/types";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/utils";
import { format } from "date-fns";
import { Logo } from "@/components/logo";
import { 
  Building2, Calendar, Clock, Users, DollarSign, 
  CheckCircle2, Eye, XCircle, AlertCircle, MessageCircle, Star, CalendarX 
} from "lucide-react";

export function MyBookingsList({ bookings }: { bookings: any[] }) {
  if (bookings.length === 0) {
    return (
      <div className="text-center py-12">
        <div className="flex justify-center mb-4">
          <Logo size="md" href={null} />
        </div>
        <CalendarX className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
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
                    <Building2 className="w-5 h-5 text-muted-foreground" />
                    <h3 className="text-xl font-semibold">{listing.title}</h3>
                    <Badge
                      variant={
                        booking.status === "CONFIRMED"
                          ? "default"
                          : booking.status === "PENDING"
                          ? "outline"
                          : booking.status === "DECLINED"
                          ? "destructive"
                          : booking.status === "CANCELLED"
                          ? "secondary"
                          : booking.status === "COMPLETED"
                          ? "secondary"
                          : "outline"
                      }
                      className="flex items-center gap-1"
                    >
                      {booking.status === "COMPLETED" && <CheckCircle2 className="w-3 h-3" />}
                      {booking.status === "CONFIRMED" && <CheckCircle2 className="w-3 h-3" />}
                      {booking.status === "PENDING" && <AlertCircle className="w-3 h-3" />}
                      {booking.status === "DECLINED" && <XCircle className="w-3 h-3" />}
                      {booking.status === "CANCELLED" && <XCircle className="w-3 h-3" />}
                      {booking.status}
                    </Badge>
                  </div>
                  <p className="text-muted-foreground mb-2">
                    {listing.location_text}
                  </p>
                  <p className="text-sm mb-1 flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-muted-foreground" />
                    <span className="font-semibold">Date:</span>{" "}
                    {format(startDate, "EEEE, MMMM d, yyyy")}
                  </p>
                  <p className="text-sm mb-1 flex items-center gap-2">
                    <Clock className="w-4 h-4 text-muted-foreground" />
                    <span className="font-semibold">Time:</span>{" "}
                    {format(startDate, "h:mm a")} - {format(endDate, "h:mm a")}
                  </p>
                  <p className="text-sm mb-2 flex items-center gap-2">
                    <Users className="w-4 h-4 text-muted-foreground" />
                    <span className="font-semibold">Guests:</span> {booking.guests_count}
                  </p>
                  <p className="font-semibold text-lg flex items-center gap-2">
                    <DollarSign className="w-4 h-4" />
                    {formatCurrency(booking.total_amount)}
                  </p>
                </div>
                <div className="flex flex-col gap-2">
                  {booking.status === "CONFIRMED" && (
                    <Button asChild variant="outline" size="sm" className="flex items-center gap-2">
                      <Link href={`/bookings/${booking.id}/messages`}>
                        <MessageCircle className="w-4 h-4" />
                        Message Host
                      </Link>
                    </Button>
                  )}
                  {isPast && booking.status === "COMPLETED" && (
                    <Button asChild variant="outline" size="sm" className="flex items-center gap-2">
                      <Link href={`/bookings/${booking.id}/review`}>
                        <Star className="w-4 h-4" />
                        Leave Review
                      </Link>
                    </Button>
                  )}
                  <Button asChild variant="ghost" size="sm" className="flex items-center gap-2">
                    <Link href={`/bookings/${booking.id}/confirm`}>
                      <Eye className="w-4 h-4" />
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
