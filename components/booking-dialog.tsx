"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useMutation } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { Listing } from "@/lib/types";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { formatCurrency } from "@/lib/utils";
import { addHours, differenceInHours, parse, format } from "date-fns";
import { DayUseWarning } from "@/components/day-use-warning";

const bookingSchema = z.object({
  date: z.string().min(1, "Date is required"),
  startTime: z.string().min(1, "Start time is required"),
  endTime: z.string().min(1, "End time is required"),
  guestsCount: z.number().min(1).max(100),
  acceptedRules: z.boolean().refine((val) => val === true, {
    message: "You must accept the house rules",
  }),
  guest_ack_toilet_access: z.boolean().refine((val) => val === true, {
    message: "You must acknowledge the toilet access policy",
  }),
  guest_ack_consumables_policy: z.boolean().refine((val) => val === true, {
    message: "You must acknowledge the consumables policy",
  }),
});

type BookingFormData = z.infer<typeof bookingSchema>;

export function BookingDialog({
  listing,
  onClose,
}: {
  listing: Listing;
  onClose: () => void;
}) {
  const router = useRouter();
  const supabase = createClient();
  const [error, setError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<BookingFormData>({
    resolver: zodResolver(bookingSchema),
    defaultValues: {
      startTime: "07:00",
      endTime: "18:00",
      guestsCount: 1,
      acceptedRules: false,
      guest_ack_toilet_access: false,
      guest_ack_consumables_policy: false,
    },
  });

  const date = watch("date");
  const startTime = watch("startTime");
  const endTime = watch("endTime");
  const guestsCount = watch("guestsCount");

  const priceBreakdown = useMemo(() => {
    if (!date || !startTime || !endTime) {
      return { total: 0, fee: 0, deposit: listing.deposit_amount, basePrice: 0 };
    }

    const start = parse(`${date} ${startTime}`, "yyyy-MM-dd HH:mm", new Date());
    const end = parse(`${date} ${endTime}`, "yyyy-MM-dd HH:mm", new Date());
    const hours = differenceInHours(end, start);

    if (hours <= 0) {
      return { total: 0, fee: 0, deposit: listing.deposit_amount, basePrice: 0 };
    }

    let basePrice = 0;
    if (hours >= 8) {
      basePrice = listing.full_day_rate;
    } else if (hours >= 4) {
      basePrice = listing.half_day_rate;
    } else {
      basePrice = listing.hourly_rate * hours;
    }

    const platformFee = Math.round(basePrice * 0.1); // 10% platform fee
    const total = basePrice + platformFee;

    return {
      total,
      fee: platformFee,
      deposit: listing.deposit_amount,
      basePrice,
    };
  }, [date, startTime, endTime, listing.hourly_rate, listing.half_day_rate, listing.full_day_rate, listing.deposit_amount]);

  const createBooking = useMutation({
    mutationFn: async (data: BookingFormData) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      if (data.guestsCount > listing.max_guests) {
        throw new Error(`Maximum ${listing.max_guests} guests allowed`);
      }

      const start = parse(`${data.date} ${data.startTime}`, "yyyy-MM-dd HH:mm", new Date());
      const end = parse(`${data.date} ${data.endTime}`, "yyyy-MM-dd HH:mm", new Date());
      const now = new Date();

      // Validate minimum lead time (4 hours)
      const hoursUntilStart = (start.getTime() - now.getTime()) / (1000 * 60 * 60);
      if (hoursUntilStart < 4) {
        throw new Error("Bookings must be requested at least 4 hours before the start time.");
      }

      // Check minimum 2 hours
      const hours = differenceInHours(end, start);
      if (hours < 2) {
        throw new Error("Minimum booking duration is 2 hours");
      }

      // Check maximum 11 hours
      if (hours > 11) {
        throw new Error("Maximum booking duration is 11 hours");
      }

      // Check start time is at or after 7am
      if (start.getHours() < 7) {
        throw new Error("Earliest start time is 7:00 AM");
      }

      // Check end time is at or before 9pm
      if (end.getHours() > 21) {
        throw new Error("Latest end time is 9:00 PM (day use only, no overnight)");
      }

      // Check availability
      const dayOfWeek = start.getDay();
      const { data: availability } = await supabase
        .from("listing_availability")
        .select("*")
        .eq("listing_id", listing.id)
        .eq("day_of_week", dayOfWeek)
        .single();

      if (!availability) {
        throw new Error("Listing not available on this day");
      }

      const availStart = parse(availability.start_time, "HH:mm:ss", new Date());
      const availEnd = parse(availability.end_time, "HH:mm:ss", new Date());
      const bookingStart = parse(data.startTime, "HH:mm", new Date());
      const bookingEnd = parse(data.endTime, "HH:mm", new Date());

      if (
        bookingStart < availStart ||
        bookingEnd > availEnd ||
        bookingStart >= bookingEnd
      ) {
        throw new Error("Selected time is outside available hours");
      }

      // Use new API route for booking request (validates lead time and availability server-side)
      const response = await fetch("/api/bookings/request", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          listing_id: listing.id,
          start_time: start.toISOString(),
          end_time: end.toISOString(),
          guests_count: data.guestsCount,
          message: null, // Optional message can be added later
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || errorData.error || "Failed to create booking request");
      }

      const result = await response.json();
      return result.booking;
    },
    onSuccess: (booking) => {
      router.push(`/bookings/${booking.id}/confirm`);
    },
    onError: (err: any) => {
      setError(err.message || "Failed to create booking");
    },
  });

  const onSubmit = (data: BookingFormData) => {
    setError(null);
    createBooking.mutate(data);
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Book {listing.title}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          {error && (
            <div className="p-3 text-sm text-destructive bg-destructive/10 rounded-md">
              {error}
            </div>
          )}

          <DayUseWarning compact />

          <div className="grid grid-cols-3 gap-4">
            <div>
              <Label htmlFor="date">Date</Label>
              <Input
                id="date"
                type="date"
                min={new Date().toISOString().split("T")[0]}
                {...register("date")}
              />
              {errors.date && (
                <p className="text-sm text-destructive mt-1">
                  {errors.date.message}
                </p>
              )}
            </div>
            <div>
              <Label htmlFor="startTime">Start Time</Label>
              <Input
                id="startTime"
                type="time"
                min="07:00"
                max="21:00"
                {...register("startTime")}
              />
              {errors.startTime && (
                <p className="text-sm text-destructive mt-1">
                  {errors.startTime.message}
                </p>
              )}
            </div>
            <div>
              <Label htmlFor="endTime">End Time</Label>
              <Input
                id="endTime"
                type="time"
                min="07:00"
                max="21:00"
                {...register("endTime")}
              />
              {errors.endTime && (
                <p className="text-sm text-destructive mt-1">
                  {errors.endTime.message}
                </p>
              )}
            </div>
          </div>

          <div>
            <Label htmlFor="guestsCount">Number of Guests</Label>
            <Input
              id="guestsCount"
              type="number"
              min={1}
              max={listing.max_guests}
              {...register("guestsCount", { valueAsNumber: true })}
            />
            {errors.guestsCount && (
              <p className="text-sm text-destructive mt-1">
                {errors.guestsCount.message}
              </p>
            )}
            <p className="text-sm text-muted-foreground mt-1">
              Maximum {listing.max_guests} guests
            </p>
          </div>

          <div className="border-t pt-4">
            <h3 className="font-semibold mb-3">Price Breakdown</h3>
            <div className="space-y-2">
              <div className="flex justify-between">
                <span>Base price</span>
                <span>{formatCurrency(priceBreakdown.basePrice)}</span>
              </div>
              <div className="flex justify-between">
                <span>Platform fee (10%)</span>
                <span>{formatCurrency(priceBreakdown.fee)}</span>
              </div>
              {priceBreakdown.deposit > 0 && (
                <div className="flex justify-between">
                  <span>Damage deposit</span>
                  <span>{formatCurrency(priceBreakdown.deposit)}</span>
                </div>
              )}
              <div className="flex justify-between font-semibold pt-2 border-t">
                <span>Total</span>
                <span>{formatCurrency(priceBreakdown.total)}</span>
              </div>
            </div>
          </div>

          {listing.additional_instructions && (
            <div className="border-l-4 border-blue-200 bg-blue-50 p-4 rounded">
              <h4 className="font-semibold mb-2 text-sm">Additional Instructions from the Host</h4>
              <p className="text-sm whitespace-pre-wrap">{listing.additional_instructions}</p>
            </div>
          )}

          {/* Toilet Access Acknowledgement */}
          <div className="border-l-4 border-amber-200 bg-amber-50 p-4 rounded">
            <div className="flex items-start gap-2 mb-2">
              <Checkbox
                id="guest_ack_toilet_access"
                checked={watch("guest_ack_toilet_access")}
                onChange={(e) =>
                  setValue("guest_ack_toilet_access", e.target.checked)
                }
              />
              <Label htmlFor="guest_ack_toilet_access" className="cursor-pointer text-sm">
                I understand the toilet access for this space is:{" "}
                <span className="font-semibold">
                  {listing.toilet_access === "shared" && "Shared bathroom"}
                  {listing.toilet_access === "private" && "Private bathroom"}
                  {listing.toilet_access === "limited" && "Limited access"}
                  {listing.toilet_access === "none" && "No toilet access"}
                </span>
                {listing.toilet_access_notes && (
                  <span className="block mt-1 text-xs text-muted-foreground">
                    ({listing.toilet_access_notes})
                  </span>
                )}
              </Label>
            </div>
            {errors.guest_ack_toilet_access && (
              <p className="text-sm text-destructive mt-1">
                {errors.guest_ack_toilet_access.message}
              </p>
            )}
          </div>

          {/* Consumables Policy Acknowledgement */}
          <div className="border-l-4 border-amber-200 bg-amber-50 p-4 rounded">
            <div className="flex items-start gap-2 mb-2">
              <Checkbox
                id="guest_ack_consumables_policy"
                checked={watch("guest_ack_consumables_policy")}
                onChange={(e) =>
                  setValue("guest_ack_consumables_policy", e.target.checked)
                }
              />
              <Label htmlFor="guest_ack_consumables_policy" className="cursor-pointer text-sm">
                I understand personal consumables/perishables (groceries, ingredients, toilet paper, hygiene items) are not included unless stated, and I will bring what I need.
              </Label>
            </div>
            {errors.guest_ack_consumables_policy && (
              <p className="text-sm text-destructive mt-1">
                {errors.guest_ack_consumables_policy.message}
              </p>
            )}
            <div className="mt-2 text-xs text-muted-foreground">
              <p className="font-semibold mb-1">Supplies provided:</p>
              <ul className="list-disc list-inside space-y-0.5">
                <li>Toilet paper: {listing.provides_toilet_paper ? "Yes" : "No (bring your own)"}</li>
                <li>Pantry staples: {listing.provides_pantry_staples ? "Yes" : "No"}</li>
                <li>Groceries/ingredients: {listing.provides_groceries ? "Yes" : "No"}</li>
              </ul>
            </div>
          </div>

          <div className="flex items-start gap-2">
            <Checkbox
              id="acceptedRules"
              checked={watch("acceptedRules")}
              onChange={(e) =>
                setValue("acceptedRules", e.target.checked)
              }
            />
            <Label htmlFor="acceptedRules" className="cursor-pointer">
              I agree to the house rules and day-use terms. I understand this is
              day-use only (7am–6pm, no overnight) and I will return the space as I found it.
            </Label>
          </div>
          {errors.acceptedRules && (
            <p className="text-sm text-destructive">
              {errors.acceptedRules.message}
            </p>
          )}

          <div className="flex gap-4">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              className="flex-1"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={createBooking.isPending}
              className="flex-1"
            >
              {createBooking.isPending ? "Sending Request..." : "Request Booking"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
