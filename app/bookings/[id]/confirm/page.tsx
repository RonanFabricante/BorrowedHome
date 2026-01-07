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

  const { data: booking } = await supabase
    .from("bookings")
    .select(`
      *,
      listings!inner(
        id,
        title,
        location_text,
        address_text,
        host_present,
        cooking_allowed,
        alcohol_allowed,
        noise_tolerance,
        cleaning_expectations
      )
    `)
    .eq("id", id)
    .eq("guest_id", user.id)
    .single();

  if (!booking) {
    notFound();
  }

  return (
    <div className="min-h-screen">
      <Nav />
      <main className="container mx-auto px-4 py-8">
        <BookingConfirmation booking={booking} />
      </main>
    </div>
  );
}
