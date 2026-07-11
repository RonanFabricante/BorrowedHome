"use client";

import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Listing } from "@/lib/types";
import { formatCurrency } from "@/lib/utils";
import { ChefHat, UtensilsCrossed, Home, Trees, Waves, Warehouse } from "lucide-react";
import Image from "next/image";
import { EmptyState } from "@/components/empty-state";

const spaceIcons = {
  KITCHEN: ChefHat,
  DINING: UtensilsCrossed,
  LIVING: Home,
  GARDEN: Trees,
  POOL: Waves,
  GARAGE: Warehouse,
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
        const sortedPhotos = [...(listing.photos || [])].sort(
          (a, b) => a.sort_order - b.sort_order
        );
        const heroPhoto = sortedPhotos[0];
        const hoverPhoto = sortedPhotos[1];
        const hourlyRate = listing.hourly_rate;
        const hourlyEquivalent = Math.min(
          listing.hourly_rate,
          Math.round(listing.half_day_rate / 4),
          Math.round(listing.full_day_rate / 8)
        );

        return (
          <Link key={listing.id} href={`/listings/${listing.id}`} className="group">
            <Card className="h-full overflow-hidden transition-shadow group-hover:shadow-elevated">
              <div className="bh-plate m-3 mb-0 aspect-[4/3]">
                <div className="relative h-full w-full overflow-hidden rounded-[calc(var(--radius)-2px)] bg-muted">
                  {heroPhoto?.url ? (
                    <>
                      <Image
                        src={heroPhoto.url}
                        alt={listing.title}
                        fill
                        sizes="(max-width: 768px) 100vw, 33vw"
                        className="object-cover transition-opacity duration-300 group-hover:opacity-0 motion-reduce:transition-none"
                      />
                      {hoverPhoto?.url && (
                        <Image
                          src={hoverPhoto.url}
                          alt=""
                          fill
                          sizes="(max-width: 768px) 100vw, 33vw"
                          className="object-cover opacity-0 transition-opacity duration-300 group-hover:opacity-100 motion-reduce:opacity-0"
                          aria-hidden
                        />
                      )}
                    </>
                  ) : (
                    <div className="absolute inset-0 bg-muted" aria-hidden />
                  )}
                </div>
              </div>
              <div className="flex gap-2 px-4 pt-3">
                <Badge variant="secondary">Day use</Badge>
                {listing.host_present && (
                  <Badge variant="outline">Host present</Badge>
                )}
              </div>
              <CardContent className="p-4 pt-2">
                <h3 className="mb-1 font-display text-lg font-bold lowercase tracking-tight line-clamp-1">
                  {listing.title}
                </h3>
                <p className="bh-caption mb-3 line-clamp-1">
                  {(listing.location_text || "").toLowerCase()}
                </p>
                <div className="mb-3 flex flex-wrap items-center gap-2">
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
                    <span className="bh-data block text-sm font-semibold text-accent-ink">
                      From {formatCurrency(hourlyRate, listing.currency)}/hr
                    </span>
                    {hourlyEquivalent < hourlyRate && (
                      <span className="bh-data text-xs text-muted-foreground">
                        As low as {formatCurrency(hourlyEquivalent, listing.currency)}/hr
                      </span>
                    )}
                  </div>
                  <span className="bh-data shrink-0 text-xs text-muted-foreground">
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
