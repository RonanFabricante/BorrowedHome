import { Nav } from "@/components/nav";
import { MyListingsList } from "@/components/my-listings-list";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { Plus, LayoutList } from "lucide-react";

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
              <a href="/host/payouts">
                <button className="px-4 py-2 bg-amber-600 text-white rounded-md hover:bg-amber-700">
                  Enable Payouts
                </button>
              </a>
            )}
            <a href="/host/onboard">
              <button className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 flex items-center gap-2">
                <Plus className="w-4 h-4" />
                Create New Listing
              </button>
            </a>
          </div>
        </div>
        
        {/* Stripe Onboarding Reminder Banner */}
        {!stripeOnboardingComplete && (
          <div className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-lg">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <h3 className="font-semibold text-amber-900 mb-1">Enable Payouts to Accept Bookings</h3>
                <p className="text-sm text-amber-800 mb-3">
                  To publish your listings and accept booking requests, you need to complete Stripe Connect onboarding to add your bank account details.
                </p>
                <a href="/host/payouts">
                  <button className="px-4 py-2 bg-amber-600 text-white rounded-md hover:bg-amber-700 text-sm">
                    Set Up Payouts
                  </button>
                </a>
              </div>
            </div>
          </div>
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
