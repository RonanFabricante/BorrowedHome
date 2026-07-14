import { NextResponse } from "next/server";
import { requireSuperadminApi } from "@/lib/admin/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const gate = await requireSuperadminApi();
  if (!gate.ok) return gate.response;

  const admin = createAdminClient();
  const now = new Date().toISOString();

  const [
    bookingsByStatus,
    stuckPayments,
    disputeHolds,
    publishedListings,
    draftListings,
    hostsIncomplete,
    recentActions,
  ] = await Promise.all([
    admin.from("bookings").select("status"),
    admin
      .from("payments")
      .select("id", { count: "exact", head: true })
      .eq("status", "authorised")
      .lte("review_window_ends_at", now),
    admin
      .from("payments")
      .select("id", { count: "exact", head: true })
      .not("dispute_reported_at", "is", null),
    admin
      .from("listings")
      .select("id", { count: "exact", head: true })
      .eq("published", true),
    admin
      .from("listings")
      .select("id", { count: "exact", head: true })
      .eq("published", false),
    admin
      .from("hosts")
      .select("id", { count: "exact", head: true })
      .or("stripe_charges_enabled.eq.false,stripe_payouts_enabled.eq.false"),
    admin
      .from("admin_actions")
      .select("id, action, entity_type, entity_id, created_at, reason")
      .order("created_at", { ascending: false })
      .limit(10),
  ]);

  // Soft-fail until migration 033 is applied
  const openReports = await admin
    .from("listing_reports")
    .select("id", { count: "exact", head: true })
    .eq("status", "open");

  const statusCounts: Record<string, number> = {};
  for (const row of bookingsByStatus.data || []) {
    const s = (row as { status: string }).status;
    statusCounts[s] = (statusCounts[s] || 0) + 1;
  }

  return NextResponse.json({
    statusCounts,
    stuckAuthorisedPayments: stuckPayments.count ?? 0,
    disputeHolds: disputeHolds.count ?? 0,
    publishedListings: publishedListings.count ?? 0,
    draftListings: draftListings.count ?? 0,
    hostsIncompleteConnect: hostsIncomplete.count ?? 0,
    openListingReports: openReports.error ? 0 : openReports.count ?? 0,
    recentActions: recentActions.data || [],
  });
}
