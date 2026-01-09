"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Nav } from "@/components/nav";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AlertCircle, CheckCircle2, Loader2, AlertTriangle } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface HostStatus {
  hasAccount: boolean;
  connectedAccountId?: string;
  chargesEnabled?: boolean;
  payoutsEnabled?: boolean;
  detailsSubmitted?: boolean;
  requirements?: {
    currently_due: string[];
    eventually_due: string[];
    past_due: string[];
    pending_verification: string[];
  };
  // Legacy fields for backward compatibility
  stripe_account_id?: string;
  stripe_charges_enabled?: boolean;
  stripe_payouts_enabled?: boolean;
  stripe_requirements_due?: string[];
  stripe_onboarding_status?: "not_started" | "in_progress" | "complete" | "restricted";
  stripe_disabled_reason?: string;
  ready?: boolean;
}

function HostPayoutsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [onboarding, setOnboarding] = useState(false);
  const [status, setStatus] = useState<HostStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const checkStatus = async () => {
      try {
        // Force fresh fetch with cache-busting
        const response = await fetch("/api/stripe/connect/check-status", {
          cache: "no-store",
          headers: {
            "Cache-Control": "no-cache",
          },
        });
        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || "Failed to check status");
        }

        setStatus(data);
      } catch (err: any) {
        setError(err.message || "An error occurred");
      } finally {
        setLoading(false);
      }
    };

    // Always check status on load, especially when returning from Stripe
    checkStatus();
  }, [searchParams]);

  const handleEnablePayouts = async () => {
    setOnboarding(true);
    setError(null);

    try {
      const response = await fetch("/api/stripe/connect/onboard", {
        method: "POST",
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to start onboarding");
      }

      // Redirect to Stripe onboarding
      if (data.url) {
        window.location.href = data.url;
      }
    } catch (err: any) {
      setError(err.message || "Failed to start onboarding");
      setOnboarding(false);
    }
  };

  const getRequirementLabel = (requirement: string): string => {
    const labels: Record<string, string> = {
      "external_account": "Bank account",
      "individual.verification.document": "Identity verification document",
      "individual.verification.additional_document": "Additional verification document",
      "individual.dob.day": "Date of birth",
      "individual.dob.month": "Date of birth",
      "individual.dob.year": "Date of birth",
      "individual.first_name": "First name",
      "individual.last_name": "Last name",
      "individual.email": "Email address",
      "individual.phone": "Phone number",
      "individual.address.line1": "Address line 1",
      "individual.address.city": "City",
      "individual.address.postal_code": "Postal code",
      "individual.address.state": "State",
      "business_profile.url": "Business website",
      "business_profile.mcc": "Business category",
    };

    return labels[requirement] || requirement.replace(/\./g, " ").replace(/\b\w/g, (l) => l.toUpperCase());
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

  return (
    <div className="min-h-screen">
      <Nav />
      <main className="container mx-auto px-4 py-8">
        <div className="max-w-2xl mx-auto">
          <Card>
            <CardHeader>
              <CardTitle>Host Payouts</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              {error && (
                <div className="p-4 bg-destructive/10 border border-destructive/20 rounded-lg">
                  <div className="flex gap-3">
                    <AlertCircle className="h-5 w-5 text-destructive mt-0.5 flex-shrink-0" />
                    <div>
                      <h3 className="font-semibold text-destructive mb-1">Error</h3>
                      <p className="text-sm text-muted-foreground">{error}</p>
                    </div>
                  </div>
                </div>
              )}

              {(() => {
                // Use new detailed status fields if available, fallback to legacy
                const chargesEnabled = status?.chargesEnabled ?? status?.stripe_charges_enabled ?? false;
                const payoutsEnabled = status?.payoutsEnabled ?? status?.stripe_payouts_enabled ?? false;
                const detailsSubmitted = status?.detailsSubmitted ?? false;
                const currentlyDue = status?.requirements?.currently_due ?? status?.stripe_requirements_due ?? [];
                const isReady = chargesEnabled && payoutsEnabled && currentlyDue.length === 0;
                const isInProgress = !detailsSubmitted || currentlyDue.length > 0;
                const isRestricted = (!chargesEnabled || !payoutsEnabled) && currentlyDue.length > 0;

                if (isReady) {
                  return (
                    <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
                      <div className="flex gap-3">
                        <CheckCircle2 className="h-5 w-5 text-green-600 mt-0.5 flex-shrink-0" />
                        <div>
                          <h3 className="font-semibold mb-2">Ready for Payouts</h3>
                          <p className="text-sm text-muted-foreground">
                            Your Stripe account is set up and ready to receive payouts. You can now accept booking requests.
                          </p>
                          {(status?.connectedAccountId || status?.stripe_account_id) && (
                            <p className="text-xs text-muted-foreground mt-2">
                              Account ID: {(status?.connectedAccountId || status?.stripe_account_id || "").substring(0, 20)}...
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                } else if (isRestricted) {
                  return (
                    <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg">
                      <div className="flex gap-3">
                        <AlertTriangle className="h-5 w-5 text-amber-600 mt-0.5 flex-shrink-0" />
                        <div>
                          <h3 className="font-semibold mb-2">Account Restricted</h3>
                          <p className="text-sm text-muted-foreground">
                            Your Stripe account has been restricted. Please complete any outstanding requirements.
                          </p>
                          {status?.stripe_disabled_reason && (
                            <div className="mt-3 p-2 bg-amber-100 rounded text-xs">
                              <p className="font-semibold mb-1">Reason:</p>
                              <p className="text-muted-foreground">{status.stripe_disabled_reason}</p>
                            </div>
                          )}
                          {currentlyDue.length > 0 && (
                            <div className="mt-3">
                              <p className="text-sm font-semibold mb-2">Required actions:</p>
                              <ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground">
                                {currentlyDue.map((req, idx) => (
                                  <li key={idx}>{getRequirementLabel(req)}</li>
                                ))}
                              </ul>
                            </div>
                          )}
                          <Button
                            onClick={handleEnablePayouts}
                            disabled={onboarding}
                            className="mt-4"
                            variant="outline"
                          >
                            {onboarding ? "Redirecting..." : "Continue Onboarding"}
                          </Button>
                        </div>
                      </div>
                    </div>
                  );
                } else if (isInProgress) {
                  return (
                    <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                      <div className="flex gap-3">
                        <Loader2 className="h-5 w-5 text-blue-600 mt-0.5 flex-shrink-0 animate-spin" />
                        <div>
                          <h3 className="font-semibold mb-2">Onboarding in Progress</h3>
                          <p className="text-sm text-muted-foreground">
                            {!detailsSubmitted
                              ? "Complete your Stripe onboarding to enable payouts."
                              : "Please complete the remaining requirements to enable payouts."}
                          </p>
                          {currentlyDue.length > 0 && (
                            <div className="mt-3">
                              <p className="text-sm font-semibold mb-2">Still required:</p>
                              <ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground">
                                {currentlyDue.map((req, idx) => (
                                  <li key={idx}>{getRequirementLabel(req)}</li>
                                ))}
                              </ul>
                            </div>
                          )}
                          <Button
                            onClick={handleEnablePayouts}
                            disabled={onboarding}
                            className="mt-4"
                          >
                            {onboarding ? "Redirecting..." : "Continue Onboarding"}
                          </Button>
                        </div>
                      </div>
                    </div>
                  );
                }
                return null;
              })()}
              {!status?.hasAccount && (
                <div className="space-y-4">
                  <div>
                    <h3 className="font-semibold mb-2">Enable Payouts</h3>
                    <p className="text-sm text-muted-foreground mb-4">
                      To accept bookings and receive payouts, you need to complete Stripe Connect onboarding.
                      This is a secure process that allows BorrowedHome to process payments on your behalf.
                    </p>

                    <div className="space-y-2 mb-4">
                      <h4 className="font-semibold text-sm">What you&apos;ll need:</h4>
                      <ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground">
                        <li>Business or personal information</li>
                        <li>Bank account details for payouts</li>
                        <li>Tax identification (if applicable)</li>
                      </ul>
                    </div>

                    <Button
                      onClick={handleEnablePayouts}
                      disabled={onboarding}
                      className="w-full"
                    >
                      {onboarding ? "Starting..." : "Enable Payouts"}
                    </Button>
                  </div>
                </div>
              )}

              <div className="pt-4 border-t">
                <Button
                  onClick={() => router.push("/my-listings")}
                  variant="outline"
                  className="w-full"
                >
                  Back to My Listings
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}

export default function HostPayoutsPage() {
  return (
    <Suspense
      fallback={
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
      }
    >
      <HostPayoutsContent />
    </Suspense>
  );
}
