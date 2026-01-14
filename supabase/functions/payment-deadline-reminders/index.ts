// Supabase Edge Function: Payment Deadline Reminders
// Creates notifications for guests when payment deadline is within 60 minutes
// Runs every 5 minutes via Supabase scheduler

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Verify authentication
    const authHeader = req.headers.get("authorization") ?? "";
    const cronSecret = Deno.env.get("CRON_SECRET") ?? "";

    if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
      console.error("[CRON] Unauthorized request");
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Initialize Supabase client with service role key
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !supabaseServiceRoleKey) {
      throw new Error(
        "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables"
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    console.log("[PaymentDeadlineReminders] Starting reminder check");

    const now = new Date();
    const sixtyMinutesFromNow = new Date(now.getTime() + 60 * 60 * 1000);

    // Find PAYMENT_PENDING bookings with deadline within next 60 minutes
    const { data: bookings, error } = await supabase
      .from("bookings")
      .select(`
        id,
        guest_id,
        payment_deadline_at,
        listings!inner(
          id,
          title
        )
      `)
      .eq("status", "PAYMENT_PENDING")
      .not("payment_deadline_at", "is", null)
      .gte("payment_deadline_at", now.toISOString())
      .lte("payment_deadline_at", sixtyMinutesFromNow.toISOString());

    if (error) {
      console.error("[PaymentDeadlineReminders] Error:", error);
      return new Response(
        JSON.stringify({
          success: false,
          error: error.message,
          timestamp: new Date().toISOString(),
        }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    let createdCount = 0;

    // Create notifications for each booking (idempotent via dedupe_key)
    if (bookings && bookings.length > 0) {
      for (const booking of bookings) {
        const listing = booking.listings as unknown as { title: string };
        
        try {
          const { error: notifError } = await supabase.rpc("create_notification", {
            p_user_id: booking.guest_id,
            p_type: "PAYMENT_DEADLINE_SOON",
            p_title: "Payment deadline in 1 hour",
            p_href: `/bookings/${booking.id}/confirm?action=pay`,
            p_dedupe_key: `booking:${booking.id}:deadline_soon`,
            p_body: `Complete payment for "${listing.title}" to confirm your booking`,
            p_entity_type: "booking",
            p_entity_id: booking.id,
          });

          if (notifError) {
            // If it's a duplicate (unique constraint violation), that's fine (idempotent)
            if (!notifError.message.includes("duplicate") && !notifError.message.includes("unique")) {
              console.error(`[PaymentDeadlineReminders] Failed to create notification for booking ${booking.id}:`, notifError);
            }
          } else {
            createdCount++;
          }
        } catch (notifError: any) {
          console.error(`[PaymentDeadlineReminders] Error creating notification for booking ${booking.id}:`, notifError);
        }
      }
    }

    console.log(`[PaymentDeadlineReminders] Created ${createdCount} reminder notifications`);

    return new Response(
      JSON.stringify({
        success: true,
        message: "Payment deadline reminders check completed",
        created_count: createdCount,
        timestamp: new Date().toISOString(),
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error: any) {
    console.error("[PaymentDeadlineReminders] Unexpected error:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message || "Internal server error",
        timestamp: new Date().toISOString(),
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
