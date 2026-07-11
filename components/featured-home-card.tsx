"use client";

import Link from "next/link";
import Image from "next/image";
import { Listing } from "@/lib/types";
import { formatCurrency } from "@/lib/utils";
import { cn } from "@/lib/utils";

type FeaturedHome = Pick<
  Listing,
  "id" | "title" | "location_text" | "hourly_rate" | "currency"
> & {
  photos?: { url?: string; sort_order: number }[];
  caption?: string;
};

/** Hover swaps primary photo → secondary (empty room → room in use). */
export function FeaturedHomeCard({
  listing,
  className,
}: {
  listing: FeaturedHome;
  className?: string;
}) {
  const photos = [...(listing.photos || [])].sort(
    (a, b) => a.sort_order - b.sort_order
  );
  const primary = photos[0];
  const secondary = photos[1] || photos[0];
  const caption =
    listing.caption ||
    `${(listing.location_text || "nearby").split(",")[0]?.trim().toLowerCase()} · day use`;

  return (
    <Link
      href={`/listings/${listing.id}`}
      className={cn("group block", className)}
    >
      <div className="bh-plate relative aspect-[4/3] overflow-hidden">
        {primary?.url ? (
          <>
            <Image
              src={primary.url}
              alt={listing.title}
              fill
              sizes="(max-width: 768px) 100vw, 33vw"
              className="object-cover transition-opacity duration-300 group-hover:opacity-0 motion-reduce:transition-none"
            />
            {secondary?.url && (
              <Image
                src={secondary.url}
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
      <p className="bh-caption mt-3">{caption}</p>
      <h3 className="mt-1 font-display text-lg font-bold lowercase tracking-tight line-clamp-1">
        {listing.title}
      </h3>
      <p className="bh-data mt-1 text-sm text-accent-ink">
        from {formatCurrency(listing.hourly_rate, listing.currency)}
        <span className="text-muted-foreground">/hr</span>
      </p>
    </Link>
  );
}
