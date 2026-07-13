import { NextRequest, NextResponse } from "next/server";
import { requireSuperadminApi } from "@/lib/admin/auth";
import { setBookingStatusAdmin } from "@/lib/admin/ops";
import type { BookingStatus } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(request: NextRequest) {
  const gate = await requireSuperadminApi();
  if (!gate.ok) return gate.response;

  const body = await request.json();
  const { bookingId, status, reason } = body as {
    bookingId?: string;
    status?: BookingStatus;
    reason?: string;
  };

  if (!bookingId || !status || !reason) {
    return NextResponse.json(
      { error: "bookingId, status, and reason are required" },
      { status: 400 }
    );
  }

  const result = await setBookingStatusAdmin(
    gate.ctx.userId,
    bookingId,
    status,
    reason
  );

  return NextResponse.json(result, { status: result.success ? 200 : 400 });
}
