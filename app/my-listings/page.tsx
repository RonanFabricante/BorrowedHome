import { Nav } from "@/components/nav";
import { MyListingsList } from "@/components/my-listings-list";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { Plus, LayoutList } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { StatusBanner } from "@/components/status-banner";

export default async function MyListingsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/login");
  }

  // Auto-update past CONFIRMED bookings to COMPLETED
  // This ensures bookings are marked as completed when hosts view their listings
  await supabase.rpc("mark_past_bookings_completed");

  const { data: listings } = await supabase
    .from("listings")
    .select(`
      *,
      listing_spaces(space_type)
    `)
    .eq("host_id", user.id)
    .order("created_at", { ascending: false });

  // Fetch all bookings for host's listings (not just PENDING)
  const { data: allBookings } = await supabase
    .from("bookings")
    .select(`
      *,
      listings!inner(id, title, location_text, host_id),
      profiles!bookings_guest_id_fkey(id, full_name)
    `)
    .eq("listings.host_id", user.id)
    .order("created_at", { ascending: false });

  // Separate bookings by status. New requests are created as REQUESTED;
  // PENDING is kept for legacy rows.
  const pendingStatuses = ["REQUESTED", "PENDING"];
  const pendingBookings = (allBookings || []).filter(b => pendingStatuses.includes(b.status));
  const confirmedBookings = (allBookings || []).filter(b => b.status === "CONFIRMED");
  const declinedBookings = (allBookings || []).filter(b => b.status === "DECLINED");
  const otherBookings = (allBookings || []).filter(b => 
    ![...pendingStatuses, "CONFIRMED", "DECLINED"].includes(b.status)
  );

  // Check which listings have active bookings (pending request, awaiting payment, or confirmed)
  const listingsWithActiveBookings = new Set(
    (allBookings || [])
      .filter(b => [...pendingStatuses, "PAYMENT_PENDING", "CONFIRMED"].includes(b.status))
      .map(b => b.listing_id)
  );

  // Check Stripe onboarding status
  const { data: host } = await supabase
    .from("hosts")
    .select("stripe_onboarding_status")
    .eq("user_id", user.id)
    .single();

  const stripeOnboardingComplete = host?.stripe_onboarding_status === "complete";

  return (
    <div className="min-h-screen">
      <Nav />
      <main className="container mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-3xl font-bold flex items-center gap-3">
            <LayoutList className="w-8 h-8" />
            My Listings
          </h1>
          <div className="flex gap-2">
            {!stripeOnboardingComplete && (
              <Button asChild>
                <Link href="/host/payouts">Enable payouts</Link>
              </Button>
            )}
            <Button variant="brand" asChild>
              <Link href="/host/onboard" className="flex items-center gap-2">
                <Plus className="w-4 h-4" />
                Create listing
              </Link>
            </Button>
          </div>
        </div>

        {!stripeOnboardingComplete && (
          <StatusBanner
            variant="warning"
            title="Enable payouts to accept bookings"
            className="mb-6"
          >
            <p className="mb-3">
              Complete Stripe Connect onboarding to publish listings and receive booking payments.
            </p>
            <Button asChild size="sm">
              <Link href="/host/payouts">Set up payouts</Link>
            </Button>
          </StatusBanner>
        )}
        <MyListingsList 
          listings={listings || []} 
          pendingBookings={pendingBookings}
          confirmedBookings={confirmedBookings}
          declinedBookings={declinedBookings}
          otherBookings={otherBookings}
          listingsWithActiveBookings={listingsWithActiveBookings}
          hostId={user.id}
        />
      </main>
    </div>
  );
}
