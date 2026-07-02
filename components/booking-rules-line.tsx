import { DAY_USE_RULES } from "@/lib/constants/copy";
import { cn } from "@/lib/utils";

export function BookingRulesLine({ className }: { className?: string }) {
  return (
    <p className={cn("text-sm text-muted-foreground", className)}>{DAY_USE_RULES}</p>
  );
}
