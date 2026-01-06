"use client";

import Link from "next/link";
import { Booking } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/utils";
import { format } from "date-fns";
import { AlertCircle } from "lucide-react";

export function BookingConfirmation({ booking }: { booking: any }) {
  const listing = booking.listings;
  const startDate = new Date(booking.start_at);
  const endDate = new Date(booking.end_at);

  const rules = [
    listing.cooking_allowed && "Cooking allowed",
    listing.alcohol_allowed && "Alcohol allowed",
    `Noise tolerance: ${listing.noise_tolerance}`,
    listing.host_present && "Host will be present",
    listing.cleaning_expectations && `Cleaning: ${listing.cleaning_expectations}`,
  ].filter(Boolean);

  return (
    <div className="max-w-3xl mx-auto">
      <div className="mb-6">
        <Badge className="mb-4">Booking Confirmed</Badge>
        <h1 className="text-4xl font-bold mb-2">Your booking is confirmed!</h1>
        <p className="text-muted-foreground">
          {listing.title} • {listing.location_text}
        </p>
      </div>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Booking Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <p className="text-sm text-muted-foreground">Date & Time</p>
            <p className="font-semibold">
              {format(startDate, "EEEE, MMMM d, yyyy")}
            </p>
            <p className="font-semibold">
              {format(startDate, "h:mm a")} - {format(endDate, "h:mm a")}
            </p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Guests</p>
            <p className="font-semibold">{booking.guests_count} guest{booking.guests_count !== 1 ? "s" : ""}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Total Amount</p>
            <p className="font-semibold text-2xl">
              {formatCurrency(booking.total_amount)}
            </p>
            {booking.deposit_amount > 0 && (
              <p className="text-sm text-muted-foreground">
                Includes {formatCurrency(booking.deposit_amount)} deposit
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Address</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="font-semibold text-lg">{listing.address_text}</p>
          <p className="text-sm text-muted-foreground mt-2">
            This address is only visible to you and the host.
          </p>
        </CardContent>
      </Card>

      <Card className="mb-6 border-amber-200 bg-amber-50">
        <CardContent className="pt-6">
          <div className="flex gap-3">
            <AlertCircle className="h-5 w-5 text-amber-600 mt-0.5 flex-shrink-0" />
            <div>
              <h3 className="font-semibold mb-2">Return as Found</h3>
              <p className="text-sm text-muted-foreground">
                Please leave the space exactly as you found it. This is a lived-in home,
                and we expect you to respect the space and clean up after yourself.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>House Rules</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2">
            {rules.map((rule, index) => (
              <li key={index} className="flex items-center gap-2">
                <span className="text-primary">•</span>
                <span>{rule}</span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <div className="flex gap-4">
        <Button asChild>
          <Link href={`/bookings/${booking.id}/messages`}>
            Message Host
          </Link>
        </Button>
        <Button variant="outline" asChild>
          <Link href="/my-bookings">View All Bookings</Link>
        </Button>
      </div>
    </div>
  );
}
