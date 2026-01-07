import Link from "next/link";
import { AlertCircle } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

export function DayUseWarning({ compact = false }: { compact?: boolean }) {
  if (compact) {
    return (
      <div className="p-3 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-lg flex items-start gap-2">
        <AlertCircle className="h-4 w-4 text-amber-600 dark:text-amber-400 mt-0.5 flex-shrink-0" />
        <div className="text-sm">
          <p className="font-semibold text-amber-900 dark:text-amber-100 mb-1">
            Day-Use Only / No Overnight
          </p>
          <p className="text-amber-800 dark:text-amber-200">
            BorrowedHome is for day-use bookings only. Overnight stays are not permitted.{" "}
            <Link
              href="/terms/guest-au#day-use-only--no-overnight"
              className="underline hover:no-underline"
            >
              Learn more
            </Link>
          </p>
        </div>
      </div>
    );
  }

  return (
    <Card className="border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/20">
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-amber-600 dark:text-amber-400 mt-0.5 flex-shrink-0" />
          <div className="flex-1">
            <h3 className="font-semibold text-amber-900 dark:text-amber-100 mb-2">
              Day-Use Only / No Overnight
            </h3>
            <p className="text-sm text-amber-800 dark:text-amber-200 mb-2">
              BorrowedHome is for day-use bookings only. Overnight stays are not permitted.
            </p>
            <p className="text-sm text-amber-800 dark:text-amber-200 mb-2">
              Hosts and guests are responsible for complying with applicable laws, building rules, strata by-laws, lease conditions, and house rules. Guests must leave by the agreed end time.
            </p>
            <p className="text-sm text-amber-800 dark:text-amber-200">
              BorrowedHome does not supervise in-person interactions and is not responsible for a host&apos;s or guest&apos;s acts or omissions. To the maximum extent permitted by law, each party assumes the risks associated with accessing and using a space in person.
            </p>
            <Link
              href="/terms/guest-au#day-use-only--no-overnight"
              className="text-sm text-amber-700 dark:text-amber-300 underline hover:no-underline mt-2 inline-block"
            >
              Read full terms
            </Link>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
