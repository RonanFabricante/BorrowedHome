import { cn } from "@/lib/utils";

/**
 * Thin sunrise → 9:00 PM day-use motif.
 * Use in at most 3 places: hero, booking/summary UI, footer.
 */
export function DayArc({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 280 36"
      role="img"
      aria-label="Day-use window from 7:00 AM to 9:00 PM"
      className={cn("h-9 w-full text-primary", className)}
    >
      <path
        d="M12 26 Q 70 6, 140 14 T 268 26"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.25"
        strokeLinecap="round"
        opacity="0.55"
      />
      {/* Sunrise marker */}
      <circle cx="12" cy="26" r="2.75" fill="currentColor" opacity="0.9" />
      {/* 9pm marker */}
      <circle cx="268" cy="26" r="2.75" fill="currentColor" opacity="0.9" />
      <text
        x="8"
        y="34"
        fill="currentColor"
        opacity="0.55"
        style={{ fontSize: "7px", fontFamily: "var(--font-body), system-ui, sans-serif" }}
      >
        7:00 AM
      </text>
      <text
        x="232"
        y="34"
        fill="currentColor"
        opacity="0.55"
        style={{ fontSize: "7px", fontFamily: "var(--font-body), system-ui, sans-serif" }}
      >
        9:00 PM
      </text>
    </svg>
  );
}
