# Stripe Connect Express Implementation Summary

## Overview

Complete Stripe Connect Express onboarding flow for BorrowedHome marketplace, implemented in LIVE mode with programmatic account creation.

## Files Created/Modified

### Database Migrations
- **`supabase/migrations/012_hosts_stripe_connect.sql`**
  - Creates `hosts` table with comprehensive Stripe fields
  - Migrates data from `host_stripe_accounts` (if exists)
  - Adds RLS policies for user access and service role updates
  - Includes indexes and triggers

### Stripe Utilities
- **`lib/stripe/connect.ts`** (NEW)
  - `getOrCreateConnectedAccount()` - Creates Stripe Express account
  - `createOnboardingLink()` - Creates Account Link for onboarding
  - `checkAccountStatus()` - Retrieves and structures account status
  - `computeOnboardingStatus()` - Determines onboarding status from Stripe data

### API Routes
- **`app/api/stripe/connect/onboard/route.ts`** (NEW)
  - POST endpoint to start onboarding
  - Creates/finds host record
  - Creates Stripe account if needed
  - Returns onboarding URL
  - Runtime: `nodejs`, Dynamic: `force-dynamic`

- **`app/api/stripe/connect/check-status/route.ts`** (UPDATED)
  - GET endpoint to check onboarding status
  - Uses new `hosts` table
  - Updates database with latest Stripe status
  - Runtime: `nodejs`, Dynamic: `force-dynamic`

- **`app/api/stripe/webhook/route.ts`** (UPDATED)
  - Handles `account.updated` events
  - Handles `capability.updated` events
  - Handles `account.application.deauthorized` events
  - Updates `hosts` table on account changes
  - Runtime: `nodejs`, Dynamic: `force-dynamic`

- **`app/api/payments/initiate/route.ts`** (UPDATED)
  - Now checks `hosts.stripe_onboarding_status === 'complete'`
  - Uses new `hosts` table instead of `host_stripe_accounts`
  - Runtime: `nodejs`, Dynamic: `force-dynamic`

- **`app/api/bookings/accept/route.ts`** (UPDATED)
  - Now checks `hosts.stripe_onboarding_status === 'complete'`
  - Uses new `hosts` table
  - Runtime: `nodejs`, Dynamic: `force-dynamic`

### Frontend Pages
- **`app/host/payouts/page.tsx`** (NEW)
  - Main host payouts management page
  - Shows onboarding status
  - "Enable Payouts" button
  - Displays requirements if incomplete
  - Handles return from Stripe onboarding

- **`app/host/stripe/onboarding/page.tsx`** (UPDATED)
  - Updated to use new `/api/stripe/connect/onboard` route
  - Backward compatible with existing flow

### Components
- **`components/edit-listing-form.tsx`** (UPDATED)
  - Added gating: cannot publish listing unless `stripe_onboarding_status === 'complete'`
  - Shows error message directing to Host Payouts page

## Database Schema

### `hosts` Table
```sql
- id (UUID, PK)
- user_id (UUID, UNIQUE, FK to auth.users)
- stripe_account_id (TEXT, NULLABLE, UNIQUE)
- stripe_charges_enabled (BOOLEAN, DEFAULT false)
- stripe_payouts_enabled (BOOLEAN, DEFAULT false)
- stripe_requirements_due (JSONB, NULLABLE)
- stripe_onboarding_status (TEXT, DEFAULT 'not_started')
  - Values: 'not_started' | 'in_progress' | 'complete' | 'restricted'
- created_at (TIMESTAMPTZ)
- updated_at (TIMESTAMPTZ)
```

### RLS Policies
- Users can SELECT/UPDATE their own host record
- Service role can UPDATE any host record (for webhooks)

## Flow

1. **Host clicks "Enable Payouts"**
   - Frontend calls `POST /api/stripe/connect/onboard`
   - Server creates/finds host record
   - Creates Stripe Express account if needed
   - Creates Account Link
   - Returns onboarding URL

2. **Host completes Stripe onboarding**
   - Redirected to Stripe-hosted onboarding
   - Completes required information
   - Returns to `/host/payouts?return=1`

3. **Status check on return**
   - Frontend calls `GET /api/stripe/connect/check-status`
   - Server retrieves Stripe account status
   - Updates `hosts` table
   - Returns current status

4. **Webhook updates**
   - Stripe sends `account.updated` or `capability.updated`
   - Webhook handler updates `hosts` table
   - Keeps status in sync automatically

5. **Gating**
   - Cannot publish listing unless `stripe_onboarding_status === 'complete'`
   - Cannot accept booking unless `stripe_onboarding_status === 'complete'`

## Environment Variables

Required in production:
```env
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_...
NEXT_PUBLIC_APP_URL=https://borrowedhome.app
SUPABASE_SERVICE_ROLE_KEY=eyJ... (server-only)
```

## Webhook Configuration

In Stripe Dashboard:
1. Go to **Developers** → **Webhooks**
2. Add endpoint: `https://borrowedhome.app/api/stripe/webhook`
3. Select events:
   - `account.updated`
   - `capability.updated`
   - `account.application.deauthorized`
   - `payment_intent.succeeded`
   - `payment_intent.canceled`
   - `charge.dispute.created`
4. Copy signing secret to `STRIPE_WEBHOOK_SECRET`

## Testing Checklist

- [ ] Run migration: `supabase migration up`
- [ ] Set environment variables
- [ ] Configure webhook in Stripe Dashboard
- [ ] Test onboarding flow:
  - [ ] Host clicks "Enable Payouts"
  - [ ] Redirects to Stripe onboarding
  - [ ] Completes onboarding
  - [ ] Returns to app
  - [ ] Status shows "Payouts Enabled"
- [ ] Test gating:
  - [ ] Cannot publish listing without onboarding
  - [ ] Cannot accept booking without onboarding
- [ ] Verify webhook:
  - [ ] Complete onboarding
  - [ ] Check webhook logs in Stripe Dashboard
  - [ ] Verify `hosts` table updated

## Migration Notes

- Existing `host_stripe_accounts` data is automatically migrated to `hosts` table
- Old table can be kept for backward compatibility or dropped later
- All new code uses `hosts` table exclusively
