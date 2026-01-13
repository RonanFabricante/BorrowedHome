import { Nav } from "@/components/nav";
import { BookingConfirmation } from "@/components/booking-confirmation";
import { createClient } from "@/lib/supabase/server";
import { notFound, redirect } from "next/navigation";

export default async function BookingConfirmPage({
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

  // Auto-update past CONFIRMED bookings to COMPLETED
  await supabase.rpc("mark_past_bookings_completed");

  // Fetch booking - allow both guest and host to view
  const { data: booking } = await supabase
    .from("bookings")
    .select(`
      *,
      listings!inner(
        id,
        title,
        location_text,
        address_text,
        host_id,
        host_present,
        cooking_allowed,
        alcohol_allowed,
        noise_tolerance,
        cleaning_expectations
      ),
      profiles!bookings_guest_id_fkey(id, full_name)
    `)
    .eq("id", id)
    .single();

  if (!booking) {
    notFound();
  }

  // Verify user has access (either guest or host)
  const isGuest = booking.guest_id === user.id;
  const isHost = booking.listings.host_id === user.id;

  if (!isGuest && !isHost) {
    notFound();
  }

  return (
    <div className="min-h-screen">
      <Nav />
      <main className="container mx-auto px-4 py-8">
        <BookingConfirmation booking={booking} isHost={isHost} />
      </main>
    </div>
  );
}
