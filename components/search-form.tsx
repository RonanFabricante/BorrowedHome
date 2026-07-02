"use client";

import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { isToday, format } from "date-fns";
import { PlaceAutocomplete, NormalizedPlace } from "@/components/place-autocomplete";
import { BookingRulesLine } from "@/components/booking-rules-line";
import { DayArc } from "@/components/day-arc";
import { formatTime } from "@/lib/utils";
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
  location: z.string().min(1, "Enter a suburb or city to search."),
  date: z.string().min(1, "Choose a date for your day-use booking."),
  startTime: z.string().min(1, "Choose a start time."),
  endTime: z.string().min(1, "Choose an end time."),
});

type SearchFormData = z.infer<typeof searchSchema>;

export function SearchForm() {
  const router = useRouter();
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [selectedPlace, setSelectedPlace] = useState<NormalizedPlace | null>(null);
  const [touched, setTouched] = useState<Record<string, boolean>>({});

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors, isSubmitted },
  } = useForm<SearchFormData>({
    resolver: zodResolver(searchSchema),
    mode: "onSubmit",
    reValidateMode: "onBlur",
    defaultValues: {
      startTime: "07:00",
      endTime: "09:00",
    },
  });

  const date = watch("date");
  const startTime = watch("startTime");
  const endTime = watch("endTime");

  const endTimeConstraints = useMemo(() => {
    if (!startTime) {
      return { min: "07:00", max: fromMinutes(CUTOFF_MINUTES) };
    }
    try {
      const startMinutes = toMinutes(startTime);
      return {
        min: fromMinutes(minEndMinutes(startMinutes)),
        max: fromMinutes(CUTOFF_MINUTES),
      };
    } catch {
      return { min: "07:00", max: fromMinutes(CUTOFF_MINUTES) };
    }
  }, [startTime]);

  const maxStartTime = fromMinutes(LATEST_START_MINUTES);
  const selectedDate = date ? new Date(date) : null;
  const isSameDay = selectedDate && isToday(selectedDate);

  const showFieldError = (field: keyof SearchFormData) =>
    (isSubmitted || touched[field]) && errors[field]?.message;

  const onSubmit = (data: SearchFormData) => {
    setSubmitError(null);

    if (data.location.trim().length < 2) {
      setSubmitError("Enter a suburb or city with at least 2 characters.");
      return;
    }

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
        setSubmitError(
          validationResult.errors[0] ||
            "Adjust your times so the booking fits within day-use hours."
        );
        return;
      }
    } catch {
      setSubmitError("Check your date and times, then try again.");
      return;
    }

    const params = new URLSearchParams({
      location: data.location.trim(),
      date: data.date,
      startTime: data.startTime,
      endTime: data.endTime,
      tz: TIMEZONE,
    });

    if (selectedPlace) {
      params.set("lat", selectedPlace.lat.toString());
      params.set("lng", selectedPlace.lng.toString());
      if (selectedPlace.placeType) params.set("placeType", selectedPlace.placeType);
      if (selectedPlace.country) params.set("country", selectedPlace.country);
      if (selectedPlace.region) params.set("region", selectedPlace.region);
    }

    router.push(`/listings?${params.toString()}`);
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
      <DayArc className="mb-1" />

      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <div className="w-full space-y-1.5 md:col-span-1">
          <Label htmlFor="location">Suburb or city</Label>
          <PlaceAutocomplete
            id="location"
            data-testid="location-input"
            value={watch("location") || ""}
            autoFocus
            onChangeValue={(value) => {
              setValue("location", value);
              setSubmitError(null);
            }}
            onSelectPlace={(place) => {
              setSelectedPlace(place);
              if (place) {
                setValue("location", place.label, { shouldValidate: true });
              }
            }}
            onBlur={() => setTouched((t) => ({ ...t, location: true }))}
            placeholder="e.g. Surry Hills"
            country="au"
            className="w-full"
          />
          {showFieldError("location") && (
            <p className="bh-form-error" role="alert">{errors.location?.message}</p>
          )}
        </div>

        <div className="w-full space-y-1.5">
          <Label htmlFor="date">Date</Label>
          <Input
            id="date"
            data-testid="date-input"
            type="date"
            min={format(new Date(), "yyyy-MM-dd")}
            {...register("date", {
              onBlur: () => setTouched((t) => ({ ...t, date: true })),
            })}
          />
          {showFieldError("date") && (
            <p className="bh-form-error" role="alert">{errors.date?.message}</p>
          )}
        </div>

        <div className="w-full space-y-1.5">
          <Label htmlFor="startTime">Start time</Label>
          <Input
            id="startTime"
            data-testid="start-time-input"
            type="time"
            min="07:00"
            max={maxStartTime}
            {...register("startTime", {
              onBlur: () => setTouched((t) => ({ ...t, startTime: true })),
            })}
          />
          <p className="text-xs text-muted-foreground">
            Latest start: {formatTime(maxStartTime)}
          </p>
          {showFieldError("startTime") && (
            <p className="bh-form-error" role="alert">{errors.startTime?.message}</p>
          )}
        </div>

        <div className="w-full space-y-1.5">
          <Label htmlFor="endTime">End time</Label>
          <Input
            id="endTime"
            data-testid="end-time-input"
            type="time"
            min={endTimeConstraints.min}
            max={endTimeConstraints.max}
            {...register("endTime", {
              onBlur: () => setTouched((t) => ({ ...t, endTime: true })),
            })}
          />
          <p className="text-xs text-muted-foreground">
            {formatTime(endTimeConstraints.min)} – {formatTime(endTimeConstraints.max)}
          </p>
          {showFieldError("endTime") && (
            <p className="bh-form-error" role="alert">{errors.endTime?.message}</p>
          )}
        </div>
      </div>

      {isSameDay && (
        <p data-testid="helper-same-day" className="text-xs text-muted-foreground">
          Same-day bookings need at least 4 hours before your start time.
        </p>
      )}

      {submitError && (
        <div
          data-testid="search-error"
          className="bh-status-banner bh-status-banner--error text-sm"
          role="alert"
        >
          {submitError}
        </div>
      )}

      <BookingRulesLine />

      <Button type="submit" size="lg" className="w-full" data-testid="browse-homes-button">
        Browse homes
      </Button>
    </form>
  );
}
