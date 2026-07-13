"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { StatusChip } from "@/components/status-chip";
import { AdminActionButton } from "@/components/admin/admin-action-button";
import { formatCurrency } from "@/lib/utils";

type PaymentRow = {
  id: string;
  booking_id: string;
  status: string;
  amount: number;
  deposit_amount: number;
  currency?: string;
  stripe_payment_intent_id: string;
  stripe_deposit_intent_id: string | null;
  review_window_ends_at: string | null;
  auto_capture_scheduled_at: string | null;
  dispute_reported_at: string | null;
  capture_hold_reason: string | null;
  deposit_released_at: string | null;
  bookings: {
    id: string;
    status: string;
    listings: { title: string; host_id: string };
  };
};

async function paymentAction(
  action: string,
  bookingId: string,
  reason?: string
) {
  const res = await fetch("/api/admin/payments/actions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, bookingId, reason }),
  });
  const json = await res.json();
  return {
    success: !!json.success,
    message: json.message || json.error || "Done",
  };
}

export default function AdminPaymentsPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [status, setStatus] = useState(searchParams.get("status") || "");
  const [stuck, setStuck] = useState(searchParams.get("stuck") === "1");
  const [disputes, setDisputes] = useState(
    searchParams.get("disputes") === "1"
  );
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams();
    if (status) params.set("status", status);
    if (stuck) params.set("stuck", "1");
    if (disputes) params.set("disputes", "1");
    const res = await fetch(`/api/admin/payments?${params}`);
    const json = await res.json();
    if (!res.ok) {
      setError(json.error || "Failed to load");
      setPayments([]);
    } else {
      setPayments(json.payments || []);
    }
    setLoading(false);
  }, [status, stuck, disputes]);

  useEffect(() => {
    load();
  }, [load]);

  const apply = (e: React.FormEvent) => {
    e.preventDefault();
    const params = new URLSearchParams();
    if (status) params.set("status", status);
    if (stuck) params.set("stuck", "1");
    if (disputes) params.set("disputes", "1");
    router.replace(`/admin/payments?${params}`);
    load();
  };

  return (
    <div className="space-y-6">
      <form onSubmit={apply} className="flex flex-wrap items-center gap-3">
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="h-10 rounded-md border border-input bg-background px-3 text-sm"
        >
          <option value="">All payment statuses</option>
          {["pending", "authorised", "captured", "released", "failed"].map(
            (s) => (
              <option key={s} value={s}>
                {s}
              </option>
            )
          )}
        </select>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={stuck}
            onChange={(e) => setStuck(e.target.checked)}
          />
          Stuck authorised
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={disputes}
            onChange={(e) => setDisputes(e.target.checked)}
          />
          Disputes only
        </label>
        <Button type="submit" variant="secondary">
          Filter
        </Button>
      </form>

      {error && <p className="text-destructive">{error}</p>}
      {loading ? (
        <p className="bh-caption text-muted-foreground">Loading…</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[52rem] border-collapse text-left">
            <thead>
              <tr className="border-b border-border">
                <th className="bh-micro py-3 pr-3">booking</th>
                <th className="bh-micro py-3 pr-3">payment</th>
                <th className="bh-micro py-3 pr-3">stripe</th>
                <th className="bh-micro py-3 pr-3">window</th>
                <th className="bh-micro py-3">actions</th>
              </tr>
            </thead>
            <tbody>
              {payments.map((p) => {
                const booking = Array.isArray(p.bookings)
                  ? p.bookings[0]
                  : p.bookings;
                const listing = booking?.listings
                  ? Array.isArray(booking.listings)
                    ? booking.listings[0]
                    : booking.listings
                  : null;
                return (
                  <tr
                    key={p.id}
                    className="border-b border-border/70 align-top hover:bg-muted/40"
                  >
                    <td className="py-3 pr-3">
                      <div className="text-sm font-medium">
                        {listing?.title || "—"}
                      </div>
                      <div className="bh-data text-xs text-muted-foreground">
                        {p.booking_id.slice(0, 8)}… · booking{" "}
                        {booking?.status}
                      </div>
                      <div className="bh-data mt-1 text-sm tabular-nums">
                        {formatCurrency(p.amount, p.currency)}
                        {p.deposit_amount > 0 && (
                          <span className="text-muted-foreground">
                            {" "}
                            + dep {formatCurrency(p.deposit_amount, p.currency)}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-3 pr-3">
                      <StatusChip status={p.status} kind="payment" />
                      {p.dispute_reported_at && (
                        <p className="bh-caption mt-1 text-destructive">
                          Dispute: {p.capture_hold_reason || "held"}
                        </p>
                      )}
                      {p.deposit_released_at && (
                        <p className="bh-caption mt-1 text-muted-foreground">
                          Deposit released
                        </p>
                      )}
                    </td>
                    <td className="bh-data py-3 pr-3 text-xs">
                      <div className="truncate max-w-[10rem]" title={p.stripe_payment_intent_id}>
                        {p.stripe_payment_intent_id}
                      </div>
                      {p.stripe_deposit_intent_id && (
                        <div
                          className="mt-1 truncate text-muted-foreground"
                          title={p.stripe_deposit_intent_id}
                        >
                          dep {p.stripe_deposit_intent_id}
                        </div>
                      )}
                    </td>
                    <td className="bh-data py-3 pr-3 text-xs text-muted-foreground">
                      {p.review_window_ends_at
                        ? new Date(p.review_window_ends_at).toLocaleString()
                        : "—"}
                    </td>
                    <td className="py-3">
                      <div className="flex flex-col gap-2">
                        <AdminActionButton
                          label="Sync Stripe"
                          onAction={(reason) =>
                            paymentAction("sync", p.booking_id, reason)
                          }
                          onDone={load}
                        />
                        <AdminActionButton
                          label="Capture + transfer"
                          confirmMessage="Capture (if needed) and transfer to host?"
                          onAction={(reason) =>
                            paymentAction(
                              "retry_capture_transfer",
                              p.booking_id,
                              reason
                            )
                          }
                          onDone={load}
                        />
                        {p.stripe_deposit_intent_id && !p.deposit_released_at && (
                          <AdminActionButton
                            label="Release deposit"
                            confirmMessage="Cancel deposit hold?"
                            onAction={(reason) =>
                              paymentAction(
                                "release_deposit",
                                p.booking_id,
                                reason
                              )
                            }
                            onDone={load}
                          />
                        )}
                        {p.dispute_reported_at && (
                          <AdminActionButton
                            label="Clear dispute"
                            variant="destructive"
                            requireReason
                            onAction={(reason) =>
                              paymentAction(
                                "clear_dispute",
                                p.booking_id,
                                reason
                              )
                            }
                            onDone={load}
                          />
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {payments.length === 0 && (
            <p className="bh-caption mt-4 text-muted-foreground">No payments.</p>
          )}
        </div>
      )}
    </div>
  );
}
