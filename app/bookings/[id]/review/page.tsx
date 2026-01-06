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

  return (
    <div className="min-h-screen">
      <Nav />
      <main className="container mx-auto px-4 py-8">
        <ReviewForm booking={booking} userId={user.id} />
      </main>
    </div>
  );
}
