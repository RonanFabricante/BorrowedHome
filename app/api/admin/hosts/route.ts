import { NextRequest, NextResponse } from "next/server";
import { requireSuperadminApi } from "@/lib/admin/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const gate = await requireSuperadminApi();
  if (!gate.ok) return gate.response;

  const { searchParams } = new URL(request.url);
  const incomplete = searchParams.get("incomplete") === "1";
  const limit = Math.min(Number(searchParams.get("limit") || 50), 100);

  const admin = createAdminClient();
  let query = admin
    .from("hosts")
    .select(
      `
      id,
      user_id,
      stripe_account_id,
      stripe_charges_enabled,
      stripe_payouts_enabled,
      stripe_onboarding_status,
      stripe_requirements_due,
      created_at,
      updated_at
    `
    )
    .order("updated_at", { ascending: false })
    .limit(limit);

  if (incomplete) {
    query = query.or(
      "stripe_charges_enabled.eq.false,stripe_payouts_enabled.eq.false,stripe_account_id.is.null"
    );
  }

  const { data: hosts, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const userIds = (hosts || []).map((h) => h.user_id);
  let profiles: Record<string, { full_name: string | null }> = {};
  if (userIds.length) {
    const { data: profileRows } = await admin
      .from("profiles")
      .select("id, full_name")
      .in("id", userIds);
    for (const p of profileRows || []) {
      profiles[p.id] = { full_name: p.full_name };
    }
  }

  const enriched = (hosts || []).map((h) => ({
    ...h,
    full_name: profiles[h.user_id]?.full_name ?? null,
  }));

  return NextResponse.json({ hosts: enriched });
}
