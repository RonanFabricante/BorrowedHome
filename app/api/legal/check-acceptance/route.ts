import { createClient } from "@/lib/supabase/server";
import { TERMS_VERSION } from "@/lib/legal/terms-au";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401 }
    );
  }

  const { searchParams } = new URL(request.url);
  const docType = searchParams.get("doc_type");

  if (!docType || !["guest_terms", "host_declaration"].includes(docType)) {
    return NextResponse.json(
      { error: "Invalid doc_type" },
      { status: 400 }
    );
  }

  // Check if user has accepted the document for current version
  const { data: acceptance, error } = await supabase
    .from("user_legal_acceptances")
    .select("*")
    .eq("user_id", user.id)
    .eq("doc_type", docType)
    .eq("doc_version", TERMS_VERSION)
    .single();

  if (error && error.code !== "PGRST116") { // PGRST116 = no rows returned
    return NextResponse.json(
      { error: "Database error" },
      { status: 500 }
    );
  }

  return NextResponse.json({
    accepted: !!acceptance,
    version: TERMS_VERSION,
  });
}
