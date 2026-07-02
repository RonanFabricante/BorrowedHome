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

  // Check for active bookings (open request, awaiting payment, or confirmed) if user is host
  let hasActiveBookings = false;
  if (isHost) {
    const { data: activeBookings } = await supabase
      .from("bookings")
      .select("id")
      .eq("listing_id", id)
      .in("status", ["REQUESTED", "PENDING", "PAYMENT_PENDING", "CONFIRMED"])
      .limit(1);
    hasActiveBookings = (activeBookings || []).length > 0;
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

  // Get review summary
  const { data: reviewSummary } = await supabase.rpc("get_listing_review_summary", {
    p_listing_id: id,
  });

  // Get latest reviews
  const { data: reviews } = await supabase.rpc("get_listing_reviews", {
    p_listing_id: id,
    p_limit: 10,
    p_offset: 0,
  });

  // Get host review summary (if listing has a host)
  let hostReviewSummary = null;
  let hostReviewSnippets: any[] = [];
  if (listing.host_id) {
    const { data: hostSummary } = await supabase.rpc("get_host_review_summary", {
      p_host_id: listing.host_id,
    });
    hostReviewSummary = hostSummary?.[0] || null;

    const { data: snippets } = await supabase.rpc("get_host_review_snippets", {
      p_host_id: listing.host_id,
      p_limit: 3,
    });
    hostReviewSnippets = snippets || [];
  }

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
          hasActiveBookings={hasActiveBookings}
          reviewSummary={reviewSummary?.[0] || null}
          reviews={reviews || []}
          hostReviewSummary={hostReviewSummary}
          hostReviewSnippets={hostReviewSnippets}
        />
      </main>
    </div>
  );
}
