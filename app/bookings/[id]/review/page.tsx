import { Nav } from "@/components/nav";
import { ReviewForm } from "@/components/review-form";
import { createClient } from "@/lib/supabase/server";
import { notFound, redirect } from "next/navigation";

export default async function ReviewPage({
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

  const { data: booking } = await supabase
    .from("bookings")
    .select(`
      *,
      listings!inner(
        id,
        title,
        host_id,
        listing_spaces(space_type)
      ),
      profiles!bookings_guest_id_fkey(id, full_name)
    `)
    .eq("id", id)
    .single();

  if (!booking) {
    notFound();
  }

  // Only guests can review (listing-scoped reviews)
  if (booking.guest_id !== user.id) {
    notFound();
  }

  // Check if booking is completed (required for reviews)
  if (booking.status !== "COMPLETED") {
    notFound();
  }

  // Check if user has already submitted a review
  const { data: existingReview } = await supabase
    .from("reviews")
    .select("id")
    .eq("booking_id", id)
    .single();

  if (existingReview) {
    // User has already reviewed - redirect to listing page
    redirect(`/listings/${booking.listings.id}#reviews`);
  }

  // Get space label from listing spaces
  const spaces = booking.listings.listing_spaces || [];
  const spaceLabels: Record<string, string> = {
    KITCHEN: "Kitchen",
    DINING: "Dining",
    LIVING: "Living Room",
    GARDEN: "Garden",
    POOL: "Swimming Pool",
    GARAGE: "Garage",
  };
  const spaceLabel = spaces
    .map((s: any) => spaceLabels[s.space_type] || s.space_type)
    .join(" + ") || "Space";

  return (
    <div className="min-h-screen">
      <Nav />
      <main className="container mx-auto px-4 py-8">
        <ReviewForm 
          booking={booking} 
          userId={user.id}
          spaceLabel={spaceLabel}
        />
      </main>
    </div>
  );
}
