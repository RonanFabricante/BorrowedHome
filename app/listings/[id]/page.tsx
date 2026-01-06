import { Nav } from "@/components/nav";
import { ListingDetail } from "@/components/listing-detail";
import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";

export default async function ListingDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  // First check if listing exists and get host_id
  const { data: listingCheck } = await supabase
    .from("listings")
    .select("host_id, published")
    .eq("id", id)
    .single();

  if (!listingCheck) {
    notFound();
  }

  // Check if user is the host
  const isHost = user?.id === listingCheck.host_id;

  // Build query - hosts can see their own listings (published or not), others only published
  let query = supabase
    .from("listings")
    .select(`
      *,
      listing_spaces(space_type),
      listing_photos(*),
      listing_availability(*),
      profiles!listings_host_id_fkey(id, full_name)
    `)
    .eq("id", id);

  if (!isHost) {
    query = query.eq("published", true);
  }

  const { data: listing } = await query.single();

  if (!listing) {
    notFound();
  }

  // Get public URLs for photos
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
        <ListingDetail
          listing={{
            ...listing,
            photos: photosWithUrls,
            spaces: listing.listing_spaces?.map((s: any) => s.space_type),
            availability: listing.listing_availability,
            host: listing.profiles,
          }}
          userId={user?.id}
        />
      </main>
    </div>
  );
}
