# Stripe Connect Payments Implementation

## Overview

BorrowedHome now integrates Stripe Connect for payment processing. Payments are only initiated after a host accepts a booking request, and deposits are handled via manual capture.

## Database Schema

### `payments` table
- Tracks Stripe PaymentIntents for each booking
- Stores both booking payment and deposit (if applicable)
- Status flow: `pending` → `authorised` → `captured` / `released`

### `host_stripe_accounts` table
- Stores Stripe Connect Express account IDs for hosts
- Tracks onboarding completion status
- Required before hosts can accept bookings

## Payment Flow

1. **Guest submits booking request**
   - Booking created with status `PENDING`
   - No payment at this stage

2. **Host accepts booking**
   - Booking status → `CONFIRMED`
   - Host must have completed Stripe onboarding
   - Payment initiation is triggered (frontend calls `/api/payments/initiate`)

3. **Payment initiation** (`/api/payments/initiate`)
   - Creates Stripe PaymentIntent for booking amount + platform fee (12%)
   - Creates separate PaymentIntent for deposit (if required)
   - Both use `capture_method: "manual"`
   - Returns `client_secret` to frontend

4. **Guest completes payment**
   - Frontend uses Stripe Elements to collect payment
   - Payment confirmed client-side
   - Webhook updates payment status to `authorised`
   - Address is revealed only after payment is authorised

5. **Post-booking (after completion)**
   - Booking is automatically marked `COMPLETED` when `end_at` passes (via trigger/cron)
   - 24-hour review window starts automatically (`review_window_ends_at` set)
   - After review window expires: Automatic capture via cron job (`/api/cron/auto-capture-payments`)
   - Payment captured → Stripe Transfer created to host's Connect account
   - Deposit automatically released if no dispute reported
   - Manual actions still available:
     - Host can manually capture payment (`/api/payments/capture`) - respects review window
     - Host can manually release deposit (`/api/payments/release-deposit`)
     - Host can manually capture deposit for damages (`/api/payments/capture-deposit`)
   - Guest or host can report dispute (`/api/payments/report-dispute`) - extends review window by 48 hours

## Stripe Connect Onboarding

- Hosts must complete Stripe Connect onboarding before accepting bookings
- Onboarding page: `/host/stripe/onboarding`
- Creates Stripe Express account
- Redirects to Stripe-hosted onboarding flow
- Returns to app after completion

## API Endpoints

### Payment Endpoints
- `POST /api/payments/initiate` - Create payment intents for a booking
- `POST /api/payments/authorize` - Update payment status to authorised after confirmation
- `POST /api/payments/capture` - Manual capture booking payment (host only, respects review window)
- `POST /api/payments/release-deposit` - Manual release deposit (host only)
- `POST /api/payments/capture-deposit` - Manual capture deposit for damages (host only)
- `POST /api/payments/report-dispute` - Report dispute (guest or host) - extends review window

### Cron Jobs (Automatic)
- `GET /api/cron/complete-bookings` - Mark past bookings as COMPLETED (hourly)
- `GET /api/cron/auto-capture-payments` - Auto-capture payments after review window (every 30 min)
  - Requires `Authorization: Bearer {CRON_SECRET}` header

### Stripe Connect Endpoints
- `POST /api/stripe/connect/create-account` - Create Stripe Connect account
- `GET /api/stripe/connect/check-status` - Check onboarding status

### Webhook
- `POST /api/stripe/webhook` - Handles Stripe webhook events
  - `payment_intent.succeeded` / `payment_intent.amount_capturable_updated` → Update payment status to `authorised`
  - `payment_intent.canceled` → Update deposit release timestamp or payment status to `released`
  - `payment_intent.captured` → Update payment status to `captured`, clear scheduled time
  - `transfer.created` → Log transfer creation for auditing
  - `account.updated` / `capability.updated` → Update host Stripe account status
  - `account.application.deauthorized` → Log account deauthorization
  - `charge.dispute.created` → Log for admin review

## Environment Variables Required

```env
STRIPE_SECRET_KEY=sk_...
STRIPE_WEBHOOK_SECRET=whsec_...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_...
NEXT_PUBLIC_APP_URL=https://your-domain.com
```

## Frontend Components

- `PaymentForm` - Stripe Elements form for guest payment
- `BookingConfirmation` - Updated to show payment form when needed
- `StripeOnboardingPage` - Host onboarding flow

## Security

- All Stripe operations occur server-side
- RLS policies ensure users can only see their own payments/bookings
- Host verification before payment initiation
- Webhook signature verification

## Next Steps

1. Install dependencies: `npm install`
2. Run migrations: `supabase migration up`
   - `016_auto_complete_bookings_enhanced.sql`
   - `017_payment_review_window.sql`
3. Configure Stripe webhook endpoint in Stripe Dashboard
   - Add `payment_intent.captured` event
   - Add `transfer.created` event
4. Set environment variables (see `AUTOMATIC_PAYMENT_FLOW.md`)
5. Configure Vercel Cron (or external cron service for Hobby plan)
   - Set up cron jobs in `vercel.json` or Vercel Dashboard
   - Optionally set `CRON_SECRET` for security
6. Test payment flow end-to-end
   - Test automatic booking completion
   - Test review window initialization
   - Test automatic capture after review window
   - Test dispute reporting and extension
   - Test manual capture and deposit release

## Automatic Payment Flow

See `AUTOMATIC_PAYMENT_FLOW.md` for detailed documentation on:
- Automatic booking completion
- 24-hour review window
- Automatic payment capture
- Automatic Stripe Connect transfers
- Automatic deposit release
- Dispute handling
- Cron job configuration
- Monitoring and troubleshooting
