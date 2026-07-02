import Link from "next/link";
import { Logo } from "@/components/logo";
import { BookingRulesLine } from "@/components/booking-rules-line";

export function Footer() {
  return (
    <footer className="border-t border-border mt-auto bg-background">
      <div className="bh-container py-8">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
          <div className="space-y-3">
            <Logo size="sm" href="/" />
            <BookingRulesLine className="text-xs" />
            <p className="text-sm text-muted-foreground">
              &copy; {new Date().getFullYear()} BorrowedHome. All rights reserved.
            </p>
          </div>
          <div className="flex flex-col sm:flex-row gap-4 text-sm">
            <Link
              href="/listings"
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              Browse homes
            </Link>
            <Link
              href="/host/onboard"
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              Become a host
            </Link>
            <Link
              href="/terms/guest-au"
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              Guest Terms (AU)
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
