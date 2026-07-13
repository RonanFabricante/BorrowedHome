import Link from "next/link";
import { Logo } from "@/components/logo";
import { BookingRulesLine } from "@/components/booking-rules-line";
import { DayArc } from "@/components/day-arc";
import { SUPPORT_EMAIL } from "@/components/support-contact";

export function Footer() {
  return (
    <footer className="mt-auto border-t border-border bg-background">
      <div className="bh-container py-10">
        <DayArc className="mb-8 max-w-xs opacity-80" />
        <div className="flex flex-col items-start justify-between gap-8 md:flex-row md:items-center">
          <div className="space-y-3">
            <Logo size="sm" href="/" showText />
            <BookingRulesLine className="text-xs" />
            <p className="text-sm text-muted-foreground">
              Need help?{" "}
              <a
                href={`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent("BorrowedHome support")}`}
                className="text-foreground transition-colors hover:text-primary"
              >
                {SUPPORT_EMAIL}
              </a>
            </p>
            <p className="text-sm text-muted-foreground">
              &copy; {new Date().getFullYear()} BorrowedHome. All rights reserved.
            </p>
          </div>
          <div className="flex flex-col gap-3 text-sm sm:flex-row sm:gap-6">
            <Link
              href="/listings"
              className="text-muted-foreground transition-colors hover:text-foreground"
            >
              Browse homes
            </Link>
            <Link
              href="/host/onboard"
              className="text-muted-foreground transition-colors hover:text-foreground"
            >
              Become a host
            </Link>
            <Link
              href="/faq"
              className="text-muted-foreground transition-colors hover:text-foreground"
            >
              FAQ
            </Link>
            <a
              href={`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent("BorrowedHome support")}`}
              className="text-muted-foreground transition-colors hover:text-foreground"
            >
              Contact
            </a>
            <Link
              href="/terms/guest-au"
              className="text-muted-foreground transition-colors hover:text-foreground"
            >
              Guest Terms (AU)
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
