import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { TERMS_VERSION } from "@/lib/legal/terms-au";

export const dynamic = "force-dynamic";

/**
 * Authenticated upsert of guest_terms acceptance via service role.
 * Used after signup when a session exists, and as a self-heal path.
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    let source = "api_accept_guest_terms";
    try {
      const body = await request.json();
      if (typeof body?.source === "string" && body.source.length < 80) {
        source = body.source;
      }
    } catch {
      // empty body is fine
    }

    const admin = createAdminClient();
    const { error } = await admin.from("user_legal_acceptances").upsert(
      {
        user_id: user.id,
        doc_type: "guest_terms",
        doc_version: TERMS_VERSION,
        accepted_at: new Date().toISOString(),
        metadata: { source },
      },
      {
        onConflict: "user_id,doc_type,doc_version",
        ignoreDuplicates: true,
      }
    );

    if (error) {
      console.error("[accept-guest-terms]", error.message);
      return NextResponse.json(
        { error: "Failed to record Guest Terms acceptance" },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true, version: TERMS_VERSION });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unexpected error";
    console.error("[accept-guest-terms]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
