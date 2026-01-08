"use client";

import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { parse, differenceInHours, differenceInMinutes, isToday } from "date-fns";
import { useMemo } from "react";
import { cn } from "@/lib/utils";

const TIMEZONE = "Australia/Sydney";

const searchSchema = z.object({
  location: z.string().min(1, "Location is required"),
  date: z.string().min(1, "Date is required"),
  startTime: z.string().min(1, "Start time is required"),
  endTime: z.string().min(1, "End time is required"),
});

type SearchFormData = z.infer<typeof searchSchema>;

type PresetType = "morning" | "afternoon" | "fullday" | null;

export function SearchForm() {
  const router = useRouter();
  const [activePreset, setActivePreset] = useState<PresetType>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  
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
      endTime: "18:00",
    },
  });

  const location = watch("location");
  const date = watch("date");
  const startTime = watch("startTime");
  const endTime = watch("endTime");

  // Validate form and compute disabled state using useMemo
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

    const start = parse(startTime, "HH:mm", new Date());
    const end = parse(endTime, "HH:mm", new Date());

    // Business hours validation
    if (start.getHours() < 7) {
      return { isValid: false, error: "Day use hours are 7:00 AM to 6:00 PM." };
    }
    if (end.getHours() > 18 || (end.getHours() === 18 && end.getMinutes() > 0)) {
      return { isValid: false, error: "Day use hours are 7:00 AM to 6:00 PM." };
    }

    // End must be after start
    if (end <= start) {
      return { isValid: false, error: "End time must be after start time." };
    }

    // Duration validation
    const startDateTime = parse(`${date} ${startTime}`, "yyyy-MM-dd HH:mm", new Date());
    const endDateTime = parse(`${date} ${endTime}`, "yyyy-MM-dd HH:mm", new Date());
    const hours = differenceInHours(endDateTime, startDateTime);
    
    if (hours > 11) {
      return { isValid: false, error: "Bookings can be up to 11 hours." };
    }

    // Same-day booking rule
    const selectedDate = parse(date, "yyyy-MM-dd", new Date());
    if (isToday(selectedDate)) {
      const now = new Date();
      const bookingStart = parse(`${date} ${startTime}`, "yyyy-MM-dd HH:mm", new Date());
      const minutesUntilStart = differenceInMinutes(bookingStart, now);
      
      if (minutesUntilStart < 30) {
        return { isValid: false, error: "Start time must be at least 30 minutes from now." };
      }
    }

    return { isValid: true, error: null };
  }, [location, date, startTime, endTime]);

  const isFormValid = validation.isValid && !errors.location && !errors.date && !errors.startTime && !errors.endTime;

  // Update validation error when form values change
  useEffect(() => {
    setValidationError(validation.error);
  }, [validation.error]);

  // Track preset state - clear if times don't match
  useEffect(() => {
    if (activePreset === "morning" && (startTime !== "07:00" || endTime !== "11:00")) {
      setActivePreset(null);
    } else if (activePreset === "afternoon" && (startTime !== "12:00" || endTime !== "16:00")) {
      setActivePreset(null);
    } else if (activePreset === "fullday" && (startTime !== "07:00" || endTime !== "18:00")) {
      setActivePreset(null);
    }
  }, [startTime, endTime, activePreset]);

  const handlePreset = (preset: PresetType, start: string, end: string) => {
    setValue("startTime", start);
    setValue("endTime", end);
    setActivePreset(preset);
  };

  const handleTimeChange = (field: "startTime" | "endTime", value: string) => {
    setValue(field, value);
    // Clear preset if manually edited
    if (activePreset) {
      setActivePreset(null);
    }
  };

  const onSubmit = (data: SearchFormData) => {
    // Final validation before submit (use current validation state)
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
    router.push(`/listings?${params.toString()}`);
  };

  const selectedDate = date ? parse(date, "yyyy-MM-dd", new Date()) : null;
  const isSameDay = selectedDate && isToday(selectedDate);

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3 md:gap-4">
        <div className="w-full">
          <Label htmlFor="location">Location</Label>
          <Input
            id="location"
            data-testid="location-input"
            placeholder="Suburb or city"
            className="w-full"
            {...register("location")}
          />
        </div>
        <div className="w-full">
          <Label htmlFor="date">Date</Label>
          <Input
            id="date"
            data-testid="date-input"
            type="date"
            className="w-full"
            min={new Date().toISOString().split("T")[0]}
            {...register("date")}
          />
        </div>
        <div className="w-full">
          <Label htmlFor="startTime">Start Time</Label>
          <Input
            id="startTime"
            data-testid="start-time-input"
            type="time"
            className="w-full"
            min="07:00"
            max="18:00"
            {...register("startTime", {
              onChange: (e) => handleTimeChange("startTime", e.target.value),
            })}
          />
        </div>
        <div className="w-full">
          <Label htmlFor="endTime">End Time</Label>
          <Input
            id="endTime"
            data-testid="end-time-input"
            type="time"
            className="w-full"
            min="07:00"
            max="18:00"
            {...register("endTime", {
              onChange: (e) => handleTimeChange("endTime", e.target.value),
            })}
          />
        </div>
      </div>
      
      {/* Preset Time Buttons */}
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant={activePreset === "morning" ? "default" : "outline"}
          size="sm"
          data-testid="preset-morning"
          onClick={() => handlePreset("morning", "07:00", "11:00")}
          className={cn("text-xs", activePreset === "morning" && "bg-primary text-primary-foreground")}
        >
          Morning (7am–11am)
        </Button>
        <Button
          type="button"
          variant={activePreset === "afternoon" ? "default" : "outline"}
          size="sm"
          data-testid="preset-afternoon"
          onClick={() => handlePreset("afternoon", "12:00", "16:00")}
          className={cn("text-xs", activePreset === "afternoon" && "bg-primary text-primary-foreground")}
        >
          Afternoon (12pm–4pm)
        </Button>
        <Button
          type="button"
          variant={activePreset === "fullday" ? "default" : "outline"}
          size="sm"
          data-testid="preset-fullday"
          onClick={() => handlePreset("fullday", "07:00", "18:00")}
          className={cn("text-xs", activePreset === "fullday" && "bg-primary text-primary-foreground")}
        >
          Full Day (7am–6pm)
        </Button>
      </div>

      {/* Same-day helper text */}
      {isSameDay && (
        <p data-testid="helper-same-day" className="text-xs text-muted-foreground">
          Same-day bookings must start at least 30 minutes from now.
        </p>
      )}

      {/* Consolidated error display */}
      {(validationError || Object.keys(errors).length > 0) && (
        <div data-testid="search-error" className="p-3 text-sm text-destructive bg-destructive/10 rounded-md">
          {validationError || 
           errors.location?.message || 
           errors.date?.message || 
           errors.startTime?.message || 
           errors.endTime?.message}
        </div>
      )}

      <div className="text-xs text-muted-foreground">
        Day use only · 7am–6pm · No overnight stays
      </div>

      <Button 
        type="submit" 
        size="lg" 
        className="w-full md:w-auto"
        data-testid="browse-homes-button"
        disabled={!isFormValid}
        style={!isFormValid ? { opacity: 0.5, cursor: "not-allowed" } : {}}
      >
        Browse Homes
      </Button>
    </form>
  );
}
