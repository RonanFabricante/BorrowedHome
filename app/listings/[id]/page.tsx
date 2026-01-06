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

  const { data: listing } = await supabase
    .from("listings")
    .select(`
      *,
      listing_spaces(space_type),
      listing_photos(*),
      listing_availability(*),
      profiles!listings_host_id_fkey(id, full_name)
    `)
    .eq("id", id)
    .eq("published", true)
    .single();

  if (!listing) {
    notFound();
  }

  // Get public URLs for photos
  const { data: { user } } = await supabase.auth.getUser();
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
