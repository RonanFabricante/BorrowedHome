import { Nav } from "@/components/nav";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { HostDashboardContent } from "@/components/host-dashboard-content";
import { getHostDashboardSummary, getHostBookings } from "@/lib/host/dashboard";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function HostDashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/login");
  }

  // Check if user is a host (has any listings)
  const { data: listings } = await supabase
    .from("listings")
    .select("id")
    .eq("host_id", user.id)
    .limit(1);

  if (!listings || listings.length === 0) {
    // User is not a host - show empty state
    return (
      <div className="min-h-screen">
        <Nav />
        <main className="mx-auto w-full max-w-[920px] px-4 py-16 sm:px-6">
          <div className="mx-auto max-w-md text-center">
            <p className="bh-micro mb-2">host</p>
            <h1 className="font-display text-3xl font-bold lowercase tracking-tighter mb-4">
              host dashboard
            </h1>
            <p className="text-muted-foreground mb-8">
              Create a listing to start hosting and access your dashboard.
            </p>
            <a
              href="/host/onboard"
              className="inline-flex items-center justify-center rounded-md bg-cta px-4 py-2 text-sm font-semibold text-cta-foreground hover:bg-cta/90"
            >
              Create a listing
            </a>
          </div>
        </main>
      </div>
    );
  }

  // Get dashboard summary
  const summary = await getHostDashboardSummary(user.id);

  const { tab } = await searchParams;
  const activeTab = tab || "requests";

  // Pre-fetch requests data if on requests tab
  const requests = activeTab === "requests" 
    ? await getHostBookings(user.id, { status: "REQUESTED" })
    : [];

  return (
    <div className="min-h-screen bg-background">
      <Nav />
      <main className="mx-auto w-full max-w-[920px] px-4 py-8 sm:px-6 sm:py-12">
        <HostDashboardContent
          hostId={user.id}
          summary={summary}
          activeTab={activeTab}
          initialRequests={requests}
        />
      </main>
    </div>
  );
}
