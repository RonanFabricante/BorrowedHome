import { Nav } from "@/components/nav";
import { EditListingForm } from "@/components/edit-listing-form";
import { createClient } from "@/lib/supabase/server";
import { notFound, redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import Link from "next/link";

export default async function EditListingPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/login");
  }

  // Get listing with all related data
  const { data: listing } = await supabase
    .from("listings")
    .select(`
      *,
      listing_spaces(space_type),
      listing_photos(*),
      listing_availability(*)
    `)
    .eq("id", id)
    .eq("host_id", user.id)
    .single();

  if (!listing) {
    notFound();
  }

  // Private address lives in listing_addresses (hosts can read their own)
  const { data: addressRow } = await supabase
    .from("listing_addresses")
    .select("address_text")
    .eq("listing_id", id)
    .maybeSingle();

  const listingWithAddress = {
    ...listing,
    address_text: addressRow?.address_text || "",
  };

  // Check for active bookings (including request / payment window)
  const { data: activeBookings } = await supabase
    .from("bookings")
    .select("id, status")
    .eq("listing_id", id)
    .in("status", ["PENDING", "REQUESTED", "PAYMENT_PENDING", "CONFIRMED"])
    .limit(1);

  const hasActiveBookings = (activeBookings || []).length > 0;

  // Get photo URLs
  const photosWithUrls = await Promise.all(
    (listing.listing_photos || []).map(async (photo: any) => {
      const { data } = await supabase.storage
        .from("listing-photos")
        .createSignedUrl(photo.storage_path, 3600);
      return {
        ...photo,
        url: data?.signedUrl || null,
      };
    })
  );

  return (
    <div className="min-h-screen">
      <Nav />
      <main className="container mx-auto px-4 py-8">
        {hasActiveBookings ? (
          <div className="max-w-2xl mx-auto">
            <div className="border-amber-200 bg-amber-50 rounded-lg border p-6">
              <h2 className="text-2xl font-semibold mb-2">Editing Disabled</h2>
              <p className="text-muted-foreground mb-4">
                This listing cannot be edited because it has active or confirmed bookings.
                Please wait until all bookings are completed, declined, or cancelled before making changes.
              </p>
              <div className="flex gap-2">
                <Button asChild variant="outline">
                  <Link href={`/listings/${id}`}>View Listing</Link>
                </Button>
                <Button asChild variant="outline">
                  <Link href="/my-listings">Back to My Listings</Link>
                </Button>
              </div>
            </div>
          </div>
        ) : (
          <EditListingForm
            listing={{
              ...listingWithAddress,
              photos: photosWithUrls,
              spaces: listing.listing_spaces?.map((s: any) => s.space_type),
              availability: listing.listing_availability,
            }}
          />
        )}
      </main>
    </div>
  );
}
