import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getHostEarningsSummary } from "@/lib/host/dashboard";

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

    const summary = await getHostEarningsSummary(user.id);

    return NextResponse.json(summary);
  } catch (error: any) {
    console.error("[Host Earnings API] Error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch earnings" },
      { status: 500 }
    );
  }
}
