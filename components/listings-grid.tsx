"use client";

import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Listing } from "@/lib/types";
import { formatCurrency } from "@/lib/utils";
import { ChefHat, UtensilsCrossed, Home, Trees } from "lucide-react";
import Image from "next/image";

const spaceIcons = {
  KITCHEN: ChefHat,
  DINING: UtensilsCrossed,
  LIVING: Home,
  GARDEN: Trees,
};

export function ListingsGrid({ listings }: { listings: Listing[] }) {
  if (listings.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">No listings found.</p>
      </div>
    );
  }

  return (
    <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
      {listings.map((listing) => {
        const heroPhoto = listing.photos?.sort((a, b) => a.sort_order - b.sort_order)[0];
        const minPrice = Math.min(
          listing.hourly_rate,
          Math.round(listing.half_day_rate / 4),
          Math.round(listing.full_day_rate / 8)
        );

        return (
          <Link key={listing.id} href={`/listings/${listing.id}`}>
            <Card className="overflow-hidden hover:shadow-lg transition-shadow">
              <div className="relative h-48 bg-muted">
                {heroPhoto?.url ? (
                  <Image
                    src={heroPhoto.url}
                    alt={listing.title}
                    fill
                    className="object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                    No photo
                  </div>
                )}
                <div className="absolute top-2 right-2 flex gap-2">
                  <Badge>Day use only</Badge>
                  {listing.host_present && <Badge variant="secondary">Host present</Badge>}
                </div>
              </div>
              <CardContent className="p-4">
                <h3 className="font-semibold text-lg mb-2">{listing.title}</h3>
                <p className="text-sm text-muted-foreground mb-3">
                  {listing.location_text}
                </p>
                <div className="flex items-center gap-2 mb-3 flex-wrap">
                  {listing.spaces?.map((space) => {
                    const Icon = spaceIcons[space];
                    return Icon ? (
                      <Icon key={space} className="h-4 w-4 text-muted-foreground" />
                    ) : null;
                  })}
                </div>
                <div className="flex items-center justify-between">
                  <span className="font-semibold">
                    From {formatCurrency(minPrice)}/hr
                  </span>
                  <span className="text-sm text-muted-foreground">
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
