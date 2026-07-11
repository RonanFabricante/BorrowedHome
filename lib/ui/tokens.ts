// Design tokens for status chips and inner-app surfaces
export type BookingStatusKey =
  | "REQUESTED"
  | "PENDING"
  | "PAYMENT_PENDING"
  | "CONFIRMED"
  | "COMPLETED"
  | "CANCELLED"
  | "DECLINED"
  | "REJECTED"
  | "EXPIRED"
  | "ACCEPTED";

export type StatusTone = "warning" | "accent" | "muted" | "destructive" | "info";

export interface StatusStyle {
  label: string;
  tone: StatusTone;
  badgeClasses: string;
  textClasses: string;
  bgClasses: string;
  borderClasses: string;
}

const TONE_CLASSES: Record<StatusTone, Pick<StatusStyle, "badgeClasses" | "textClasses" | "bgClasses" | "borderClasses">> = {
  warning: {
    badgeClasses: "bg-[hsl(var(--color-accent)/0.22)] text-accent-ink border-[hsl(var(--color-accent-ink)/0.25)]",
    textClasses: "text-accent-ink",
    bgClasses: "bg-[hsl(var(--color-accent)/0.18)]",
    borderClasses: "border-[hsl(var(--color-accent-ink)/0.25)]",
  },
  accent: {
    badgeClasses: "bg-[hsl(var(--color-accent)/0.35)] text-foreground border-[hsl(var(--color-accent-ink)/0.3)]",
    textClasses: "text-accent-ink",
    bgClasses: "bg-[hsl(var(--color-accent)/0.25)]",
    borderClasses: "border-[hsl(var(--color-accent)/0.5)]",
  },
  muted: {
    badgeClasses: "bg-muted text-muted-foreground border-border",
    textClasses: "text-muted-foreground",
    bgClasses: "bg-muted",
    borderClasses: "border-border",
  },
  destructive: {
    badgeClasses: "bg-destructive/10 text-destructive border-destructive/25",
    textClasses: "text-destructive",
    bgClasses: "bg-destructive/10",
    borderClasses: "border-destructive/25",
  },
  info: {
    badgeClasses: "bg-primary/10 text-primary border-primary/20",
    textClasses: "text-primary",
    bgClasses: "bg-primary/10",
    borderClasses: "border-primary/20",
  },
};

function style(label: string, tone: StatusTone): StatusStyle {
  return { label, tone, ...TONE_CLASSES[tone] };
}

/** Canonical booking status → human label + semantic tone */
export const statusStyles: Record<BookingStatusKey, StatusStyle> = {
  REQUESTED: style("Requested", "info"),
  PENDING: style("Requested", "info"),
  ACCEPTED: style("Accepted", "info"),
  PAYMENT_PENDING: style("Awaiting payment", "warning"),
  CONFIRMED: style("Confirmed", "accent"),
  COMPLETED: style("Completed", "muted"),
  CANCELLED: style("Cancelled", "muted"),
  DECLINED: style("Declined", "destructive"),
  REJECTED: style("Declined", "destructive"),
  EXPIRED: style("Expired", "muted"),
};

/** Listing publish state */
export const listingStatusStyles = {
  published: style("Published", "accent"),
  draft: style("Draft", "muted"),
} as const;

/** Ledger / payout entry types */
export const ledgerTypeStyles: Record<string, StatusStyle> = {
  credit: style("Credit", "accent"),
  debit: style("Debit", "muted"),
  payout: style("Payout", "info"),
  fee: style("Fee", "muted"),
  refund: style("Refund", "warning"),
};

export type BookingStatus = BookingStatusKey;

export function resolveStatusStyle(status: string | null | undefined): StatusStyle {
  const key = (status || "").toUpperCase().trim() as BookingStatusKey;
  return (
    statusStyles[key] ||
    style(
      (status || "Unknown").replace(/_/g, " ").toLowerCase().replace(/^\w/, (c) => c.toUpperCase()),
      "muted"
    )
  );
}

export const surfaceClasses = {
  card: "bh-card",
  mutedSurface: "bg-muted border border-border rounded-lg",
  divider: "border-t border-border",
  hoverRow: "hover:bg-muted/60 transition-colors",
};

export const typographyClasses = {
  h1: "font-display text-3xl font-bold lowercase tracking-tighter sm:text-4xl",
  h2: "font-display text-2xl font-bold lowercase tracking-tighter",
  h3: "font-display text-xl font-bold lowercase tracking-tight",
  sectionLabel: "bh-micro",
  mutedText: "text-sm text-muted-foreground",
  smallMuted: "bh-caption",
};
