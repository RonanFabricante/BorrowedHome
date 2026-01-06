/**
 * Seed script for BorrowedHome
 * 
 * Run this after setting up Supabase and running migrations.
 * 
 * Usage:
 *   npx tsx scripts/seed.ts
 * 
 * Or with environment variables:
 *   NEXT_PUBLIC_SUPABASE_URL=... NEXT_PUBLIC_SUPABASE_ANON_KEY=... npx tsx scripts/seed.ts
 */

import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing Supabase environment variables");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function seed() {
  console.log("🌱 Starting seed...");

  // Create test users (you'll need to create these in Supabase Auth first)
  // For now, we'll assume you have test users with IDs
  // In production, you'd create these via Supabase Auth API

  console.log("📝 Note: You need to create test users in Supabase Auth first.");
  console.log("   Then update the user IDs in this script.");

  // Example: Create a host profile (replace with actual user ID from Supabase Auth)
  const hostUserId = "534d3b9b-e9da-4c7a-ac09-76e46ac7c2c3"; // Replace with real UUID
  const guestUserId = "534d3b9b-e9da-4c7a-ac09-76e46ac7c2c3"; // Replace with real UUID

  try {
    // Create host profile
    const { error: hostError } = await supabase.from("profiles").upsert({
      id: hostUserId,
      full_name: "Test Host",
      is_host: true,
      is_guest: false,
    });

    if (hostError && !hostError.message.includes("duplicate")) {
      console.error("Error creating host profile:", hostError);
    } else {
      console.log("✅ Host profile created");
    }

    // Create guest profile
    const { error: guestError } = await supabase.from("profiles").upsert({
      id: guestUserId,
      full_name: "Test Guest",
      is_host: false,
      is_guest: true,
    });

    if (guestError && !guestError.message.includes("duplicate")) {
      console.error("Error creating guest profile:", guestError);
    } else {
      console.log("✅ Guest profile created");
    }

    // Create a sample listing
    const { data: listing, error: listingError } = await supabase
      .from("listings")
      .insert({
        host_id: hostUserId,
        title: "Cozy Family Home in Downtown",
        description:
          "A warm, lived-in home perfect for family gatherings, small events, or team meetings. Features a fully equipped kitchen, spacious dining area, comfortable living room, and beautiful garden space.",
        location_text: "Downtown, Seattle",
        address_text: "123 Main Street, Seattle, WA 98101",
        max_guests: 12,
        host_present: false,
        noise_tolerance: "MEDIUM",
        cooking_allowed: true,
        alcohol_allowed: true,
        cleaning_expectations: "Please wash dishes and wipe surfaces",
        hourly_rate: 5000, // $50/hour in cents
        half_day_rate: 18000, // $180 for 4 hours
        full_day_rate: 32000, // $320 for 8 hours
        deposit_amount: 10000, // $100 deposit
        published: true,
      })
      .select()
      .single();

    if (listingError) {
      console.error("Error creating listing:", listingError);
      return;
    }

    console.log("✅ Listing created:", listing.id);

    // Add spaces
    const { error: spacesError } = await supabase
      .from("listing_spaces")
      .insert([
        { listing_id: listing.id, space_type: "KITCHEN" },
        { listing_id: listing.id, space_type: "DINING" },
        { listing_id: listing.id, space_type: "LIVING" },
        { listing_id: listing.id, space_type: "GARDEN" },
      ]);

    if (spacesError) {
      console.error("Error creating spaces:", spacesError);
    } else {
      console.log("✅ Spaces added");
    }

    // Add availability (Monday to Friday, 9am-9pm)
    const availability = [1, 2, 3, 4, 5].map((day) => ({
      listing_id: listing.id,
      day_of_week: day,
      start_time: "09:00:00",
      end_time: "21:00:00",
    }));

    const { error: availError } = await supabase
      .from("listing_availability")
      .insert(availability);

    if (availError) {
      console.error("Error creating availability:", availError);
    } else {
      console.log("✅ Availability set");
    }

    // Create a second listing
    const { data: listing2, error: listing2Error } = await supabase
      .from("listings")
      .insert({
        host_id: hostUserId,
        title: "Modern Apartment with City Views",
        description:
          "Stylish apartment in the heart of the city. Perfect for small gatherings, work sessions, or intimate events. Kitchen and living area available.",
        location_text: "Midtown, New York",
        address_text: "456 Park Avenue, New York, NY 10001",
        max_guests: 8,
        host_present: true,
        noise_tolerance: "LOW",
        cooking_allowed: true,
        alcohol_allowed: false,
        cleaning_expectations: "Clean up after yourself",
        hourly_rate: 4000, // $40/hour
        half_day_rate: 14000, // $140 for 4 hours
        full_day_rate: 25000, // $250 for 8 hours
        deposit_amount: 5000, // $50 deposit
        published: true,
      })
      .select()
      .single();

    if (listing2Error) {
      console.error("Error creating second listing:", listing2Error);
    } else {
      console.log("✅ Second listing created:", listing2.id);

      // Add spaces for second listing
      await supabase.from("listing_spaces").insert([
        { listing_id: listing2.id, space_type: "KITCHEN" },
        { listing_id: listing2.id, space_type: "LIVING" },
      ]);

      // Add availability (Weekends, 10am-8pm)
      await supabase.from("listing_availability").insert([
        {
          listing_id: listing2.id,
          day_of_week: 0, // Sunday
          start_time: "10:00:00",
          end_time: "20:00:00",
        },
        {
          listing_id: listing2.id,
          day_of_week: 6, // Saturday
          start_time: "10:00:00",
          end_time: "20:00:00",
        },
      ]);

      console.log("✅ Second listing configured");
    }

    console.log("\n✅ Seed completed!");
    console.log("\n📝 Next steps:");
    console.log("   1. Create test users in Supabase Auth");
    console.log("   2. Update user IDs in this script if needed");
    console.log("   3. Upload photos to Supabase Storage (bucket: listing-photos)");
    console.log("   4. Link photos to listings in listing_photos table");
  } catch (error) {
    console.error("❌ Seed failed:", error);
    process.exit(1);
  }
}

seed();
