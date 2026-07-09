import { Nav } from "@/components/nav";
import { SearchForm } from "@/components/search-form";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { Home, UtensilsCrossed, Laptop, X } from "lucide-react";
import { BookingRulesLine } from "@/components/booking-rules-line";
import { DayArc } from "@/components/day-arc";
import { DAY_USE_RULES } from "@/lib/constants/copy";

export default function HomePage() {
  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <Nav />

      <main>
        {/* Hero — typography is the visual centerpiece */}
        <section className="bh-container pt-10 sm:pt-16 pb-6 sm:pb-10">
          <div className="mx-auto max-w-5xl">
            <p className="mb-6 font-sans text-sm font-medium tracking-wide text-primary sm:mb-8">
              BorrowedHome
            </p>
            <h1 className="bh-hero-headline mb-6 max-w-[14ch] sm:mb-8">
              Borrow space. Just for the day.
            </h1>
            <p className="mb-8 max-w-md font-sans text-base text-muted-foreground sm:mb-10 sm:text-lg">
              Day-use homes for remote work, cooking, and small gatherings — no overnight stays.
            </p>

            {/* Signature day arc — place (a) */}
            <DayArc className="mb-6 max-w-md sm:mb-8" />

            <div className="bh-card p-6 shadow-elevated sm:p-8">
              <SearchForm />
            </div>
          </div>
        </section>

        {/* Use cases */}
        <section className="bh-container bh-section bh-rule">
          <h2 className="mb-12 text-center font-display text-2xl font-medium sm:text-3xl">
            Perfect for
          </h2>
          <div className="mx-auto grid max-w-5xl gap-10 sm:grid-cols-3 sm:gap-8">
            <div>
              <Laptop className="mb-4 h-8 w-8 text-primary" aria-hidden />
              <h3 className="mb-2 font-sans text-base font-semibold">Remote work</h3>
              <p className="text-sm text-muted-foreground">
                A quiet table, natural light, and a real kitchen between meetings.
              </p>
            </div>
            <div>
              <UtensilsCrossed className="mb-4 h-8 w-8 text-primary" aria-hidden />
              <h3 className="mb-2 font-sans text-base font-semibold">Cook &amp; gather</h3>
              <p className="text-sm text-muted-foreground">
                Host a meal or small celebration in someone&apos;s lived-in home.
              </p>
            </div>
            <div>
              <Home className="mb-4 h-8 w-8 text-primary" aria-hidden />
              <h3 className="mb-2 font-sans text-base font-semibold">Flexible hours</h3>
              <p className="text-sm text-muted-foreground">
                Book by the hour within the day-use window — you choose the timing.
              </p>
            </div>
          </div>
        </section>

        {/* What it is not */}
        <section className="bh-container bh-section bh-rule">
          <div className="mx-auto max-w-2xl">
            <h2 className="mb-10 text-center font-display text-2xl font-medium sm:text-3xl">
              What BorrowedHome is not
            </h2>
            <div className="space-y-0 divide-y divide-border">
              <div className="flex items-start gap-4 py-5 first:pt-0">
                <X className="mt-0.5 h-5 w-5 shrink-0 text-destructive" aria-hidden />
                <div>
                  <h3 className="mb-1 font-sans text-base font-semibold">Not overnight</h3>
                  <p className="text-sm text-muted-foreground">{DAY_USE_RULES}</p>
                </div>
              </div>
              <div className="flex items-start gap-4 py-5">
                <X className="mt-0.5 h-5 w-5 shrink-0 text-destructive" aria-hidden />
                <div>
                  <h3 className="mb-1 font-sans text-base font-semibold">Not bedrooms</h3>
                  <p className="text-sm text-muted-foreground">
                    Shared spaces only: kitchen, dining, living room, and outdoor areas.
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-4 py-5 last:pb-0">
                <X className="mt-0.5 h-5 w-5 shrink-0 text-destructive" aria-hidden />
                <div>
                  <h3 className="mb-1 font-sans text-base font-semibold">Not empty venues</h3>
                  <p className="text-sm text-muted-foreground">
                    Real homes — please respect the space and leave it as you found it.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Closing CTA — calm primary band, clay button */}
        <section className="bh-rule bg-primary text-primary-foreground">
          <div className="bh-container bh-section">
            <div className="mx-auto max-w-xl text-center">
              <h2 className="mb-3 font-display text-2xl font-medium text-primary-foreground sm:text-3xl">
                Ready to get started?
              </h2>
              <BookingRulesLine className="mb-8 justify-center text-primary-foreground/75" />
              <div className="flex flex-col justify-center gap-3 sm:flex-row">
                <Link href="/listings">
                  <Button size="lg" className="w-full min-w-[160px] sm:w-auto">
                    Browse homes
                  </Button>
                </Link>
                <Link href="/host/onboard">
                  <Button
                    variant="outline"
                    size="lg"
                    className="w-full min-w-[160px] border-primary-foreground/35 bg-transparent text-primary-foreground hover:bg-primary-foreground/10 sm:w-auto"
                  >
                    Become a host
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
