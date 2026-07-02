"use client";

import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Listing } from "@/lib/types";
import { formatCurrency } from "@/lib/utils";
import { ChefHat, UtensilsCrossed, Home, Trees } from "lucide-react";
import Image from "next/image";
import { EmptyState } from "@/components/empty-state";

const spaceIcons = {
  KITCHEN: ChefHat,
  DINING: UtensilsCrossed,
  LIVING: Home,
  GARDEN: Trees,
};

interface ListingsGridProps {
  listings: Listing[];
  location?: string;
}

export function ListingsGrid({ listings, location }: ListingsGridProps) {
  if (listings.length === 0) {
    const place = location?.trim();
    return (
      <EmptyState
        title={place ? `No homes in ${place} yet` : "No homes match your search"}
        description={
          place
            ? "Try nearby suburbs, a different date, or wider time window within day-use hours."
            : "Adjust your filters or browse all available homes."
        }
        actionLabel={place ? "Browse all homes" : "Clear filters"}
        actionHref="/listings"
      />
    );
  }

  return (
    <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
      {listings.map((listing) => {
        const heroPhoto = listing.photos?.sort((a, b) => a.sort_order - b.sort_order)[0];
        const hourlyRate = listing.hourly_rate;
        const hourlyEquivalent = Math.min(
          listing.hourly_rate,
          Math.round(listing.half_day_rate / 4),
          Math.round(listing.full_day_rate / 8)
        );

        return (
          <Link key={listing.id} href={`/listings/${listing.id}`} className="group">
            <Card className="overflow-hidden h-full transition-shadow group-hover:shadow-elevated">
              <div className="relative aspect-[4/3] bg-muted">
                {heroPhoto?.url ? (
                  <Image
                    src={heroPhoto.url}
                    alt={listing.title}
                    fill
                    sizes="(max-width: 768px) 100vw, 33vw"
                    className="object-cover"
                  />
                ) : (
                  <div
                    className="absolute inset-0 bg-muted animate-pulse"
                    aria-hidden
                  />
                )}
                <div className="absolute top-2 right-2 flex gap-2">
                  <Badge variant="secondary" className="bg-card/95 backdrop-blur-sm">
                    Day use
                  </Badge>
                  {listing.host_present && (
                    <Badge variant="outline" className="bg-card/95 backdrop-blur-sm">
                      Host present
                    </Badge>
                  )}
                </div>
              </div>
              <CardContent className="p-4">
                <h3 className="font-display font-semibold text-lg mb-1 line-clamp-1">
                  {listing.title}
                </h3>
                <p className="text-sm text-muted-foreground mb-3 line-clamp-1">
                  {listing.location_text}
                </p>
                <div className="flex items-center gap-2 mb-3 flex-wrap">
                  {listing.spaces?.map((space) => {
                    const Icon = spaceIcons[space];
                    return Icon ? (
                      <Icon
                        key={space}
                        className="h-4 w-4 text-muted-foreground"
                        aria-label={space}
                      />
                    ) : null;
                  })}
                </div>
                <div className="flex items-end justify-between gap-2">
                  <div>
                    <span className="font-semibold block">
                      From {formatCurrency(hourlyRate)}/hr
                    </span>
                    {hourlyEquivalent < hourlyRate && (
                      <span className="text-xs text-muted-foreground">
                        As low as {formatCurrency(hourlyEquivalent)}/hr for longer bookings
                      </span>
                    )}
                  </div>
                  <span className="text-sm text-muted-foreground shrink-0">
                    Up to {listing.max_guests} guests
                  </span>
                </div>
              </CardContent>
            </Card>
          </Link>
        );
      })}
    </div>
  );
}
