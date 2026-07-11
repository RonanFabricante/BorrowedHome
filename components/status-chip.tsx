import { cn } from "@/lib/utils";
import {
  listingStatusStyles,
  ledgerTypeStyles,
  resolveStatusStyle,
  type StatusStyle,
} from "@/lib/ui/tokens";

type ChipKind = "booking" | "listing" | "ledger";

interface StatusChipProps {
  status: string;
  kind?: ChipKind;
  className?: string;
}

function resolve(kind: ChipKind, status: string): StatusStyle {
  if (kind === "listing") {
    const key = status.toLowerCase() === "published" || status === "true" ? "published" : "draft";
    return listingStatusStyles[key];
  }
  if (kind === "ledger") {
    return ledgerTypeStyles[status.toLowerCase()] || resolveStatusStyle(status);
  }
  return resolveStatusStyle(status);
}

/** Single status chip — never render raw backend enums in the UI. */
export function StatusChip({ status, kind = "booking", className }: StatusChipProps) {
  const style = resolve(kind, status);
  return (
    <span
      className={cn(
        "bh-data inline-flex items-center rounded-sm border px-2 py-0.5 text-[0.65rem] font-medium uppercase tracking-[0.06em]",
        style.badgeClasses,
        className
      )}
    >
      {style.label}
    </span>
  );
}

/** @deprecated Prefer StatusChip — kept for host-dashboard imports */
export function StatusBadge(props: StatusChipProps) {
  return <StatusChip {...props} />;
}
