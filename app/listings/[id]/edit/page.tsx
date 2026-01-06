import { Nav } from "@/components/nav";
import { EditListingForm } from "@/components/edit-listing-form";
import { createClient } from "@/lib/supabase/server";
import { notFound, redirect } from "next/navigation";

export default async function EditListingPage({
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

  // Get listing with all related data
  const { data: listing } = await supabase
    .from("listings")
    .select(`
      *,
      listing_spaces(space_type),
      listing_photos(*),
      listing_availability(*)
    `)
    .eq("id", id)
    .eq("host_id", user.id)
    .single();

  if (!listing) {
    notFound();
  }

  // Get photo URLs
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

  return (
    <div className="min-h-screen">
      <Nav />
      <main className="container mx-auto px-4 py-8">
        <EditListingForm
          listing={{
            ...listing,
            photos: photosWithUrls,
            spaces: listing.listing_spaces?.map((s: any) => s.space_type),
            availability: listing.listing_availability,
          }}
        />
      </main>
    </div>
  );
}
