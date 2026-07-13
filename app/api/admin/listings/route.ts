import { NextRequest, NextResponse } from "next/server";
import { requireSuperadminApi } from "@/lib/admin/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { setListingPublishedAdmin } from "@/lib/admin/ops";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const gate = await requireSuperadminApi();
  if (!gate.ok) return gate.response;

  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q")?.trim() || "";
  const published = searchParams.get("published");
  const limit = Math.min(Number(searchParams.get("limit") || 50), 100);

  const admin = createAdminClient();
  let query = admin
    .from("listings")
    .select(
      `
      id,
      title,
      location_text,
      country,
      currency,
      published,
      host_id,
      hourly_rate,
      created_at,
      updated_at
    `
    )
    .order("updated_at", { ascending: false })
    .limit(limit);

  if (published === "true") query = query.eq("published", true);
  if (published === "false") query = query.eq("published", false);
  if (q) query = query.or(`title.ilike.%${q}%,location_text.ilike.%${q}%`);

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ listings: data || [] });
}

export async function PATCH(request: NextRequest) {
  const gate = await requireSuperadminApi();
  if (!gate.ok) return gate.response;

  const body = await request.json();
  const { listingId, published, reason } = body as {
    listingId?: string;
    published?: boolean;
    reason?: string;
  };

  if (!listingId || typeof published !== "boolean") {
    return NextResponse.json(
      { error: "listingId and published are required" },
      { status: 400 }
    );
  }

  const result = await setListingPublishedAdmin(
    gate.ctx.userId,
    listingId,
    published,
    reason
  );

  return NextResponse.json(result, { status: result.success ? 200 : 400 });
}
