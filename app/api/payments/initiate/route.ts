import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { stripe, PLATFORM_FEE_PERCENTAGE } from "@/lib/stripe/server";
import { checkAccountStatus, computeOnboardingStatus, findStripeAccountByUserId } from "@/lib/stripe/connect";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { bookingId } = await request.json();

    if (!bookingId) {
      return NextResponse.json({ error: "bookingId is required" }, { status: 400 });
    }

    // Fetch booking and listing
    const { data: booking, error: bookingError } = await supabase
      .from("bookings")
      .select(`
        *,
        listings!inner(
          id,
          host_id,
          deposit_amount
        )
      `)
      .eq("id", bookingId)
      .eq("status", "CONFIRMED")
      .single();

    if (bookingError || !booking) {
      return NextResponse.json(
        { error: "Booking not found or not confirmed" },
        { status: 404 }
      );
    }

    // Check if payment already exists
    const { data: existingPayment } = await supabase
      .from("payments")
      .select("*")
      .eq("booking_id", bookingId)
      .single();

    if (existingPayment) {
      return NextResponse.json({
        paymentIntentId: existingPayment.stripe_payment_intent_id,
        depositIntentId: existingPayment.stripe_deposit_intent_id,
        clientSecret: null, // Payment already initiated
      });
    }

    // Check if host has completed Stripe onboarding
    let { data: host, error: hostError } = await supabase
      .from("hosts")
      .select("*")
      .eq("user_id", booking.listings.host_id)
      .single();

    // If host record doesn't exist or is missing stripe_account_id, try to find it in Stripe
    // Search if: host not found (PGRST116) OR host exists but stripe_account_id is missing OR any other error
    const needsStripeSearch = (hostError?.code === "PGRST116") || !host || (host && !host.stripe_account_id);
    
    if (needsStripeSearch) {
      console.log(`[Payment Initiate] Host record missing or stripe_account_id not found for user ${booking.listings.host_id}, searching Stripe...`);
      
      try {
        // Use helper function to find Stripe account (searches with pagination)
        const foundAccountId = await findStripeAccountByUserId(booking.listings.host_id);

        if (foundAccountId) {
          // Found the account - check status and sync database
          console.log(`[Payment Initiate] Found Stripe account ${foundAccountId} for user ${booking.listings.host_id}`);
          
          // Get full account status from Stripe
          const status = await checkAccountStatus({ accountId: foundAccountId });
          const onboardingStatus = computeOnboardingStatus(status);
          
          // Verify account is actually ready
          if (!status.charges_enabled || !status.payouts_enabled) {
            console.log(`[Payment Initiate] Stripe account found but not ready:`, {
              charges_enabled: status.charges_enabled,
              payouts_enabled: status.payouts_enabled,
              currently_due: status.currently_due.length,
            });
            // Still sync to database so status is updated
          }
          
          if (!host) {
            // Create host record with full status
            const { data: newHost, error: createError } = await supabase
              .from("hosts")
              .insert({
                user_id: booking.listings.host_id,
                stripe_account_id: foundAccountId,
                stripe_charges_enabled: status.charges_enabled,
                stripe_payouts_enabled: status.payouts_enabled,
                stripe_requirements_due: status.currently_due.length > 0 ? status.currently_due : null,
                stripe_onboarding_status: onboardingStatus,
              })
              .select()
              .single();
            
            if (createError) {
              console.error("[Payment Initiate] Failed to create host record:", createError);
              throw new Error(`Failed to sync Stripe account to database: ${createError.message}`);
            } else {
              host = newHost;
            }
          } else {
            // Update existing host record with full status
            const { data: updatedHost, error: updateError } = await supabase
              .from("hosts")
              .update({
                stripe_account_id: foundAccountId,
                stripe_charges_enabled: status.charges_enabled,
                stripe_payouts_enabled: status.payouts_enabled,
                stripe_requirements_due: status.currently_due.length > 0 ? status.currently_due : null,
                stripe_onboarding_status: onboardingStatus,
              })
              .eq("user_id", booking.listings.host_id)
              .select()
              .single();
            
            if (updateError) {
              console.error("[Payment Initiate] Failed to update host record:", updateError);
              throw new Error(`Failed to sync Stripe account to database: ${updateError.message}`);
            } else if (!updatedHost) {
              throw new Error("Failed to update host record: no data returned");
            } else {
              host = updatedHost;
            }
          }
          
          // If account is not ready, return error
          if (!status.charges_enabled || !status.payouts_enabled || status.currently_due.length > 0) {
            return NextResponse.json(
              { 
                error: "Host Stripe account is not fully enabled yet",
                details: `Charges enabled: ${status.charges_enabled}, Payouts enabled: ${status.payouts_enabled}, Requirements due: ${status.currently_due.length}`
              },
              { status: 400 }
            );
          }
        } else {
          // Account not found in Stripe - host needs to complete onboarding OR sync their account
          console.log(`[Payment Initiate] No Stripe account found with metadata.user_id = ${booking.listings.host_id} after searching`);
          
          // If host record exists but stripe_account_id is missing, suggest syncing
          if (host && !host.stripe_account_id) {
            return NextResponse.json(
              { 
                error: "Host Stripe account not found in database. The host should visit /host/payouts to sync their Stripe account. If they completed Stripe onboarding, visiting /host/payouts will automatically sync the account.",
                code: "STRIPE_ACCOUNT_NOT_SYNCED"
              },
              { status: 400 }
            );
          }
          
          // Host record doesn't exist - create it
          if (!host) {
            await supabase.from("hosts").insert({
              user_id: booking.listings.host_id,
              stripe_onboarding_status: "not_started",
            });
          }
          
          return NextResponse.json(
            { error: "Host must complete Stripe onboarding. Please visit /host/payouts to set up your account." },
            { status: 400 }
          );
        }
      } catch (stripeError: any) {
        console.error("[Payment Initiate] Error searching Stripe accounts:", stripeError);
        return NextResponse.json(
          { error: stripeError.message || "Unable to verify host Stripe account. Please visit /host/payouts to complete onboarding." },
          { status: 500 }
        );
      }
    }

    // At this point, host should exist and have stripe_account_id
    if (!host || !host.stripe_account_id) {
      return NextResponse.json(
        { error: "Host Stripe account not found. Please visit /host/payouts to complete onboarding." },
        { status: 400 }
      );
    }

    // If database status is not complete, check Stripe directly (source of truth)
    // This handles cases where the database might be out of sync with Stripe
    if (!host.stripe_onboarding_status || host.stripe_onboarding_status !== "complete") {
      console.log(`[Payment Initiate] Database shows status "${host.stripe_onboarding_status}", checking Stripe directly...`);
      
      // Verify with Stripe directly - database might be out of sync
      const status = await checkAccountStatus({ accountId: host.stripe_account_id });
      
      // Check if account is actually ready (charges and payouts enabled, no requirements due)
      if (status.charges_enabled && status.payouts_enabled && status.currently_due.length === 0) {
        // Account is ready in Stripe - update database and proceed
        console.log(`[Payment Initiate] Stripe account is ready, updating database...`);
        const onboardingStatus = computeOnboardingStatus(status);
        const { error: updateError } = await supabase
          .from("hosts")
          .update({
            stripe_charges_enabled: status.charges_enabled,
            stripe_payouts_enabled: status.payouts_enabled,
            stripe_requirements_due: status.currently_due.length > 0 ? status.currently_due : null,
            stripe_onboarding_status: onboardingStatus,
          })
          .eq("user_id", booking.listings.host_id);
        
        if (updateError) {
          console.error("[Payment Initiate] Failed to update host status:", updateError);
          // Continue anyway since Stripe confirms account is ready
        }
        
        // Continue with payment initiation
      } else {
        // Account is not ready in Stripe either
        console.log(`[Payment Initiate] Stripe account not ready:`, {
          charges_enabled: status.charges_enabled,
          payouts_enabled: status.payouts_enabled,
          currently_due_count: status.currently_due.length,
        });
        
        return NextResponse.json(
          { 
            error: "Host must complete Stripe onboarding before accepting bookings",
            details: status.currently_due.length > 0 
              ? `Please complete: ${status.currently_due.join(", ")}`
              : "Account capabilities are not enabled yet"
          },
          { status: 400 }
        );
      }
    }

    // Calculate amounts
    const bookingAmount = booking.total_amount - booking.platform_fee_amount; // Base amount
    const platformFee = booking.platform_fee_amount;
    const totalAmount = bookingAmount + platformFee;
    const depositAmount = booking.deposit_amount || 0;

    // Create PaymentIntent for booking + platform fee
    const paymentIntent = await stripe.paymentIntents.create({
      amount: totalAmount,
      currency: "aud",
      capture_method: "manual",
      payment_method_types: ["card"],
      metadata: {
        booking_id: bookingId,
        listing_id: booking.listings.id,
        host_id: booking.listings.host_id,
        guest_id: booking.guest_id,
        type: "booking",
      },
    });

    let depositIntentId: string | null = null;

    // Create deposit PaymentIntent if deposit is required
    if (depositAmount > 0) {
      const depositIntent = await stripe.paymentIntents.create({
        amount: depositAmount,
        currency: "aud",
        capture_method: "manual",
        payment_method_types: ["card"],
        metadata: {
          booking_id: bookingId,
          listing_id: booking.listings.id,
          host_id: booking.listings.host_id,
          guest_id: booking.guest_id,
          type: "deposit",
        },
      });
      depositIntentId = depositIntent.id;
    }

    // Store payment record
    const { error: paymentError } = await supabase
      .from("payments")
      .insert({
        booking_id: bookingId,
        stripe_payment_intent_id: paymentIntent.id,
        stripe_deposit_intent_id: depositIntentId,
        amount: totalAmount,
        deposit_amount: depositAmount,
        status: "pending",
      });

    if (paymentError) {
      // Clean up Stripe intents if DB insert fails
      await stripe.paymentIntents.cancel(paymentIntent.id);
      if (depositIntentId) {
        await stripe.paymentIntents.cancel(depositIntentId);
      }
      throw paymentError;
    }

    return NextResponse.json({
      paymentIntentId: paymentIntent.id,
      depositIntentId,
      clientSecret: paymentIntent.client_secret,
      depositClientSecret: depositIntentId
        ? (await stripe.paymentIntents.retrieve(depositIntentId)).client_secret
        : null,
    });
  } catch (error: any) {
    console.error("Payment initiation error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to initiate payment" },
      { status: 500 }
    );
  }
}
