import { NextRequest, NextResponse } from "next/server";
import { requireSuperadminApi } from "@/lib/admin/auth";
import {
  syncPaymentFromStripe,
  retryCaptureAndTransfer,
  releaseDepositAdmin,
  clearDisputeHoldAdmin,
} from "@/lib/admin/ops";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Action =
  | "sync"
  | "retry_capture_transfer"
  | "release_deposit"
  | "clear_dispute";

export async function POST(request: NextRequest) {
  const gate = await requireSuperadminApi();
  if (!gate.ok) return gate.response;

  const body = await request.json();
  const { action, bookingId, reason } = body as {
    action?: Action;
    bookingId?: string;
    reason?: string;
  };

  if (!action || !bookingId) {
    return NextResponse.json(
      { error: "action and bookingId are required" },
      { status: 400 }
    );
  }

  let result;
  switch (action) {
    case "sync":
      result = await syncPaymentFromStripe(gate.ctx.userId, bookingId, reason);
      break;
    case "retry_capture_transfer":
      result = await retryCaptureAndTransfer(
        gate.ctx.userId,
        bookingId,
        reason
      );
      break;
    case "release_deposit":
      result = await releaseDepositAdmin(gate.ctx.userId, bookingId, reason);
      break;
    case "clear_dispute":
      if (!reason?.trim()) {
        return NextResponse.json(
          { error: "reason is required to clear a dispute" },
          { status: 400 }
        );
      }
      result = await clearDisputeHoldAdmin(
        gate.ctx.userId,
        bookingId,
        reason
      );
      break;
    default:
      return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  }

  return NextResponse.json(result, { status: result.success ? 200 : 400 });
}
