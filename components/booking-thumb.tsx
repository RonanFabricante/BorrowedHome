"use client";

import { DayArc } from "@/components/day-arc";
import { cn } from "@/lib/utils";

/** Fixed 4:3 thumb — photo or day-arc placeholder (never a flat gray box). */
export function BookingThumb({
  src,
  alt,
  className,
}: {
  src?: string | null;
  alt: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "relative aspect-[4/3] w-full shrink-0 overflow-hidden rounded-[var(--radius)] border border-border bg-[hsl(var(--color-accent)/0.12)] sm:w-36",
        className
      )}
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt={alt} className="h-full w-full object-cover" />
      ) : (
        <div className="flex h-full w-full flex-col items-center justify-center px-3">
          <DayArc className="max-w-[7rem] opacity-90" />
          <span className="bh-caption mt-2">day use</span>
        </div>
      )}
    </div>
  );
}
