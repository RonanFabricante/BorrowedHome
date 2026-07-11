import { Nav } from "@/components/nav";
import { ListingsGrid } from "@/components/listings-grid";
import { createClient } from "@/lib/supabase/server";
import { BookingRulesLine } from "@/components/booking-rules-line";
import { sydneyDayOfWeek } from "@/lib/timezone";

export default async function ListingsPage({
  searchParams,
}: {
  searchParams: {
    location?: string;
    date?: string;
    startTime?: string;
    endTime?: string;
    tz?: string;
  };
}) {
  const supabase = await createClient();

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
    const dayOfWeek = sydneyDayOfWeek(searchParams.date!);
    query = query
      .eq("listing_availability.day_of_week", dayOfWeek)
      .lte("listing_availability.start_time", searchParams.startTime!)
      .gte("listing_availability.end_time", searchParams.endTime!);
  }

  const { data: listings } = await query;

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
      spaces: listing.listing_spaces?.map((s: any) => s.space_type) || [],
    }))
  );

  const count = listingsWithPhotos.length;
  const locationLabel = searchParams.location?.trim();

  return (
    <div className="min-h-screen bg-background">
      <Nav />
      <main className="bh-container py-8 sm:py-12">
        <header className="mb-8">
          <p className="bh-micro mb-2">browse</p>
          <h1 className="mb-2 font-display text-3xl font-bold lowercase tracking-tighter sm:text-4xl">
            {locationLabel ? `homes in ${locationLabel.toLowerCase()}` : "browse homes"}
          </h1>
          <p className="bh-data mb-2 text-sm text-accent-ink">
            {count === 0
              ? "no results for your search"
              : `${count} home${count === 1 ? "" : "s"} available`}
          </p>
          <BookingRulesLine />
          <hr className="bh-rule mt-8" />
        </header>
        <ListingsGrid listings={listingsWithPhotos} location={locationLabel} />
      </main>
    </div>
  );
}
