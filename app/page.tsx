import { Nav } from "@/components/nav";
import { SearchForm } from "@/components/search-form";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { Home, Users, Clock, X } from "lucide-react";

export default function HomePage() {
  return (
    <div className="min-h-screen">
      <Nav />
      <main>
        {/* Hero Section */}
        <section className="container mx-auto px-4 py-16">
          <div className="max-w-3xl mx-auto text-center">
            <h1 className="text-5xl font-bold mb-6">
              Book Real Homes by the Hour
            </h1>
            <p className="text-xl text-muted-foreground mb-8">
              Day-use access to lived-in homes. No overnight stays. No bedrooms.
              Just the spaces you need, when you need them.
            </p>
            <SearchForm />
          </div>
        </section>

        {/* Use Cases */}
        <section className="bg-muted py-16">
          <div className="container mx-auto px-4">
            <h2 className="text-3xl font-bold text-center mb-12">
              Perfect For
            </h2>
            <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
              <div className="text-center">
                <Home className="h-12 w-12 mx-auto mb-4 text-primary" />
                <h3 className="text-xl font-semibold mb-2">Family Gatherings</h3>
                <p className="text-muted-foreground">
                  Host family meals and celebrations in a real home environment
                </p>
              </div>
              <div className="text-center">
                <Users className="h-12 w-12 mx-auto mb-4 text-primary" />
                <h3 className="text-xl font-semibold mb-2">Small Events</h3>
                <p className="text-muted-foreground">
                  Intimate gatherings, workshops, or team meetings
                </p>
              </div>
              <div className="text-center">
                <Clock className="h-12 w-12 mx-auto mb-4 text-primary" />
                <h3 className="text-xl font-semibold mb-2">Flexible Timing</h3>
                <p className="text-muted-foreground">
                  Book by the hour, half-day, or full day to fit your schedule
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* What It Is Not */}
        <section className="container mx-auto px-4 py-16">
          <div className="max-w-3xl mx-auto">
            <h2 className="text-3xl font-bold text-center mb-8">
              What BorrowedHome Is Not
            </h2>
            <div className="space-y-4">
              <div className="flex items-start gap-4 p-4 border rounded-lg">
                <X className="h-6 w-6 text-destructive mt-1 flex-shrink-0" />
                <div>
                  <h3 className="font-semibold mb-1">Not an Overnight Stay</h3>
                  <p className="text-muted-foreground">
                    All bookings end by 9pm. This is day-use only.
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-4 p-4 border rounded-lg">
                <X className="h-6 w-6 text-destructive mt-1 flex-shrink-0" />
                <div>
                  <h3 className="font-semibold mb-1">Not Bedrooms</h3>
                  <p className="text-muted-foreground">
                    We only offer shared spaces: kitchen, dining, living room, and outdoor areas.
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-4 p-4 border rounded-lg">
                <X className="h-6 w-6 text-destructive mt-1 flex-shrink-0" />
                <div>
                  <h3 className="font-semibold mb-1">Not Empty Spaces</h3>
                  <p className="text-muted-foreground">
                    These are real, lived-in homes. Respect the space and leave it as you found it.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* CTAs */}
        <section className="bg-primary text-primary-foreground py-16">
          <div className="container mx-auto px-4 text-center">
            <h2 className="text-3xl font-bold mb-8">Ready to Get Started?</h2>
            <div className="flex gap-4 justify-center">
              <Link href="/listings">
                <Button variant="secondary" size="lg">
                  Browse Homes
                </Button>
              </Link>
              <Link href="/host/onboard">
                <Button variant="outline" size="lg" className="bg-transparent border-white text-white hover:bg-white/10">
                  Become a Host
                </Button>
              </Link>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
