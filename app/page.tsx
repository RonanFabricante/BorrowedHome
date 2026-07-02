import { Nav } from "@/components/nav";
import { SearchForm } from "@/components/search-form";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { Home, UtensilsCrossed, Laptop, X } from "lucide-react";
import { Logo } from "@/components/logo";
import { BookingRulesLine } from "@/components/booking-rules-line";
import { DAY_USE_RULES } from "@/lib/constants/copy";

export default function HomePage() {
  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <Nav />

      <main>
        {/* Hero — warm residential, no stock video */}
        <section className="bh-container bh-section">
          <div className="max-w-4xl mx-auto text-center">
            <div className="flex justify-center mb-4">
              <Logo size="md" href={null} />
            </div>
            <h1 className="font-display text-3xl sm:text-4xl lg:text-5xl font-semibold tracking-tight leading-tight mb-3">
              Borrow space. Just for the day.
            </h1>
            <p className="text-muted-foreground text-base sm:text-lg max-w-xl mx-auto mb-8">
              Day-use homes for remote work, cooking, and small gatherings — no overnight stays.
            </p>

            <div className="bh-card text-left p-5 sm:p-8 shadow-elevated">
              <SearchForm />
            </div>
          </div>
        </section>

        {/* Use cases */}
        <section className="bh-container bh-section border-t border-border">
          <h2 className="font-display text-2xl sm:text-3xl font-semibold text-center mb-10">
            Perfect for
          </h2>
          <div className="grid sm:grid-cols-3 gap-8 max-w-5xl mx-auto">
            <div className="text-center">
              <Laptop className="h-10 w-10 mx-auto mb-4 text-primary" aria-hidden />
              <h3 className="font-display text-lg font-semibold mb-2">Remote work</h3>
              <p className="text-muted-foreground text-sm">
                A quiet table, natural light, and a real kitchen between meetings.
              </p>
            </div>
            <div className="text-center">
              <UtensilsCrossed className="h-10 w-10 mx-auto mb-4 text-primary" aria-hidden />
              <h3 className="font-display text-lg font-semibold mb-2">Cook &amp; gather</h3>
              <p className="text-muted-foreground text-sm">
                Host a meal or small celebration in someone&apos;s lived-in home.
              </p>
            </div>
            <div className="text-center">
              <Home className="h-10 w-10 mx-auto mb-4 text-primary" aria-hidden />
              <h3 className="font-display text-lg font-semibold mb-2">Flexible hours</h3>
              <p className="text-muted-foreground text-sm">
                Book by the hour within the day-use window — you choose the timing.
              </p>
            </div>
          </div>
        </section>

        {/* What it is not */}
        <section className="bh-container bh-section border-t border-border">
          <div className="max-w-3xl mx-auto">
            <h2 className="font-display text-2xl sm:text-3xl font-semibold text-center mb-8">
              What BorrowedHome is not
            </h2>
            <div className="space-y-4">
              <div className="flex items-start gap-4 p-4 bh-card">
                <X className="h-5 w-5 text-destructive mt-1 shrink-0" aria-hidden />
                <div>
                  <h3 className="font-semibold mb-1">Not overnight</h3>
                  <p className="text-muted-foreground text-sm">{DAY_USE_RULES}</p>
                </div>
              </div>
              <div className="flex items-start gap-4 p-4 bh-card">
                <X className="h-5 w-5 text-destructive mt-1 shrink-0" aria-hidden />
                <div>
                  <h3 className="font-semibold mb-1">Not bedrooms</h3>
                  <p className="text-muted-foreground text-sm">
                    Shared spaces only: kitchen, dining, living room, and outdoor areas.
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-4 p-4 bh-card">
                <X className="h-5 w-5 text-destructive mt-1 shrink-0" aria-hidden />
                <div>
                  <h3 className="font-semibold mb-1">Not empty venues</h3>
                  <p className="text-muted-foreground text-sm">
                    Real homes — please respect the space and leave it as you found it.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* CTAs */}
        <section className="bh-container bh-section border-t border-border bg-primary text-primary-foreground">
          <div className="text-center max-w-xl mx-auto">
            <h2 className="font-display text-2xl sm:text-3xl font-semibold mb-3">
              Ready to get started?
            </h2>
            <BookingRulesLine className="text-primary-foreground/80 mb-8 justify-center" />
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Link href="/listings">
                <Button size="lg" className="w-full sm:w-auto min-w-[160px]">
                  Browse homes
                </Button>
              </Link>
              <Link href="/host/onboard">
                <Button
                  variant="outline"
                  size="lg"
                  className="w-full sm:w-auto min-w-[160px] bg-transparent border-primary-foreground/30 text-primary-foreground hover:bg-primary-foreground/10"
                >
                  Become a host
                </Button>
              </Link>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
