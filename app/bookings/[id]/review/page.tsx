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
      listings!inner(id, title, host_id),
      profiles!bookings_guest_id_fkey(id, full_name)
    `)
    .eq("id", id)
    .single();

  if (!booking) {
    notFound();
  }

  const hasAccess =
    booking.guest_id === user.id ||
    booking.listings.host_id === user.id;

  if (!hasAccess) {
    notFound();
  }

  // Check if booking is completed (required for reviews)
  if (booking.status !== "COMPLETED") {
    notFound();
  }

  // Check if user has already submitted a review
  const isGuest = booking.guest_id === user.id;
  const revieweeId = isGuest
    ? booking.listings.host_id
    : booking.guest_id;

  const { data: existingReview } = await supabase
    .from("reviews")
    .select("id")
    .eq("booking_id", id)
    .eq("reviewer_id", user.id)
    .eq("reviewee_id", revieweeId)
    .single();

  if (existingReview) {
    // User has already reviewed - redirect to bookings page
    redirect("/my-bookings");
  }

  return (
    <div className="min-h-screen">
      <Nav />
      <main className="container mx-auto px-4 py-8">
        <ReviewForm booking={booking} userId={user.id} />
      </main>
    </div>
  );
}
