import { Nav } from "@/components/nav";
import { ListingsGrid } from "@/components/listings-grid";
import { createClient } from "@/lib/supabase/server";

export default async function ListingsPage({
  searchParams,
}: {
  searchParams: { location?: string; date?: string; startTime?: string; endTime?: string };
}) {
  const supabase = await createClient();
  
  let query = supabase
    .from("listings")
    .select(`
      *,
      listing_spaces(space_type),
      listing_photos(id, storage_path, sort_order)
    `)
    .eq("published", true)
    .order("created_at", { ascending: false });

  if (searchParams.location) {
    query = query.ilike("location_text", `%${searchParams.location}%`);
  }

  const { data: listings } = await query;

  // Generate signed URLs for photos
  const listingsWithPhotos = await Promise.all(
    (listings || []).map(async (listing: any) => {
      if (!listing.listing_photos || listing.listing_photos.length === 0) {
        return { ...listing, photos: [] };
      }

      const photosWithUrls = await Promise.all(
        listing.listing_photos.map(async (photo: any) => {
          const { data } = await supabase.storage
            .from("listing-photos")
            .createSignedUrl(photo.storage_path, 3600);
          return {
            ...photo,
            url: data?.signedUrl || null,
          };
        })
      );

      return {
        ...listing,
        photos: photosWithUrls,
      };
    })
  );

  return (
    <div className="min-h-screen">
      <Nav />
      <main className="container mx-auto px-4 py-8">
        <h1 className="text-3xl font-bold mb-8">
          {searchParams.location ? `Homes in ${searchParams.location}` : "All Homes"}
        </h1>
        <ListingsGrid listings={listingsWithPhotos} />
      </main>
    </div>
  );
}
