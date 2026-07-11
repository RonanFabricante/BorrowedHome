"use client";

import { useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/utils";

/** Live day-use availability framing for the hero. */
export function LiveAvailability({ className }: { className?: string }) {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(id);
  }, []);

  const copy = useMemo(() => {
    const parts = new Intl.DateTimeFormat("en-AU", {
      timeZone: "Australia/Sydney",
      hour: "numeric",
      minute: "numeric",
      hour12: true,
    }).formatToParts(now);
    const hour24 = Number(
      new Intl.DateTimeFormat("en-AU", {
        timeZone: "Australia/Sydney",
        hour: "numeric",
        hour12: false,
      }).format(now)
    );
    const minute = Number(parts.find((p) => p.type === "minute")?.value ?? 0);

    const fmt = (h: number, m: number) => {
      const d = new Date();
      d.setHours(h, m, 0, 0);
      return d.toLocaleTimeString("en-AU", {
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
      });
    };

    if (hour24 < 7) {
      return `Next available window today: ${fmt(7, 0)} – ${fmt(21, 0)}`;
    }
    if (hour24 >= 21) {
      return `Day-use closed · next window tomorrow ${fmt(7, 0)} – ${fmt(21, 0)}`;
    }
    // Round start up to next half-hour within window
    let startH = hour24;
    let startM = minute < 30 ? 30 : 0;
    if (minute >= 30) startH += 1;
    if (startH >= 21) {
      return `Day-use closing soon · ends ${fmt(21, 0)}`;
    }
    return `Next available window today: ${fmt(startH, startM)} – ${fmt(21, 0)}`;
  }, [now]);

  return (
    <p className={cn("bh-data text-sm text-accent-ink", className)}>
      <span
        className="mr-2 inline-block h-1.5 w-1.5 rounded-full bg-electric align-middle"
        aria-hidden
      />
      {copy}
    </p>
  );
}
