# Stripe Connect Express Onboarding Setup

## Overview

BorrowedHome uses Stripe Connect Express accounts for marketplace payments. Hosts must complete onboarding before they can accept bookings and receive payouts.

## Environment Variables

Add these to your `.env.local` (development) and Vercel environment variables (production):

```env
# Stripe (LIVE mode keys for production)
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_...

# App URL (for Stripe redirects)
NEXT_PUBLIC_APP_URL=https://borrowedhome.app

# Supabase (server-side only, never expose to client)
SUPABASE_SERVICE_ROLE_KEY=eyJ...
```

## Stripe Dashboard Configuration

### 1. Enable Connect

1. Go to [Stripe Dashboard](https://dashboard.stripe.com)
2. Navigate to **Settings** → **Connect**
3. Enable **Connect** if not already enabled
4. Set **Platform type** to **Marketplace**

### 2. Configure Webhook Endpoint

1. Go to **Developers** → **Webhooks**
2. Click **Add endpoint**
3. Set endpoint URL: `https://borrowedhome.app/api/stripe/webhook`
4. Select events to listen to:
   - `account.updated`
   - `capability.updated`
   - `account.application.deauthorized`
   - `payment_intent.succeeded`
   - `payment_intent.canceled`
   - `charge.dispute.created`
5. Copy the **Signing secret** (starts with `whsec_`) and add to `STRIPE_WEBHOOK_SECRET`

### 3. Verify Account Settings

- **Country**: Australia (AU)
- **Express accounts**: Enabled
- **Capabilities**: Card payments, Transfers

## Database Migration

Run the migration to create the `hosts` table:

```bash
# Using Supabase CLI
supabase migration up

# Or manually in Supabase SQL Editor
# Run: supabase/migrations/012_hosts_stripe_connect.sql
```

## Testing the Flow

### 1. Create Host Account

1. Sign up as a user
2. Complete host onboarding wizard
3. Navigate to `/host/payouts`

### 2. Start Onboarding

1. Click "Enable Payouts"
2. You'll be redirected to Stripe-hosted onboarding
3. Complete the required information:
   - Business/personal details
   - Bank account for payouts
   - Tax information (if applicable)

### 3. Return to App

1. After completing onboarding, you'll be redirected back to `/host/payouts?return=1`
2. The app will check your Stripe account status
3. Status should update to "Payouts Enabled" if all requirements are met

### 4. Verify in Stripe Dashboard

1. Go to **Connect** → **Accounts**
2. You should see the connected account
3. Verify status shows "Active" and capabilities are enabled

## Webhook Verification

### Test Webhook Locally (Development)

Use Stripe CLI to forward webhooks to your local server:

```bash
stripe listen --forward-to localhost:3000/api/stripe/webhook
```

This will give you a webhook signing secret for local testing.

### Production Webhook

1. Ensure webhook endpoint is configured in Stripe Dashboard
2. Test by completing onboarding and checking logs
3. Verify `account.updated` events are received and processed

## Troubleshooting

### Host Cannot Publish Listing

**Error**: "You must complete Stripe onboarding before publishing listings"

**Solution**: 
- Navigate to `/host/payouts`
- Complete Stripe onboarding
- Wait for status to show "Payouts Enabled"

### Host Cannot Accept Booking

**Error**: "Host must complete Stripe onboarding before accepting bookings"

**Solution**: Same as above - complete onboarding first.

### Webhook Not Receiving Events

**Check**:
1. Webhook endpoint URL is correct in Stripe Dashboard
2. `STRIPE_WEBHOOK_SECRET` matches the signing secret
3. Webhook events are enabled in Stripe Dashboard
4. Check Vercel function logs for errors

### Account Status Not Updating

**Check**:
1. Webhook is receiving `account.updated` events
2. Database RLS policies allow service role updates
3. `SUPABASE_SERVICE_ROLE_KEY` is set correctly

## API Routes

### POST `/api/stripe/connect/onboard`
- Creates Stripe Express account if needed
- Returns onboarding URL
- Updates host status to `in_progress`

### GET `/api/stripe/connect/check-status`
- Checks Stripe account status
- Updates database with latest status
- Returns current onboarding status

### POST `/api/stripe/webhook`
- Handles Stripe webhook events
- Updates host records on account changes
- Must be accessible from Stripe servers

## Database Schema

### `hosts` table

- `user_id` (UUID, unique) - References auth.users
- `stripe_account_id` (TEXT, nullable) - Stripe account ID
- `stripe_charges_enabled` (BOOLEAN) - Can accept payments
- `stripe_payouts_enabled` (BOOLEAN) - Can receive payouts
- `stripe_requirements_due` (JSONB) - Array of pending requirements
- `stripe_onboarding_status` (TEXT) - not_started | in_progress | complete | restricted

## Security Notes

- All Stripe operations occur server-side
- Webhook signature verification prevents unauthorized requests
- RLS policies ensure users can only access their own host records
- Service role key is server-only, never exposed to client
