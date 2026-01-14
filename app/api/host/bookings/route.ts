import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getHostBookings } from "@/lib/host/dashboard";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Check if user is a host
    const { data: listings } = await supabase
      .from("listings")
      .select("id")
      .eq("host_id", user.id)
      .limit(1);

    if (!listings || listings.length === 0) {
      return NextResponse.json({ error: "Not a host" }, { status: 403 });
    }

    const searchParams = request.nextUrl.searchParams;
    const status = searchParams.get("status") || undefined;
    const q = searchParams.get("q") || undefined;
    const from = searchParams.get("from") || undefined;
    const to = searchParams.get("to") || undefined;
    const sort = (searchParams.get("sort") as "created_at" | "start_at") || "created_at";

    const bookings = await getHostBookings(user.id, {
      status,
      q,
      from,
      to,
      sort,
    });

    return NextResponse.json(bookings);
  } catch (error: any) {
    console.error("[Host Bookings API] Error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch bookings" },
      { status: 500 }
    );
  }
}
