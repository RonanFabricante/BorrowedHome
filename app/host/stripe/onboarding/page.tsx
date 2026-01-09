"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Nav } from "@/components/nav";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AlertCircle, CheckCircle2, Loader2 } from "lucide-react";

export default function StripeOnboardingPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [onboardingUrl, setOnboardingUrl] = useState<string | null>(null);
  const [onboardingCompleted, setOnboardingCompleted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const checkStatus = async () => {
      try {
        const response = await fetch("/api/stripe/connect/check-status");
        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || "Failed to check status");
        }

        if (data.ready && data.stripe_onboarding_status === "complete") {
          setOnboardingCompleted(true);
        } else if (data.hasAccount || data.stripe_onboarding_status === "in_progress") {
          // Account exists but onboarding not completed - get onboarding URL
          const onboardResponse = await fetch("/api/stripe/connect/onboard", {
            method: "POST",
          });
          const onboardData = await onboardResponse.json();

          if (!onboardResponse.ok) {
            throw new Error(onboardData.error || "Failed to get onboarding URL");
          }

          setOnboardingUrl(onboardData.url);
        } else {
          // No account - create one
          const onboardResponse = await fetch("/api/stripe/connect/onboard", {
            method: "POST",
          });
          const onboardData = await onboardResponse.json();

          if (!onboardResponse.ok) {
            throw new Error(onboardData.error || "Failed to create account");
          }

          setOnboardingUrl(onboardData.url);
        }
      } catch (err: any) {
        setError(err.message || "An error occurred");
      } finally {
        setLoading(false);
      }
    };

    checkStatus();
  }, []);

  const handleStartOnboarding = () => {
    if (onboardingUrl) {
      window.location.href = onboardingUrl;
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen">
        <Nav />
        <main className="container mx-auto px-4 py-8">
          <div className="max-w-2xl mx-auto">
            <Card>
              <CardContent className="p-12 text-center">
                <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4 text-muted-foreground" />
                <p className="text-muted-foreground">Loading...</p>
              </CardContent>
            </Card>
          </div>
        </main>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen">
        <Nav />
        <main className="container mx-auto px-4 py-8">
          <div className="max-w-2xl mx-auto">
            <Card>
              <CardContent className="p-6">
                <div className="flex gap-3">
                  <AlertCircle className="h-5 w-5 text-destructive mt-0.5 flex-shrink-0" />
                  <div>
                    <h3 className="font-semibold mb-2">Error</h3>
                    <p className="text-sm text-muted-foreground">{error}</p>
                  </div>
                </div>
                <Button
                  onClick={() => router.push("/my-listings")}
                  className="mt-4"
                  variant="outline"
                >
                  Back to My Listings
                </Button>
              </CardContent>
            </Card>
          </div>
        </main>
      </div>
    );
  }

  if (onboardingCompleted) {
    return (
      <div className="min-h-screen">
        <Nav />
        <main className="container mx-auto px-4 py-8">
          <div className="max-w-2xl mx-auto">
            <Card className="border-green-200 bg-green-50">
              <CardContent className="p-6">
                <div className="flex gap-3">
                  <CheckCircle2 className="h-5 w-5 text-green-600 mt-0.5 flex-shrink-0" />
                  <div>
                    <h3 className="font-semibold mb-2">Stripe Account Connected</h3>
                    <p className="text-sm text-muted-foreground">
                      Your Stripe account is set up and ready to receive payouts. You can now accept booking requests.
                    </p>
                  </div>
                </div>
                <Button
                  onClick={() => router.push("/my-listings")}
                  className="mt-4"
                >
                  Go to My Listings
                </Button>
              </CardContent>
            </Card>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <Nav />
      <main className="container mx-auto px-4 py-8">
        <div className="max-w-2xl mx-auto">
          <Card>
            <CardHeader>
              <CardTitle>Complete Stripe Onboarding</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-muted-foreground">
                To accept bookings and receive payouts, you need to complete Stripe Connect onboarding.
                This is a secure process that allows BorrowedHome to process payments on your behalf.
              </p>

              <div className="space-y-2">
                <h4 className="font-semibold">What you&apos;ll need:</h4>
                <ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground">
                  <li>Business or personal information</li>
                  <li>Bank account details for payouts</li>
                  <li>Tax identification (if applicable)</li>
                </ul>
              </div>

              <Button
                onClick={handleStartOnboarding}
                disabled={!onboardingUrl}
                className="w-full"
              >
                Start Onboarding
              </Button>

              <Button
                onClick={() => router.push("/my-listings")}
                variant="outline"
                className="w-full"
              >
                Cancel
              </Button>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
