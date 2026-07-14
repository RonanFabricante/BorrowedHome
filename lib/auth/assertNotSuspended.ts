import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export class AccountSuspendedError extends Error {
  constructor(message = "Your account is suspended. Contact hello@borrowedhome.app for help.") {
    super(message);
    this.name = "AccountSuspendedError";
  }
}

/**
 * Throws AccountSuspendedError if the profile is suspended.
 * Uses service role so clients cannot bypass via stale/local state.
 */
export async function assertNotSuspended(userId: string): Promise<void> {
  const admin = createAdminClient();
  const { data: profile, error } = await admin
    .from("profiles")
    .select("is_suspended")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    console.error("[assertNotSuspended] profile lookup failed:", error);
    throw new Error("Unable to verify account status");
  }

  if (profile?.is_suspended) {
    throw new AccountSuspendedError();
  }
}

export function suspendedResponse(error: unknown): NextResponse | null {
  if (error instanceof AccountSuspendedError) {
    return NextResponse.json({ error: error.message }, { status: 403 });
  }
  return null;
}
