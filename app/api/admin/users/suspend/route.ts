import { NextRequest, NextResponse } from "next/server";
import { requireSuperadminApi } from "@/lib/admin/auth";
import { setUserSuspendedAdmin } from "@/lib/admin/ops";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const gate = await requireSuperadminApi();
  if (!gate.ok) return gate.response;

  const body = await request.json();
  const { userId, suspended, reason } = body as {
    userId?: string;
    suspended?: boolean;
    reason?: string;
  };

  if (!userId || typeof suspended !== "boolean") {
    return NextResponse.json(
      { error: "userId and suspended are required" },
      { status: 400 }
    );
  }

  const result = await setUserSuspendedAdmin(
    gate.ctx.userId,
    userId,
    suspended,
    reason
  );

  return NextResponse.json(result, { status: result.success ? 200 : 400 });
}
