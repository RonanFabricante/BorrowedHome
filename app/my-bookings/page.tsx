import { Nav } from "@/components/nav";
import { MyBookingsList } from "@/components/my-bookings-list";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { Calendar } from "lucide-react";

export default async function MyBookingsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/login");
  }

  const { data: bookings } = await supabase
    .from("bookings")
    .select(`
      *,
      listings(id, title, location_text)
    `)
    .eq("guest_id", user.id)
    .order("start_at", { ascending: false });

  return (
    <div className="min-h-screen">
      <Nav />
      <main className="container mx-auto px-4 py-8">
        <h1 className="text-3xl font-bold mb-8 flex items-center gap-3">
          <Calendar className="w-8 h-8" />
          My Bookings
        </h1>
        <MyBookingsList bookings={bookings || []} />
      </main>
    </div>
  );
}
