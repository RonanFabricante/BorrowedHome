"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusChip } from "@/components/status-chip";

type Overview = {
  statusCounts: Record<string, number>;
  stuckAuthorisedPayments: number;
  disputeHolds: number;
  publishedListings: number;
  draftListings: number;
  hostsIncompleteConnect: number;
  recentActions: Array<{
    id: string;
    action: string;
    entity_type: string;
    entity_id: string | null;
    reason: string | null;
    created_at: string;
  }>;
};

export default function AdminOverviewPage() {
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/admin/overview")
      .then(async (r) => {
        const json = await r.json();
        if (!r.ok) throw new Error(json.error || "Failed to load");
        setData(json);
      })
      .catch((e) => setError(e.message));
  }, []);

  if (error) {
    return <p className="text-destructive">{error}</p>;
  }

  if (!data) {
    return <p className="bh-caption text-muted-foreground">Loading overview…</p>;
  }

  const kpis = [
    {
      label: "Stuck authorised",
      value: data.stuckAuthorisedPayments,
      href: "/admin/payments?stuck=1",
    },
    {
      label: "Dispute holds",
      value: data.disputeHolds,
      href: "/admin/payments?disputes=1",
    },
    {
      label: "Published listings",
      value: data.publishedListings,
      href: "/admin/listings?published=true",
    },
    {
      label: "Draft listings",
      value: data.draftListings,
      href: "/admin/listings?published=false",
    },
    {
      label: "Hosts incomplete Connect",
      value: data.hostsIncompleteConnect,
      href: "/admin/hosts?incomplete=1",
    },
  ];

  return (
    <div className="space-y-10">
      <section>
        <p className="bh-micro mb-4">attention</p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {kpis.map((kpi) => (
            <Link key={kpi.label} href={kpi.href}>
              <Card className="transition-colors hover:border-foreground/30">
                <CardHeader className="pb-2">
                  <CardTitle className="bh-micro font-normal text-muted-foreground">
                    {kpi.label}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="bh-stat-num text-3xl tabular-nums">{kpi.value}</p>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </section>

      <section>
        <p className="bh-micro mb-4">bookings by status</p>
        <div className="flex flex-wrap gap-2">
          {Object.entries(data.statusCounts)
            .sort((a, b) => b[1] - a[1])
            .map(([status, count]) => (
              <Link
                key={status}
                href={`/admin/bookings?status=${encodeURIComponent(status)}`}
                className="inline-flex items-center gap-2 border border-border px-3 py-2 hover:bg-muted/40"
              >
                <StatusChip status={status} />
                <span className="bh-data text-sm tabular-nums">{count}</span>
              </Link>
            ))}
        </div>
      </section>

      <section>
        <div className="mb-4 flex items-baseline justify-between gap-4">
          <p className="bh-micro">recent admin actions</p>
          <Link href="/admin/audit" className="bh-caption text-muted-foreground underline-offset-2 hover:underline">
            view all
          </Link>
        </div>
        {data.recentActions.length === 0 ? (
          <p className="bh-caption text-muted-foreground">No actions yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[36rem] border-collapse text-left">
              <thead>
                <tr className="border-b border-border">
                  <th className="bh-micro py-3 pr-4">when</th>
                  <th className="bh-micro py-3 pr-4">action</th>
                  <th className="bh-micro py-3 pr-4">entity</th>
                  <th className="bh-micro py-3">reason</th>
                </tr>
              </thead>
              <tbody>
                {data.recentActions.map((a) => (
                  <tr
                    key={a.id}
                    className="border-b border-border/70 hover:bg-muted/40"
                  >
                    <td className="bh-data py-3 pr-4 text-xs text-muted-foreground">
                      {new Date(a.created_at).toLocaleString()}
                    </td>
                    <td className="bh-data py-3 pr-4 text-sm">{a.action}</td>
                    <td className="bh-data py-3 pr-4 text-xs">
                      {a.entity_type}
                      {a.entity_id ? ` · ${a.entity_id.slice(0, 8)}` : ""}
                    </td>
                    <td className="py-3 text-sm text-muted-foreground">
                      {a.reason || "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
