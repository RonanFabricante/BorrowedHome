import { Nav } from "@/components/nav";
import { SearchForm } from "@/components/search-form";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { BookingRulesLine } from "@/components/booking-rules-line";
import { DayArc } from "@/components/day-arc";
import { LiveAvailability } from "@/components/live-availability";
import { CountUp } from "@/components/count-up";
import { ScrollReveal } from "@/components/scroll-reveal";
import { FeaturedHomeCard } from "@/components/featured-home-card";
import { createClient } from "@/lib/supabase/server";
import { formatCurrency } from "@/lib/utils";

const SUBURB_ROWS = [
  { suburb: "Surry Hills", homes: 24, fromCents: 4500, rating: "4.9" },
  { suburb: "Fitzroy", homes: 18, fromCents: 4200, rating: "4.8" },
  { suburb: "Newtown", homes: 31, fromCents: 3800, rating: "4.7" },
  { suburb: "Paddington", homes: 12, fromCents: 5500, rating: "5.0" },
  { suburb: "Brunswick", homes: 22, fromCents: 3600, rating: "4.8" },
];

const HOW_STEPS = [
  {
    n: "01",
    title: "find a spare kitchen",
    body: "Search by suburb and hours. Day-use only — no overnight stays.",
  },
  {
    n: "02",
    title: "request the window",
    body: "Hosts respond fast. Pay when accepted; your card holds the booking.",
  },
  {
    n: "03",
    title: "unlock the day",
    body: "Arrive, use the space, leave it as you found it. Done by 9:00 PM.",
  },
];

async function getFeaturedHomes() {
  try {
    const supabase = await createClient();
    const { data } = await supabase
      .from("listings")
      .select(
        `
        id,
        title,
        location_text,
        hourly_rate,
        currency,
        listing_photos(storage_path, sort_order)
      `
      )
      .eq("published", true)
      .order("created_at", { ascending: false })
      .limit(6);

    if (!data?.length) return [];

    return data.map((listing: any) => {
      const photos = (listing.listing_photos || [])
        .sort((a: any, b: any) => a.sort_order - b.sort_order)
        .map((p: any) => {
          const { data: urlData } = supabase.storage
            .from("listing-photos")
            .getPublicUrl(p.storage_path);
          return { url: urlData.publicUrl, sort_order: p.sort_order };
        });
      const suburb = (listing.location_text || "nearby")
        .split(",")[0]
        ?.trim()
        .toLowerCase();
      return {
        id: listing.id,
        title: listing.title,
        location_text: listing.location_text,
        hourly_rate: listing.hourly_rate,
        currency: listing.currency,
        photos,
        caption: `${suburb} · booked for the day`,
      };
    });
  } catch {
    return [];
  }
}

