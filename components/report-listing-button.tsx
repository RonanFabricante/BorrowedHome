"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Flag } from "lucide-react";

type Props = {
  listingId: string;
  className?: string;
};

export function ReportListingButton({ listingId, className }: Props) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("misleading");
  const [details, setDetails] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/listings/report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ listingId, reason, details: details.trim() || undefined }),
      });
      const json = await res.json();
      if (!res.ok) {
        if (res.status === 401) {
          setError("Sign in to report a listing.");
        } else {
          setError(json.error || "Could not submit report");
        }
        return;
      }
      setDone(json.message || "Report submitted.");
      setOpen(false);
    } catch (e: any) {
      setError(e.message || "Could not submit report");
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <p className="bh-caption text-muted-foreground">{done}</p>
    );
  }

  return (
    <div className={className}>
      {!open ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="text-muted-foreground"
          onClick={() => setOpen(true)}
        >
          <Flag className="mr-1.5 h-3.5 w-3.5" />
          Report listing
        </Button>
      ) : (
        <div className="space-y-3 rounded-md border border-border p-3 text-sm">
          <p className="font-medium">Report this listing</p>
          <select
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="h-9 w-full rounded-md border border-input bg-background px-2"
          >
            <option value="misleading">Misleading or inaccurate</option>
            <option value="unsafe">Safety concern</option>
            <option value="fraud">Suspected fraud / ghost listing</option>
            <option value="inappropriate">Inappropriate content</option>
            <option value="other">Other</option>
          </select>
          <textarea
            value={details}
            onChange={(e) => setDetails(e.target.value)}
            placeholder="Optional details"
            rows={3}
            className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
            maxLength={2000}
          />
          {error && <p className="text-destructive text-xs">{error}</p>}
          <div className="flex gap-2">
            <Button type="button" size="sm" disabled={busy} onClick={submit}>
              {busy ? "Sending…" : "Submit report"}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={busy}
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
