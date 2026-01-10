"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Nav } from "@/components/nav";
import { HostOnboardingWizard } from "@/components/host-onboarding-wizard";
import { createClient } from "@/lib/supabase/client";
import { Logo } from "@/components/logo";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AlertCircle } from "lucide-react";
import Link from "next/link";

export default function HostOnboardPage() {
  const router = useRouter();
  const supabase = createClient();
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<any>(null);
  const [stripeStatus, setStripeStatus] = useState<{
    ready: boolean;
    status?: string;
    loading: boolean;
  }>({ ready: false, loading: true });

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) {
        router.push("/auth/login");
        return;
      }
      setUser(data.user);

      // Check Stripe onboarding status
      const { data: host, error: hostError } = await supabase
        .from("hosts")
        .select("stripe_onboarding_status, stripe_charges_enabled, stripe_payouts_enabled")
        .eq("user_id", data.user.id)
        .single();

      if (hostError && hostError.code !== "PGRST116") {
        console.error("Error checking Stripe status:", hostError);
      }

      // Check if Stripe is ready (complete and capabilities enabled)
      const isReady =
        host?.stripe_onboarding_status === "complete" &&
        host?.stripe_charges_enabled === true &&
        host?.stripe_payouts_enabled === true;

      setStripeStatus({
        ready: isReady,
        status: host?.stripe_onboarding_status || "not_started",
        loading: false,
      });
      setLoading(false);
    });
  }, [supabase, router]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Logo size="lg" href={null} />
      </div>
    );
  }

  // Show blocker if Stripe not ready
  if (!stripeStatus.ready) {
    return (
      <div className="min-h-screen">
        <Nav />
        <main className="container mx-auto px-4 py-8">
          <div className="max-w-2xl mx-auto">
            <Card>
              <CardHeader>
                <CardTitle>Complete Stripe Setup First</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex gap-3 p-4 bg-amber-50 border border-amber-200 rounded-lg">
                  <AlertCircle className="h-5 w-5 text-amber-600 mt-0.5 flex-shrink-0" />
                  <div>
                    <h3 className="font-semibold text-amber-900 mb-1">
                      Stripe Onboarding Required
                    </h3>
                    <p className="text-sm text-amber-800 mb-3">
                      To create a listing on BorrowedHome, you must first complete Stripe Connect onboarding. 
                      This allows us to process payments and send payouts to your bank account.
                    </p>
                    <Link href="/host/payouts">
                      <Button className="bg-amber-600 hover:bg-amber-700">
                        Go to Host Payouts Setup
                      </Button>
                    </Link>
                  </div>
                </div>
                
                <div className="p-4 bg-muted rounded-lg space-y-2">
                  <h4 className="font-semibold text-sm">What you&apos;ll need:</h4>
                  <ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground">
                    <li>Business or personal information</li>
                    <li>Bank account details for payouts</li>
                    <li>Tax identification (if applicable)</li>
                  </ul>
                </div>

                {stripeStatus.status === "in_progress" && (
                  <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
                    <p className="text-sm text-blue-800">
                      Your Stripe onboarding is in progress. Complete the remaining steps to continue.
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </main>
      </div>
    );
  }

  // Stripe is ready - show the wizard
  return (
    <div className="min-h-screen">
      <Nav />
      <main className="container mx-auto px-4 py-8">
        <HostOnboardingWizard />
      </main>
    </div>
  );
}
