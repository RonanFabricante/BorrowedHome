import { NextRequest, NextResponse } from "next/server";
import { requireSuperadminApi } from "@/lib/admin/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { logAdminAction } from "@/lib/admin/audit";
import { setListingPublishedAdmin, setUserSuspendedAdmin } from "@/lib/admin/ops";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const gate = await requireSuperadminApi();
  if (!gate.ok) return gate.response;

  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status") || "open";
  const limit = Math.min(Number(searchParams.get("limit") || 50), 100);

  const admin = createAdminClient();
  let query = admin
    .from("listing_reports")
    .select(
      `
      id,
      listing_id,
      reporter_id,
      reason,
      details,
      status,
      created_at,
      reviewed_at,
      reviewed_by,
      listings (
        id,
        title,
        published,
        host_id,
        location_text
      )
    `
    )
    .order("created_at", { ascending: false })
    .limit(limit);

  if (status !== "all") {
    query = query.eq("status", status);
  }

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ reports: data || [] });
}

export async function PATCH(request: NextRequest) {
  const gate = await requireSuperadminApi();
  if (!gate.ok) return gate.response;

  const body = await request.json();
  const {
    reportId,
    status,
    reason,
    unpublishListing,
    suspendHost,
  } = body as {
    reportId?: string;
    status?: "open" | "reviewed" | "dismissed" | "actioned";
    reason?: string;
    unpublishListing?: boolean;
    suspendHost?: boolean;
  };

  if (!reportId || !status) {
    return NextResponse.json(
      { error: "reportId and status are required" },
      { status: 400 }
    );
  }

  const allowed = ["open", "reviewed", "dismissed", "actioned"] as const;
  if (!allowed.includes(status)) {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: report, error: loadError } = await admin
    .from("listing_reports")
    .select("id, listing_id, status, listings(id, host_id, title, published)")
    .eq("id", reportId)
    .maybeSingle();

  if (loadError || !report) {
    return NextResponse.json({ error: "Report not found" }, { status: 404 });
  }

  const listing = Array.isArray(report.listings)
    ? report.listings[0]
    : report.listings;

  const sideEffects: string[] = [];

  if (unpublishListing && listing?.id) {
    const result = await setListingPublishedAdmin(
      gate.ctx.userId,
      listing.id,
      false,
      reason || `Via report ${reportId}`
    );
    if (result.success) sideEffects.push("listing unpublished");
  }

  if (suspendHost && listing?.host_id) {
    const result = await setUserSuspendedAdmin(
      gate.ctx.userId,
      listing.host_id,
      true,
      reason || `Via report ${reportId}`
    );
    if (result.success) sideEffects.push("host suspended");
  }

  const { error: updateError } = await admin
    .from("listing_reports")
    .update({
      status,
      reviewed_at: new Date().toISOString(),
      reviewed_by: gate.ctx.userId,
    })
    .eq("id", reportId);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  await logAdminAction({
    actorId: gate.ctx.userId,
    action: "update_listing_report",
    entityType: "listing_report",
    entityId: reportId,
    reason,
    payload: {
      previousStatus: report.status,
      nextStatus: status,
      listingId: report.listing_id,
      unpublishListing: !!unpublishListing,
      suspendHost: !!suspendHost,
      sideEffects,
    },
  });

  return NextResponse.json({
    success: true,
    message:
      sideEffects.length > 0
        ? `Report marked ${status} (${sideEffects.join("; ")})`
        : `Report marked ${status}`,
  });
}