export default async function HomePage() {
  const featured = await getFeaturedHomes();

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <Nav />

      <main>
        {/* Hero — kinetic type + sacred search */}
        <section className="bh-container pb-8 pt-8 sm:pb-12 sm:pt-12">
          <div className="mx-auto max-w-5xl">
            <p className="bh-micro mb-4 text-primary">borrowedhome</p>
            <h1 className="bh-hero-headline mb-5 max-w-[16ch]">
              borrow <strong>space</strong>. just for <strong>the day</strong>.
            </h1>
            <p className="mb-4 max-w-md font-sans text-base text-muted-foreground sm:text-lg">
              Day-use homes for remote work, cooking, and small gatherings — no
              overnight stays.
            </p>
            <LiveAvailability className="mb-5" />
            <DayArc className="mb-6 max-w-md sm:mb-8" />
            <div className="bh-search-card">
              <SearchForm />
            </div>
            <BookingRulesLine className="mt-4 text-xs" />
          </div>
        </section>

        {/* Stat band — data is the aesthetic */}
        <section className="bh-rule bg-card">
          <div className="bh-container py-10 sm:py-12">
            <p className="bh-micro mb-6">marketplace</p>
            <div className="grid grid-cols-2 gap-8 md:grid-cols-4">
              <ScrollReveal>
                <p className="bh-micro mb-2">homes</p>
                <p className="font-display text-4xl font-bold tracking-tighter sm:text-5xl">
                  <CountUp value={142} />
                </p>
                <p className="bh-data mt-1 text-xs text-muted-foreground">
                  live listings
                </p>
              </ScrollReveal>
              <ScrollReveal delayMs={60}>
                <p className="bh-micro mb-2">city</p>
                <p className="font-display text-4xl font-bold tracking-tighter lowercase sm:text-5xl">
                  sydney
                </p>
                <p className="bh-data mt-1 text-xs text-muted-foreground">
                  + melbourne growing
                </p>
              </ScrollReveal>
              <ScrollReveal delayMs={120}>
                <p className="bh-micro mb-2">avg response</p>
                <p className="font-display text-4xl font-bold tracking-tighter sm:text-5xl">
                  <CountUp value={12} suffix=" min" />
                </p>
                <p className="bh-data mt-1 text-xs text-muted-foreground">
                  host reply time
                </p>
              </ScrollReveal>
              <ScrollReveal delayMs={180}>
                <p className="bh-micro mb-2">day ends</p>
                <p className="bh-stat-num font-display text-4xl font-bold tracking-tighter sm:text-5xl">
                  9:00<span className="text-2xl"> PM</span>
                </p>
                <p className="bh-data mt-1 text-xs text-muted-foreground">
                  hard stop every booking
                </p>
              </ScrollReveal>
            </div>
          </div>
        </section>

        {/* Featured homes — hover image swap */}
        <section className="bh-container bh-section bh-rule">
          <div className="mb-10 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="bh-micro mb-2">featured</p>
              <h2 className="font-display text-3xl font-bold tracking-tighter sm:text-4xl">
                homes with daylight
              </h2>
            </div>
            <Link
              href="/listings"
              className="bh-data text-sm text-accent-ink underline decoration-[hsl(var(--color-accent))] decoration-2 underline-offset-4"
            >
              browse all →
            </Link>
          </div>
          {featured.length > 0 ? (
            <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
              {featured.map((home, i) => (
                <ScrollReveal key={home.id} delayMs={i * 40}>
                  <FeaturedHomeCard listing={home} />
                </ScrollReveal>
              ))}
            </div>
          ) : (
            <div className="bh-card p-8 text-center">
              <p className="font-display text-xl font-bold lowercase tracking-tight">
                finding you a spare kitchen…
              </p>
              <p className="mt-2 text-sm text-muted-foreground">
                Published homes will land here.{" "}
                <Link href="/listings" className="text-accent-ink underline">
                  Browse listings
                </Link>{" "}
                or{" "}
                <Link href="/host/onboard" className="text-accent-ink underline">
                  list yours
                </Link>
                .
              </p>
            </div>
          )}
        </section>

        {/* How it works — numbered editorial */}
        <section className="bh-container bh-section bh-rule">
          <p className="bh-micro mb-2">how it works</p>
          <h2 className="mb-12 font-display text-3xl font-bold tracking-tighter sm:text-4xl">
            three moves. done by dusk.
          </h2>
          <ol className="space-y-0 divide-y divide-border">
            {HOW_STEPS.map((step, i) => (
              <ScrollReveal key={step.n} delayMs={i * 50}>
                <li className="grid gap-4 py-8 first:pt-0 last:pb-0 sm:grid-cols-[5rem_1fr] sm:gap-10">
                  <span className="bh-stat-num text-3xl sm:text-4xl">{step.n}</span>
                  <div>
                    <h3 className="font-display text-xl font-bold lowercase tracking-tight sm:text-2xl">
                      {step.title}
                    </h3>
                    <p className="mt-2 max-w-xl text-muted-foreground">{step.body}</p>
                  </div>
                </li>
              </ScrollReveal>
            ))}
          </ol>
        </section>

        {/* Suburb data table */}
        <section className="bh-container bh-section bh-rule">
          <p className="bh-micro mb-2">neighborhoods</p>
          <h2 className="mb-8 font-display text-3xl font-bold tracking-tighter sm:text-4xl">
            suburb telemetry
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[32rem] border-collapse text-left">
              <thead>
                <tr className="border-b border-border">
                  <th className="bh-micro py-3 pr-4">suburb</th>
                  <th className="bh-micro py-3 pr-4">homes</th>
                  <th className="bh-micro py-3 pr-4">from $/hr</th>
                  <th className="bh-micro py-3">avg rating</th>
                </tr>
              </thead>
              <tbody>
                {SUBURB_ROWS.map((row) => (
                  <tr
                    key={row.suburb}
                    className="border-b border-border/70 transition-colors hover:bg-muted/50"
                  >
                    <td className="py-4 pr-4 font-display text-base font-semibold lowercase tracking-tight">
                      {row.suburb}
                    </td>
                    <td className="bh-data py-4 pr-4 text-sm">{row.homes}</td>
                    <td className="bh-data py-4 pr-4 text-sm text-accent-ink">
                      {formatCurrency(row.fromCents)}
                    </td>
                    <td className="bh-data py-4 text-sm">{row.rating}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="bh-caption mt-4">
            illustrative snapshot · live inventory on browse
          </p>
        </section>

        {/* Closing CTA */}
        <section className="bh-rule bg-primary text-primary-foreground">
          <div className="bh-container bh-section">
            <div className="mx-auto max-w-xl text-center">
              <p className="bh-micro mb-3 text-primary-foreground/70">ready?</p>
              <h2 className="mb-3 font-display text-3xl font-bold lowercase tracking-tighter text-primary-foreground sm:text-4xl">
                unlocking front doors…
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
