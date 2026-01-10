"use client";

import { useState, useEffect } from "react";
import { loadStripe } from "@stripe/stripe-js";
import { Elements, PaymentElement, useStripe, useElements } from "@stripe/react-stripe-js";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/lib/utils";

// Initialize Stripe
const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!);

interface PaymentFormProps {
  bookingId: string;
  amount: number;
  depositAmount: number;
  onSuccess: () => void;
}

function CheckoutForm({ bookingId, amount, depositAmount, onSuccess }: PaymentFormProps) {
  const stripe = useStripe();
  const elements = useElements();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!stripe || !elements) {
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const { error: submitError } = await elements.submit();
      if (submitError) {
        setError(submitError.message || "Payment form error");
        setLoading(false);
        return;
      }

      // Confirm payment
      // Note: With redirect: "if_required", if a redirect is needed, the function will
      // actually redirect the page and we won't reach this code. If no redirect is needed,
      // it returns { paymentIntent, error?: undefined }
      const result = await stripe.confirmPayment({
        elements,
        confirmParams: {
          return_url: `${window.location.origin}/bookings/${bookingId}/confirm?payment=success`,
        },
        redirect: "if_required",
      });

      if (result.error) {
        setError(result.error.message || "Payment failed");
        setLoading(false);
        return;
      }

      // PaymentIntent was confirmed successfully
      // For manual capture, status will be "requires_capture" (not "succeeded")
      // This is correct - the payment is authorized but not yet captured
      const paymentIntent = result.paymentIntent;
      
      if (paymentIntent) {
        const status = paymentIntent.status;
        console.log("[PaymentForm] PaymentIntent status after confirmation:", status);
        
        // Payment is authorized (requires_capture) or succeeded
        if (status === "requires_capture" || status === "succeeded") {
          // Update payment status in database via API
          try {
            const response = await fetch(`/api/payments/authorize`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ 
                bookingId,
                paymentIntentId: paymentIntent.id 
              }),
            });

            if (!response.ok) {
              const data = await response.json();
              console.error("[PaymentForm] Failed to update payment status:", data.error);
              // Don't fail - webhook will handle it eventually
            } else {
              console.log("[PaymentForm] Payment status updated to authorised");
            }
          } catch (err) {
            console.error("[PaymentForm] Error updating payment status:", err);
            // Don't fail - webhook will handle it eventually
          }
          
          // Clear loading state first
          setLoading(false);
          
          // Call onSuccess to refresh UI
          // The parent component will refetch payment status
          onSuccess();
        } else if (status === "requires_action") {
          // Payment requires additional action (like 3D Secure)
          // This should have been handled by Stripe Elements, but log for debugging
          console.warn("[PaymentForm] PaymentIntent still requires action:", status);
          setError("Payment requires additional verification. Please try again.");
          setLoading(false);
        } else {
          console.error("[PaymentForm] Unexpected PaymentIntent status:", status);
          setError("Payment confirmation incomplete. Please try again.");
          setLoading(false);
        }
      } else {
        // No PaymentIntent returned - should not happen
        console.error("[PaymentForm] No PaymentIntent returned from confirmPayment");
        setError("Payment confirmation incomplete. Please refresh and try again.");
        setLoading(false);
      }
    } catch (err: any) {
      setError(err.message || "An error occurred");
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <PaymentElement />
      {error && (
        <div className="p-3 text-sm text-destructive bg-destructive/10 rounded-md">
          {error}
        </div>
      )}
      <Button type="submit" disabled={!stripe || loading} className="w-full">
        {loading ? "Processing..." : `Pay ${formatCurrency(amount + depositAmount)}`}
      </Button>
      {depositAmount > 0 && (
        <p className="text-xs text-muted-foreground text-center">
          Includes {formatCurrency(depositAmount)} security deposit (held, not charged)
        </p>
      )}
    </form>
  );
}

export function PaymentForm({ bookingId, amount, depositAmount, onSuccess }: PaymentFormProps) {
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [depositClientSecret, setDepositClientSecret] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const initiatePayment = async () => {
      try {
        const response = await fetch("/api/payments/initiate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ bookingId }),
        });

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || "Failed to initiate payment");
        }

        setClientSecret(data.clientSecret);
        if (data.depositClientSecret) {
          setDepositClientSecret(data.depositClientSecret);
        }
      } catch (err: any) {
        setError(err.message || "Failed to load payment form");
      } finally {
        setLoading(false);
      }
    };

    initiatePayment();
  }, [bookingId]);

  if (loading) {
    return (
      <Card>
        <CardContent className="p-6">
          <p className="text-center text-muted-foreground">Loading payment form...</p>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="p-3 text-sm text-destructive bg-destructive/10 rounded-md">
            {error}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!clientSecret) {
    return null;
  }

  const options = {
    clientSecret,
    appearance: {
      theme: "stripe" as const,
    },
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Complete Payment</CardTitle>
      </CardHeader>
      <CardContent>
        <Elements stripe={stripePromise} options={options}>
          <CheckoutForm
            bookingId={bookingId}
            amount={amount}
            depositAmount={depositAmount}
            onSuccess={onSuccess}
          />
        </Elements>
      </CardContent>
    </Card>
  );
}
