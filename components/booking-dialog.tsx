"use client";

import { useState, useMemo, useEffect } from "react";
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
import { formatCurrency, formatTime } from "@/lib/utils";
import { format } from "date-fns";
import { BookingRulesLine } from "@/components/booking-rules-line";
import { StatusBanner } from "@/components/status-banner";
import {
  toMinutes,
  fromMinutes,
  minEndMinutes,
  CUTOFF_MINUTES,
  LATEST_START_MINUTES,
  validate as validateBookingTime,
  normalize,
} from "@/lib/bookingTimeRules";
import { sydneyDayOfWeek, sydneyLocalToUtcIso } from "@/lib/timezone";

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
  const [submitValidationErrors, setSubmitValidationErrors] = useState<string[]>([]);
  const [adjustmentNote, setAdjustmentNote] = useState<string | null>(null);
  const [touched, setTouched] = useState<Record<string, boolean>>({});

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isSubmitted },
  } = useForm<BookingFormData>({
    resolver: zodResolver(bookingSchema),
    mode: "onSubmit",
    reValidateMode: "onBlur",
    defaultValues: {
      startTime: "07:00",
      endTime: "09:00", // Default to 2 hours after start
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

  // Calculate min/max for end time picker
  const endTimeConstraints = useMemo(() => {
    if (!startTime) {
      return { min: "07:00", max: fromMinutes(CUTOFF_MINUTES) };
    }

    try {
      const startMinutes = toMinutes(startTime);
      const minEnd = minEndMinutes(startMinutes);
      const maxEnd = CUTOFF_MINUTES;

      return {
        min: fromMinutes(minEnd),
        max: fromMinutes(maxEnd),
      };
    } catch {
      return { min: "07:00", max: fromMinutes(CUTOFF_MINUTES) };
    }
  }, [startTime]);

  // Auto-adjust end time when start time changes
  useEffect(() => {
    if (!date || !startTime || !endTime) return;

    let noteTimeout: ReturnType<typeof setTimeout> | undefined;

    try {
      const startMinutes = toMinutes(startTime);
      const currentEndMinutes = toMinutes(endTime);
      
      const normalized = normalize({
        startMinutes,
        endMinutes: currentEndMinutes,
      });

      // If adjustment was needed, update end time and show note
      if (normalized.endMinutes !== currentEndMinutes || normalized.startMinutes !== startMinutes) {
        const newEndTime = fromMinutes(normalized.endMinutes);
        setValue("endTime", newEndTime, { shouldValidate: true });
        
        if (normalized.adjustments.length > 0) {
          setAdjustmentNote(normalized.adjustments[0]);
          // Clear note after 5 seconds
          noteTimeout = setTimeout(() => setAdjustmentNote(null), 5000);
        }
      } else {
        setAdjustmentNote(null);
      }
    } catch (err) {
      // Invalid time format, skip adjustment
    }

    return () => {
      if (noteTimeout) clearTimeout(noteTimeout);
    };
  }, [date, startTime, endTime, setValue]);

  // Price calculation based on actual duration (no pre-submit validation banners)
  const priceBreakdown = useMemo(() => {
    if (!date || !startTime || !endTime) {
      return { total: 0, fee: 0, deposit: listing.deposit_amount, basePrice: 0 };
    }

    try {
      const startMinutes = toMinutes(startTime);
      const endMinutes = toMinutes(endTime);
      const durationHours = (endMinutes - startMinutes) / 60;

      // Calculate base price based on duration
      let basePrice = 0;
      if (durationHours >= 8) {
        basePrice = listing.full_day_rate;
      } else if (durationHours >= 4) {
        basePrice = listing.half_day_rate;
      } else {
        basePrice = Math.round(listing.hourly_rate * durationHours);
      }

      const platformFee = Math.round(basePrice * 0.1); // 10% platform fee
      const total = basePrice + platformFee;

      return {
        total,
        fee: platformFee,
        deposit: listing.deposit_amount,
        basePrice,
        durationHours,
      };
    } catch {
      return { total: 0, fee: 0, deposit: listing.deposit_amount, basePrice: 0, durationHours: 0 };
    }
  }, [date, startTime, endTime, listing.hourly_rate, listing.half_day_rate, listing.full_day_rate, listing.deposit_amount]);

  const createBooking = useMutation({
    mutationFn: async (data: BookingFormData) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      if (data.guestsCount > listing.max_guests) {
        throw new Error(`Maximum ${listing.max_guests} guests allowed`);
      }

      const startIso = sydneyLocalToUtcIso(data.date, data.startTime);
      const endIso = sydneyLocalToUtcIso(data.date, data.endTime);
      const now = new Date();

      // Validate using shared validation function
      const startMinutes = toMinutes(data.startTime);
      const endMinutes = toMinutes(data.endTime);
      const validationResult = validateBookingTime({ date: data.date, startMinutes, endMinutes, now });
      
      if (!validationResult.ok) {
        throw new Error(validationResult.errors[0] || "Invalid booking request");
      }

      // Check availability (Sydney weekday)
      const dayOfWeek = sydneyDayOfWeek(data.date);
      const { data: availability } = await supabase
        .from("listing_availability")
        .select("*")
        .eq("listing_id", listing.id)
        .eq("day_of_week", dayOfWeek)
        .single();

      if (!availability) {
        throw new Error("Listing not available on this day");
      }

      // Check that the booking fits inside the host's availability window
      const availStartMinutes = toMinutes(availability.start_time);
      const availEndMinutes = toMinutes(availability.end_time);
      if (startMinutes < availStartMinutes || endMinutes > availEndMinutes) {
        throw new Error(
          `Selected time is outside available hours (${fromMinutes(availStartMinutes)} - ${fromMinutes(availEndMinutes)})`
        );
      }

      // Use API route for booking request (validates server-side)
      const response = await fetch("/api/bookings/request", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          listing_id: listing.id,
          start_time: startIso,
          end_time: endIso,
          guests_count: data.guestsCount,
          guest_ack_toilet_access: data.guest_ack_toilet_access,
          guest_ack_consumables_policy: data.guest_ack_consumables_policy,
          message: null,
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
    setSubmitValidationErrors([]);

    try {
      const startMinutes = toMinutes(data.startTime);
      const endMinutes = toMinutes(data.endTime);
      const validationResult = validateBookingTime({
        date: data.date,
        startMinutes,
        endMinutes,
        now: new Date(),
      });

      if (!validationResult.ok) {
        setSubmitValidationErrors(validationResult.errors);
        return;
      }
    } catch {
      setSubmitValidationErrors(["Check your date and times, then try again."]);
      return;
    }

    createBooking.mutate(data);
  };

  const showFieldError = (field: keyof BookingFormData) =>
    (isSubmitted || touched[field as string]) && errors[field]?.message;

  // Get max start time (19:00)
  const maxStartTime = fromMinutes(LATEST_START_MINUTES);

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Book {listing.title}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          {error && (
            <div className="bh-status-banner bh-status-banner--error text-sm" role="alert">
              {error}
            </div>
          )}

          <StatusBanner variant="info" title="Before you book">
            <BookingRulesLine className="text-foreground/80" />
          </StatusBanner>

          {submitValidationErrors.length > 0 && (
            <div className="bh-status-banner bh-status-banner--error text-sm" role="alert">
              <ul className="list-disc list-inside space-y-1">
                {submitValidationErrors.map((err, idx) => (
                  <li key={idx}>{err}</li>
                ))}
              </ul>
            </div>
          )}

          {adjustmentNote && (
            <StatusBanner variant="warning" title="Time adjusted">
              {adjustmentNote}
            </StatusBanner>
          )}

          <div className="grid grid-cols-3 gap-4">
            <div>
              <Label htmlFor="date">Date</Label>
              <Input
                id="date"
                type="date"
                autoFocus
                min={format(new Date(), "yyyy-MM-dd")}
                {...register("date", {
                  onBlur: () => setTouched((t) => ({ ...t, date: true })),
                })}
              />
              {showFieldError("date") && (
                <p className="bh-form-error" role="alert">{errors.date?.message}</p>
              )}
            </div>
            <div>
              <Label htmlFor="startTime">Start time</Label>
              <Input
                id="startTime"
                type="time"
                min="07:00"
                max={maxStartTime}
                {...register("startTime", {
                  onBlur: () => setTouched((t) => ({ ...t, startTime: true })),
                })}
              />
              {showFieldError("startTime") && (
                <p className="bh-form-error" role="alert">{errors.startTime?.message}</p>
              )}
              <p className="text-xs text-muted-foreground mt-1">
                Latest start: {formatTime(maxStartTime)}
              </p>
            </div>
            <div>
              <Label htmlFor="endTime">End time</Label>
              <Input
                id="endTime"
                type="time"
                min={endTimeConstraints.min}
                max={endTimeConstraints.max}
                {...register("endTime", {
                  onBlur: () => setTouched((t) => ({ ...t, endTime: true })),
                })}
              />
              {showFieldError("endTime") && (
                <p className="bh-form-error" role="alert">{errors.endTime?.message}</p>
              )}
              <p className="text-xs text-muted-foreground mt-1">
                {formatTime(endTimeConstraints.min)} – {formatTime(endTimeConstraints.max)}
              </p>
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
                <span>Base price ({priceBreakdown.durationHours?.toFixed(1) || 0} hours)</span>
                <span>{formatCurrency(priceBreakdown.basePrice, listing.currency)}</span>
              </div>
              <div className="flex justify-between">
                <span>Platform fee (10%)</span>
                <span>{formatCurrency(priceBreakdown.fee, listing.currency)}</span>
              </div>
              {priceBreakdown.deposit > 0 && (
                <div className="flex justify-between">
                  <span>Damage deposit</span>
                  <span>{formatCurrency(priceBreakdown.deposit, listing.currency)}</span>
                </div>
              )}
              <div className="flex justify-between font-semibold pt-2 border-t">
                <span>Total</span>
                <span>{formatCurrency(priceBreakdown.total, listing.currency)}</span>
              </div>
            </div>
          </div>

          {listing.additional_instructions && (
            <StatusBanner variant="info" title="Additional instructions from the host">
              <p className="whitespace-pre-wrap">{listing.additional_instructions}</p>
            </StatusBanner>
          )}

          {/* Toilet Access Acknowledgement */}
          <div className="bh-status-banner bh-status-banner--warning">
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
          <div className="bh-status-banner bh-status-banner--warning">
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
              day-use only (bookings must end by 9:00 PM, no overnight) and I will return the space as I found it.
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
