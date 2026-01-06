"use client";

import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const searchSchema = z.object({
  location: z.string().min(1, "Location is required"),
  date: z.string().min(1, "Date is required"),
  startTime: z.string().min(1, "Start time is required"),
  endTime: z.string().min(1, "End time is required"),
});

type SearchFormData = z.infer<typeof searchSchema>;

export function SearchForm() {
  const router = useRouter();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<SearchFormData>({
    resolver: zodResolver(searchSchema),
  });

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
      <div className="grid md:grid-cols-4 gap-4">
        <div>
          <Label htmlFor="location">Location</Label>
          <Input
            id="location"
            placeholder="Suburb or city"
            {...register("location")}
          />
          {errors.location && (
            <p className="text-sm text-destructive mt-1">
              {errors.location.message}
            </p>
          )}
        </div>
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
            {...register("endTime")}
          />
          {errors.endTime && (
            <p className="text-sm text-destructive mt-1">
              {errors.endTime.message}
            </p>
          )}
        </div>
      </div>
      <Button type="submit" size="lg" className="w-full md:w-auto">
        Browse Homes
      </Button>
    </form>
  );
}
