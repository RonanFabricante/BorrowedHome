"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useMutation } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Select } from "@/components/ui/select";
import { SpaceType, NoiseTolerance } from "@/lib/types";
import { Kitchen, UtensilsCrossed, Sofa, TreePine } from "lucide-react";

const spaceOptions: { value: SpaceType; label: string; icon: any }[] = [
  { value: "KITCHEN", label: "Kitchen", icon: Kitchen },
  { value: "DINING", label: "Dining Room", icon: UtensilsCrossed },
  { value: "LIVING", label: "Living Room", icon: Sofa },
  { value: "GARDEN", label: "Garden/Pool", icon: TreePine },
];

const onboardingSchema = z.object({
  // Step 1: Spaces
  spaces: z.array(z.enum(["KITCHEN", "DINING", "LIVING", "GARDEN"])).min(1),
  
  // Step 2: Basic Info
  title: z.string().min(5, "Title must be at least 5 characters"),
  description: z.string().min(20, "Description must be at least 20 characters"),
  location_text: z.string().min(2, "Location is required"),
  address_text: z.string().min(5, "Address is required"),
  max_guests: z.number().min(1).max(50),
  
  // Step 3: Availability
  availability: z.array(z.object({
    day_of_week: z.number().min(0).max(6),
    start_time: z.string(),
    end_time: z.string(),
  })).min(1),
  
  // Step 4: Rules
  host_present: z.boolean(),
  cooking_allowed: z.boolean(),
  alcohol_allowed: z.boolean(),
  noise_tolerance: z.enum(["LOW", "MEDIUM", "HIGH"]),
  cleaning_expectations: z.string().optional(),
  
  // Step 5: Pricing
  hourly_rate: z.number().min(100), // $1 minimum
  half_day_rate: z.number().min(100),
  full_day_rate: z.number().min(100),
  deposit_amount: z.number().min(0),
});

type OnboardingFormData = z.infer<typeof onboardingSchema>;

