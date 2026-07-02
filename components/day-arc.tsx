import { cn } from "@/lib/utils";

/**
 * Thin sunrise-to-9pm timeline — use in at most 3 places site-wide.
 */
export function DayArc({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 240 32"
      role="img"
      aria-label="Day-use window from morning to 9:00 PM"
      className={cn("w-full h-8 text-primary/40", className)}
    >
      <path
        d="M8 24 Q 60 8, 120 12 T 232 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <circle cx="8" cy="24" r="2.5" fill="currentColor" className="text-warning" />
      <circle cx="232" cy="24" r="2.5" fill="currentColor" className="text-primary" />
      <text x="4" y="30" className="fill-muted-foreground text-[8px]">
        7:00 AM
      </text>
      <text x="196" y="30" className="fill-muted-foreground text-[8px]">
        9:00 PM
      </text>
    </svg>
  );
}
