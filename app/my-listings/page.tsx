import { Nav } from "@/components/nav";
import { MyListingsList } from "@/components/my-listings-list";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { StatusBanner } from "@/components/status-banner";

export default async function MyListingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/login");
  }

  const { data: listingsRaw } = await supabase
    .from("listings")
    .select(
      `
      *,
      listing_spaces(space_type),
      listing_photos(storage_path, sort_order)
    `
    )
    .eq("host_id", user.id)
    .order("created_at", { ascending: false });

  const listings = (listingsRaw || []).map((listing: any) => {
    const photos = [...(listing.listing_photos || [])].sort(
      (a: any, b: any) => a.sort_order - b.sort_order
    );
    const path = photos[0]?.storage_path;
    let photo_url: string | null = null;
    if (path) {
      const { data } = supabase.storage.from("listing-photos").getPublicUrl(path);
      photo_url = data.publicUrl;
    }
    return { ...listing, photo_url };
  });

  const { data: allBookingsRaw } = await supabase
    .from("bookings")
    .select(
      `
      *,
      listings!inner(id, title, location_text, host_id, listing_photos(storage_path, sort_order)),
      profiles!bookings_guest_id_fkey(id, full_name)
    `
    )
    .eq("listings.host_id", user.id)
    .order("created_at", { ascending: false });

  const withPhotos = (allBookingsRaw || []).map((b: any) => {
    const photos = [...(b.listings?.listing_photos || [])].sort(
      (a: any, c: any) => a.sort_order - c.sort_order
    );
    const path = photos[0]?.storage_path;
    let photo_url: string | null = null;
    if (path) {
      const { data } = supabase.storage.from("listing-photos").getPublicUrl(path);
      photo_url = data.publicUrl;
    }
    return {
      ...b,
      listings: b.listings ? { ...b.listings, photo_url } : b.listings,
    };
  });

  const pendingStatuses = ["REQUESTED", "PENDING"];
  const pendingBookings = withPhotos.filter((b) =>
    pendingStatuses.includes(b.status)
  );
  const confirmedBookings = withPhotos.filter((b) => b.status === "CONFIRMED");
  const declinedBookings = withPhotos.filter((b) => b.status === "DECLINED");
  const otherBookings = withPhotos.filter(
    (b) => ![...pendingStatuses, "CONFIRMED", "DECLINED"].includes(b.status)
  );

  const listingsWithActiveBookings = new Set(
    withPhotos
      .filter((b) =>
        [...pendingStatuses, "PAYMENT_PENDING", "CONFIRMED"].includes(b.status)
      )
      .map((b) => b.listing_id)
  );

  const { data: host } = await supabase
    .from("hosts")
    .select("stripe_onboarding_status")
    .eq("user_id", user.id)
    .single();

  const stripeOnboardingComplete = host?.stripe_onboarding_status === "complete";
  const published = listings.filter((l) => l.published).length;
  const awaitingPay = otherBookings.filter(
    (b) => b.status === "PAYMENT_PENDING"
  ).length;

  return (
    <div className="min-h-screen bg-background">
      <Nav />
      <main className="mx-auto w-full max-w-[920px] px-4 py-8 sm:px-6 sm:py-12">
        <header className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="bh-micro mb-2">host</p>
            <h1 className="font-display text-3xl font-bold lowercase tracking-tighter sm:text-4xl">
              my listings
            </h1>
            <p className="bh-data mt-2 text-sm text-accent-ink">
              {listings.length} listing{listings.length === 1 ? "" : "s"} ·{" "}
              {published} published
              {pendingBookings.length
                ? ` · ${pendingBookings.length} request${pendingBookings.length === 1 ? "" : "s"}`
                : ""}
              {awaitingPay ? ` · ${awaitingPay} awaiting payment` : ""}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {!stripeOnboardingComplete && (
              <Button asChild>
                <Link href="/host/payouts">Enable payouts</Link>
              </Button>
            )}
            <Button variant="brand" asChild>
              <Link href="/host/onboard">Create listing</Link>
            </Button>
          </div>
        </header>

        {!stripeOnboardingComplete && (
          <StatusBanner
            variant="warning"
            title="Enable payouts to accept bookings"
            className="mb-6"
          >
            <p className="mb-3">
              Complete Stripe Connect onboarding to publish listings and receive
              booking payments.
            </p>
            <Button asChild size="sm">
              <Link href="/host/payouts">Set up payouts</Link>
            </Button>
          </StatusBanner>
        )}

        <MyListingsList
          listings={listings}
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
