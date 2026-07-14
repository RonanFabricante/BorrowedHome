"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { AdminActionButton } from "@/components/admin/admin-action-button";

type ReportRow = {
  id: string;
  listing_id: string;
  reporter_id: string | null;
  reason: string;
  details: string | null;
  status: string;
  created_at: string;
  listings:
    | {
        id: string;
        title: string;
        published: boolean;
        host_id: string;
        location_text: string;
      }
    | {
        id: string;
        title: string;
        published: boolean;
        host_id: string;
        location_text: string;
      }[]
    | null;
};

function listingOf(r: ReportRow) {
  if (!r.listings) return null;
  return Array.isArray(r.listings) ? r.listings[0] ?? null : r.listings;
}

export default function AdminReportsPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [status, setStatus] = useState(searchParams.get("status") || "open");
  const [reports, setReports] = useState<ReportRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams();
    if (status) params.set("status", status);
    const res = await fetch(`/api/admin/reports?${params}`);
    const json = await res.json();
    if (!res.ok) {
      setError(json.error || "Failed to load");
      setReports([]);
    } else {
      setReports(json.reports || []);
    }
    setLoading(false);
  }, [status]);

  useEffect(() => {
    load();
  }, [load]);

  const apply = (e: React.FormEvent) => {
    e.preventDefault();
    const params = new URLSearchParams();
    if (status) params.set("status", status);
    router.replace(`/admin/reports?${params}`);
    load();
  };

  const updateReport = async (
    reportId: string,
    nextStatus: string,
    opts?: { unpublishListing?: boolean; suspendHost?: boolean },
    reason?: string
  ) => {
    const res = await fetch("/api/admin/reports", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        reportId,
        status: nextStatus,
        reason,
        unpublishListing: opts?.unpublishListing,
        suspendHost: opts?.suspendHost,
      }),
    });
    const json = await res.json();
    return {
      success: !!json.success,
      message: json.message || json.error || "",
    };
  };

  return (
    <div className="space-y-6">
      <form onSubmit={apply} className="flex flex-wrap gap-2">
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="h-10 rounded-md border border-input bg-background px-3 text-sm"
        >
          <option value="open">Open</option>
          <option value="reviewed">Reviewed</option>
          <option value="dismissed">Dismissed</option>
          <option value="actioned">Actioned</option>
          <option value="all">All</option>
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
                <th className="bh-micro py-3 pr-3">report</th>
                <th className="bh-micro py-3 pr-3">listing</th>
                <th className="bh-micro py-3 pr-3">status</th>
                <th className="bh-micro py-3">actions</th>
              </tr>
            </thead>
            <tbody>
              {reports.map((r) => {
                const listing = listingOf(r);
                return (
                  <tr
                    key={r.id}
                    className="border-b border-border/70 align-top hover:bg-muted/40"
                  >
                    <td className="py-3 pr-3">
                      <div className="text-sm font-medium max-w-sm">
                        {r.reason}
                      </div>
                      <div className="bh-caption text-muted-foreground">
                        {new Date(r.created_at).toLocaleString()}
                        {r.reporter_id
                          ? ` · reporter ${r.reporter_id.slice(0, 8)}…`
                          : ""}
                      </div>
                    </td>
                    <td className="py-3 pr-3">
                      {listing ? (
                        <>
                          <Link
                            href={`/listings/${listing.id}`}
                            className="text-sm font-medium underline-offset-2 hover:underline"
                          >
                            {listing.title}
                          </Link>
                          <div className="bh-caption text-muted-foreground">
                            {listing.location_text}
                            {listing.published ? " · published" : " · draft"}
                          </div>
                          <div className="bh-data text-xs text-muted-foreground">
                            host {listing.host_id.slice(0, 8)}…
                          </div>
                        </>
                      ) : (
                        <span className="bh-caption text-muted-foreground">
                          Listing removed
                        </span>
                      )}
                    </td>
                    <td className="bh-data py-3 pr-3 text-sm">{r.status}</td>
                    <td className="py-3">
                      <div className="flex flex-col gap-2">
                        <AdminActionButton
                          label="Dismiss"
                          variant="ghost"
                          requireReason
                          confirmMessage="Dismiss this report?"
                          onAction={(reason) =>
                            updateReport(r.id, "dismissed", undefined, reason)
                          }
                          onDone={load}
                        />
                        <AdminActionButton
                          label="Mark reviewed"
                          variant="secondary"
                          requireReason
                          onAction={(reason) =>
                            updateReport(r.id, "reviewed", undefined, reason)
                          }
                          onDone={load}
                        />
                        {listing?.published && (
                          <AdminActionButton
                            label="Unpublish + action"
                            variant="destructive"
                            requireReason
                            confirmMessage="Unpublish listing and mark report actioned?"
                            onAction={(reason) =>
                              updateReport(
                                r.id,
                                "actioned",
                                { unpublishListing: true },
                                reason
                              )
                            }
                            onDone={load}
                          />
                        )}
                        {listing && (
                          <AdminActionButton
                            label="Suspend host"
                            variant="destructive"
                            requireReason
                            confirmMessage="Suspend host (unpublishes their listings) and mark actioned?"
                            onAction={(reason) =>
                              updateReport(
                                r.id,
                                "actioned",
                                {
                                  unpublishListing: true,
                                  suspendHost: true,
                                },
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
          {reports.length === 0 && (
            <p className="bh-caption mt-4 text-muted-foreground">No reports.</p>
          )}
        </div>
      )}
    </div>
  );
}
