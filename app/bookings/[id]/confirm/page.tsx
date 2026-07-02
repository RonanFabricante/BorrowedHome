import { Nav } from "@/components/nav";
import { BookingConfirmation } from "@/components/booking-confirmation";
import { DayArc } from "@/components/day-arc";
import { BookingRulesLine } from "@/components/booking-rules-line";
import { createClient } from "@/lib/supabase/server";
import { notFound, redirect } from "next/navigation";
import { cn } from "@/lib/utils";

const STEPS = [
  { id: "request", label: "Request" },
  { id: "approval", label: "Host approval" },
  { id: "payment", label: "Payment" },
  { id: "confirmed", label: "Confirmed" },
] as const;

function stepIndex(status: string): number {
  switch (status) {
    case "REQUESTED":
    case "PENDING":
      return 1;
    case "PAYMENT_PENDING":
      return 2;
    case "CONFIRMED":
    case "COMPLETED":
      return 3;
    default:
      return 0;
  }
}

export default async function BookingConfirmPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/login");
  }

  await supabase.rpc("mark_past_bookings_completed");

  const { data: booking } = await supabase
    .from("bookings")
    .select(`
      *,
      listings!inner(
        id,
        title,
        location_text,
        address_text,
        host_id,
        host_present,
        cooking_allowed,
        alcohol_allowed,
        noise_tolerance,
        cleaning_expectations
      ),
      profiles!bookings_guest_id_fkey(id, full_name)
    `)
    .eq("id", id)
    .single();

  if (!booking) {
    notFound();
  }

  const isGuest = booking.guest_id === user.id;
  const isHost = booking.listings.host_id === user.id;

  if (!isGuest && !isHost) {
    notFound();
  }

  const activeStep = stepIndex(booking.status);
  const showProgress = !["DECLINED", "REJECTED", "CANCELLED", "EXPIRED"].includes(
    booking.status
  );

  return (
    <div className="min-h-screen bg-background">
      <Nav />
      <main className="bh-container py-8 sm:py-12">
        {showProgress && (
          <div className="max-w-3xl mx-auto mb-8">
            <DayArc className="mb-4" />
            <BookingRulesLine className="mb-6" />
            <ol className="flex items-center justify-between gap-2" aria-label="Booking progress">
              {STEPS.map((step, index) => {
                const isComplete = index < activeStep;
                const isCurrent = index === activeStep;
                return (
                  <li
                    key={step.id}
                    className={cn(
                      "flex-1 text-center text-xs sm:text-sm",
                      isComplete && "text-success font-medium",
                      isCurrent && "text-foreground font-semibold",
                      !isComplete && !isCurrent && "text-muted-foreground"
                    )}
                    aria-current={isCurrent ? "step" : undefined}
                  >
                    <span
                      className={cn(
                        "mx-auto mb-1 flex h-7 w-7 items-center justify-center rounded-full border text-xs",
                        isComplete && "border-success bg-success text-success-foreground",
                        isCurrent && "border-cta bg-cta text-cta-foreground",
                        !isComplete && !isCurrent && "border-border bg-muted"
                      )}
                    >
                      {index + 1}
                    </span>
                    {step.label}
                  </li>
                );
              })}
            </ol>
          </div>
        )}
        <BookingConfirmation booking={booking} isHost={isHost} />
      </main>
    </div>
  );
}
