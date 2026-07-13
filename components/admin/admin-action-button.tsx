"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

type Props = {
  label: string;
  variant?: "default" | "outline" | "destructive" | "secondary" | "ghost";
  requireReason?: boolean;
  confirmMessage?: string;
  onAction: (reason?: string) => Promise<{ success: boolean; message: string }>;
  onDone?: () => void;
  className?: string;
};

export function AdminActionButton({
  label,
  variant = "outline",
  requireReason = false,
  confirmMessage,
  onAction,
  onDone,
  className,
}: Props) {
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  const run = async () => {
    if (confirmMessage && !window.confirm(confirmMessage)) return;

    let reason: string | undefined;
    if (requireReason) {
      const entered = window.prompt("Reason (required):");
      if (!entered?.trim()) return;
      reason = entered.trim();
    }

    setBusy(true);
    setFeedback(null);
    try {
      const result = await onAction(reason);
      setFeedback(result.message);
      if (result.success) onDone?.();
    } catch (e: any) {
      setFeedback(e.message || "Action failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={className}>
      <Button
        type="button"
        size="sm"
        variant={variant}
        disabled={busy}
        onClick={run}
      >
        {busy ? "…" : label}
      </Button>
      {feedback && (
        <p className="bh-caption mt-1 max-w-[14rem] text-muted-foreground">
          {feedback}
        </p>
      )}
    </div>
  );
}
