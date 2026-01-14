// Supabase Edge Function: Expire Unpaid Bookings
// Expires bookings that are PAYMENT_PENDING past their payment deadline
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

    console.log("[ExpireBookings] Starting expiry check");

    // Call the database function to expire unpaid bookings
    const { data, error } = await supabase.rpc("expire_unpaid_bookings");

    if (error) {
      console.error("[ExpireBookings] Error:", error);
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

    const expiredCount = data?.[0]?.expired_count || 0;
    const expiredIds = data?.[0]?.expired_ids || [];

    console.log(`[ExpireBookings] Expired ${expiredCount} bookings:`, expiredIds);

    // Log events for each expired booking (idempotent - log_booking_event handles duplicates)
    if (expiredCount > 0) {
      for (const bookingId of expiredIds) {
        try {
          await supabase.rpc("log_booking_event", {
            p_booking_id: bookingId,
            p_event_type: "EXPIRED",
            p_actor_id: null, // System event
            p_payload: { reason: "payment_deadline_passed" },
          });
        } catch (eventError) {
          // Log but don't fail - event logging is best effort
          console.error(`[ExpireBookings] Failed to log event for booking ${bookingId}:`, eventError);
        }
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: "Booking expiry check completed",
        expired_count: expiredCount,
        expired_ids: expiredIds,
        timestamp: new Date().toISOString(),
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error: any) {
    console.error("[ExpireBookings] Unexpected error:", error);
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
