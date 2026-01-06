"use client";

import Link from "next/link";
import { Listing } from "@/lib/types";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/utils";

export function MyListingsList({ listings }: { listings: any[] }) {
  if (listings.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground mb-4">
          You don&apos;t have any listings yet.
        </p>
        <Button asChild>
          <Link href="/host/onboard">Create Your First Listing</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {listings.map((listing) => (
        <Card key={listing.id}>
          <CardContent className="p-6">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-2">
                  <h3 className="text-xl font-semibold">{listing.title}</h3>
                  {listing.published ? (
                    <Badge>Published</Badge>
                  ) : (
                    <Badge variant="outline">Draft</Badge>
                  )}
                </div>
                <p className="text-muted-foreground mb-2">
                  {listing.location_text}
                </p>
                <p className="text-sm mb-1">
                  <span className="font-semibold">Spaces:</span>{" "}
                  {listing.listing_spaces
                    ?.map((s: any) => s.space_type)
                    .join(", ")}
                </p>
                <p className="text-sm mb-1">
                  <span className="font-semibold">Max guests:</span>{" "}
                  {listing.max_guests}
                </p>
                <p className="font-semibold">
                  From {formatCurrency(listing.hourly_rate)}/hr
                </p>
              </div>
              <div className="flex flex-col gap-2">
                <Button asChild variant="outline" size="sm">
                  <Link href={`/listings/${listing.id}`}>View</Link>
                </Button>
                <Button asChild variant="ghost" size="sm">
                  <Link href={`/listings/${listing.id}/edit`}>Edit</Link>
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
