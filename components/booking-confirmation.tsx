"use client";

import { useState, useEffect, useMemo } from "react";
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
import { CancelBookingModal } from "@/components/cancel-booking-modal";
import { canCancelBooking, computeCancellationPolicy } from "@/lib/cancellation/policy";
import { DayArc } from "@/components/day-arc";

export function BookingConfirmation({ booking, isHost = false }: { booking: any; isHost?: boolean }) {
  const supabase = createClient();
  const listing = booking.listings ?? {};
  const startDate = useMemo(() => new Date(booking.start_at), [booking.start_at]);
  const endDate = useMemo(() => new Date(booking.end_at), [booking.end_at]);
  const isConfirmed = booking.status === "CONFIRMED";
  const isRequested = booking.status === "REQUESTED";
  const isPending = booking.status === "PENDING" || booking.status === "REQUESTED"; // Support both for backward compatibility
  const isPaymentPending = booking.status === "PAYMENT_PENDING";
  const isDeclined = booking.status === "DECLINED" || booking.status === "REJECTED";
  const deadlinePassed =
    isPaymentPending &&
    booking.payment_deadline_at &&
    new Date(booking.payment_deadline_at).getTime() <= Date.now();
  const isExpired = booking.status === "EXPIRED" || Boolean(deadlinePassed);
  const isCancelled = booking.status === "CANCELLED";
  const isCompleted = booking.status === "COMPLETED";
  const canShowAddress =
    (isConfirmed || isCompleted) && Boolean(listing?.address_text);
  
  const [hasReview, setHasReview] = useState<boolean | null>(null);
  const [payment, setPayment] = useState<any>(null);
  const [paymentLoading, setPaymentLoading] = useState(true);
  const [paymentInitError, setPaymentInitError] = useState<string | null>(null);
  const [now, setNow] = useState(() => new Date());
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [cancellationPolicy, setCancellationPolicy] = useState<{
    refundAmount: number;
    message: string;
  } | null>(null);

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

    // Compute cancellation policy when modal opens
    if (showCancelModal) {
      const check = canCancelBooking(booking.status, startDate);
      if (check.canCancel) {
        const policy = computeCancellationPolicy({
          actor: isHost ? "host" : "guest",
          bookingStartTime: startDate,
          cancelledAt: new Date(),
          totalAmountCents: booking.total_amount,
          policyVersion: booking.cancellation_policy_version || "v1",
        });
        setCancellationPolicy({
          refundAmount: policy.refundableAmountCents,
          message: policy.message,
        });
      }
    }
  }, [isCompleted, isHost, booking.id, booking.status, booking.total_amount, booking.cancellation_policy_version, showCancelModal, startDate, supabase]);

  useEffect(() => {
    // Fetch payment info if booking is PAYMENT_PENDING (for guests) or CONFIRMED (to show payment status).
    // If no payment row exists yet, PaymentForm initiates the payment itself,
    // so we don't also call /api/payments/initiate here (that raced with
    // PaymentForm and could create duplicate PaymentIntents).
    if ((isPaymentPending || isConfirmed) && !isHost) {
      supabase
        .from("payments")
        .select("*")
        .eq("booking_id", booking.id)
        .single()
        .then(({ data }) => {
          if (data) {
            setPayment(data);
          }
          setPaymentLoading(false);
        });
    } else {
      setPaymentLoading(false);
    }
  }, [booking.id, isPaymentPending, isConfirmed, isHost, supabase]);

  useEffect(() => {
    // Keep the payment-deadline countdown ticking while awaiting payment
    if (!isPaymentPending) return;
    const interval = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(interval);
  }, [isPaymentPending]);

  const needsPayment = isPaymentPending && (!payment || payment.status === "pending");
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

        <Card className="mb-6 border-primary/20 bg-primary/5">
          <CardContent className="pt-6">
            <div className="flex gap-3">
              <Clock className="h-5 w-5 text-primary mt-0.5 shrink-0" aria-hidden />
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
                {formatCurrency(booking.total_amount, booking.currency)}
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

        <Card className="mb-6 border-destructive/25 bg-destructive/10">
          <CardContent className="pt-6">
            <div className="flex gap-3">
              <XCircle className="h-5 w-5 text-destructive mt-0.5 flex-shrink-0" />
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

  if (isExpired) {
    return (
      <div className="max-w-3xl mx-auto">
        <div className="mb-6">
          <Badge variant="destructive" className="mb-4">
            <XCircle className="h-3 w-3 mr-1" />
            Expired
          </Badge>
          <h1 className="text-4xl font-bold mb-2">Payment Expired</h1>
          <p className="text-muted-foreground">
            {listing.title} • {listing.location_text}
          </p>
        </div>

        <Card className="mb-6 border-destructive/25 bg-destructive/10">
          <CardContent className="pt-6">
            <div className="flex gap-3">
              <XCircle className="h-5 w-5 text-destructive mt-0.5 flex-shrink-0" />
              <div>
                <h3 className="font-semibold mb-2">Payment Window Expired</h3>
                <p className="text-sm text-muted-foreground">
                  The payment window for this booking has expired. The time slot is now available for other guests.
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

  // PAYMENT_PENDING status - show payment form and countdown
  if (isPaymentPending) {
    const deadline = booking.payment_deadline_at ? new Date(booking.payment_deadline_at) : null;
    const timeRemaining = deadline ? Math.max(0, deadline.getTime() - now.getTime()) : 0;
    const hoursRemaining = Math.floor(timeRemaining / (1000 * 60 * 60));
    const minutesRemaining = Math.floor((timeRemaining % (1000 * 60 * 60)) / (1000 * 60));

    return (
      <div className="max-w-3xl mx-auto">
        <div className="mb-6">
          <Badge variant="outline" className="mb-4 border-warning text-warning">
            <Clock className="h-3 w-3 mr-1" />
            Payment Required
          </Badge>
          <h1 className="text-4xl font-bold mb-2">
            {isHost ? "Payment Pending" : "Complete Payment to Confirm"}
          </h1>
          <p className="text-muted-foreground">
            {listing.title} • {listing.location_text}
          </p>
        </div>

        {!isHost && deadline && timeRemaining > 0 && (
          <Card className="mb-6 border-warning/30 bg-warning/10">
            <CardContent className="pt-6">
              <div className="flex gap-3">
                <Clock className="h-5 w-5 text-warning mt-0.5 flex-shrink-0" />
                <div>
                  <h3 className="font-semibold mb-2">Payment Deadline</h3>
                  <p className="text-sm text-muted-foreground mb-1">
                    Complete payment within{" "}
                    {hoursRemaining > 0 && `${hoursRemaining} hour${hoursRemaining !== 1 ? "s" : ""} `}
                    {minutesRemaining > 0 && `${minutesRemaining} minute${minutesRemaining !== 1 ? "s" : ""}`}
                    {hoursRemaining === 0 && minutesRemaining === 0 && "less than a minute"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Deadline: {format(deadline, "MMM d, yyyy 'at' h:mm a")}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {!isHost && deadline && timeRemaining <= 0 && (
          <Card className="mb-6 border-destructive/25 bg-destructive/10">
            <CardContent className="pt-6">
              <div className="flex gap-3">
                <AlertCircle className="h-5 w-5 text-destructive mt-0.5 flex-shrink-0" />
                <div>
                  <h3 className="font-semibold mb-2 text-destructive">Payment Deadline Passed</h3>
                  <p className="text-sm text-muted-foreground">
                    The payment deadline has passed. This booking may expire soon.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

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
                {formatCurrency(booking.total_amount, booking.currency)}
              </p>
              {booking.deposit_amount > 0 && (
                <p className="text-sm text-muted-foreground">
                  Includes {formatCurrency(booking.deposit_amount, booking.currency)} deposit
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

        {/* Payment Form - Show if payment is needed (guests only) */}
        {needsPayment && !paymentLoading && !paymentInitError && !isHost && (
          <PaymentForm
            bookingId={booking.id}
            amount={booking.total_amount}
            depositAmount={booking.deposit_amount || 0}
            currency={booking.currency}
            onSuccess={() => {
              // Reload so the page reflects the confirmed booking (address,
              // messaging) once the server/webhook has updated its status.
              window.location.reload();
            }}
          />
        )}

        {/* Payment Status - Show if payment is authorised */}
        {paymentAuthorised && !isHost && (
          <Card className="mb-6 border-success/25 bg-success/10">
            <CardContent className="pt-6">
              <div className="flex gap-3">
                <CheckCircle2 className="h-5 w-5 text-success mt-0.5 flex-shrink-0" />
                <div>
                  <h3 className="font-semibold mb-2">Payment Authorised</h3>
                  <p className="text-sm text-muted-foreground">
                    Your payment has been authorised. Your booking will be confirmed shortly.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Host view - show waiting message */}
        {isHost && (
          <Card className="mb-6 border-primary/20 bg-primary/5">
            <CardContent className="pt-6">
              <div className="flex gap-3">
                <Clock className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
                <div>
                  <h3 className="font-semibold mb-2">Waiting for Guest Payment</h3>
                  <p className="text-sm text-muted-foreground">
                    The guest has {hoursRemaining > 0 && `${hoursRemaining} hour${hoursRemaining !== 1 ? "s" : ""} `}
                    {minutesRemaining > 0 && `${minutesRemaining} minute${minutesRemaining !== 1 ? "s" : ""}`}
                    {hoursRemaining === 0 && minutesRemaining === 0 && "less than a minute"} to complete payment.
                    The booking will be confirmed once payment is received.
                  </p>
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
                {formatCurrency(booking.total_amount, booking.currency)}
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Leave Review Prompt for Guests */}
        {!isHost && hasReview === false && (
          <Card className="mb-6 border-primary/20 bg-primary/5">
            <CardContent className="pt-6">
              <div className="flex gap-3">
                <Star className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
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
        <DayArc className="mt-6 max-w-sm" />
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
              {formatCurrency(booking.total_amount, booking.currency)}
            </p>
            {booking.deposit_amount > 0 && (
              <p className="text-sm text-muted-foreground">
                Includes {formatCurrency(booking.deposit_amount, booking.currency)} deposit
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

      {/* Payment Form - Should not show for CONFIRMED status, but keep as fallback */}
      {needsPayment && !paymentLoading && !paymentInitError && !isHost && (
        <Card className="mb-6 border-warning/30 bg-warning/10">
          <CardContent className="pt-6">
            <div className="flex gap-3">
              <AlertCircle className="h-5 w-5 text-warning mt-0.5 flex-shrink-0" />
              <div>
                <h3 className="font-semibold mb-2">Payment Processing</h3>
                <p className="text-sm text-muted-foreground">
                  Your booking is confirmed, but payment is still being processed. This should resolve shortly.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Payment Status - Show to both guest and host */}
      {paymentAuthorised && (
        <Card className="mb-6 border-success/25 bg-success/10">
          <CardContent className="pt-6">
            <div className="flex gap-3">
              <CheckCircle2 className="h-5 w-5 text-success mt-0.5 flex-shrink-0" />
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

      {/* Address is loaded server-side via get_listing_address after confirm */}
      {canShowAddress && (
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

      <Card className="mb-6 border-warning/30 bg-warning/10">
        <CardContent className="pt-6">
          <div className="flex gap-3">
            <AlertCircle className="h-5 w-5 text-warning mt-0.5 flex-shrink-0" />
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
        <div className="space-y-4">
          {/* Cancel Button - Show if booking can be cancelled */}
          {canCancelBooking(booking.status, startDate).canCancel && (
            <div className="flex justify-end">
              <Button
                variant="destructive"
                onClick={() => setShowCancelModal(true)}
              >
                Cancel Booking
              </Button>
            </div>
          )}

          {/* Action Buttons */}
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
        </div>
      )}

      {/* Cancel Booking Modal */}
      {showCancelModal && cancellationPolicy && (
        <CancelBookingModal
          open={showCancelModal}
          onClose={() => {
            setShowCancelModal(false);
            setCancellationPolicy(null);
          }}
          bookingId={booking.id}
          totalAmount={booking.total_amount}
          refundAmount={cancellationPolicy.refundAmount}
          refundMessage={cancellationPolicy.message}
          currency={booking.currency}
          onSuccess={() => {
            // Refresh page to show updated status
            window.location.reload();
          }}
        />
      )}
    </div>
  );
}
