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

const bookingSchema = z.object({
  date: z.string().min(1, "Date is required"),
  startTime: z.string().min(1, "Start time is required"),
  endTime: z.string().min(1, "End time is required"),
  guestsCount: z.number().min(1).max(100),
  acceptedRules: z.boolean().refine((val) => val === true, {
    message: "You must accept the house rules",
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
      guestsCount: 1,
      acceptedRules: false,
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

      // Check minimum 2 hours
      const hours = differenceInHours(end, start);
      if (hours < 2) {
        throw new Error("Minimum booking duration is 2 hours");
      }

      // Check end time is before 9pm
      if (end.getHours() >= 21) {
        throw new Error("Bookings must end before 9pm (day use only)");
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

      // Check for overlaps (only against CONFIRMED bookings - PENDING doesn't block inventory)
      const { data: overlapping } = await supabase
        .rpc("check_booking_overlap", {
          p_listing_id: listing.id,
          p_start_at: start.toISOString(),
          p_end_at: end.toISOString(),
          p_booking_id: null,
        });

      if (overlapping) {
        throw new Error("This time slot is already booked");
      }

      // Create booking with PENDING status (requires host approval)
      const { data: booking, error } = await supabase
        .from("bookings")
        .insert({
          listing_id: listing.id,
          guest_id: user.id,
          start_at: start.toISOString(),
          end_at: end.toISOString(),
          status: "PENDING",
          accepted_rules_at: new Date().toISOString(),
          guests_count: data.guestsCount,
          total_amount: priceBreakdown.total,
          platform_fee_amount: priceBreakdown.fee,
          deposit_amount: priceBreakdown.deposit,
        })
        .select()
        .single();

      if (error) throw error;

      return booking;
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
              day-use only (no overnight) and I will return the space as I found it.
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
