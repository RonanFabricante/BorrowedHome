"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { StatusChip } from "@/components/status-chip";
import { BookingThumb } from "@/components/booking-thumb";
import { formatCurrency, cn } from "@/lib/utils";
import { formatSydneyDate, formatSydneyTime } from "@/lib/timezone";
import { normalizeBookingStatus } from "@/lib/bookingStatus";

export type BookingCardAction = {
  label: string;
  href?: string;
  onClick?: () => void;
  variant?: "default" | "outline" | "ghost" | "destructive";
  primary?: boolean;
  disabled?: boolean;
};

export interface BookingCardProps {
  id: string;
  title: string;
  locationText?: string | null;
  status: string;
  startAt: string;
  endAt: string;
  guestsCount: number;
  totalAmount: number;
  currency?: string;
  photoUrl?: string | null;
  subtitle?: string | null;
  href?: string;
  actions?: BookingCardAction[];
  className?: string;
}

function suburbCaption(location: string | null | undefined): string {
  if (!location?.trim()) return "location tbd";
  return location.trim().toLowerCase();
}

export function BookingCard({
  id,
  title,
  locationText,
  status,
  startAt,
  endAt,
  guestsCount,
  totalAmount,
  currency,
  photoUrl,
  subtitle,
  href = `/bookings/${id}/confirm`,
  actions = [],
  className,
}: BookingCardProps) {
  const when = `${formatSydneyDate(startAt)} · ${formatSydneyTime(startAt)} – ${formatSydneyTime(endAt)}`;
  const primary = actions.find((a) => a.primary) || actions[0];
  const secondary = actions.filter((a) => a !== primary);

  return (
    <article
      className={cn(
        "group relative flex flex-col gap-4 rounded-[var(--radius-lg)] border border-border bg-card p-4 transition-[border-color,box-shadow,transform] duration-200",
        "hover:border-[hsl(var(--color-accent-ink)/0.45)] hover:shadow-elevated hover:-translate-y-0.5",
        "focus-within:border-[hsl(var(--color-accent-ink)/0.55)] focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2",
        "motion-reduce:transform-none motion-reduce:transition-none",
        "sm:flex-row sm:items-center",
        className
      )}
    >
      <Link
        href={href}
        className="absolute inset-0 z-0 rounded-[var(--radius-lg)] focus:outline-none"
        aria-label={`View booking: ${title}`}
      />

      <BookingThumb src={photoUrl} alt="" className="relative z-[1] pointer-events-none" />

      <div className="relative z-[1] min-w-0 flex-1 pointer-events-none">
        <div className="mb-1 flex flex-wrap items-center gap-2">
          <h3 className="font-display text-xl font-bold lowercase tracking-tight line-clamp-1">
            {title}
          </h3>
          <StatusChip status={status} />
        </div>
        <p className="bh-caption mb-3">{subtitle || suburbCaption(locationText)}</p>
        <div className="flex flex-wrap gap-x-5 gap-y-2">
          <DataCell label="when" value={when} />
          <DataCell label="guests" value={String(guestsCount)} />
          <DataCell
            label="total"
            value={formatCurrency(totalAmount, currency)}
            emphasize
          />
        </div>
      </div>

      <div className="relative z-[2] flex w-full flex-row flex-wrap gap-2 sm:w-auto sm:flex-col sm:items-stretch">
        {primary && (
          <ActionButton action={primary} primary />
        )}
        {secondary.map((action) => (
          <ActionButton key={action.label} action={action} />
        ))}
        {!actions.length && (
          <Button asChild variant="ghost" size="sm" className="relative z-[2]">
            <Link href={href}>View details</Link>
          </Button>
        )}
      </div>
    </article>
  );
}

function DataCell({
  label,
  value,
  emphasize,
}: {
  label: string;
  value: string;
  emphasize?: boolean;
}) {
  return (
    <div>
      <div className="bh-micro mb-0.5">{label}</div>
      <div
        className={cn(
          "bh-data text-sm",
          emphasize ? "font-semibold text-accent-ink" : "text-foreground"
        )}
      >
        {value}
      </div>
    </div>
  );
}

function ActionButton({
  action,
  primary,
}: {
  action: BookingCardAction;
  primary?: boolean;
}) {
  const variant = action.variant || (primary || action.primary ? "default" : "ghost");
  const className = "relative z-[2] w-full sm:w-auto";

  if (action.href) {
    return (
      <Button asChild variant={variant} size="sm" className={className} disabled={action.disabled}>
        <Link href={action.href} onClick={(e) => e.stopPropagation()}>
          {action.label}
        </Link>
      </Button>
    );
  }

  return (
    <Button
      type="button"
      variant={variant}
      size="sm"
      className={className}
      disabled={action.disabled}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        action.onClick?.();
      }}
    >
      {action.label}
    </Button>
  );
}

/** Build default guest actions from booking status. */
export function guestBookingActions(booking: {
  id: string;
  status: string;
  end_at: string;
}): BookingCardAction[] {
  const status = normalizeBookingStatus(booking.status);
  const isPast = new Date(booking.end_at).getTime() < Date.now();
  const actions: BookingCardAction[] = [];

  if (status === "PAYMENT_PENDING") {
    actions.push({
      label: "Pay now",
      href: `/bookings/${booking.id}/confirm?action=pay`,
      primary: true,
    });
  } else if (status === "CONFIRMED") {
    actions.push({
      label: "Message host",
      href: `/bookings/${booking.id}/messages`,
      primary: true,
    });
  } else if (isPast && status === "COMPLETED") {
    actions.push({
      label: "Leave review",
      href: `/bookings/${booking.id}/review`,
      primary: true,
    });
  }

  actions.push({
    label: "View details",
    href: `/bookings/${booking.id}/confirm`,
    variant: "ghost",
  });

  return actions;
}
