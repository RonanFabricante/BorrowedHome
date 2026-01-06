import { Nav } from "@/components/nav";
import { MessagesThread } from "@/components/messages-thread";
import { createClient } from "@/lib/supabase/server";
import { notFound, redirect } from "next/navigation";

export default async function MessagesPage({
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

  // Verify user has access to this booking
  const { data: booking } = await supabase
    .from("bookings")
    .select(`
      *,
      listings!inner(id, title, host_id)
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
        <MessagesThread bookingId={params.id} userId={user.id} />
      </main>
    </div>
  );
}
