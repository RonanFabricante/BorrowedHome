import { Nav } from "@/components/nav";
import { MyListingsList } from "@/components/my-listings-list";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export default async function MyListingsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/login");
  }

  const { data: listings } = await supabase
    .from("listings")
    .select(`
      *,
      listing_spaces(space_type)
    `)
    .eq("host_id", user.id)
    .order("created_at", { ascending: false });

  return (
    <div className="min-h-screen">
      <Nav />
      <main className="container mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-3xl font-bold">My Listings</h1>
          <a href="/host/onboard">
            <button className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90">
              Create New Listing
            </button>
          </a>
        </div>
        <MyListingsList listings={listings || []} />
      </main>
    </div>
  );
}
