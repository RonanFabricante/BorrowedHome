// Supabase Edge Function: Expire Unpaid Bookings
// Expires bookings that are PAYMENT_PENDING past their payment deadline
// Cancels Stripe holds and notifies guests
// Runs every 5 minutes via Supabase scheduler

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function getCronSecret(): string {
  // Prefer CRON_SECRET; accept SUPABASE_CRON_SECRET for older deployments/docs
  return (
    Deno.env.get("CRON_SECRET") ||
    Deno.env.get("SUPABASE_CRON_SECRET") ||
    ""
  );
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("authorization") ?? "";
    const cronSecret = getCronSecret();

    if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
      console.error("[CRON] Unauthorized request");
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const stripeSecretKey = Deno.env.get("STRIPE_SECRET_KEY");
    const siteUrl =
      Deno.env.get("SITE_URL") ||
      Deno.env.get("NEXT_PUBLIC_SITE_URL") ||
      "";

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
    const expiredIds: string[] = data?.[0]?.expired_ids || [];

    console.log(
      `[ExpireBookings] Expired ${expiredCount} bookings:`,
      expiredIds
    );

    if (expiredCount > 0) {
      for (const bookingId of expiredIds) {
        try {
          await supabase.rpc("log_booking_event", {
            p_booking_id: bookingId,
            p_event_type: "EXPIRED",
            p_actor_id: null,
            p_payload: { reason: "payment_deadline_passed" },
          });
        } catch (eventError) {
          console.error(
            `[ExpireBookings] Failed to log event for booking ${bookingId}:`,
            eventError
          );
        }
      }

      // Cancel Stripe holds + email guests via the Next.js cleanup route when
      // available; otherwise cancel intents directly from this function.
      if (siteUrl) {
        try {
          const cleanupRes = await fetch(
            `${siteUrl.replace(/\/$/, "")}/api/bookings/expire-notifications`,
            {
              method: "POST",
              headers: {
                Authorization: `Bearer ${cronSecret}`,
                "Content-Type": "application/json",
              },
            }
          );
          if (!cleanupRes.ok) {
            console.error(
              "[ExpireBookings] expire-notifications failed:",
              await cleanupRes.text()
            );
          }
        } catch (cleanupError) {
          console.error(
            "[ExpireBookings] Failed to call expire-notifications:",
            cleanupError
          );
        }
      } else if (stripeSecretKey) {
        for (const bookingId of expiredIds) {
          try {
            const { data: payment } = await supabase
              .from("payments")
              .select(
                "id, status, stripe_payment_intent_id, stripe_deposit_intent_id, deposit_released_at"
              )
              .eq("booking_id", bookingId)
              .maybeSingle();

            if (!payment || payment.status === "captured") continue;

            for (const intentId of [
              payment.stripe_payment_intent_id,
              payment.stripe_deposit_intent_id,
            ]) {
              if (!intentId) continue;
              const intentRes = await fetch(
                `https://api.stripe.com/v1/payment_intents/${intentId}`,
                {
                  headers: { Authorization: `Bearer ${stripeSecretKey}` },
                }
              );
              if (!intentRes.ok) continue;
              const intent = await intentRes.json();
              if (
                intent.status !== "canceled" &&
                intent.status !== "succeeded"
              ) {
                await fetch(
                  `https://api.stripe.com/v1/payment_intents/${intentId}/cancel`,
                  {
                    method: "POST",
                    headers: {
                      Authorization: `Bearer ${stripeSecretKey}`,
                    },
                  }
                );
              }
            }

            await supabase
              .from("payments")
              .update({
                status: "released",
                ...(payment.stripe_deposit_intent_id &&
                !payment.deposit_released_at
                  ? { deposit_released_at: new Date().toISOString() }
                  : {}),
              })
              .eq("id", payment.id)
              .neq("status", "captured");
          } catch (stripeError) {
            console.error(
              `[ExpireBookings] Stripe cleanup failed for ${bookingId}:`,
              stripeError
            );
          }
        }
      } else {
        console.warn(
          "[ExpireBookings] No SITE_URL or STRIPE_SECRET_KEY; Stripe holds not cancelled"
        );
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
