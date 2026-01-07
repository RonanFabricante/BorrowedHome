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
import { ChefHat, UtensilsCrossed, Home, Trees, Upload, X } from "lucide-react";
import Image from "next/image";

const spaceOptions: { value: SpaceType; label: string; icon: any }[] = [
  { value: "KITCHEN", label: "Kitchen", icon: ChefHat },
  { value: "DINING", label: "Dining Room", icon: UtensilsCrossed },
  { value: "LIVING", label: "Living Room", icon: Home },
  { value: "GARDEN", label: "Garden/Pool", icon: Trees },
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
  additional_instructions: z.string().max(1000, "Additional instructions must be 1000 characters or less").optional(),
  
  // Step 4.5: Facilities & Supplies
  toilet_access: z.enum(["shared", "private", "limited", "none"]),
  toilet_access_notes: z.string().optional(),
  consumables_policy_host_notes: z.string().optional(),
  provides_toilet_paper: z.boolean(),
  provides_pantry_staples: z.boolean(),
  provides_groceries: z.boolean(),
  
  // Step 5: Pricing
  hourly_rate: z.number().min(100), // $1 minimum
  half_day_rate: z.number().min(100),
  full_day_rate: z.number().min(100),
  deposit_amount: z.number().min(0),
}).refine((data) => {
  // Require toilet_access_notes when toilet_access is limited or none
  if (data.toilet_access === "limited" || data.toilet_access === "none") {
    return data.toilet_access_notes && data.toilet_access_notes.trim().length > 0;
  }
  return true;
}, {
  message: "Please explain the toilet arrangements",
  path: ["toilet_access_notes"],
});

type OnboardingFormData = z.infer<typeof onboardingSchema>;

type PhotoUpload = {
  file: File;
  preview: string;
  spaceType: SpaceType;
};

