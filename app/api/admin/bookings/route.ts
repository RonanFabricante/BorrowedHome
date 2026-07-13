import { NextRequest, NextResponse } from "next/server";
import { requireSuperadminApi } from "@/lib/admin/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const gate = await requireSuperadminApi();
  if (!gate.ok) return gate.response;

  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q")?.trim() || "";
  const status = searchParams.get("status")?.trim() || "";
  const limit = Math.min(Number(searchParams.get("limit") || 50), 100);

  const admin = createAdminClient();
  let query = admin
    .from("bookings")
    .select(
      `
      id,
      status,
      start_at,
      end_at,
      total_amount,
      platform_fee_amount,
      deposit_amount,
      currency,
      guest_id,
      payment_status,
      payment_deadline_at,
      created_at,
      listings!inner(
        id,
        title,
        location_text,
        host_id
      )
    `
    )
    .order("created_at", { ascending: false })
    .limit(limit);

  if (status) {
    query = query.eq("status", status);
  }

  if (q) {
    const isUuid =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        q
      );
    if (isUuid) {
      query = query.or(`id.eq.${q},guest_id.eq.${q}`);
    } else {
      const { data: matchingListings } = await admin
        .from("listings")
        .select("id")
        .ilike("title", `%${q}%`)
        .limit(50);
      const listingIds = (matchingListings || []).map((l) => l.id);
      if (listingIds.length === 0) {
        return NextResponse.json({ bookings: [] });
      }
      query = query.in("listing_id", listingIds);
    }
  }

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ bookings: data || [] });
}
