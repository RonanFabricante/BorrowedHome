"use client";

import { useEffect, useState } from "react";

type ActionRow = {
  id: string;
  actor_id: string;
  actor_name: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  reason: string | null;
  payload: Record<string, unknown>;
  created_at: string;
};

export default function AdminAuditPage() {
  const [actions, setActions] = useState<ActionRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/admin/audit?limit=100")
      .then(async (r) => {
        const json = await r.json();
        if (!r.ok) throw new Error(json.error || "Failed to load");
        setActions(json.actions || []);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  if (error) return <p className="text-destructive">{error}</p>;
  if (loading) {
    return <p className="bh-caption text-muted-foreground">Loading…</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[44rem] border-collapse text-left">
        <thead>
          <tr className="border-b border-border">
            <th className="bh-micro py-3 pr-3">when</th>
            <th className="bh-micro py-3 pr-3">actor</th>
            <th className="bh-micro py-3 pr-3">action</th>
            <th className="bh-micro py-3 pr-3">entity</th>
            <th className="bh-micro py-3 pr-3">reason</th>
            <th className="bh-micro py-3">payload</th>
          </tr>
        </thead>
        <tbody>
          {actions.map((a) => (
            <tr
              key={a.id}
              className="border-b border-border/70 align-top hover:bg-muted/40"
            >
              <td className="bh-data py-3 pr-3 text-xs text-muted-foreground">
                {new Date(a.created_at).toLocaleString()}
              </td>
              <td className="py-3 pr-3 text-sm">
                {a.actor_name || a.actor_id.slice(0, 8)}
              </td>
              <td className="bh-data py-3 pr-3 text-sm">{a.action}</td>
              <td className="bh-data py-3 pr-3 text-xs">
                {a.entity_type}
                {a.entity_id ? (
                  <>
                    <br />
                    {a.entity_id}
                  </>
                ) : null}
              </td>
              <td className="py-3 pr-3 text-sm text-muted-foreground">
                {a.reason || "—"}
              </td>
              <td className="bh-data py-3 max-w-xs truncate text-xs text-muted-foreground">
                {JSON.stringify(a.payload)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {actions.length === 0 && (
        <p className="bh-caption mt-4 text-muted-foreground">
          No admin actions recorded yet.
        </p>
      )}
    </div>
  );
}
