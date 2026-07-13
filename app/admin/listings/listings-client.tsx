"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StatusChip } from "@/components/status-chip";
import { AdminActionButton } from "@/components/admin/admin-action-button";
import { formatCurrency } from "@/lib/utils";

type ListingRow = {
  id: string;
  title: string;
  location_text: string;
  country?: string;
  currency?: string;
  published: boolean;
  host_id: string;
  hourly_rate: number;
  updated_at: string;
};

export default function AdminListingsPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [q, setQ] = useState(searchParams.get("q") || "");
  const [published, setPublished] = useState(
    searchParams.get("published") || ""
  );
  const [listings, setListings] = useState<ListingRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (published) params.set("published", published);
    const res = await fetch(`/api/admin/listings?${params}`);
    const json = await res.json();
    if (!res.ok) {
      setError(json.error || "Failed to load");
      setListings([]);
    } else {
      setListings(json.listings || []);
    }
    setLoading(false);
  }, [q, published]);

  useEffect(() => {
    load();
  }, [load]);

  const apply = (e: React.FormEvent) => {
    e.preventDefault();
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (published) params.set("published", published);
    router.replace(`/admin/listings?${params}`);
    load();
  };

  const setPublishedAction = async (
    listingId: string,
    next: boolean,
    reason?: string
  ) => {
    const res = await fetch("/api/admin/listings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ listingId, published: next, reason }),
    });
    const json = await res.json();
    return { success: !!json.success, message: json.message || json.error || "" };
  };

  return (
    <div className="space-y-6">
      <form onSubmit={apply} className="flex flex-wrap gap-2">
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Title or location"
          className="max-w-sm"
        />
        <select
          value={published}
          onChange={(e) => setPublished(e.target.value)}
          className="h-10 rounded-md border border-input bg-background px-3 text-sm"
        >
          <option value="">All</option>
          <option value="true">Published</option>
          <option value="false">Draft</option>
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
          <table className="w-full min-w-[40rem] border-collapse text-left">
            <thead>
              <tr className="border-b border-border">
                <th className="bh-micro py-3 pr-3">listing</th>
                <th className="bh-micro py-3 pr-3">status</th>
                <th className="bh-micro py-3 pr-3">rate</th>
                <th className="bh-micro py-3">actions</th>
              </tr>
            </thead>
            <tbody>
              {listings.map((l) => (
                <tr
                  key={l.id}
                  className="border-b border-border/70 align-top hover:bg-muted/40"
                >
                  <td className="py-3 pr-3">
                    <Link
                      href={`/listings/${l.id}`}
                      className="text-sm font-medium underline-offset-2 hover:underline"
                    >
                      {l.title}
                    </Link>
                    <div className="bh-caption text-muted-foreground">
                      {l.location_text}
                      {l.country ? ` · ${l.country}` : ""}
                    </div>
                    <div className="bh-data text-xs text-muted-foreground">
                      host {l.host_id.slice(0, 8)}…
                    </div>
                  </td>
                  <td className="py-3 pr-3">
                    <StatusChip
                      status={l.published ? "published" : "draft"}
                      kind="listing"
                    />
                  </td>
                  <td className="bh-data py-3 pr-3 text-sm tabular-nums">
                    {formatCurrency(l.hourly_rate, l.currency)}/hr
                  </td>
                  <td className="py-3">
                    <AdminActionButton
                      label={l.published ? "Unpublish" : "Publish"}
                      variant={l.published ? "destructive" : "default"}
                      requireReason={!l.published ? false : true}
                      confirmMessage={
                        l.published
                          ? "Unpublish this listing?"
                          : "Publish this listing?"
                      }
                      onAction={(reason) =>
                        setPublishedAction(l.id, !l.published, reason)
                      }
                      onDone={load}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {listings.length === 0 && (
            <p className="bh-caption mt-4 text-muted-foreground">No listings.</p>
          )}
        </div>
      )}
    </div>
  );
}
