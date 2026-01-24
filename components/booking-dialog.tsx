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
import { formatCurrency } from "@/lib/utils";
import { parse, format } from "date-fns";
import { DayUseWarning } from "@/components/day-use-warning";
import {
  computeEndTime,
  validateBookingRequest,
  wouldExceedCutoff,
  LATEST_START_HOUR,
  BOOKING_DURATION_MINUTES,
} from "@/lib/bookingRules";
import { validateDayUseBooking, endTimeExceedsCutoff } from "@/lib/timeRules";

const bookingSchema = z.object({
  date: z.string().min(1, "Date is required"),
  startTime: z.string().min(1, "Start time is required"),
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
  const [validationErrors, setValidationErrors] = useState<string[]>([]);

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
      guestsCount: 1,
      acceptedRules: false,
      guest_ack_toilet_access: false,
      guest_ack_consumables_policy: false,
    },
  });

  const date = watch("date");
  const startTime = watch("startTime");
  const guestsCount = watch("guestsCount");

  // Auto-calculate end time from start time (start + 2 hours)
  const endTime = useMemo(() => {
    if (!startTime) return null;
    return computeEndTime(startTime, BOOKING_DURATION_MINUTES);
  }, [startTime]);

  // Update end time in form when start time changes
  useEffect(() => {
    if (startTime && endTime) {
      // End time is computed, not user-editable
    }
  }, [startTime, endTime]);

  // Validate booking in real-time using minutes-from-midnight for reliable time checks
  const validation = useMemo(() => {
    if (!date || !startTime || !endTime) {
      return { valid: false, errors: [] };
    }

    try {
      // First, validate time rules using minutes-from-midnight (more reliable)
      const timeValidation = validateDayUseBooking({ date, startTime, endTime });
      
      // Then, validate full booking request (includes lead time, duration, etc.)
      const startDateTime = parse(`${date} ${startTime}`, "yyyy-MM-dd HH:mm", new Date());
      const endDateTime = parse(`${date} ${endTime}`, "yyyy-MM-dd HH:mm", new Date());
      const now = new Date();

      const bookingValidation = validateBookingRequest({ startDateTime, endDateTime, now });
      
      // Combine errors, prioritizing time validation errors
      const allErrors = [...timeValidation.errors, ...bookingValidation.errors];
      
      return {
        valid: timeValidation.ok && bookingValidation.valid,
        errors: allErrors,
      };
    } catch (err) {
      return { valid: false, errors: ["Invalid date or time format"] };
    }
  }, [date, startTime, endTime]);

  useEffect(() => {
    setValidationErrors(validation.errors);
  }, [validation]);

  // Price calculation (fixed 2-hour duration)
  const priceBreakdown = useMemo(() => {
    if (!date || !startTime || !endTime) {
      return { total: 0, fee: 0, deposit: listing.deposit_amount, basePrice: 0 };
    }

    // Fixed 2-hour duration - use hourly rate * 2
    const basePrice = listing.hourly_rate * 2;
    const platformFee = Math.round(basePrice * 0.1); // 10% platform fee
    const total = basePrice + platformFee;

    return {
      total,
      fee: platformFee,
      deposit: listing.deposit_amount,
      basePrice,
    };
  }, [date, startTime, endTime, listing.hourly_rate, listing.deposit_amount]);

  const createBooking = useMutation({
    mutationFn: async (data: BookingFormData) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      if (data.guestsCount > listing.max_guests) {
        throw new Error(`Maximum ${listing.max_guests} guests allowed`);
      }

      if (!endTime) {
        throw new Error("End time calculation failed");
      }

      const start = parse(`${data.date} ${data.startTime}`, "yyyy-MM-dd HH:mm", new Date());
      const end = parse(`${data.date} ${endTime}`, "yyyy-MM-dd HH:mm", new Date());
      const now = new Date();

      // Validate using shared validation function
      const validationResult = validateBookingRequest({ startDateTime: start, endDateTime: end, now });
      if (!validationResult.valid) {
        throw new Error(validationResult.errors[0] || "Invalid booking request");
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
      const bookingStart = parse(data.startTime, "HH:mm", new Date());

      // Check that booking starts within availability window
      if (bookingStart < availStart) {
        throw new Error("Selected time is outside available hours");
      }

      // Use API route for booking request (validates server-side)
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
    setValidationErrors([]);

    // Final validation check
    if (!endTime) {
      setError("End time calculation failed");
      return;
    }

    if (!validation.valid) {
      setError(validation.errors[0] || "Invalid booking request");
      return;
    }

    createBooking.mutate(data);
  };

  // Get max start time for date picker (19:00)
  const maxStartTime = `${String(LATEST_START_HOUR).padStart(2, '0')}:00`;

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

          {validationErrors.length > 0 && (
            <div className="p-3 text-sm text-destructive bg-destructive/10 rounded-md">
              <ul className="list-disc list-inside space-y-1">
                {validationErrors.map((err, idx) => (
                  <li key={idx}>{err}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Debug info in development */}
          {process.env.NODE_ENV === 'development' && date && startTime && endTime && (
            <div className="p-2 text-xs bg-muted rounded text-muted-foreground">
              <strong>Debug:</strong> Start={startTime}, End={endTime}, 
              End exceeds cutoff: {endTimeExceedsCutoff(endTime) ? 'YES' : 'NO'}
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
                max={maxStartTime}
                {...register("startTime")}
              />
              {errors.startTime && (
                <p className="text-sm text-destructive mt-1">
                  {errors.startTime.message}
                </p>
              )}
              <p className="text-xs text-muted-foreground mt-1">
                Latest: {maxStartTime} (ends at 9:00 PM)
              </p>
            </div>
            <div>
              <Label htmlFor="endTime">End Time</Label>
              <Input
                id="endTime"
                type="time"
                value={endTime || ""}
                disabled
                readOnly
                className="bg-muted cursor-not-allowed"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Automatically set (2 hours)
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
                <span>Base price (2 hours)</span>
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
              disabled={createBooking.isPending || !validation.valid}
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
