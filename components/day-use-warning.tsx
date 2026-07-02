import Link from "next/link";
import { AlertCircle } from "lucide-react";
import { StatusBanner } from "@/components/status-banner";
import { BookingRulesLine } from "@/components/booking-rules-line";
import { DAY_USE_RULES } from "@/lib/constants/copy";

export function DayUseWarning({ compact = false }: { compact?: boolean }) {
  if (compact) {
    return (
      <StatusBanner variant="warning" title="Day-use only — no overnight stays">
        <BookingRulesLine className="text-foreground/80" />{" "}
        <Link
          href="/terms/guest-au#day-use-only--no-overnight"
          className="text-primary underline hover:no-underline"
        >
          Learn more
        </Link>
      </StatusBanner>
    );
  }

  return (
    <StatusBanner
      variant="warning"
      title="Day-use only — no overnight stays"
      icon={AlertCircle}
    >
      <p className="mb-2">{DAY_USE_RULES}</p>
      <p className="mb-2">
        Hosts and guests are responsible for complying with applicable laws, building rules,
        strata by-laws, lease conditions, and house rules. Guests must leave by the agreed end time.
      </p>
      <p>
        BorrowedHome does not supervise in-person interactions and is not responsible for a
        host&apos;s or guest&apos;s acts or omissions.
      </p>
      <Link
        href="/terms/guest-au#day-use-only--no-overnight"
        className="text-primary underline hover:no-underline mt-2 inline-block"
      >
        Read full terms
      </Link>
    </StatusBanner>
  );
}
