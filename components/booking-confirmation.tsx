"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Booking } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/utils";
import { format } from "date-fns";
import { AlertCircle, Clock, XCircle, CheckCircle2, Star } from "lucide-react";
import { PaymentForm } from "@/components/payment-form";
import { createClient } from "@/lib/supabase/client";

export function BookingConfirmation({ booking, isHost = false }: { booking: any; isHost?: boolean }) {
  const supabase = createClient();
  const listing = booking.listings;
  const startDate = new Date(booking.start_at);
  const endDate = new Date(booking.end_at);
  const isConfirmed = booking.status === "CONFIRMED";
  const isPending = booking.status === "PENDING";
  const isDeclined = booking.status === "DECLINED";
  const isCancelled = booking.status === "CANCELLED";
  const isCompleted = booking.status === "COMPLETED";
  
  const [hasReview, setHasReview] = useState<boolean | null>(null);

  useEffect(() => {
    // Check if review exists for completed bookings (guests only)
    if (isCompleted && !isHost) {
      supabase
        .from("reviews")
        .select("id")
        .eq("booking_id", booking.id)
        .single()
        .then(({ data }) => {
          setHasReview(!!data);
        });
    }
  }, [isCompleted, isHost, booking.id, supabase]);
  
  const [payment, setPayment] = useState<any>(null);
  const [paymentLoading, setPaymentLoading] = useState(true);
  const [paymentInitError, setPaymentInitError] = useState<string | null>(null);

  useEffect(() => {
    // Only fetch payment info if user is guest (hosts don't need payment forms)
    if (isConfirmed && !isHost) {
      // Fetch payment status
      supabase
        .from("payments")
        .select("*")
        .eq("booking_id", booking.id)
        .single()
        .then(async ({ data, error }) => {
          if (error && error.code === "PGRST116") {
            // No payment record exists - initiate payment automatically
            try {
              const response = await fetch("/api/payments/initiate", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ bookingId: booking.id }),
              });

              const paymentData = await response.json();
              
              console.log("[BookingConfirmation] Payment initiation response:", {
                ok: response.ok,
                status: response.status,
                hasClientSecret: !!paymentData.clientSecret,
                error: paymentData.error,
                data: paymentData
              });

              if (response.ok && paymentData.clientSecret) {
                // Payment initiated, now fetch the payment record
                const { data: newPayment } = await supabase
                  .from("payments")
                  .select("*")
                  .eq("booking_id", booking.id)
                  .single();
                
                if (newPayment) {
                  setPayment(newPayment);
                }
              } else {
                // Store error to display to user
                const errorMessage = paymentData.error || paymentData.message || `Failed to initiate payment (${response.status})`;
                console.error("[BookingConfirmation] Failed to initiate payment:", {
                  status: response.status,
                  error: errorMessage,
                  fullResponse: paymentData
                });
                setPaymentInitError(errorMessage);
              }
            } catch (err: any) {
              console.error("[BookingConfirmation] Error initiating payment:", err);
              // Handle different error types
              let errorMessage = "Failed to initiate payment. Please try again.";
              
              if (err.message) {
                errorMessage = err.message;
              } else if (err.toString && err.toString() !== "[object Object]") {
                errorMessage = err.toString();
              } else if (err.error) {
                errorMessage = err.error;
              }
              
              // If it's a network error, provide helpful message
              if (errorMessage.includes("fetch") || errorMessage.includes("network") || errorMessage.includes("Failed to fetch")) {
                errorMessage = "Network error. Please check your connection and try again.";
              }
              
              setPaymentInitError(errorMessage);
            }
          } else if (data) {
            // Payment record exists
            setPayment(data);
          }
          setPaymentLoading(false);
        });
    } else {
      setPaymentLoading(false);
    }
  }, [booking.id, isConfirmed, isHost, supabase]);

  const needsPayment = isConfirmed && (!payment || payment.status === "pending");
  const paymentAuthorised = payment && payment.status === "authorised";

  const rules = [
    listing.cooking_allowed && "Cooking allowed",
    listing.alcohol_allowed && "Alcohol allowed",
    `Noise tolerance: ${listing.noise_tolerance}`,
    listing.host_present && "Host will be present",
    listing.cleaning_expectations && `Cleaning: ${listing.cleaning_expectations}`,
  ].filter(Boolean);

  // Show different UI based on status
  if (isPending) {
    return (
      <div className="max-w-3xl mx-auto">
        <div className="mb-6">
          <Badge variant="outline" className="mb-4">
            <Clock className="h-3 w-3 mr-1" />
            Pending Host Approval
          </Badge>
          <h1 className="text-4xl font-bold mb-2">Booking Request Sent</h1>
          <p className="text-muted-foreground">
            {listing.title} • {listing.location_text}
          </p>
        </div>

        <Card className="mb-6 border-blue-200 bg-blue-50">
          <CardContent className="pt-6">
            <div className="flex gap-3">
              <Clock className="h-5 w-5 text-blue-600 mt-0.5 flex-shrink-0" />
              <div>
                <h3 className="font-semibold mb-2">Waiting for Host Approval</h3>
                <p className="text-sm text-muted-foreground">
                  Your booking request has been sent to the host. They will review and respond soon.
                  You&apos;ll be notified once they accept or decline your request.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

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
            </div>
          </CardContent>
        </Card>

        <div className="flex gap-4">
          <Button variant="outline" asChild>
            <Link href={isHost ? "/my-listings" : "/my-bookings"}>
              {isHost ? "Back to My Listings" : "View All Bookings"}
            </Link>
          </Button>
        </div>
      </div>
    );
  }

  if (isDeclined) {
    return (
      <div className="max-w-3xl mx-auto">
        <div className="mb-6">
          <Badge variant="destructive" className="mb-4">
            <XCircle className="h-3 w-3 mr-1" />
            Declined
          </Badge>
          <h1 className="text-4xl font-bold mb-2">
            {isHost ? "Booking Declined" : "Booking Request Declined"}
          </h1>
          <p className="text-muted-foreground">
            {listing.title} • {listing.location_text}
          </p>
        </div>

        <Card className="mb-6 border-red-200 bg-red-50">
          <CardContent className="pt-6">
            <div className="flex gap-3">
              <XCircle className="h-5 w-5 text-red-600 mt-0.5 flex-shrink-0" />
              <div>
                <h3 className="font-semibold mb-2">
                  {isHost ? "You Declined This Request" : "Request Not Accepted"}
                </h3>
                <p className="text-sm text-muted-foreground">
                  {isHost
                    ? "You have declined this booking request. The guest has been notified."
                    : "Unfortunately, the host has declined your booking request for this time slot. The address has not been revealed. You can browse other listings or try a different time."}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

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
          </CardContent>
        </Card>

        <div className="flex gap-4">
          {!isHost && (
            <Button asChild>
              <Link href="/listings">Browse Other Listings</Link>
            </Button>
          )}
          <Button variant="outline" asChild>
            <Link href={isHost ? "/my-listings" : "/my-bookings"}>
              {isHost ? "Back to My Listings" : "View All Bookings"}
            </Link>
          </Button>
        </div>
      </div>
    );
  }

  if (isCancelled) {
    return (
      <div className="max-w-3xl mx-auto">
        <div className="mb-6">
          <Badge variant="secondary" className="mb-4">Cancelled</Badge>
          <h1 className="text-4xl font-bold mb-2">Booking Cancelled</h1>
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
          </CardContent>
        </Card>

        <div className="flex gap-4">
          <Button variant="outline" asChild>
            <Link href={isHost ? "/my-listings" : "/my-bookings"}>
              {isHost ? "Back to My Listings" : "View All Bookings"}
            </Link>
          </Button>
        </div>
      </div>
    );
  }

  // COMPLETED status - show completed booking with review prompt
  if (isCompleted) {
    return (
      <div className="max-w-3xl mx-auto">
        <div className="mb-6">
          <Badge variant="secondary" className="mb-4">
            <CheckCircle2 className="h-3 w-3 mr-1" />
            Completed
          </Badge>
          <h1 className="text-4xl font-bold mb-2">
            {isHost ? "Booking Completed" : "Your booking is completed!"}
          </h1>
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
            </div>
          </CardContent>
        </Card>

        {/* Leave Review Prompt for Guests */}
        {!isHost && hasReview === false && (
          <Card className="mb-6 border-blue-200 bg-blue-50">
            <CardContent className="pt-6">
              <div className="flex gap-3">
                <Star className="h-5 w-5 text-blue-600 mt-0.5 flex-shrink-0" />
                <div className="flex-1">
                  <h3 className="font-semibold mb-2">Share your experience</h3>
                  <p className="text-sm text-muted-foreground mb-4">
                    Help future guests choose with confidence. Leave a review of your day-use booking.
                  </p>
                  <Button asChild>
                    <Link href={`/bookings/${booking.id}/review`}>
                      Leave Review
                    </Link>
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        <div className="flex gap-4">
          <Button variant="outline" asChild>
            <Link href={isHost ? "/my-listings" : "/my-bookings"}>
              {isHost ? "Back to My Listings" : "View All Bookings"}
            </Link>
          </Button>
        </div>
      </div>
    );
  }

  // CONFIRMED status - show full details including address
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

      {/* Payment Initiation Error - Only show to guests */}
      {paymentInitError && !isHost && (
        <Card className="mb-6 border-destructive bg-destructive/10">
          <CardContent className="pt-6">
            <div className="flex gap-3">
              <AlertCircle className="h-5 w-5 text-destructive mt-0.5 flex-shrink-0" />
              <div>
                <h3 className="font-semibold text-destructive mb-1">Payment Setup Required</h3>
                <p className="text-sm text-muted-foreground mb-3">
                  {paymentInitError}
                </p>
                {paymentInitError.includes("/host/payouts") && (
                  <p className="text-xs text-muted-foreground">
                    The host needs to complete Stripe onboarding before payments can be processed.
                  </p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Payment Form - Show if CONFIRMED but payment not authorised and no error (guests only) */}
      {needsPayment && !paymentLoading && !paymentInitError && !isHost && (
        <PaymentForm
          bookingId={booking.id}
          amount={booking.total_amount}
          depositAmount={booking.deposit_amount || 0}
          onSuccess={() => {
            // Refresh payment status
            supabase
              .from("payments")
              .select("*")
              .eq("booking_id", booking.id)
              .single()
              .then(({ data }) => {
                if (data) setPayment(data);
              });
          }}
        />
      )}

      {/* Payment Status - Show to both guest and host */}
      {paymentAuthorised && (
        <Card className="mb-6 border-green-200 bg-green-50">
          <CardContent className="pt-6">
            <div className="flex gap-3">
              <CheckCircle2 className="h-5 w-5 text-green-600 mt-0.5 flex-shrink-0" />
              <div>
                <h3 className="font-semibold mb-2">Payment Authorised</h3>
                <p className="text-sm text-muted-foreground">
                  Your payment has been authorised. Funds will be captured after your booking is completed.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Address - Show to host always, or to guest if payment is authorised */}
      {isConfirmed && (isHost || paymentAuthorised) && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Address</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="font-semibold text-lg">{listing.address_text}</p>
            <p className="text-sm text-muted-foreground mt-2">
              {isHost 
                ? "This is your property address for this booking."
                : "This address is only visible to you and the host."}
            </p>
          </CardContent>
        </Card>
      )}

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

      {isConfirmed && (
        <div className="flex gap-4">
          {!isHost && (
            <Button asChild>
              <Link href={`/bookings/${booking.id}/messages`}>
                Message Host
              </Link>
            </Button>
          )}
          {isHost && (
            <Button asChild>
              <Link href={`/bookings/${booking.id}/messages`}>
                Message Guest
              </Link>
            </Button>
          )}
          <Button variant="outline" asChild>
            <Link href={isHost ? "/my-listings" : "/my-bookings"}>
              {isHost ? "Back to My Listings" : "View All Bookings"}
            </Link>
          </Button>
        </div>
      )}
    </div>
  );
}
