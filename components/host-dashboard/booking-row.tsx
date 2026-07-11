import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "./status-badge";
import { formatCurrency } from "@/lib/utils";
import { format, differenceInMinutes } from "date-fns";
import {
  MessageCircle,
  Eye,
  Calendar,
  MapPin,
  Users,
  AlertCircle,
  ChevronRight,
} from "lucide-react";
import { HostBooking } from "@/lib/host/dashboard";
import { surfaceClasses } from "@/lib/ui/tokens";

interface BookingRowProps {
  booking: HostBooking;
  variant?: "default" | "request";
  onAccept?: (bookingId: string) => void;
  onDecline?: (bookingId: string) => void;
  processing?: boolean;
}

export function BookingRow({
  booking,
  variant = "default",
  onAccept,
  onDecline,
  processing = false,
}: BookingRowProps) {
  const startDate = new Date(booking.start_at);
  const endDate = new Date(booking.end_at);
  const isPaymentPending = booking.status === "PAYMENT_PENDING";
  const deadline = booking.payment_deadline_at
    ? new Date(booking.payment_deadline_at)
    : null;
  const minutesLeft = deadline
    ? differenceInMinutes(deadline, new Date())
    : null;

  const getCountdownText = () => {
    if (!minutesLeft || minutesLeft < 0) return null;
    if (minutesLeft < 60) return `${minutesLeft}m left`;
    const hours = Math.floor(minutesLeft / 60);
    const mins = minutesLeft % 60;
    return `${hours}h ${mins}m left`;
  };

  const countdownText = getCountdownText();

  return (
    <Card className={`${surfaceClasses.card} ${surfaceClasses.hoverRow} group`}>
      <CardContent className="p-6">
        <div className="flex flex-col lg:flex-row lg:items-center gap-4">
          {/* Left: Listing & Guest Info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-start gap-3 mb-2">
              <h3 className="text-lg font-semibold text-slate-900 truncate">
                {booking.listing?.title || "Listing unavailable"}
              </h3>
              <StatusBadge status={booking.status} />
              {isPaymentPending && countdownText && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200">
                  <AlertCircle className="h-3 w-3" />
                  Expires in {countdownText}
                </span>
              )}
            </div>

            <div className="space-y-1.5 text-sm text-slate-600">
              <div className="flex items-center gap-2">
                <MapPin className="h-3.5 w-3.5 flex-shrink-0" />
                <span className="truncate">{booking.listing?.location_text || ""}</span>
              </div>
              <div className="flex items-center gap-2">
                <Users className="h-3.5 w-3.5 flex-shrink-0" />
                <span>
                  {booking.guest.full_name || "Guest"} • {booking.guests_count}{" "}
                  guest{booking.guests_count !== 1 ? "s" : ""}
                </span>
              </div>
            </div>
          </div>

          {/* Middle: Date/Time & Amount */}
          <div className="flex flex-col gap-3 lg:min-w-[200px]">
            <div className="flex items-center gap-3">
              <Calendar className="h-4 w-4 text-slate-400 flex-shrink-0" />
              <div className="text-sm">
                <div className="font-medium text-slate-900">
                  {format(startDate, "MMM d, yyyy")}
                </div>
                <div className="text-slate-600">
                  {format(startDate, "h:mm a")} - {format(endDate, "h:mm a")}
                </div>
              </div>
            </div>
            <div className="text-sm lg:block hidden">
              <div className="text-slate-600">Total</div>
              <div className="font-semibold text-slate-900">
                {formatCurrency(booking.total_amount, booking.currency)}
              </div>
            </div>
          </div>

          {/* Right: Actions */}
          <div className="flex items-center gap-2 lg:flex-shrink-0">
            {variant === "request" && onAccept && onDecline ? (
              <>
                <Button
                  size="sm"
                  onClick={() => onAccept(booking.id)}
                  disabled={processing}
                  className="flex items-center gap-2"
                >
                  Accept
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => onDecline(booking.id)}
                  disabled={processing}
                  className="flex items-center gap-2 border-red-200 text-red-700 hover:bg-red-50"
                >
                  Decline
                </Button>
              </>
            ) : (
              <>
                <Button
                  size="sm"
                  variant="outline"
                  asChild
                  className="flex items-center gap-2"
                >
                  <Link href={`/bookings/${booking.id}/messages`}>
                    <MessageCircle className="h-4 w-4" />
                    Message
                  </Link>
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  asChild
                  className="flex items-center gap-2"
                >
                  <Link href={`/bookings/${booking.id}/confirm`}>
                    <Eye className="h-4 w-4" />
                    View
                  </Link>
                </Button>
              </>
            )}
            <ChevronRight className="h-4 w-4 text-slate-400 lg:hidden group-hover:text-slate-600 transition-colors" />
          </div>
        </div>

        {/* Amount (mobile) */}
        <div className="mt-3 pt-3 border-t border-slate-200 lg:hidden">
          <div className="flex items-center justify-between">
            <span className="text-sm text-slate-600">Total</span>
            <span className="text-base font-semibold text-slate-900">
              {formatCurrency(booking.total_amount, booking.currency)}
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
