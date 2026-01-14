import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const limit = parseInt(searchParams.get("limit") || "10", 10);
    const cursor = searchParams.get("cursor");

    let query = supabase
      .from("notifications")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    // Pagination cursor (if provided)
    if (cursor) {
      query = query.lt("created_at", cursor);
    }

    // Apply limit after cursor filter
    query = query.limit(limit);

    const { data: notifications, error } = await query;

    if (error) {
      console.error("[GET /api/notifications] Error:", error);
      return NextResponse.json(
        { error: "Failed to fetch notifications" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      notifications: notifications || [],
      cursor: notifications && notifications.length > 0
        ? notifications[notifications.length - 1].created_at
        : null,
    });
  } catch (error: any) {
    console.error("[GET /api/notifications] Unexpected error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
