# Cron Migration Summary: Vercel → Supabase

## Overview

Successfully migrated scheduled cron jobs from Vercel Cron to Supabase scheduled Edge Functions to eliminate deployment blocking and improve reliability.

## What Changed

### New Files Created

1. **Supabase Edge Functions:**
   - `supabase/functions/complete-bookings/index.ts` - Marks past bookings as COMPLETED (runs hourly)
   - `supabase/functions/auto-capture-payments/index.ts` - Auto-captures payments after review window (runs every 30 min)

2. **Documentation:**
   - `docs/SUPABASE_SCHEDULER_SETUP.md` - Complete setup and deployment guide
   - `docs/PRODUCTION_CUTOVER_CHECKLIST.md` - Step-by-step migration checklist

### Files Modified

1. **vercel.json** - Removed cron configuration (no longer needed)
2. **AUTOMATIC_PAYMENT_FLOW.md** - Updated to reflect new architecture
3. **README.md** - Updated deployment section with Edge Functions setup

### Files Unchanged (Still Available)

- `app/api/cron/complete-bookings/route.ts` - Available for manual/admin use
- `app/api/cron/auto-capture-payments/route.ts` - Available for manual/admin use
- `lib/payments/auto-capture.ts` - Logic preserved for reference/testing

## Architecture Changes

### Before (Vercel Cron)
```
Vercel Cron → Next.js API Routes → Supabase DB + Stripe API
```

### After (Supabase Scheduled Edge Functions)
```
Supabase pg_cron → Edge Functions → Supabase DB + Stripe REST API
```

**Benefits:**
- ✅ No deployment blocking (Vercel cron limits removed)
- ✅ More reliable scheduling (Supabase infrastructure)
- ✅ Direct database access (faster, more efficient)
- ✅ Better monitoring (Supabase Dashboard)
- ✅ Deno runtime (modern, secure)

## Environment Variables

### New Variables Required (Supabase Edge Functions)

Set via `supabase secrets set`:

```bash
SUPABASE_URL=https://your-project-ref.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
SUPABASE_CRON_SECRET=your_secure_random_secret  # Generate with: openssl rand -hex 32
STRIPE_SECRET_KEY=sk_live_...  # For auto-capture-payments only
```

### Existing Variables (Next.js - Still Required)

```bash
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
STRIPE_SECRET_KEY=...  # Still needed for Next.js API routes
STRIPE_WEBHOOK_SECRET=...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=...
CRON_SECRET=...  # Optional - for manual API route triggers
```

**Note:** `CRON_SECRET` is no longer required for Vercel deployments, but can be kept for manual testing of Next.js API routes.

## Deployment Steps

### Quick Start

1. **Deploy Functions:**
   ```bash
   supabase functions deploy complete-bookings
   supabase functions deploy auto-capture-payments
   ```

2. **Set Secrets:**
   ```bash
   supabase secrets set SUPABASE_URL=...
   supabase secrets set SUPABASE_SERVICE_ROLE_KEY=...
   supabase secrets set SUPABASE_CRON_SECRET=...
   supabase secrets set STRIPE_SECRET_KEY=...
   ```

3. **Configure Schedules:** (See `docs/SUPABASE_SCHEDULER_SETUP.md` for SQL)

4. **Test Manually:** (See setup guide for cURL commands)

### Full Instructions

See `docs/SUPABASE_SCHEDULER_SETUP.md` for complete setup instructions.

See `docs/PRODUCTION_CUTOVER_CHECKLIST.md` for step-by-step migration guide.

## Technical Details

### Function Authentication

Both functions require `Authorization: Bearer {SUPABASE_CRON_SECRET}` header. This secret should match:
- Function secrets (set via `supabase secrets set`)
- Cron job Authorization header (in SQL schedule)

### Stripe API Compatibility

The auto-capture function uses Stripe REST API via `fetch()` for Deno compatibility, instead of the Node.js Stripe SDK. All functionality is preserved:
- PaymentIntent capture
- Transfer creation
- PaymentIntent cancellation (deposit release)

### Database Access

Functions use `SUPABASE_SERVICE_ROLE_KEY` for database access, which bypasses RLS and provides full access needed for admin operations.

## Verification

### Test Functions

```bash
# Test complete-bookings
curl -X POST 'https://your-project-ref.supabase.co/functions/v1/complete-bookings' \
  -H 'Authorization: Bearer YOUR_SUPABASE_CRON_SECRET'

# Test auto-capture-payments
curl -X POST 'https://your-project-ref.supabase.co/functions/v1/auto-capture-payments' \
  -H 'Authorization: Bearer YOUR_SUPABASE_CRON_SECRET'
```

### Check Logs

```bash
supabase functions logs complete-bookings
supabase functions logs auto-capture-payments
```

### Monitor Schedules

```sql
SELECT * FROM cron.job_run_details 
ORDER BY start_time DESC 
LIMIT 20;
```

## Migration Strategy

**Recommended Approach:**
1. Deploy Supabase functions
2. Run in parallel with Vercel cron for 2-7 days
3. Monitor both systems
4. Remove Vercel cron after verification

See `docs/PRODUCTION_CUTOVER_CHECKLIST.md` for detailed steps.

## Rollback Plan

If issues occur:
1. Re-add cron config to `vercel.json`
2. Deploy to Vercel
3. Remove Supabase schedules via SQL
4. Investigate and fix issues
5. Re-deploy after fixes

## Support

- **Setup Guide:** `docs/SUPABASE_SCHEDULER_SETUP.md`
- **Migration Checklist:** `docs/PRODUCTION_CUTOVER_CHECKLIST.md`
- **Payment Flow Docs:** `AUTOMATIC_PAYMENT_FLOW.md`
- **Supabase Docs:** https://supabase.com/docs/guides/functions

## Next Steps

1. Review this summary
2. Follow `docs/SUPABASE_SCHEDULER_SETUP.md` for deployment
3. Use `docs/PRODUCTION_CUTOVER_CHECKLIST.md` for migration
4. Monitor functions after deployment
5. Remove Vercel cron after successful parallel run
