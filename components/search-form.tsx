"use client";

import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { parse, differenceInHours } from "date-fns";

const searchSchema = z
  .object({
    location: z.string().min(1, "Location is required"),
    date: z.string().min(1, "Date is required"),
    startTime: z.string().min(1, "Start time is required"),
    endTime: z.string().min(1, "End time is required"),
  })
  .refine(
    (data) => {
      if (!data.startTime || !data.endTime) return true;
      const start = parse(data.startTime, "HH:mm", new Date());
      const end = parse(data.endTime, "HH:mm", new Date());
      return end > start;
    },
    {
      message: "End time must be after start time",
      path: ["endTime"],
    }
  )
  .refine(
    (data) => {
      if (!data.startTime || !data.endTime || !data.date) return true;
      const start = parse(`${data.date} ${data.startTime}`, "yyyy-MM-dd HH:mm", new Date());
      const end = parse(`${data.date} ${data.endTime}`, "yyyy-MM-dd HH:mm", new Date());
      const hours = differenceInHours(end, start);
      return hours > 0 && hours <= 11;
    },
    {
      message: "Booking duration must be between 1 and 11 hours",
      path: ["endTime"],
    }
  )
  .refine(
    (data) => {
      if (!data.startTime) return true;
      const start = parse(data.startTime, "HH:mm", new Date());
      return start.getHours() >= 7;
    },
    {
      message: "Earliest start time is 7:00 AM",
      path: ["startTime"],
    }
  )
  .refine(
    (data) => {
      if (!data.endTime) return true;
      const end = parse(data.endTime, "HH:mm", new Date());
      return end.getHours() <= 18;
    },
    {
      message: "Latest end time is 6:00 PM (day use only)",
      path: ["endTime"],
    }
  );

type SearchFormData = z.infer<typeof searchSchema>;

export function SearchForm() {
  const router = useRouter();
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

  const handlePreset = (start: string, end: string) => {
    setValue("startTime", start);
    setValue("endTime", end);
  };

  const onSubmit = (data: SearchFormData) => {
    const params = new URLSearchParams({
      location: data.location,
      date: data.date,
      startTime: data.startTime,
      endTime: data.endTime,
    });
    router.push(`/listings?${params.toString()}`);
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3 md:gap-4">
        <div className="w-full">
          <Label htmlFor="location">Location</Label>
          <Input
            id="location"
            placeholder="Suburb or city"
            className="w-full"
            {...register("location")}
          />
          {errors.location && (
            <p className="text-sm text-destructive mt-1">
              {errors.location.message}
            </p>
          )}
        </div>
        <div className="w-full">
          <Label htmlFor="date">Date</Label>
          <Input
            id="date"
            type="date"
            className="w-full"
            min={new Date().toISOString().split("T")[0]}
            {...register("date")}
          />
          {errors.date && (
            <p className="text-sm text-destructive mt-1">
              {errors.date.message}
            </p>
          )}
        </div>
        <div className="w-full">
          <Label htmlFor="startTime">Start Time</Label>
          <Input
            id="startTime"
            type="time"
            className="w-full"
            min="07:00"
            max="18:00"
            {...register("startTime")}
          />
          {errors.startTime && (
            <p className="text-sm text-destructive mt-1">
              {errors.startTime.message}
            </p>
          )}
        </div>
        <div className="w-full">
          <Label htmlFor="endTime">End Time</Label>
          <Input
            id="endTime"
            type="time"
            className="w-full"
            min="07:00"
            max="18:00"
            {...register("endTime")}
          />
          {errors.endTime && (
            <p className="text-sm text-destructive mt-1">
              {errors.endTime.message}
            </p>
          )}
        </div>
      </div>
      
      {/* Preset Time Buttons */}
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => handlePreset("07:00", "11:00")}
          className="text-xs"
        >
          Morning (7am–11am)
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => handlePreset("12:00", "16:00")}
          className="text-xs"
        >
          Afternoon (12pm–4pm)
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => handlePreset("07:00", "18:00")}
          className="text-xs"
        >
          Full Day (7am–6pm)
        </Button>
      </div>

      <div className="text-xs text-muted-foreground">
        Day use only · 7am–6pm · No overnight stays
      </div>

      <Button type="submit" size="lg" className="w-full md:w-auto">
        Browse Homes
      </Button>
    </form>
  );
}
