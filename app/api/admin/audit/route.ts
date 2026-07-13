import { NextRequest, NextResponse } from "next/server";
import { requireSuperadminApi } from "@/lib/admin/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const gate = await requireSuperadminApi();
  if (!gate.ok) return gate.response;

  const { searchParams } = new URL(request.url);
  const limit = Math.min(Number(searchParams.get("limit") || 50), 100);

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("admin_actions")
    .select(
      `
      id,
      actor_id,
      action,
      entity_type,
      entity_id,
      reason,
      payload,
      created_at
    `
    )
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const actorIds = [...new Set((data || []).map((a) => a.actor_id))];
  const names: Record<string, string | null> = {};
  if (actorIds.length) {
    const { data: profiles } = await admin
      .from("profiles")
      .select("id, full_name")
      .in("id", actorIds);
    for (const p of profiles || []) {
      names[p.id] = p.full_name;
    }
  }

  const actions = (data || []).map((a) => ({
    ...a,
    actor_name: names[a.actor_id] ?? null,
  }));

  return NextResponse.json({ actions });
}
