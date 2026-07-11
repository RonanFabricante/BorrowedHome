import { Nav } from "@/components/nav";
import { MyBookingsList, type BookingRow } from "@/components/my-bookings-list";
import { bookingsStatLine } from "@/lib/bookings/grouping";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export default async function MyBookingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/login");
  }

  const { data: bookings } = await supabase
    .from("bookings")
    .select(
      `
      id,
      status,
      start_at,
      end_at,
      guests_count,
      total_amount,
      currency,
      listings!inner(
        id,
        title,
        location_text,
        listing_photos(storage_path, sort_order)
      )
    `
    )
    .eq("guest_id", user.id)
    .order("start_at", { ascending: false });

  const rows: BookingRow[] = (bookings || []).map((b: any) => {
    const photos = [...(b.listings?.listing_photos || [])].sort(
      (a: any, c: any) => a.sort_order - c.sort_order
    );
    const path = photos[0]?.storage_path;
    let photo_url: string | null = null;
    if (path) {
      const { data } = supabase.storage.from("listing-photos").getPublicUrl(path);
      photo_url = data.publicUrl;
    }
    return {
      id: b.id,
      status: b.status,
      start_at: b.start_at,
      end_at: b.end_at,
      guests_count: b.guests_count,
      total_amount: b.total_amount,
      currency: b.currency,
      listings: b.listings
        ? {
            id: b.listings.id,
            title: b.listings.title,
            location_text: b.listings.location_text,
            photo_url,
          }
        : null,
    };
  });

  return (
    <div className="min-h-screen bg-background">
      <Nav />
      <main className="mx-auto w-full max-w-[920px] px-4 py-8 sm:px-6 sm:py-12">
        <header className="mb-8">
          <p className="bh-micro mb-2">guest</p>
          <h1 className="font-display text-3xl font-bold lowercase tracking-tighter sm:text-4xl">
            my bookings
          </h1>
          <p className="bh-data mt-2 text-sm text-accent-ink">
            {bookingsStatLine(rows)}
          </p>
        </header>
        <MyBookingsList bookings={rows} />
      </main>
    </div>
  );
}
