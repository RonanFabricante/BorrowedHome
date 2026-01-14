import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getHostCalendarBookings } from "@/lib/host/dashboard";

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
    const from = searchParams.get("from");
    const to = searchParams.get("to");

    if (!from || !to) {
      return NextResponse.json(
        { error: "from and to parameters are required" },
        { status: 400 }
      );
    }

    const events = await getHostCalendarBookings(
      user.id,
      new Date(from),
      new Date(to)
    );

    return NextResponse.json(events);
  } catch (error: any) {
    console.error("[Host Calendar API] Error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch calendar events" },
      { status: 500 }
    );
  }
}
