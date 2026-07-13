"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

type HostRow = {
  id: string;
  user_id: string;
  full_name: string | null;
  stripe_account_id: string | null;
  stripe_charges_enabled: boolean;
  stripe_payouts_enabled: boolean;
  stripe_onboarding_status: string | null;
  updated_at: string;
};

export default function AdminHostsPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [incomplete, setIncomplete] = useState(
    searchParams.get("incomplete") === "1"
  );
  const [hosts, setHosts] = useState<HostRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams();
    if (incomplete) params.set("incomplete", "1");
    const res = await fetch(`/api/admin/hosts?${params}`);
    const json = await res.json();
    if (!res.ok) {
      setError(json.error || "Failed to load");
      setHosts([]);
    } else {
      setHosts(json.hosts || []);
    }
    setLoading(false);
  }, [incomplete]);

  useEffect(() => {
    load();
  }, [load]);

  const apply = (e: React.FormEvent) => {
    e.preventDefault();
    const params = new URLSearchParams();
    if (incomplete) params.set("incomplete", "1");
    router.replace(`/admin/hosts?${params}`);
    load();
  };

  return (
    <div className="space-y-6">
      <form onSubmit={apply} className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={incomplete}
            onChange={(e) => setIncomplete(e.target.checked)}
          />
          Incomplete Connect only
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
          <table className="w-full min-w-[40rem] border-collapse text-left">
            <thead>
              <tr className="border-b border-border">
                <th className="bh-micro py-3 pr-3">host</th>
                <th className="bh-micro py-3 pr-3">onboarding</th>
                <th className="bh-micro py-3 pr-3">charges</th>
                <th className="bh-micro py-3 pr-3">payouts</th>
                <th className="bh-micro py-3">stripe account</th>
              </tr>
            </thead>
            <tbody>
              {hosts.map((h) => (
                <tr
                  key={h.id}
                  className="border-b border-border/70 hover:bg-muted/40"
                >
                  <td className="py-3 pr-3">
                    <div className="text-sm font-medium">
                      {h.full_name || "—"}
                    </div>
                    <div className="bh-data text-xs text-muted-foreground">
                      {h.user_id.slice(0, 8)}…
                    </div>
                  </td>
                  <td className="bh-data py-3 pr-3 text-sm">
                    {h.stripe_onboarding_status || "—"}
                  </td>
                  <td className="bh-data py-3 pr-3 text-sm">
                    {h.stripe_charges_enabled ? "yes" : "no"}
                  </td>
                  <td className="bh-data py-3 pr-3 text-sm">
                    {h.stripe_payouts_enabled ? "yes" : "no"}
                  </td>
                  <td className="bh-data py-3 text-xs">
                    {h.stripe_account_id || "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {hosts.length === 0 && (
            <p className="bh-caption mt-4 text-muted-foreground">No hosts.</p>
          )}
        </div>
      )}
    </div>
  );
}
