import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { stripe, PLATFORM_FEE_PERCENTAGE } from "@/lib/stripe/server";
import { checkAccountStatus, computeOnboardingStatus, findStripeAccountByUserId } from "@/lib/stripe/connect";
import { isPaymentPending, normalizeBookingStatus } from "@/lib/bookingStatus";
import { validateStripeAmountCents } from "@/lib/payments/stripeMinAmount";
import { DEFAULT_CURRENCY, normalizeCurrency } from "@/lib/currency";

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
      .single();

    if (bookingError || !booking) {
      return NextResponse.json(
        { error: "Booking not found" },
        { status: 404 }
      );
    }

    // Guests only: ensure this booking belongs to the authenticated guest
    if (booking.guest_id !== user.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const status = normalizeBookingStatus(booking.status);
    const allowedForPayment = status === "CONFIRMED" || status === "PAYMENT_PENDING";

    if (!allowedForPayment) {
      return NextResponse.json(
        { error: `Booking is not awaiting payment. Status: ${status || "UNKNOWN"}` },
        { status: 400 }
      );
    }

    if (process.env.NODE_ENV !== "production") {
      console.log("[Payment Initiate] Booking loaded:", {
        bookingId,
        status,
        guestId: booking.guest_id,
        hostId: (booking.listings as any)?.host_id,
      });
    }

    // Extract listings with type assertion (Supabase returns object with .single())
    // Cast through unknown to handle TypeScript's array inference
    const listings = booking.listings as unknown as { host_id: string; id: string; deposit_amount: number };

    // Check if payment already exists
    const { data: existingPayment } = await supabase
      .from("payments")
      .select("*")
      .eq("booking_id", bookingId)
      .single();

    if (existingPayment) {
      // Payment already exists - retrieve client_secret from Stripe
      const paymentIntent = await stripe.paymentIntents.retrieve(
        existingPayment.stripe_payment_intent_id
      );
      
      let depositClientSecret: string | null = null;
      if (existingPayment.stripe_deposit_intent_id) {
        const depositIntent = await stripe.paymentIntents.retrieve(
          existingPayment.stripe_deposit_intent_id
        );
        depositClientSecret = depositIntent.client_secret;
      }

      return NextResponse.json({
        paymentIntentId: existingPayment.stripe_payment_intent_id,
        depositIntentId: existingPayment.stripe_deposit_intent_id,
        clientSecret: paymentIntent.client_secret,
        depositClientSecret,
      });
    }

    // If we reached here, there is no payment row yet. This must only happen while awaiting payment.
    // (Host accept flow should set PAYMENT_PENDING before the guest can initiate.)
    if (!isPaymentPending(booking)) {
      return NextResponse.json(
        { error: `Payment has not been requested for this booking yet. Status: ${status || "UNKNOWN"}` },
        { status: 400 }
      );
    }

    // Check if host has completed Stripe onboarding
    let { data: host, error: hostError } = await supabase
      .from("hosts")
      .select("*")
      .eq("user_id", listings.host_id)
      .single();

    // Handle RLS errors - if we can't read the host record, it might be an RLS issue
    // This can happen if migration 014 hasn't been run yet
    if (hostError && hostError.code !== "PGRST116") {
      console.error("[Payment Initiate] Error reading host record:", {
        code: hostError.code,
        message: hostError.message,
        details: hostError.details,
        hint: hostError.hint
      });
      
      // Check if it's an RLS/permission error
      const errorMessage = hostError.message || "";
      const errorDetails = hostError.details || "";
      const isRlsError = 
        errorMessage.toLowerCase().includes("row-level security") ||
        errorMessage.toLowerCase().includes("permission denied") ||
        errorMessage.toLowerCase().includes("policy") ||
        errorDetails.toLowerCase().includes("row-level security") ||
        hostError.code === "42501"; // PostgreSQL permission denied code
      
      if (isRlsError) {
        return NextResponse.json(
          { 
            error: "Unable to verify host Stripe account due to database permissions. The host should visit /host/payouts to ensure their Stripe account is properly synced. If this issue persists, please contact support.",
            code: "RLS_ERROR",
            details: "This may require running database migration 014_allow_guests_read_host_stripe_status.sql"
          },
          { status: 403 }
        );
      }
      
      // Other database errors
      return NextResponse.json(
        { 
          error: `Unable to verify host Stripe account: ${errorMessage || "Database error"}. The host should visit /host/payouts to ensure their account is set up.`,
          code: "DATABASE_ERROR"
        },
        { status: 500 }
      );
    }

    // If host record doesn't exist or is missing stripe_account_id, try to find it in Stripe
    // Search if: host not found (PGRST116) OR host exists but stripe_account_id is missing OR any other error
    const needsStripeSearch = (hostError?.code === "PGRST116") || !host || (host && !host.stripe_account_id);
    
    if (needsStripeSearch) {
      console.log(`[Payment Initiate] Host record missing or stripe_account_id not found for user ${listings.host_id}, searching Stripe...`);
      
      try {
        // Use helper function to find Stripe account (searches with pagination)
        const foundAccountId = await findStripeAccountByUserId(listings.host_id);

        if (foundAccountId) {
          // Found the account in Stripe - verify it's ready
          console.log(`[Payment Initiate] Found Stripe account ${foundAccountId} for user ${listings.host_id}`);
          
          // Get full account status from Stripe (we cannot update database as guest due to RLS)
          const status = await checkAccountStatus({ accountId: foundAccountId });
          
          // Verify account is actually ready
          if (!status.charges_enabled || !status.payouts_enabled || status.currently_due.length > 0) {
            return NextResponse.json(
              { 
                error: "Host Stripe account exists but is not fully enabled yet. The host should visit /host/payouts to complete setup.",
                details: `Charges enabled: ${status.charges_enabled}, Payouts enabled: ${status.payouts_enabled}, Requirements due: ${status.currently_due.length}`
              },
              { status: 400 }
            );
          }
          
          // Account is ready in Stripe but not synced to database
          // Host needs to visit /host/payouts to sync (they can do this themselves, which will work with RLS)
          return NextResponse.json(
            { 
              error: "Host Stripe account exists but needs to be synced. The host should visit /host/payouts to sync their account before accepting payments.",
              code: "STRIPE_ACCOUNT_NOT_SYNCED"
            },
            { status: 400 }
          );
        } else {
          // Account not found in Stripe - host needs to complete onboarding
          console.log(`[Payment Initiate] No Stripe account found with metadata.user_id = ${listings.host_id} after searching`);
          
          return NextResponse.json(
            { error: "Host must complete Stripe onboarding. Please contact the host to visit /host/payouts to set up their account." },
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
    // Note: We cannot update the database as a guest due to RLS, but we can verify Stripe status
    if (!host.stripe_onboarding_status || host.stripe_onboarding_status !== "complete") {
      console.log(`[Payment Initiate] Database shows status "${host.stripe_onboarding_status}", checking Stripe directly...`);
      
      // Verify with Stripe directly - database might be out of sync
      const status = await checkAccountStatus({ accountId: host.stripe_account_id });
      
      // Check if account is actually ready (charges and payouts enabled, no requirements due)
      if (status.charges_enabled && status.payouts_enabled && status.currently_due.length === 0) {
        // Account is ready in Stripe - proceed with payment even if database status is out of sync
        // The host can visit /host/payouts to sync their status later
        console.log(`[Payment Initiate] Stripe account is ready, proceeding despite database status mismatch`);
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
              : "Account capabilities are not enabled yet. The host should visit /host/payouts to complete setup."
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
    const currency = normalizeCurrency(booking.currency || DEFAULT_CURRENCY);

    const totalError = validateStripeAmountCents(totalAmount, { currency });
    if (totalError) {
      return NextResponse.json({ error: totalError }, { status: 400 });
    }
    const depositError = validateStripeAmountCents(depositAmount, {
      allowZero: true,
      currency,
    });
    if (depositError) {
      return NextResponse.json({ error: depositError }, { status: 400 });
    }

    // A Stripe Customer is required so the card used for the booking payment
    // can be reused server-side to place the separate deposit hold.
    const customer = await stripe.customers.create({
      metadata: {
        user_id: booking.guest_id,
        booking_id: bookingId,
      },
    });

    // Create PaymentIntent for booking + platform fee
    const paymentIntent = await stripe.paymentIntents.create({
      amount: totalAmount,
      currency,
      capture_method: "manual",
      payment_method_types: ["card"],
      customer: customer.id,
      // Attach the card to the customer on confirmation so the deposit
      // intent can be confirmed with the same payment method.
      setup_future_usage: "off_session",
      metadata: {
        booking_id: bookingId,
        listing_id: listings.id,
        host_id: listings.host_id,
        guest_id: booking.guest_id,
        type: "booking",
      },
    });

    let depositIntentId: string | null = null;

    // Create deposit PaymentIntent if deposit is required
    if (depositAmount > 0) {
      const depositIntent = await stripe.paymentIntents.create({
        amount: depositAmount,
        currency,
        capture_method: "manual",
        payment_method_types: ["card"],
        customer: customer.id,
        metadata: {
          booking_id: bookingId,
          listing_id: listings.id,
          host_id: listings.host_id,
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
        currency,
        status: "pending",
      });

    if (paymentError) {
      // Clean up Stripe intents if DB insert fails
      await stripe.paymentIntents.cancel(paymentIntent.id);
      if (depositIntentId) {
        await stripe.paymentIntents.cancel(depositIntentId);
      }

      // Unique violation on booking_id means a concurrent request won the
      // race; return that payment's intents instead of failing.
      if (paymentError.code === "23505") {
        const { data: concurrentPayment } = await supabase
          .from("payments")
          .select("*")
          .eq("booking_id", bookingId)
          .single();

        if (concurrentPayment) {
          const existingIntent = await stripe.paymentIntents.retrieve(
            concurrentPayment.stripe_payment_intent_id
          );
          let existingDepositSecret: string | null = null;
          if (concurrentPayment.stripe_deposit_intent_id) {
            const existingDeposit = await stripe.paymentIntents.retrieve(
              concurrentPayment.stripe_deposit_intent_id
            );
            existingDepositSecret = existingDeposit.client_secret;
          }

          return NextResponse.json({
            paymentIntentId: concurrentPayment.stripe_payment_intent_id,
            depositIntentId: concurrentPayment.stripe_deposit_intent_id,
            clientSecret: existingIntent.client_secret,
            depositClientSecret: existingDepositSecret,
          });
        }
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
