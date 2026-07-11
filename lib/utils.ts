import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import { DEFAULT_CURRENCY, formatCurrencyAmount } from "@/lib/currency";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Format Stripe/DB minor units for display. Defaults to AUD for legacy callers. */
export function formatCurrency(
  cents: number,
  currency: string = DEFAULT_CURRENCY
): string {
  return formatCurrencyAmount(cents, currency);
}

/** Convert 24h "HH:mm" or "HH:mm:ss" to 12-hour AM/PM for display. */
export function formatTime(time: string): string {
  const [hours, minutes] = time.split(":");
  const hour = parseInt(hours, 10);
  if (Number.isNaN(hour)) return time;
  const ampm = hour >= 12 ? "PM" : "AM";
  const displayHour = hour % 12 || 12;
  return `${displayHour}:${minutes?.padStart(2, "0") ?? "00"} ${ampm}`;
}
