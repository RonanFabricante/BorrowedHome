"use client";

import { useState, useEffect } from "react";
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
import { Listing, ListingPhoto, SpaceType, NoiseTolerance } from "@/lib/types";
import { ChefHat, UtensilsCrossed, Home, Trees, Upload, X } from "lucide-react";
import Image from "next/image";
import { hostDeclarationCheckboxLabel, TERMS_VERSION } from "@/lib/legal/terms-au";
import { HostDeclarationModal } from "@/components/host-declaration-modal";
import { PlaceAutocomplete, NormalizedPlace } from "@/components/place-autocomplete";

const spaceOptions: { value: SpaceType; label: string; icon: any }[] = [
  { value: "KITCHEN", label: "Kitchen", icon: ChefHat },
  { value: "DINING", label: "Dining Room", icon: UtensilsCrossed },
  { value: "LIVING", label: "Living Room", icon: Home },
  { value: "GARDEN", label: "Garden/Pool", icon: Trees },
];

const editSchema = z.object({
  spaces: z.array(z.enum(["KITCHEN", "DINING", "LIVING", "GARDEN"])).min(1),
  title: z.string().min(5, "Title must be at least 5 characters"),
  description: z.string().min(20, "Description must be at least 20 characters"),
  location_text: z.string().min(2, "Location is required"),
  address_text: z.string().min(5, "Address is required"),
  max_guests: z.number().min(1).max(50),
  availability: z.array(z.object({
    day_of_week: z.number().min(0).max(6),
    start_time: z.string(),
    end_time: z.string(),
  })).min(1),
  host_present: z.boolean(),
  cooking_allowed: z.boolean(),
  alcohol_allowed: z.boolean(),
  noise_tolerance: z.enum(["LOW", "MEDIUM", "HIGH"]),
  cleaning_expectations: z.string().optional(),
  additional_instructions: z.string().max(1000, "Additional instructions must be 1000 characters or less").optional(),
  toilet_access: z.enum(["shared", "private", "limited", "none"]),
  toilet_access_notes: z.string().optional(),
  consumables_policy_host_notes: z.string().optional(),
  provides_toilet_paper: z.boolean(),
  provides_pantry_staples: z.boolean(),
  provides_groceries: z.boolean(),
  hourly_rate: z.number().min(0),
  half_day_rate: z.number().min(0),
  full_day_rate: z.number().min(0),
  deposit_amount: z.number().min(0),
  published: z.boolean(),
  hostDeclarationConfirmed: z.boolean().optional(),
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

type EditFormData = z.infer<typeof editSchema>;

type PhotoUpload = {
  file: File;
  preview: string;
  spaceType: SpaceType;
};

export function EditListingForm({ listing }: { listing: any }) {
  const router = useRouter();
  const supabase = createClient();
  const [error, setError] = useState<string | null>(null);
  const [photos, setPhotos] = useState<PhotoUpload[]>([]);
  const [existingPhotos, setExistingPhotos] = useState<(ListingPhoto & { url?: string })[]>(listing.photos || []);
  const [uploading, setUploading] = useState(false);
  const [showDeclarationModal, setShowDeclarationModal] = useState(false);
  const [hostDeclarationConfirmed, setHostDeclarationConfirmed] = useState(false);
  const [locationPlace, setLocationPlace] = useState<NormalizedPlace | null>(null);
  const [addressPlace, setAddressPlace] = useState<NormalizedPlace | null>(null);

  const form = useForm<EditFormData>({
    resolver: zodResolver(editSchema),
    defaultValues: {
      spaces: listing.spaces || [],
      title: listing.title || "",
      description: listing.description || "",
      location_text: listing.location_text || "",
      address_text: listing.address_text || "",
      max_guests: listing.max_guests || 10,
      availability: (listing.availability || []).map((avail: any) => ({
        day_of_week: avail.day_of_week,
        start_time: avail.start_time?.substring(0, 5) || "07:00", // Convert HH:mm:ss to HH:mm
        end_time: avail.end_time?.substring(0, 5) || "18:00", // Convert HH:mm:ss to HH:mm
      })),
      host_present: listing.host_present || false,
      cooking_allowed: listing.cooking_allowed || false,
      alcohol_allowed: listing.alcohol_allowed || false,
      noise_tolerance: listing.noise_tolerance || "MEDIUM",
      cleaning_expectations: listing.cleaning_expectations || "",
      additional_instructions: listing.additional_instructions || "",
      toilet_access: listing.toilet_access || "shared",
      toilet_access_notes: listing.toilet_access_notes || "",
      consumables_policy_host_notes: listing.consumables_policy?.includes("Host notes:") 
        ? listing.consumables_policy.split("Host notes:")[1]?.trim() || ""
        : "",
      provides_toilet_paper: listing.provides_toilet_paper || false,
      provides_pantry_staples: listing.provides_pantry_staples || false,
      provides_groceries: listing.provides_groceries || false,
      hourly_rate: (listing.hourly_rate || 0) / 100,
      half_day_rate: (listing.half_day_rate || 0) / 100,
      full_day_rate: (listing.full_day_rate || 0) / 100,
      deposit_amount: (listing.deposit_amount || 0) / 100,
      published: listing.published || false,
      hostDeclarationConfirmed: false,
    },
  });

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

  const removeExistingPhoto = async (photoId: string, storagePath: string) => {
    // Delete from storage
    await supabase.storage.from("listing-photos").remove([storagePath]);
    
    // Delete from database
    await supabase.from("listing_photos").delete().eq("id", photoId);
    
    // Update local state
    setExistingPhotos((prev: (ListingPhoto & { url?: string })[]) => prev.filter((p) => p.id !== photoId));
  };

  const updateListing = useMutation({
    mutationFn: async (data: EditFormData) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      // If publishing, check for host declaration acceptance and Stripe onboarding
      if (data.published && !listing.published) {
        // Check if user has accepted host declaration for current version
        const { data: existingAcceptance } = await supabase
          .from("user_legal_acceptances")
          .select("*")
          .eq("user_id", user.id)
          .eq("doc_type", "host_declaration")
          .eq("doc_version", TERMS_VERSION)
          .single();

        if (!existingAcceptance) {
          throw new Error("You must confirm the Host Declaration before publishing. Please check the declaration checkbox.");
        }

        // Verify checkbox is checked
        if (!data.hostDeclarationConfirmed) {
          throw new Error("You must confirm the Host Declaration checkbox before publishing.");
        }

        // Check if host has completed Stripe onboarding
        const { data: host } = await supabase
          .from("hosts")
          .select("stripe_onboarding_status")
          .eq("user_id", user.id)
          .single();

        if (!host || host.stripe_onboarding_status !== "complete") {
          const error = new Error("You must complete Stripe onboarding before publishing listings.");
          (error as any).code = "STRIPE_ONBOARDING_REQUIRED";
          throw error;
        }

        // Record acceptance on listing
        const updateData: any = {
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
          hourly_rate: Math.round(data.hourly_rate * 100),
          half_day_rate: Math.round(data.half_day_rate * 100),
          full_day_rate: Math.round(data.full_day_rate * 100),
          deposit_amount: Math.round(data.deposit_amount * 100),
          published: data.published,
          host_declaration_version: TERMS_VERSION,
          host_declaration_accepted_at: new Date().toISOString(),
        };

        const { error: listingError } = await supabase
          .from("listings")
          .update(updateData)
          .eq("id", listing.id)
          .eq("host_id", user.id);

        if (listingError) throw listingError;
      } else {
        // Not publishing or already published - normal update
        const { error: listingError } = await supabase
          .from("listings")
          .update({
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
            hourly_rate: Math.round(data.hourly_rate * 100),
            half_day_rate: Math.round(data.half_day_rate * 100),
            full_day_rate: Math.round(data.full_day_rate * 100),
            deposit_amount: Math.round(data.deposit_amount * 100),
            published: data.published,
          })
          .eq("id", listing.id)
          .eq("host_id", user.id);

        if (listingError) throw listingError;
      }

      // Update spaces
      await supabase.from("listing_spaces").delete().eq("listing_id", listing.id);
      const spaces = data.spaces.map((space) => ({
        listing_id: listing.id,
        space_type: space,
      }));
      await supabase.from("listing_spaces").insert(spaces);

      // Update availability
      await supabase.from("listing_availability").delete().eq("listing_id", listing.id);
      const availability = data.availability.map((avail) => ({
        listing_id: listing.id,
        day_of_week: avail.day_of_week,
        start_time: avail.start_time,
        end_time: avail.end_time,
      }));
      await supabase.from("listing_availability").insert(availability);

      // Upload new photos
      if (photos.length > 0) {
        setUploading(true);
        const photoRecords = [];
        const currentMaxOrder = existingPhotos.length > 0
          ? Math.max(...existingPhotos.map((p: any) => p.sort_order || 0))
          : -1;

        for (let i = 0; i < photos.length; i++) {
          const photo = photos[i];
          const fileExt = photo.file.name.split(".").pop();
          const fileName = `${listing.id}/${photo.spaceType}-${Date.now()}-${i}.${fileExt}`;
          const storagePath = fileName;

          const { error: uploadError } = await supabase.storage
            .from("listing-photos")
            .upload(storagePath, photo.file, {
              cacheControl: "3600",
              upsert: false,
            });

          if (uploadError) {
            console.error("Photo upload error:", uploadError);
            continue;
          }

          photoRecords.push({
            listing_id: listing.id,
            storage_path: storagePath,
            sort_order: currentMaxOrder + i + 1,
          });
        }

        if (photoRecords.length > 0) {
          await supabase.from("listing_photos").insert(photoRecords);
        }

        setUploading(false);
      }

      return listing.id;
    },
    onSuccess: (listingId) => {
      router.push(`/listings/${listingId}`);
      router.refresh();
    },
    onError: (err: any) => {
      setError(err.message || "Failed to update listing");
      setUploading(false);
    },
  });

  const onSubmit = (data: EditFormData) => {
    setError(null);
    updateListing.mutate(data);
  };

  const selectedSpaces = form.watch("spaces");
  const availability = form.watch("availability") || [];
  const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

  return (
    <div className="max-w-4xl mx-auto">
      <Card>
        <CardHeader>
          <CardTitle>Edit Listing</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
            {error && (
              <div className="p-3 text-sm text-destructive bg-destructive/10 rounded-md">
                <p className="mb-2">{error}</p>
                {error.includes("Stripe onboarding") && (
                  <a href="/host/payouts" className="text-sm underline font-semibold">
                    Go to Host Payouts to enable payouts →
                  </a>
                )}
              </div>
            )}

            {/* Spaces */}
            <div className="space-y-4">
              <h3 className="text-xl font-semibold">Spaces</h3>
              <div className="grid md:grid-cols-2 gap-4">
                {spaceOptions.map((option) => {
                  const Icon = option.icon;
                  const isSelected = selectedSpaces.includes(option.value);
                  return (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => {
                        const current = form.getValues("spaces");
                        if (isSelected) {
                          form.setValue("spaces", current.filter((s) => s !== option.value));
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
            </div>

            {/* Basic Info */}
            <div className="space-y-4">
              <h3 className="text-xl font-semibold">Basic Information</h3>
              <div>
                <Label htmlFor="title">Title</Label>
                <Input id="title" {...form.register("title")} />
                {form.formState.errors.title && (
                  <p className="text-sm text-destructive mt-1">{form.formState.errors.title.message}</p>
                )}
              </div>
              <div>
                <Label htmlFor="description">Description</Label>
                <Textarea id="description" {...form.register("description")} rows={6} />
                {form.formState.errors.description && (
                  <p className="text-sm text-destructive mt-1">{form.formState.errors.description.message}</p>
                )}
              </div>
              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="location_text">Location (Public)</Label>
                  <PlaceAutocomplete
                    id="location_text"
                    value={form.watch("location_text") || ""}
                    onChangeValue={(value) => {
                      form.setValue("location_text", value, { shouldValidate: true });
                    }}
                    onSelectPlace={(place) => {
                      setLocationPlace(place);
                      if (place) {
                        form.setValue("location_text", place.label, { shouldValidate: true });
                      }
                    }}
                    placeholder="e.g., Surry Hills, NSW"
                    country="au"
                  />
                  {form.formState.errors.location_text && (
                    <p className="text-sm text-destructive mt-1">
                      {form.formState.errors.location_text.message}
                    </p>
                  )}
                </div>
                <div>
                  <Label htmlFor="address_text">Address (Private)</Label>
                  <PlaceAutocomplete
                    id="address_text"
                    value={form.watch("address_text") || ""}
                    onChangeValue={(value) => {
                      form.setValue("address_text", value, { shouldValidate: true });
                    }}
                    onSelectPlace={(place) => {
                      setAddressPlace(place);
                      if (place) {
                        form.setValue("address_text", place.label, { shouldValidate: true });
                      }
                    }}
                    placeholder="e.g., 123 Main St, Surry Hills"
                    country="au"
                  />
                  {form.formState.errors.address_text && (
                    <p className="text-sm text-destructive mt-1">
                      {form.formState.errors.address_text.message}
                    </p>
                  )}
                </div>
              </div>
              <div>
                <Label htmlFor="max_guests">Max Guests</Label>
                <Input id="max_guests" type="number" {...form.register("max_guests", { valueAsNumber: true })} />
              </div>
            </div>

            {/* Availability */}
            <div className="space-y-4">
              <h3 className="text-xl font-semibold">Availability</h3>
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
                              { day_of_week: index, start_time: "07:00", end_time: "18:00" },
                            ]);
                          } else {
                            form.setValue("availability", current.filter((a) => a.day_of_week !== index));
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
                            min="07:00"
                            max="18:00"
                            value={dayAvail.start_time}
                            onChange={(e) => {
                              const current = form.getValues("availability");
                              form.setValue(
                                "availability",
                                current.map((a) =>
                                  a.day_of_week === index ? { ...a, start_time: e.target.value } : a
                                )
                              );
                            }}
                          />
                        </div>
                        <div className="flex-1">
                          <Label>End (max 6pm)</Label>
                          <Input
                            type="time"
                            min="07:00"
                            max="18:00"
                            value={dayAvail.end_time}
                            onChange={(e) => {
                              const current = form.getValues("availability");
                              form.setValue(
                                "availability",
                                current.map((a) =>
                                  a.day_of_week === index ? { ...a, end_time: e.target.value } : a
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
            </div>

            {/* Rules */}
            <div className="space-y-4">
              <h3 className="text-xl font-semibold">House Rules</h3>
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="host_present"
                    checked={form.watch("host_present")}
                    onChange={(e) => form.setValue("host_present", e.target.checked)}
                  />
                  <Label htmlFor="host_present" className="cursor-pointer">Host will be present</Label>
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="cooking_allowed"
                    checked={form.watch("cooking_allowed")}
                    onChange={(e) => form.setValue("cooking_allowed", e.target.checked)}
                  />
                  <Label htmlFor="cooking_allowed" className="cursor-pointer">Cooking allowed</Label>
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="alcohol_allowed"
                    checked={form.watch("alcohol_allowed")}
                    onChange={(e) => form.setValue("alcohol_allowed", e.target.checked)}
                  />
                  <Label htmlFor="alcohol_allowed" className="cursor-pointer">Alcohol allowed</Label>
                </div>
                <div>
                  <Label htmlFor="noise_tolerance">Noise Tolerance</Label>
                  <Select id="noise_tolerance" {...form.register("noise_tolerance")}>
                    <option value="LOW">Low</option>
                    <option value="MEDIUM">Medium</option>
                    <option value="HIGH">High</option>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="cleaning_expectations">Cleaning Expectations</Label>
                  <Textarea id="cleaning_expectations" {...form.register("cleaning_expectations")} rows={3} />
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

            {/* Facilities & Supplies */}
            <div className="space-y-4">
              <h3 className="text-xl font-semibold">Facilities & Supplies</h3>
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

                {(form.watch("toilet_access") === "limited" || form.watch("toilet_access") === "none") && (
                  <div>
                    <Label htmlFor="toilet_access_notes">
                      Explain bathroom/toilet arrangements <span className="text-destructive">*</span>
                    </Label>
                    <Textarea
                      id="toilet_access_notes"
                      {...form.register("toilet_access_notes")}
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
                  <h4 className="font-semibold mb-3">Supplies Provided</h4>
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
                  <h4 className="font-semibold mb-2">Consumables Policy</h4>
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

            {/* Pricing */}
            <div className="space-y-4">
              <h3 className="text-xl font-semibold">Pricing</h3>
              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="hourly_rate">Hourly Rate ($)</Label>
                  <Input
                    id="hourly_rate"
                    type="number"
                    step="0.01"
                    {...form.register("hourly_rate", { valueAsNumber: true })}
                  />
                </div>
                <div>
                  <Label htmlFor="half_day_rate">Half-Day Rate ($)</Label>
                  <Input
                    id="half_day_rate"
                    type="number"
                    step="0.01"
                    {...form.register("half_day_rate", { valueAsNumber: true })}
                  />
                </div>
                <div>
                  <Label htmlFor="full_day_rate">Full-Day Rate ($)</Label>
                  <Input
                    id="full_day_rate"
                    type="number"
                    step="0.01"
                    {...form.register("full_day_rate", { valueAsNumber: true })}
                  />
                </div>
                <div>
                  <Label htmlFor="deposit_amount">Deposit ($)</Label>
                  <Input
                    id="deposit_amount"
                    type="number"
                    step="0.01"
                    {...form.register("deposit_amount", { valueAsNumber: true })}
                  />
                </div>
              </div>
            </div>

            {/* Photos */}
            <div className="space-y-6">
              <h3 className="text-xl font-semibold">Photos</h3>
              {selectedSpaces.map((spaceType) => {
                const spaceOption = spaceOptions.find((opt) => opt.value === spaceType);
                const Icon = spaceOption?.icon;
                const spacePhotos = photos.filter((p) => p.spaceType === spaceType);
                const spaceExistingPhotos = existingPhotos.filter((p: any) => 
                  p.storage_path?.includes(spaceType)
                );

                return (
                  <div key={spaceType} className="space-y-3">
                    <div className="flex items-center gap-2">
                      {Icon && <Icon className="h-5 w-5" />}
                      <Label className="text-base font-semibold">{spaceOption?.label} Photos</Label>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                      {spaceExistingPhotos.map((photo: any) => (
                        <div key={photo.id} className="relative aspect-square rounded-lg overflow-hidden border border-border bg-muted">
                          {photo.url ? (
                            <Image src={photo.url} alt="Existing photo" fill className="object-cover" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center">No image</div>
                          )}
                          <button
                            type="button"
                            onClick={() => removeExistingPhoto(photo.id, photo.storage_path)}
                            className="absolute top-2 right-2 p-1 bg-destructive text-destructive-foreground rounded-full hover:bg-destructive/90"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                      ))}
                      {spacePhotos.map((photo, index) => {
                        const globalIndex = photos.findIndex((p) => p === photo);
                        return (
                          <div key={index} className="relative aspect-square rounded-lg overflow-hidden border border-border bg-muted">
                            <Image src={photo.preview} alt="New photo" fill className="object-cover" />
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
                        <span className="text-xs text-muted-foreground text-center px-2">Add Photo</span>
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
            </div>

            {/* Publish */}
            {!listing.published && (
              <div className="space-y-4 p-4 border rounded-lg">
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="published"
                    checked={form.watch("published")}
                    onChange={(e) => form.setValue("published", e.target.checked)}
                  />
                  <Label htmlFor="published" className="cursor-pointer font-semibold">
                    Publish this listing (make it visible to guests)
                  </Label>
                </div>
                {form.watch("published") && (
                  <div className="space-y-2 pl-6">
                    <div className="flex items-start gap-2">
                      <Checkbox
                        id="hostDeclarationConfirmed"
                        checked={hostDeclarationConfirmed}
                        onChange={(e) => {
                          setHostDeclarationConfirmed(e.target.checked);
                          form.setValue("hostDeclarationConfirmed", e.target.checked);
                        }}
                      />
                      <Label htmlFor="hostDeclarationConfirmed" className="cursor-pointer text-sm">
                        {hostDeclarationCheckboxLabel}
                      </Label>
                    </div>
                    {form.watch("published") && !hostDeclarationConfirmed && (
                      <p className="text-sm text-destructive ml-6">
                        You must confirm the Host Declaration to publish.
                      </p>
                    )}
                    <Button
                      type="button"
                      variant="link"
                      className="text-sm p-0 h-auto ml-6"
                      onClick={() => setShowDeclarationModal(true)}
                    >
                      Review Host Declaration
                    </Button>
                  </div>
                )}
              </div>
            )}
            {listing.published && (
              <div className="p-4 bg-muted rounded-lg">
                <p className="text-sm font-semibold">This listing is published</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Uncheck &quot;Publish&quot; below to unpublish it.
                </p>
                <div className="flex items-center gap-2 mt-3">
                  <Checkbox
                    id="published"
                    checked={form.watch("published")}
                    onChange={(e) => form.setValue("published", e.target.checked)}
                  />
                  <Label htmlFor="published" className="cursor-pointer font-semibold">
                    Publish this listing (make it visible to guests)
                  </Label>
                </div>
              </div>
            )}

            <div className="flex gap-4">
              <Button type="button" variant="outline" onClick={() => router.back()}>
                Cancel
              </Button>
              <Button type="submit" disabled={updateListing.isPending || uploading} className="ml-auto">
                {uploading ? "Uploading..." : updateListing.isPending ? "Saving..." : "Save Changes"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
      <HostDeclarationModal
        open={showDeclarationModal}
        onConfirm={() => {
          setShowDeclarationModal(false);
          setHostDeclarationConfirmed(true);
          form.setValue("hostDeclarationConfirmed", true);
        }}
        onCancel={() => setShowDeclarationModal(false)}
      />
    </div>
  );
}
