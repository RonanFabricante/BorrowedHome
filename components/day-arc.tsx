"use client";

import { useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * Thin sunrise → 9:00 PM day-use motif with a live "now" marker.
 * Max 3 placements: hero, booking summary, footer.
 */
export function DayArc({ className }: { className?: string }) {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(id);
  }, []);

  const progress = useMemo(() => {
    // Sydney wall-clock for day-use window 7:00–21:00
    const parts = new Intl.DateTimeFormat("en-AU", {
      timeZone: "Australia/Sydney",
      hour: "numeric",
      minute: "numeric",
      hour12: false,
    }).formatToParts(now);
    const hour = Number(parts.find((p) => p.type === "hour")?.value ?? 12);
    const minute = Number(parts.find((p) => p.type === "minute")?.value ?? 0);
    const mins = hour * 60 + minute;
    const start = 7 * 60;
    const end = 21 * 60;
    if (mins <= start) return 0;
    if (mins >= end) return 1;
    return (mins - start) / (end - start);
  }, [now]);

  // Arc path from (12,26) to (268,26); approximate point along quadratic
  const markerX = 12 + progress * (268 - 12);
  const markerY = 26 - Math.sin(progress * Math.PI) * 16;

  return (
    <svg
      viewBox="0 0 280 40"
      role="img"
      aria-label="Day-use window from 7:00 AM to 9:00 PM with current time marker"
      className={cn("h-10 w-full text-accent-ink", className)}
    >
      <path
        d="M12 26 Q 140 2, 268 26"
        fill="none"
        stroke="hsl(var(--color-accent))"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <circle cx="12" cy="26" r="2.5" fill="hsl(var(--color-accent-ink))" />
      <circle cx="268" cy="26" r="2.5" fill="hsl(var(--color-accent-ink))" />
      {/* Now marker */}
      <circle
        cx={markerX}
        cy={markerY}
        r="4"
        fill="hsl(var(--color-ink))"
        stroke="hsl(var(--color-accent))"
        strokeWidth="2"
      />
      <text
        x="8"
        y="38"
        fill="currentColor"
        opacity="0.65"
        style={{
          fontSize: "7px",
          fontFamily: "var(--font-mono), ui-monospace, monospace",
        }}
      >
        7:00 AM
      </text>
      <text
        x="228"
        y="38"
        fill="currentColor"
        opacity="0.65"
        style={{
          fontSize: "7px",
          fontFamily: "var(--font-mono), ui-monospace, monospace",
        }}
      >
        9:00 PM
      </text>
    </svg>
  );
}
