// Design tokens for Host Dashboard UI
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
    badgeClasses: "bg-amber-50 text-amber-700 border-amber-200",
    textClasses: "text-amber-700",
    bgClasses: "bg-amber-50",
    borderClasses: "border-amber-200",
  },
  PAYMENT_PENDING: {
    label: "Awaiting Payment",
    badgeClasses: "bg-purple-50 text-purple-700 border-purple-200",
    textClasses: "text-purple-700",
    bgClasses: "bg-purple-50",
    borderClasses: "border-purple-200",
  },
  CONFIRMED: {
    label: "Confirmed",
    badgeClasses: "bg-green-50 text-green-700 border-green-200",
    textClasses: "text-green-700",
    bgClasses: "bg-green-50",
    borderClasses: "border-green-200",
  },
  COMPLETED: {
    label: "Completed",
    badgeClasses: "bg-slate-50 text-slate-700 border-slate-200",
    textClasses: "text-slate-700",
    bgClasses: "bg-slate-50",
    borderClasses: "border-slate-200",
  },
  CANCELLED: {
    label: "Cancelled",
    badgeClasses: "bg-red-50 text-red-700 border-red-200",
    textClasses: "text-red-700",
    bgClasses: "bg-red-50",
    borderClasses: "border-red-200",
  },
  EXPIRED: {
    label: "Expired",
    badgeClasses: "bg-gray-50 text-gray-700 border-gray-200",
    textClasses: "text-gray-700",
    bgClasses: "bg-gray-50",
    borderClasses: "border-gray-200",
  },
};

// Surface classes
export const surfaceClasses = {
  card: "bg-white border border-slate-200 rounded-2xl",
  mutedSurface: "bg-slate-50 border border-slate-200 rounded-xl",
  divider: "border-t border-slate-200",
  hoverRow: "hover:bg-slate-50 transition-colors",
};

// Typography classes
export const typographyClasses = {
  h1: "text-3xl font-bold tracking-tight",
  h2: "text-2xl font-semibold tracking-tight",
  h3: "text-xl font-semibold",
  sectionLabel: "text-sm font-medium text-slate-700",
  mutedText: "text-sm text-slate-600",
  smallMuted: "text-xs text-slate-500",
};
