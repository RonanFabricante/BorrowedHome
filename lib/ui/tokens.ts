// Design tokens for Host Dashboard UI — maps to global CSS custom properties
export type BookingStatus =
  | "REQUESTED"
  | "PAYMENT_PENDING"
  | "CONFIRMED"
  | "COMPLETED"
  | "CANCELLED"
  | "EXPIRED";

export interface StatusStyle {
  label: string;
  badgeClasses: string;
  textClasses: string;
  bgClasses: string;
  borderClasses: string;
}

export const statusStyles: Record<BookingStatus, StatusStyle> = {
  REQUESTED: {
    label: "Requested",
    badgeClasses: "bg-warning/10 text-warning border-warning/30",
    textClasses: "text-warning",
    bgClasses: "bg-warning/10",
    borderClasses: "border-warning/30",
  },
  PAYMENT_PENDING: {
    label: "Awaiting Payment",
    badgeClasses: "bg-primary/10 text-primary border-primary/20",
    textClasses: "text-primary",
    bgClasses: "bg-primary/10",
    borderClasses: "border-primary/20",
  },
  CONFIRMED: {
    label: "Confirmed",
    badgeClasses: "bg-success/10 text-success border-success/25",
    textClasses: "text-success",
    bgClasses: "bg-success/10",
    borderClasses: "border-success/25",
  },
  COMPLETED: {
    label: "Completed",
    badgeClasses: "bg-muted text-muted-foreground border-border",
    textClasses: "text-muted-foreground",
    bgClasses: "bg-muted",
    borderClasses: "border-border",
  },
  CANCELLED: {
    label: "Cancelled",
    badgeClasses: "bg-destructive/10 text-destructive border-destructive/25",
    textClasses: "text-destructive",
    bgClasses: "bg-destructive/10",
    borderClasses: "border-destructive/25",
  },
  EXPIRED: {
    label: "Expired",
    badgeClasses: "bg-muted text-muted-foreground border-border",
    textClasses: "text-muted-foreground",
    bgClasses: "bg-muted",
    borderClasses: "border-border",
  },
};

export const surfaceClasses = {
  card: "bh-card",
  mutedSurface: "bg-muted border border-border rounded-lg",
  divider: "border-t border-border",
  hoverRow: "hover:bg-accent transition-colors",
};

export const typographyClasses = {
  h1: "font-display text-3xl font-medium tracking-tight",
  h2: "font-display text-2xl font-medium tracking-tight",
  h3: "font-sans text-xl font-semibold tracking-tight",
  sectionLabel: "text-sm font-medium text-foreground",
  mutedText: "text-sm text-muted-foreground",
  smallMuted: "text-xs text-muted-foreground",
};
