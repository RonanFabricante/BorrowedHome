"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

/** Count-up once when scrolled into view (≤800ms). Respects reduced motion. */
export function CountUp({
  value,
  className,
  durationMs = 750,
  suffix = "",
  prefix = "",
}: {
  value: number;
  className?: string;
  durationMs?: number;
  suffix?: string;
  prefix?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const [display, setDisplay] = useState(0);
  const [done, setDone] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || done) return;

    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (reduce) {
      setDisplay(value);
      setDone(true);
      return;
    }

    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return;
        io.disconnect();
        const start = performance.now();
        const from = 0;
        const tick = (t: number) => {
          const p = Math.min(1, (t - start) / durationMs);
          const eased = 1 - Math.pow(1 - p, 3);
          setDisplay(Math.round(from + (value - from) * eased));
          if (p < 1) requestAnimationFrame(tick);
          else setDone(true);
        };
        requestAnimationFrame(tick);
      },
      { threshold: 0.4 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [value, durationMs, done]);

  return (
    <span ref={ref} className={cn("bh-stat-num", className)}>
      {prefix}
      {display.toLocaleString("en-AU")}
      {suffix}
    </span>
  );
}
