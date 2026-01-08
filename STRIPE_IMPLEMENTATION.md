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
   - Host can capture booking payment (`/api/payments/capture`)
   - Host can release deposit if no damage (`/api/payments/release-deposit`)
   - Host can capture deposit if damage reported (`/api/payments/capture-deposit`)

## Stripe Connect Onboarding

- Hosts must complete Stripe Connect onboarding before accepting bookings
- Onboarding page: `/host/stripe/onboarding`
- Creates Stripe Express account
- Redirects to Stripe-hosted onboarding flow
- Returns to app after completion

## API Endpoints

### Payment Endpoints
- `POST /api/payments/initiate` - Create payment intents for a booking
- `POST /api/payments/capture` - Capture booking payment (host only)
- `POST /api/payments/release-deposit` - Release deposit (host only)
- `POST /api/payments/capture-deposit` - Capture deposit (host only)

### Stripe Connect Endpoints
- `POST /api/stripe/connect/create-account` - Create Stripe Connect account
- `GET /api/stripe/connect/check-status` - Check onboarding status

### Webhook
- `POST /api/stripe/webhook` - Handles Stripe webhook events
  - `payment_intent.succeeded` → Update payment status to `authorised`
  - `payment_intent.canceled` → Update payment status to `released`
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
2. Run migration: `supabase migration up`
3. Configure Stripe webhook endpoint in Stripe Dashboard
4. Set environment variables
5. Test payment flow end-to-end