export function HostOnboardingWizard() {
  const router = useRouter();
  const supabase = createClient();
  const [step, setStep] = useState(1);
  const [error, setError] = useState<string | null>(null);

  const form = useForm<OnboardingFormData>({
    resolver: zodResolver(onboardingSchema),
    defaultValues: {
      spaces: [],
      availability: [],
      host_present: false,
      cooking_allowed: false,
      alcohol_allowed: false,
      noise_tolerance: "MEDIUM",
      deposit_amount: 0,
      max_guests: 10,
    },
  });

  const createListing = useMutation({
    mutationFn: async (data: OnboardingFormData) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      // Create listing
      const { data: listing, error: listingError } = await supabase
        .from("listings")
        .insert({
          host_id: user.id,
          title: data.title,
          description: data.description,
          location_text: data.location_text,
          address_text: data.address_text,
          max_guests: data.max_guests,
          host_present: data.host_present,
          cooking_allowed: data.cooking_allowed,
          alcohol_allowed: data.alcohol_allowed,
          noise_tolerance: data.noise_tolerance,
          cleaning_expectations: data.cleaning_expectations || null,
          hourly_rate: Math.round(data.hourly_rate * 100), // Convert to cents
          half_day_rate: Math.round(data.half_day_rate * 100),
          full_day_rate: Math.round(data.full_day_rate * 100),
          deposit_amount: Math.round(data.deposit_amount * 100),
          published: false, // Host can publish later
        })
        .select()
        .single();

      if (listingError) throw listingError;

      // Create spaces
      const spaces = data.spaces.map((space) => ({
        listing_id: listing.id,
        space_type: space,
      }));

      const { error: spacesError } = await supabase
        .from("listing_spaces")
        .insert(spaces);

      if (spacesError) throw spacesError;

      // Create availability
      const availability = data.availability.map((avail) => ({
        listing_id: listing.id,
        day_of_week: avail.day_of_week,
        start_time: avail.start_time,
        end_time: avail.end_time,
      }));

      const { error: availError } = await supabase
        .from("listing_availability")
        .insert(availability);

      if (availError) throw availError;

      // Update profile to mark as host
      await supabase
        .from("profiles")
        .update({ is_host: true })
        .eq("id", user.id);

      return listing;
    },
    onSuccess: (listing) => {
      router.push(`/my-listings?created=${listing.id}`);
    },
    onError: (err: any) => {
      setError(err.message || "Failed to create listing");
    },
  });

  const onSubmit = (data: OnboardingFormData) => {
    setError(null);
    createListing.mutate(data);
  };

  // Step 1: Select Spaces
  const renderStep1 = () => {
    const spaces = form.watch("spaces");
    return (
      <div className="space-y-4">
        <h2 className="text-2xl font-bold mb-4">Select Spaces</h2>
        <p className="text-muted-foreground mb-6">
          Choose which spaces guests can access. Remember: no bedrooms.
        </p>
        <div className="grid md:grid-cols-2 gap-4">
          {spaceOptions.map((option) => {
            const Icon = option.icon;
            const isSelected = spaces.includes(option.value);
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => {
                  const current = form.getValues("spaces");
                  if (isSelected) {
                    form.setValue(
                      "spaces",
                      current.filter((s) => s !== option.value)
                    );
                  } else {
                    form.setValue("spaces", [...current, option.value]);
                  }
                }}
                className={`p-4 border-2 rounded-lg text-left transition-colors ${
                  isSelected
                    ? "border-primary bg-primary/5"
                    : "border-border hover:border-primary/50"
                }`}
              >
                <Icon className="h-8 w-8 mb-2" />
                <p className="font-semibold">{option.label}</p>
              </button>
            );
          })}
        </div>
        {form.formState.errors.spaces && (
          <p className="text-sm text-destructive">
            Please select at least one space
          </p>
        )}
      </div>
    );
  };

  // Step 2: Basic Info
  const renderStep2 = () => (
    <div className="space-y-4">
      <h2 className="text-2xl font-bold mb-4">Basic Information</h2>
      <div>
        <Label htmlFor="title">Listing Title</Label>
        <Input
          id="title"
          {...form.register("title")}
          placeholder="e.g., Cozy Family Home in Downtown"
        />
        {form.formState.errors.title && (
          <p className="text-sm text-destructive mt-1">
            {form.formState.errors.title.message}
          </p>
        )}
      </div>
      <div>
        <Label htmlFor="description">Description</Label>
        <Textarea
          id="description"
          {...form.register("description")}
          placeholder="Describe your space..."
          rows={6}
        />
        {form.formState.errors.description && (
          <p className="text-sm text-destructive mt-1">
            {form.formState.errors.description.message}
          </p>
        )}
      </div>
      <div>
        <Label htmlFor="location_text">Location (Public)</Label>
        <Input
          id="location_text"
          {...form.register("location_text")}
          placeholder="e.g., Downtown, Seattle"
        />
        {form.formState.errors.location_text && (
          <p className="text-sm text-destructive mt-1">
            {form.formState.errors.location_text.message}
          </p>
        )}
      </div>
      <div>
        <Label htmlFor="address_text">Full Address (Private)</Label>
        <Input
          id="address_text"
          {...form.register("address_text")}
          placeholder="123 Main St, Seattle, WA 98101"
        />
        {form.formState.errors.address_text && (
          <p className="text-sm text-destructive mt-1">
            {form.formState.errors.address_text.message}
          </p>
        )}
        <p className="text-sm text-muted-foreground mt-1">
          This will only be shown to confirmed bookings
        </p>
      </div>
      <div>
        <Label htmlFor="max_guests">Maximum Guests</Label>
        <Input
          id="max_guests"
          type="number"
          {...form.register("max_guests", { valueAsNumber: true })}
          min={1}
          max={50}
        />
        {form.formState.errors.max_guests && (
          <p className="text-sm text-destructive mt-1">
            {form.formState.errors.max_guests.message}
          </p>
        )}
      </div>
    </div>
  );

  // Step 3: Availability
  const renderStep3 = () => {
    const availability = form.watch("availability") || [];
    const days = [
      "Sunday",
      "Monday",
      "Tuesday",
      "Wednesday",
      "Thursday",
      "Friday",
      "Saturday",
    ];

    return (
      <div className="space-y-4">
        <h2 className="text-2xl font-bold mb-4">Availability</h2>
        <p className="text-muted-foreground mb-6">
          Set when your space is available. Remember: day-use only, end by 9pm.
        </p>
        {days.map((day, index) => {
          const dayAvail = availability.find((a) => a.day_of_week === index);
          return (
            <div key={index} className="flex items-center gap-4 p-4 border rounded-lg">
              <div className="w-24">
                <Checkbox
                  checked={!!dayAvail}
                  onChange={(e) => {
                    const current = form.getValues("availability");
                    if (e.target.checked) {
                      form.setValue("availability", [
                        ...current,
                        { day_of_week: index, start_time: "09:00", end_time: "21:00" },
                      ]);
                    } else {
                      form.setValue(
                        "availability",
                        current.filter((a) => a.day_of_week !== index)
                      );
                    }
                  }}
                />
                <Label className="ml-2">{day}</Label>
              </div>
              {dayAvail && (
                <div className="flex gap-2 flex-1">
                  <div className="flex-1">
                    <Label>Start</Label>
                    <Input
                      type="time"
                      value={dayAvail.start_time}
                      onChange={(e) => {
                        const current = form.getValues("availability");
                        form.setValue(
                          "availability",
                          current.map((a) =>
                            a.day_of_week === index
                              ? { ...a, start_time: e.target.value }
                              : a
                          )
                        );
                      }}
                    />
                  </div>
                  <div className="flex-1">
                    <Label>End (max 9pm)</Label>
                    <Input
                      type="time"
                      max="21:00"
                      value={dayAvail.end_time}
                      onChange={(e) => {
                        const current = form.getValues("availability");
                        form.setValue(
                          "availability",
                          current.map((a) =>
                            a.day_of_week === index
                              ? { ...a, end_time: e.target.value }
                              : a
                          )
                        );
                      }}
                    />
                  </div>
                </div>
              )}
            </div>
          );
        })}
        {form.formState.errors.availability && (
          <p className="text-sm text-destructive">
            Please set availability for at least one day
          </p>
        )}
      </div>
    );
  };

  // Step 4: Rules
  const renderStep4 = () => (
    <div className="space-y-4">
      <h2 className="text-2xl font-bold mb-4">House Rules</h2>
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Checkbox
            id="host_present"
            checked={form.watch("host_present")}
            onChange={(e) =>
              form.setValue("host_present", e.target.checked)
            }
          />
          <Label htmlFor="host_present" className="cursor-pointer">
            Host will be present during bookings
          </Label>
        </div>
        <div className="flex items-center gap-2">
          <Checkbox
            id="cooking_allowed"
            checked={form.watch("cooking_allowed")}
            onChange={(e) =>
              form.setValue("cooking_allowed", e.target.checked)
            }
          />
          <Label htmlFor="cooking_allowed" className="cursor-pointer">
            Cooking allowed
          </Label>
        </div>
        <div className="flex items-center gap-2">
          <Checkbox
            id="alcohol_allowed"
            checked={form.watch("alcohol_allowed")}
            onChange={(e) =>
              form.setValue("alcohol_allowed", e.target.checked)
            }
          />
          <Label htmlFor="alcohol_allowed" className="cursor-pointer">
            Alcohol allowed
          </Label>
        </div>
        <div>
          <Label htmlFor="noise_tolerance">Noise Tolerance</Label>
          <Select
            id="noise_tolerance"
            {...form.register("noise_tolerance")}
          >
            <option value="LOW">Low</option>
            <option value="MEDIUM">Medium</option>
            <option value="HIGH">High</option>
          </Select>
        </div>
        <div>
          <Label htmlFor="cleaning_expectations">Cleaning Expectations</Label>
          <Textarea
            id="cleaning_expectations"
            {...form.register("cleaning_expectations")}
            placeholder="e.g., Please wash dishes and wipe surfaces"
            rows={3}
          />
        </div>
      </div>
    </div>
  );

  // Step 5: Pricing
  const renderStep5 = () => (
    <div className="space-y-4">
      <h2 className="text-2xl font-bold mb-4">Pricing</h2>
      <p className="text-muted-foreground mb-6">
        Set your rates. All amounts are in USD.
      </p>
      <div>
        <Label htmlFor="hourly_rate">Hourly Rate ($)</Label>
        <Input
          id="hourly_rate"
          type="number"
          step="0.01"
          {...form.register("hourly_rate", { valueAsNumber: true })}
          min={1}
        />
        {form.formState.errors.hourly_rate && (
          <p className="text-sm text-destructive mt-1">
            {form.formState.errors.hourly_rate.message}
          </p>
        )}
      </div>
      <div>
        <Label htmlFor="half_day_rate">Half-Day Rate (4 hours) ($)</Label>
        <Input
          id="half_day_rate"
          type="number"
          step="0.01"
          {...form.register("half_day_rate", { valueAsNumber: true })}
          min={1}
        />
        {form.formState.errors.half_day_rate && (
          <p className="text-sm text-destructive mt-1">
            {form.formState.errors.half_day_rate.message}
          </p>
        )}
      </div>
      <div>
        <Label htmlFor="full_day_rate">Full-Day Rate (8 hours) ($)</Label>
        <Input
          id="full_day_rate"
          type="number"
          step="0.01"
          {...form.register("full_day_rate", { valueAsNumber: true })}
          min={1}
        />
        {form.formState.errors.full_day_rate && (
          <p className="text-sm text-destructive mt-1">
            {form.formState.errors.full_day_rate.message}
          </p>
        )}
      </div>
      <div>
        <Label htmlFor="deposit_amount">Damage Deposit ($)</Label>
        <Input
          id="deposit_amount"
          type="number"
          step="0.01"
          {...form.register("deposit_amount", { valueAsNumber: true })}
          min={0}
        />
        <p className="text-sm text-muted-foreground mt-1">
          Optional. Refundable deposit to cover potential damage.
        </p>
      </div>
      <div className="p-4 bg-muted rounded-lg">
        <p className="text-sm font-semibold mb-2">Confirm Day-Use Only</p>
        <p className="text-sm text-muted-foreground">
          By publishing this listing, you confirm this is for day-use only.
          All bookings must end by 9pm. No overnight stays.
        </p>
      </div>
    </div>
  );

  return (
    <div className="max-w-3xl mx-auto">
      <Card>
        <CardHeader>
          <CardTitle>Create Your Listing</CardTitle>
          <p className="text-sm text-muted-foreground">
            Step {step} of 5
          </p>
        </CardHeader>
        <CardContent>
          <form onSubmit={form.handleSubmit(onSubmit)}>
            {error && (
              <div className="p-3 text-sm text-destructive bg-destructive/10 rounded-md mb-6">
                {error}
              </div>
            )}

            {step === 1 && renderStep1()}
            {step === 2 && renderStep2()}
            {step === 3 && renderStep3()}
            {step === 4 && renderStep4()}
            {step === 5 && renderStep5()}

            <div className="flex gap-4 mt-8">
              {step > 1 && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setStep(step - 1)}
                >
                  Previous
                </Button>
              )}
              {step < 5 ? (
                <Button
                  type="button"
                  onClick={() => {
                    // Validate current step before proceeding
                    const fields: (keyof OnboardingFormData)[] =
                      step === 1
                        ? ["spaces"]
                        : step === 2
                        ? ["title", "description", "location_text", "address_text", "max_guests"]
                        : step === 3
                        ? ["availability"]
                        : step === 4
                        ? ["noise_tolerance"]
                        : [];
                    
                    form.trigger(fields).then((isValid) => {
                      if (isValid) setStep(step + 1);
                    });
                  }}
                  className="ml-auto"
                >
                  Next
                </Button>
              ) : (
                <Button
                  type="submit"
                  disabled={createListing.isPending}
                  className="ml-auto"
                >
                  {createListing.isPending ? "Creating..." : "Create Listing"}
                </Button>
              )}
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
