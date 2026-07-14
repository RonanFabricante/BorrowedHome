import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const REASONS = [
  "misleading",
  "unsafe",
  "fraud",
  "inappropriate",
  "other",
] as const;

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const admin = createAdminClient();
    const { data: profile } = await admin
      .from("profiles")
      .select("is_suspended")
      .eq("id", user.id)
      .maybeSingle();

    if (profile?.is_suspended) {
      return NextResponse.json(
        { error: "Your account is suspended. Contact support." },
        { status: 403 }
      );
    }

    const body = await request.json();
    const listingId = body.listingId as string | undefined;
    const reason = (body.reason as string | undefined)?.trim();
    const details = (body.details as string | undefined)?.trim() || null;

    if (!listingId || !reason) {
      return NextResponse.json(
        { error: "listingId and reason are required" },
        { status: 400 }
      );
    }

    if (!REASONS.includes(reason as (typeof REASONS)[number])) {
      return NextResponse.json({ error: "Invalid reason" }, { status: 400 });
    }

    if (details && details.length > 2000) {
      return NextResponse.json(
        { error: "Details must be under 2000 characters" },
        { status: 400 }
      );
    }

    const { data: listing } = await admin
      .from("listings")
      .select("id, title, published")
      .eq("id", listingId)
      .maybeSingle();

    if (!listing) {
      return NextResponse.json({ error: "Listing not found" }, { status: 404 });
    }

    const reasonLabel =
      reason === "misleading"
        ? "Misleading or inaccurate"
        : reason === "unsafe"
          ? "Safety concern"
          : reason === "fraud"
            ? "Suspected fraud / ghost listing"
            : reason === "inappropriate"
              ? "Inappropriate content"
              : "Other";

    const { data: report, error } = await admin
      .from("listing_reports")
      .insert({
        listing_id: listingId,
        reporter_id: user.id,
        reason: `${reasonLabel}${details ? `: ${details}` : ""}`.slice(0, 2000),
        details,
        status: "open",
      })
      .select("id")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      reportId: report.id,
      message: "Report submitted. Our team will review it.",
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e.message || "Failed to submit report" },
      { status: 500 }
    );
  }
}
