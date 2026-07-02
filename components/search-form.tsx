"use client";

import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useState, useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { isToday, format } from "date-fns";
import { PlaceAutocomplete, NormalizedPlace } from "@/components/place-autocomplete";
import {
  toMinutes,
  fromMinutes,
  minEndMinutes,
  CUTOFF_MINUTES,
  LATEST_START_MINUTES,
  validate as validateBookingTime,
} from "@/lib/bookingTimeRules";

const TIMEZONE = "Australia/Sydney";

const searchSchema = z.object({
  location: z.string().min(1, "Location is required"),
  date: z.string().min(1, "Date is required"),
  startTime: z.string().min(1, "Start time is required"),
  endTime: z.string().min(1, "End time is required"),
});

type SearchFormData = z.infer<typeof searchSchema>;

export function SearchForm() {
  const router = useRouter();
  const [validationError, setValidationError] = useState<string | null>(null);
  const [selectedPlace, setSelectedPlace] = useState<NormalizedPlace | null>(null);
  
  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<SearchFormData>({
    resolver: zodResolver(searchSchema),
    defaultValues: {
      startTime: "07:00",
      endTime: "09:00", // Default to 2 hours after start
    },
  });

  const location = watch("location");
  const date = watch("date");
  const startTime = watch("startTime");
  const endTime = watch("endTime");

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

  // Validate form using booking time rules
  const validation = useMemo((): { isValid: boolean; error: string | null } => {
    // Location validation
    if (!location || location.trim().length < 2) {
      return { isValid: false, error: "Enter a suburb or city to continue." };
    }

    // Date validation
    if (!date) {
      return { isValid: false, error: "Select a date to continue." };
    }

    // Time validation
    if (!startTime || !endTime) {
      return { isValid: false, error: null }; // Let Zod handle required fields
    }

    try {
      const startMinutes = toMinutes(startTime);
      const endMinutes = toMinutes(endTime);
      const now = new Date();

      const validationResult = validateBookingTime({ date, startMinutes, endMinutes, now });
      
      if (!validationResult.ok) {
        return { isValid: false, error: validationResult.errors[0] || "Invalid booking time" };
      }
    } catch (err) {
      return { isValid: false, error: "Invalid date or time format" };
    }

    return { isValid: true, error: null };
  }, [location, date, startTime, endTime]);

  const isFormValid = validation.isValid && !errors.location && !errors.date && !errors.startTime && !errors.endTime;

  // Update validation error when form values change
  useEffect(() => {
    setValidationError(validation.error);
  }, [validation.error]);

  const onSubmit = (data: SearchFormData) => {
    // Final validation before submit
    if (!validation.isValid) {
      setValidationError(validation.error);
      return;
    }

    const params = new URLSearchParams({
      location: data.location.trim(),
      date: data.date,
      startTime: data.startTime,
      endTime: data.endTime,
      tz: TIMEZONE,
    });

    // Add lat/lng if place was selected
    if (selectedPlace) {
      params.set("lat", selectedPlace.lat.toString());
      params.set("lng", selectedPlace.lng.toString());
      if (selectedPlace.placeType) {
        params.set("placeType", selectedPlace.placeType);
      }
      if (selectedPlace.country) {
        params.set("country", selectedPlace.country);
      }
      if (selectedPlace.region) {
        params.set("region", selectedPlace.region);
      }
    }

    router.push(`/listings?${params.toString()}`);
  };

  const selectedDate = date ? new Date(date) : null;
  const isSameDay = selectedDate && isToday(selectedDate);

  // Get max start time (19:00)
  const maxStartTime = fromMinutes(LATEST_START_MINUTES);

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-3 sm:space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <div className="w-full space-y-1.5">
          <Label htmlFor="location" className="text-sm font-medium">Suburb or City</Label>
          <PlaceAutocomplete
            id="location"
            data-testid="location-input"
            value={location || ""}
            onChangeValue={(value) => {
              setValue("location", value, { shouldValidate: true });
            }}
            onSelectPlace={(place) => {
              setSelectedPlace(place);
              if (place) {
                setValue("location", place.label, { shouldValidate: true });
              }
            }}
            placeholder="Suburb or City"
            country="au"
            className="w-full"
          />
        </div>
        <div className="w-full space-y-1.5">
          <Label htmlFor="date" className="text-sm font-medium">Date</Label>
          <Input
            id="date"
            data-testid="date-input"
            type="date"
            className="w-full"
            min={format(new Date(), "yyyy-MM-dd")}
            {...register("date")}
          />
        </div>
        <div className="w-full space-y-1.5">
          <Label htmlFor="startTime" className="text-sm font-medium">Start Time</Label>
          <Input
            id="startTime"
            data-testid="start-time-input"
            type="time"
            className="w-full"
            min="07:00"
            max={maxStartTime}
            {...register("startTime")}
          />
          <p className="text-xs text-muted-foreground mt-0.5">
            Latest: {maxStartTime}
          </p>
        </div>
        <div className="w-full space-y-1.5">
          <Label htmlFor="endTime" className="text-sm font-medium">End Time</Label>
          <Input
            id="endTime"
            data-testid="end-time-input"
            type="time"
            className="w-full"
            min={endTimeConstraints.min}
            max={endTimeConstraints.max}
            {...register("endTime")}
          />
          <p className="text-xs text-muted-foreground mt-0.5">
            Min: {endTimeConstraints.min}, Max: {endTimeConstraints.max}
          </p>
        </div>
      </div>

      {/* Same-day helper text */}
      {isSameDay && (
        <p data-testid="helper-same-day" className="text-xs text-muted-foreground mt-1.5">
          Same-day bookings must be requested at least 4 hours before the start time.
        </p>
      )}

      {/* Consolidated error display */}
      {(validationError || Object.keys(errors).length > 0) && (
        <div data-testid="search-error" className="p-3 text-sm text-destructive bg-destructive/10 rounded-md mt-1.5">
          {validationError || 
           errors.location?.message || 
           errors.date?.message || 
           errors.startTime?.message ||
           errors.endTime?.message}
        </div>
      )}

      <div className="text-xs text-muted-foreground mt-1.5">
        Day use only · Bookings must end by 9:00 PM · Minimum 2 hours · No overnight stays
      </div>

      <Button 
        type="submit" 
        size="lg" 
        className="w-full mt-3"
        data-testid="browse-homes-button"
        disabled={!isFormValid}
        style={!isFormValid ? { opacity: 0.5, cursor: "not-allowed" } : {}}
      >
        Browse Homes
      </Button>
    </form>
  );
}
