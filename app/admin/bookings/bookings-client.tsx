"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StatusChip } from "@/components/status-chip";
import { AdminActionButton } from "@/components/admin/admin-action-button";
import { formatCurrency } from "@/lib/utils";
import type { BookingStatus } from "@/lib/types";

type BookingRow = {
  id: string;
  status: string;
  start_at: string;
  end_at: string;
  total_amount: number;
  platform_fee_amount: number;
  currency?: string;
  guest_id: string;
  payment_status?: string | null;
  created_at: string;
  listings: {
    id: string;
    title: string;
    location_text: string;
    host_id: string;
  };
};

const STATUS_OPTIONS: BookingStatus[] = [
  "COMPLETED",
  "CANCELLED",
  "EXPIRED",
  "CONFIRMED",
  "DECLINED",
];

export default function AdminBookingsPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [q, setQ] = useState(searchParams.get("q") || "");
  const [status, setStatus] = useState(searchParams.get("status") || "");
  const [bookings, setBookings] = useState<BookingRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (status) params.set("status", status);
    const res = await fetch(`/api/admin/bookings?${params}`);
    const json = await res.json();
    if (!res.ok) {
      setError(json.error || "Failed to load");
      setBookings([]);
    } else {
      setBookings(json.bookings || []);
    }
    setLoading(false);
  }, [q, status]);

  useEffect(() => {
    load();
  }, [load]);

  const applyFilters = (e: React.FormEvent) => {
    e.preventDefault();
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (status) params.set("status", status);
    router.replace(`/admin/bookings?${params}`);
    load();
  };

  const setStatusAction = async (
    bookingId: string,
    next: BookingStatus,
    reason?: string
  ) => {
    const res = await fetch("/api/admin/bookings/status", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bookingId, status: next, reason }),
    });
    const json = await res.json();
    return { success: !!json.success, message: json.message || json.error || "" };
  };

  return (
    <div className="space-y-6">
      <form onSubmit={applyFilters} className="flex flex-wrap gap-2">
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Booking UUID, guest UUID, or listing title"
          className="max-w-md"
        />
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="h-10 rounded-md border border-input bg-background px-3 text-sm"
        >
          <option value="">All statuses</option>
          {[
            "REQUESTED",
            "PAYMENT_PENDING",
            "CONFIRMED",
            "COMPLETED",
            "EXPIRED",
            "CANCELLED",
            "DECLINED",
          ].map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <Button type="submit" variant="secondary">
          Filter
        </Button>
      </form>

      {error && <p className="text-destructive">{error}</p>}
      {loading ? (
        <p className="bh-caption text-muted-foreground">Loading…</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[48rem] border-collapse text-left">
            <thead>
              <tr className="border-b border-border">
                <th className="bh-micro py-3 pr-3">listing</th>
                <th className="bh-micro py-3 pr-3">status</th>
                <th className="bh-micro py-3 pr-3">when</th>
                <th className="bh-micro py-3 pr-3">amount</th>
                <th className="bh-micro py-3">actions</th>
              </tr>
            </thead>
            <tbody>
              {bookings.map((b) => {
                const listing = Array.isArray(b.listings)
                  ? b.listings[0]
                  : b.listings;
                return (
                  <tr
                    key={b.id}
                    className="border-b border-border/70 align-top hover:bg-muted/40"
                  >
                    <td className="py-3 pr-3">
                      <div className="text-sm font-medium">{listing?.title}</div>
                      <div className="bh-data text-xs text-muted-foreground">
                        {b.id.slice(0, 8)}…
                      </div>
                    </td>
                    <td className="py-3 pr-3">
                      <StatusChip status={b.status} />
                    </td>
                    <td className="bh-data py-3 pr-3 text-xs">
                      {new Date(b.start_at).toLocaleString()}
                      <br />
                      → {new Date(b.end_at).toLocaleString()}
                    </td>
                    <td className="bh-data py-3 pr-3 text-sm tabular-nums">
                      {formatCurrency(b.total_amount, b.currency)}
                    </td>
                    <td className="py-3">
                      <div className="flex flex-wrap gap-2">
                        {STATUS_OPTIONS.filter((s) => s !== b.status).map(
                          (s) => (
                            <AdminActionButton
                              key={s}
                              label={`→ ${s}`}
                              requireReason
                              confirmMessage={`Set booking to ${s}?`}
                              onAction={(reason) =>
                                setStatusAction(b.id, s, reason)
                              }
                              onDone={load}
                            />
                          )
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {bookings.length === 0 && (
            <p className="bh-caption mt-4 text-muted-foreground">No bookings.</p>
          )}
        </div>
      )}
    </div>
  );
}
