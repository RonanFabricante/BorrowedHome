import { NextRequest, NextResponse } from "next/server";
import { requireSuperadminApi } from "@/lib/admin/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const gate = await requireSuperadminApi();
  if (!gate.ok) return gate.response;

  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status")?.trim() || "";
  const stuck = searchParams.get("stuck") === "1";
  const disputes = searchParams.get("disputes") === "1";
  const limit = Math.min(Number(searchParams.get("limit") || 50), 100);
  const now = new Date().toISOString();

  const admin = createAdminClient();
  let query = admin
    .from("payments")
    .select(
      `
      id,
      booking_id,
      status,
      amount,
      deposit_amount,
      currency,
      stripe_payment_intent_id,
      stripe_deposit_intent_id,
      review_window_ends_at,
      auto_capture_scheduled_at,
      dispute_reported_at,
      capture_hold_reason,
      deposit_released_at,
      created_at,
      bookings!inner(
        id,
        status,
        listings!inner(title, host_id)
      )
    `
    )
    .order("created_at", { ascending: false })
    .limit(limit);

  if (status) query = query.eq("status", status);
  if (stuck) {
    query = query
      .eq("status", "authorised")
      .lte("review_window_ends_at", now);
  }
  if (disputes) {
    query = query.not("dispute_reported_at", "is", null);
  }

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ payments: data || [] });
}
