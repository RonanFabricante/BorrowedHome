"use client";

import { useState } from "react";
import { Listing } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatCurrency, formatTime } from "@/lib/utils";
import { ChefHat, UtensilsCrossed, Home, Trees, Check } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { BookingDialog } from "@/components/booking-dialog";

const spaceIcons = {
  KITCHEN: ChefHat,
  DINING: UtensilsCrossed,
  LIVING: Home,
  GARDEN: Trees,
};

const spaceLabels = {
  KITCHEN: "Kitchen",
  DINING: "Dining Room",
  LIVING: "Living Room",
  GARDEN: "Garden/Pool",
};

export function ListingDetail({
  listing,
  userId,
  hasActiveBookings = false,
}: {
  listing: Listing;
  userId?: string;
  hasActiveBookings?: boolean;
}) {
  const [selectedPhotoIndex, setSelectedPhotoIndex] = useState(0);
  const [showBookingDialog, setShowBookingDialog] = useState(false);

  const photos = listing.photos?.sort((a, b) => a.sort_order - b.sort_order) || [];
  const currentPhoto = photos[selectedPhotoIndex];
  const isHost = userId === listing.host_id;

  const rules = [
    listing.cooking_allowed && "Cooking allowed",
    listing.alcohol_allowed && "Alcohol allowed",
    `Noise tolerance: ${listing.noise_tolerance}`,
    listing.host_present && "Host will be present",
    listing.cleaning_expectations && `Cleaning: ${listing.cleaning_expectations}`,
  ].filter(Boolean);

  return (
    <div className="max-w-6xl mx-auto">
      <div className="mb-6">
        <div className="flex items-center justify-between mb-2">
          <div className="flex gap-2">
            <Badge>Day use only</Badge>
            {listing.host_present && <Badge variant="secondary">Host present</Badge>}
            {!listing.published && isHost && <Badge variant="outline">Draft</Badge>}
          </div>
          {isHost && (
            hasActiveBookings ? (
              <Button 
                variant="outline" 
                disabled
                title="Cannot edit listing with active or confirmed bookings"
              >
                Edit Listing (Disabled)
              </Button>
            ) : (
              <Button variant="outline" asChild>
                <Link href={`/listings/${listing.id}/edit`}>Edit Listing</Link>
              </Button>
            )
          )}
        </div>
        <h1 className="text-4xl font-bold mb-2">{listing.title}</h1>
        <p className="text-muted-foreground">{listing.location_text}</p>
      </div>

      {/* Photos */}
      {photos.length > 0 && (
        <div className="mb-8">
          <div className="relative h-96 bg-muted rounded-lg overflow-hidden mb-4">
            {currentPhoto?.url ? (
              <Image
                src={currentPhoto.url}
                alt={listing.title}
                fill
                className="object-cover"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                No photo
              </div>
            )}
          </div>
          {photos.length > 1 && (
            <div className="grid grid-cols-4 gap-2">
              {photos.slice(0, 4).map((photo, index) => (
                <button
                  key={photo.id}
                  onClick={() => setSelectedPhotoIndex(index)}
                  className={`relative h-24 bg-muted rounded overflow-hidden ${
                    selectedPhotoIndex === index ? "ring-2 ring-primary" : ""
                  }`}
                >
                  {photo.url ? (
                    <Image
                      src={photo.url}
                      alt={`${listing.title} ${index + 1}`}
                      fill
                      className="object-cover"
                    />
                  ) : null}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="grid md:grid-cols-3 gap-8">
        <div className="md:col-span-2 space-y-6">
          {/* Description */}
          {listing.description && (
            <Card>
              <CardHeader>
                <CardTitle>About this space</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="whitespace-pre-line">{listing.description}</p>
              </CardContent>
            </Card>
          )}

          {/* Spaces */}
          <Card>
            <CardHeader>
              <CardTitle>Spaces included</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4">
                {listing.spaces?.map((space) => {
                  const Icon = spaceIcons[space];
                  return (
                    <div key={space} className="flex items-center gap-3">
                      {Icon && <Icon className="h-5 w-5" />}
                      <span>{spaceLabels[space]}</span>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {/* House Rules */}
          <Card>
            <CardHeader>
              <CardTitle>House Rules</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2">
                {rules.map((rule, index) => (
                  <li key={index} className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-primary" />
                    <span>{rule}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>

          {/* Additional Instructions */}
          {listing.additional_instructions && (
            <Card>
              <CardHeader>
                <CardTitle>Additional Instructions from the Host</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="whitespace-pre-wrap text-sm">{listing.additional_instructions}</p>
              </CardContent>
            </Card>
          )}

          {/* Toilet & Supplies */}
          <Card>
            <CardHeader>
              <CardTitle>Toilet & Supplies</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <p className="text-sm font-semibold mb-2">Toilet Access</p>
                <div className="flex items-center gap-2">
                  <Badge variant={
                    listing.toilet_access === "none" ? "destructive" :
                    listing.toilet_access === "limited" ? "outline" :
                    "default"
                  }>
                    {listing.toilet_access === "shared" && "Shared bathroom"}
                    {listing.toilet_access === "private" && "Private bathroom"}
                    {listing.toilet_access === "limited" && "Limited access"}
                    {listing.toilet_access === "none" && "No toilet access"}
                  </Badge>
                  {listing.toilet_access === "none" && (
                    <Badge variant="destructive">Important: Bring your own facilities</Badge>
                  )}
                </div>
                {listing.toilet_access_notes && (
                  <p className="text-sm text-muted-foreground mt-2 whitespace-pre-wrap">
                    {listing.toilet_access_notes}
                  </p>
                )}
              </div>

              <div className="border-t pt-4">
                <p className="text-sm font-semibold mb-3">Supplies Provided</p>
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    {listing.provides_toilet_paper ? (
                      <Badge variant="default">Toilet paper: Provided</Badge>
                    ) : (
                      <Badge variant="outline" className="border-amber-300 text-amber-700">
                        Toilet paper: Bring your own
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {listing.provides_pantry_staples ? (
                      <Badge variant="default">Pantry staples: Provided</Badge>
                    ) : (
                      <Badge variant="outline">Pantry staples: Not provided</Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {listing.provides_groceries ? (
                      <Badge variant="default">Groceries: Provided</Badge>
                    ) : (
                      <Badge variant="outline">Groceries: Not provided</Badge>
                    )}
                  </div>
                </div>
              </div>

              <div className="border-t pt-4">
                <p className="text-sm font-semibold mb-2">Consumables Policy</p>
                <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                  {listing.consumables_policy}
                </p>
                <p className="text-sm font-medium mt-2 text-amber-700">
                  Bring what you need; only listed inclusions are provided.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>

        <div>
          <Card className="sticky top-4">
            <CardHeader>
              <CardTitle>Pricing</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <div className="flex justify-between mb-1">
                  <span>Hourly</span>
                  <span className="font-semibold">
                    {formatCurrency(listing.hourly_rate)}
                  </span>
                </div>
                <div className="flex justify-between mb-1">
                  <span>Half-day (4 hours)</span>
                  <span className="font-semibold">
                    {formatCurrency(listing.half_day_rate)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Full-day (8 hours)</span>
                  <span className="font-semibold">
                    {formatCurrency(listing.full_day_rate)}
                  </span>
                </div>
              </div>
              {listing.deposit_amount > 0 && (
                <div className="pt-4 border-t">
                  <div className="flex justify-between">
                    <span>Damage deposit</span>
                    <span className="font-semibold">
                      {formatCurrency(listing.deposit_amount)}
                    </span>
                  </div>
                </div>
              )}
              <div className="pt-4 border-t">
                <p className="text-sm text-muted-foreground mb-4">
                  Max {listing.max_guests} guests
                </p>
                {userId ? (
                  <Button
                    className="w-full"
                    onClick={() => setShowBookingDialog(true)}
                  >
                    Select Time
                  </Button>
                ) : (
                  <Button className="w-full" asChild>
                    <a href="/auth/login">Log in to book</a>
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {showBookingDialog && (
        <BookingDialog
          listing={listing}
          onClose={() => setShowBookingDialog(false)}
        />
      )}
    </div>
  );
}
