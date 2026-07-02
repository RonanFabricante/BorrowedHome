import { Nav } from "@/components/nav";
import { ListingsGrid } from "@/components/listings-grid";
import { createClient } from "@/lib/supabase/server";

export default async function ListingsPage({
  searchParams,
}: {
  searchParams: { location?: string; date?: string; startTime?: string; endTime?: string };
}) {
  const supabase = await createClient();

  // When date/time filters are present, require a matching availability
  // window (inner join); otherwise embed availability without filtering.
  const hasTimeFilter = Boolean(
    searchParams.date && searchParams.startTime && searchParams.endTime
  );

  let query = supabase
    .from("listings")
    .select(`
      *,
      listing_spaces(space_type),
      listing_photos(id, storage_path, sort_order),
      listing_availability${hasTimeFilter ? "!inner" : ""}(day_of_week, start_time, end_time)
    `)
    .eq("published", true)
    .order("created_at", { ascending: false });

  if (searchParams.location) {
    query = query.ilike("location_text", `%${searchParams.location}%`);
  }

  if (hasTimeFilter) {
    const dayOfWeek = new Date(`${searchParams.date}T00:00:00`).getDay();
    query = query
      .eq("listing_availability.day_of_week", dayOfWeek)
      .lte("listing_availability.start_time", searchParams.startTime!)
      .gte("listing_availability.end_time", searchParams.endTime!);
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
  ).then((results) =>
    results.map((listing: any) => ({
      ...listing,
      // ListingsGrid expects `spaces` as an array of space type strings
      spaces: listing.listing_spaces?.map((s: any) => s.space_type) || [],
    }))
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