export function HostOnboardingWizard() {
  const router = useRouter();
  const supabase = createClient();
  const [step, setStep] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [photos, setPhotos] = useState<PhotoUpload[]>([]);
  const [uploading, setUploading] = useState(false);

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
      additional_instructions: "",
    },
  });

  // Photo upload handlers
  const handlePhotoUpload = (files: FileList | null, spaceType: SpaceType) => {
    if (!files) return;
    
    Array.from(files).forEach((file) => {
      if (file.type.startsWith("image/")) {
        const preview = URL.createObjectURL(file);
        setPhotos((prev) => [...prev, { file, preview, spaceType }]);
      }
    });
  };

  const removePhoto = (index: number) => {
    setPhotos((prev) => {
      const photo = prev[index];
      URL.revokeObjectURL(photo.preview);
      return prev.filter((_, i) => i !== index);
    });
  };

  const createListing = useMutation({
    mutationFn: async (data: OnboardingFormData) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      // Ensure profile exists before creating listing
      const { error: profileError } = await supabase
        .from("profiles")
        .upsert({
          id: user.id,
          full_name: user.user_metadata?.full_name || user.email?.split("@")[0] || "User",
          is_guest: true,
          is_host: false,
        }, {
          onConflict: "id"
        });

      if (profileError) {
        throw new Error(`Failed to ensure profile exists: ${profileError.message}`);
      }

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
          additional_instructions: data.additional_instructions?.trim() || null,
          toilet_access: data.toilet_access,
          toilet_access_notes: data.toilet_access_notes?.trim() || null,
          consumables_policy: data.consumables_policy_host_notes?.trim()
            ? `Personal consumables and perishables are not provided unless explicitly listed by the Host. Please bring any groceries/ingredients and personal items you require (e.g., hygiene products).\n\nHost notes: ${data.consumables_policy_host_notes.trim()}`
            : 'Personal consumables and perishables are not provided unless explicitly listed by the Host. Please bring any groceries/ingredients and personal items you require (e.g., hygiene products).',
          provides_toilet_paper: data.provides_toilet_paper,
          provides_pantry_staples: data.provides_pantry_staples,
          provides_groceries: data.provides_groceries,
          hourly_rate: Math.round(data.hourly_rate * 100), // Convert to cents
          half_day_rate: Math.round(data.half_day_rate * 100),
          full_day_rate: Math.round(data.full_day_rate * 100),
          deposit_amount: Math.round(data.deposit_amount * 100),
          published: false, // Host can publish later
        })
        .select()
        .single();

      if (listingError) throw listingError;

      // Upload photos to Supabase Storage
      if (photos.length > 0) {
        setUploading(true);
        const photoRecords = [];

        for (let i = 0; i < photos.length; i++) {
          const photo = photos[i];
          const fileExt = photo.file.name.split(".").pop();
          const fileName = `${listing.id}/${photo.spaceType}-${Date.now()}-${i}.${fileExt}`;
          const storagePath = fileName;

          // Upload to Supabase Storage
          const { error: uploadError } = await supabase.storage
            .from("listing-photos")
            .upload(storagePath, photo.file, {
              cacheControl: "3600",
              upsert: false,
            });

          if (uploadError) {
            console.error("Photo upload error:", uploadError);
            continue; // Skip this photo but continue with others
          }

          // Create photo record
          photoRecords.push({
            listing_id: listing.id,
            storage_path: storagePath,
            sort_order: i,
          });
        }

        // Insert photo records
        if (photoRecords.length > 0) {
          const { error: photosError } = await supabase
            .from("listing_photos")
            .insert(photoRecords);

          if (photosError) {
            console.error("Photo record error:", photosError);
            // Don't throw - listing is already created
          }
        }

        setUploading(false);
      }

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
      setUploading(false);
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
        <div>
          <Label htmlFor="additional_instructions">
            Additional Instructions (optional)
          </Label>
          <Textarea
            id="additional_instructions"
            {...form.register("additional_instructions")}
            placeholder="Share anything guests should know before booking (access notes, exclusions, special considerations)"
            rows={4}
            maxLength={1000}
          />
          <p className="text-sm text-muted-foreground mt-1">
            {form.watch("additional_instructions")?.length || 0}/1000 characters
          </p>
          {form.formState.errors.additional_instructions && (
            <p className="text-sm text-destructive mt-1">
              {form.formState.errors.additional_instructions.message}
            </p>
          )}
        </div>
      </div>
    </div>
  );

  // Step 5: Facilities & Supplies
  const renderStep5 = () => {
    const toiletAccess = form.watch("toilet_access");
    const requiresNotes = toiletAccess === "limited" || toiletAccess === "none";

    return (
      <div className="space-y-6">
        <h2 className="text-2xl font-bold mb-4">Facilities & Supplies</h2>
        <p className="text-muted-foreground mb-6">
          Specify toilet access and what supplies you provide to guests.
        </p>

        <div className="space-y-4">
          <div>
            <Label htmlFor="toilet_access" className="text-base font-semibold">
              Toilet Access <span className="text-destructive">*</span>
            </Label>
            <div className="mt-2 space-y-2">
              <div className="flex items-center gap-2">
                <input
                  type="radio"
                  id="toilet_shared"
                  value="shared"
                  {...form.register("toilet_access")}
                  className="h-4 w-4"
                />
                <Label htmlFor="toilet_shared" className="cursor-pointer font-normal">
                  Shared bathroom
                </Label>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="radio"
                  id="toilet_private"
                  value="private"
                  {...form.register("toilet_access")}
                  className="h-4 w-4"
                />
                <Label htmlFor="toilet_private" className="cursor-pointer font-normal">
                  Private bathroom
                </Label>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="radio"
                  id="toilet_limited"
                  value="limited"
                  {...form.register("toilet_access")}
                  className="h-4 w-4"
                />
                <Label htmlFor="toilet_limited" className="cursor-pointer font-normal">
                  Limited access (explain)
                </Label>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="radio"
                  id="toilet_none"
                  value="none"
                  {...form.register("toilet_access")}
                  className="h-4 w-4"
                />
                <Label htmlFor="toilet_none" className="cursor-pointer font-normal">
                  No toilet access
                </Label>
              </div>
            </div>
            {form.formState.errors.toilet_access && (
              <p className="text-sm text-destructive mt-1">
                {form.formState.errors.toilet_access.message}
              </p>
            )}
          </div>

          {requiresNotes && (
            <div>
              <Label htmlFor="toilet_access_notes">
                Explain bathroom/toilet arrangements <span className="text-destructive">*</span>
              </Label>
              <Textarea
                id="toilet_access_notes"
                {...form.register("toilet_access_notes", {
                  required: requiresNotes ? "Please explain the toilet arrangements" : false,
                })}
                placeholder="e.g., Guests can use the downstairs bathroom, but the upstairs is private"
                rows={3}
              />
              {form.formState.errors.toilet_access_notes && (
                <p className="text-sm text-destructive mt-1">
                  {form.formState.errors.toilet_access_notes.message}
                </p>
              )}
            </div>
          )}

          <div className="border-t pt-4">
            <h3 className="font-semibold mb-4">Supplies Provided</h3>
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="provides_toilet_paper"
                  checked={form.watch("provides_toilet_paper")}
                  onChange={(e) => form.setValue("provides_toilet_paper", e.target.checked)}
                />
                <Label htmlFor="provides_toilet_paper" className="cursor-pointer">
                  Toilet paper provided
                </Label>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox
                  id="provides_pantry_staples"
                  checked={form.watch("provides_pantry_staples")}
                  onChange={(e) => form.setValue("provides_pantry_staples", e.target.checked)}
                />
                <Label htmlFor="provides_pantry_staples" className="cursor-pointer">
                  Basic pantry staples provided (oil/salt/pepper)
                </Label>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox
                  id="provides_groceries"
                  checked={form.watch("provides_groceries")}
                  onChange={(e) => form.setValue("provides_groceries", e.target.checked)}
                />
                <Label htmlFor="provides_groceries" className="cursor-pointer">
                  Groceries/ingredients provided
                </Label>
              </div>
            </div>
          </div>

          <div className="border-t pt-4">
            <h3 className="font-semibold mb-2">Consumables Policy</h3>
            <div className="bg-muted p-4 rounded-md mb-4">
              <p className="text-sm whitespace-pre-wrap">
                Personal consumables and perishables are not provided unless explicitly listed by the Host. Please bring any groceries/ingredients and personal items you require (e.g., hygiene products).
              </p>
            </div>
            <div>
              <Label htmlFor="consumables_policy_host_notes">
                Host notes (optional)
              </Label>
              <Textarea
                id="consumables_policy_host_notes"
                {...form.register("consumables_policy_host_notes")}
                placeholder="Add any additional notes about consumables (optional)"
                rows={3}
              />
              <p className="text-sm text-muted-foreground mt-1">
                These notes will be appended to the default policy text shown to guests.
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  };

  // Step 7: Photos
  const renderStep7 = () => {
    const selectedSpaces = form.watch("spaces");
    
    return (
      <div className="space-y-6">
        <h2 className="text-2xl font-bold mb-4">Upload Photos</h2>
        <p className="text-muted-foreground mb-6">
          Add photos for each space. These will be visible to guests browsing your listing.
        </p>

        {selectedSpaces.map((spaceType) => {
          const spaceOption = spaceOptions.find((opt) => opt.value === spaceType);
          const Icon = spaceOption?.icon;
          const spacePhotos = photos.filter((p) => p.spaceType === spaceType);

          return (
            <div key={spaceType} className="space-y-3">
              <div className="flex items-center gap-2">
                {Icon && <Icon className="h-5 w-5" />}
                <Label className="text-base font-semibold">
                  {spaceOption?.label} Photos
                </Label>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                {spacePhotos.map((photo, index) => {
                  const globalIndex = photos.findIndex((p) => p === photo);
                  return (
                    <div
                      key={index}
                      className="relative aspect-square rounded-lg overflow-hidden border border-border bg-muted"
                    >
                      <Image
                        src={photo.preview}
                        alt={`${spaceOption?.label} ${index + 1}`}
                        fill
                        className="object-cover"
                      />
                      <button
                        type="button"
                        onClick={() => removePhoto(globalIndex)}
                        className="absolute top-2 right-2 p-1 bg-destructive text-destructive-foreground rounded-full hover:bg-destructive/90"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  );
                })}

                <label className="aspect-square rounded-lg border-2 border-dashed border-border bg-muted hover:bg-muted/80 cursor-pointer flex flex-col items-center justify-center gap-2 transition-colors">
                  <Upload className="h-6 w-6 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground text-center px-2">
                    Add Photo
                  </span>
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    onChange={(e) => handlePhotoUpload(e.target.files, spaceType)}
                  />
                </label>
              </div>
            </div>
          );
        })}

        {selectedSpaces.length === 0 && (
          <p className="text-sm text-muted-foreground">
            Please select spaces in Step 1 before uploading photos.
          </p>
        )}
      </div>
    );
  };

  // Step 6: Pricing (renumbered from Step 5)
  const renderStep6Pricing = () => (
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
            Step {step} of 7
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
            {step === 6 && renderStep6Pricing()}
            {step === 7 && renderStep7()}

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
              {step < 7 ? (
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
                        : step === 5
                        ? ["toilet_access", "toilet_access_notes"]
                        : step === 6
                        ? ["hourly_rate", "half_day_rate", "full_day_rate"]
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
                  disabled={createListing.isPending || uploading}
                  className="ml-auto"
                >
                  {uploading
                    ? "Uploading photos..."
                    : createListing.isPending
                    ? "Creating..."
                    : "Create Listing"}
                </Button>
              )}
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
