/**
 * Helper functions for legal acceptance checks
 */

import { TERMS_VERSION } from "./terms-au";

export interface AcceptanceCheck {
  accepted: boolean;
  version: string;
  acceptedAt?: string;
}

/**
 * Check if a user has accepted a specific document type and version
 */
export async function checkAcceptance(
  supabase: any,
  userId: string,
  docType: "guest_terms" | "host_declaration",
  version: string = TERMS_VERSION
): Promise<AcceptanceCheck> {
  const { data: acceptance, error } = await supabase
    .from("user_legal_acceptances")
    .select("*")
    .eq("user_id", userId)
    .eq("doc_type", docType)
    .eq("doc_version", version)
    .single();

  if (error && error.code !== "PGRST116") {
    // PGRST116 = no rows returned (expected if not accepted)
    throw new Error(`Failed to check acceptance: ${error.message}`);
  }

  return {
    accepted: !!acceptance,
    version,
    acceptedAt: acceptance?.accepted_at,
  };
}

/**
 * Check if user has accepted guest terms
 */
export async function hasAcceptedGuestTerms(
  supabase: any,
  userId: string,
  version: string = TERMS_VERSION
): Promise<boolean> {
  const check = await checkAcceptance(supabase, userId, "guest_terms", version);
  return check.accepted;
}

/**
 * Check if user has accepted host declaration
 */
export async function hasAcceptedHostDeclaration(
  supabase: any,
  userId: string,
  version: string = TERMS_VERSION
): Promise<boolean> {
  const check = await checkAcceptance(supabase, userId, "host_declaration", version);
  return check.accepted;
}
