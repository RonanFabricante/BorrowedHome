# Supabase Scheduler Setup Guide

This guide explains how to set up and deploy scheduled Edge Functions in Supabase to replace Vercel Cron jobs.

## Overview

BorrowedHome uses Supabase scheduled Edge Functions to run periodic tasks:
- **complete-bookings**: Marks past CONFIRMED bookings as COMPLETED (runs every hour)
- **auto-capture-payments**: Automatically captures payments after review window expires (runs every 30 minutes)
- **expire-bookings**: Expires unpaid PAYMENT_PENDING bookings, cancels Stripe holds, and emails guests (runs every 5 minutes)
- **payment-deadline-reminders**: Reminds guests approaching the payment deadline

These functions run directly in Supabase, eliminating dependency on Vercel Cron and avoiding deployment blocking issues.

## Prerequisites

1. **Supabase CLI** installed and authenticated
   ```bash
   npm install -g supabase
   supabase login
   ```

2. **Supabase Project** linked
   ```bash
   supabase link --project-ref your-project-ref
   ```

3. **Required Supabase Extensions** enabled:
   - `pg_cron` (for scheduling)
   - `pg_net` (for HTTP requests)

   Enable via Supabase Dashboard → Database → Extensions, or run:
   ```sql
   CREATE EXTENSION IF NOT EXISTS pg_cron;
   CREATE EXTENSION IF NOT EXISTS pg_net;
   ```

## Deployment Steps

### 1. Deploy Edge Functions

Deploy both functions to your Supabase project:

```bash
# Deploy scheduled functions
supabase functions deploy complete-bookings
supabase functions deploy auto-capture-payments
supabase functions deploy expire-bookings
supabase functions deploy payment-deadline-reminders
```

### 2. Set Environment Variables (Secrets)

Set the required secrets for each function using Supabase CLI or Dashboard:

```bash
# Shared secrets (all scheduled functions)
supabase secrets set SUPABASE_URL=https://your-project-ref.supabase.co
supabase secrets set SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
# MUST be named CRON_SECRET — this is what the Edge Functions read
supabase secrets set CRON_SECRET=your_secure_random_secret

# auto-capture-payments + expire-bookings also need Stripe
supabase secrets set STRIPE_SECRET_KEY=sk_live_...

# Optional: expire-bookings will call the Next.js cleanup/email route when set
supabase secrets set SITE_URL=https://borrowedhome.app
```

**Important Notes:**
- `SUPABASE_URL`: Your Supabase project URL (same for both functions)
- `SUPABASE_SERVICE_ROLE_KEY`: Service role key from Supabase Dashboard → Settings → API (server-side only, bypasses RLS)
- `STRIPE_SECRET_KEY`: Your Stripe secret key (live or test)
- `CRON_SECRET`: A secure random string used to authenticate scheduler requests (generate with `openssl rand -hex 32`). Do **not** use `SUPABASE_CRON_SECRET` as the only name — functions read `CRON_SECRET` (they also accept `SUPABASE_CRON_SECRET` as a fallback).
- Use the **same** secret value in pg_cron `Authorization: Bearer ...` headers and in Vercel `CRON_SECRET` for `/api/bookings/expire-notifications`.

**Via Dashboard:**
1. Go to Project Settings → Edge Functions
2. Select each function
3. Add secrets in the "Secrets" section

### 3. Configure Schedules

Supabase supports scheduling Edge Functions using `pg_cron`. Connect to your database and run the following SQL:

```sql
-- Schedule complete-bookings to run every hour at minute 0
SELECT cron.schedule(
  'complete-bookings-hourly',
  '0 * * * *', -- Every hour at minute 0
  $$
  SELECT
    net.http_post(
      url := 'https://your-project-ref.supabase.co/functions/v1/complete-bookings',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer YOUR_CRON_SECRET'
      ),
      body := '{}'::jsonb
    ) AS request_id;
  $$
);

-- Schedule auto-capture-payments to run every 30 minutes
SELECT cron.schedule(
  'auto-capture-payments-30min',
  '*/30 * * * *', -- Every 30 minutes
  $$
  SELECT
    net.http_post(
      url := 'https://your-project-ref.supabase.co/functions/v1/auto-capture-payments',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer YOUR_CRON_SECRET'
      ),
      body := '{}'::jsonb
    ) AS request_id;
  $$
);

-- Schedule expire-bookings to run every 5 minutes
SELECT cron.schedule(
  'expire-bookings-5min',
  '*/5 * * * *',
  $$
  SELECT
    net.http_post(
      url := 'https://your-project-ref.supabase.co/functions/v1/expire-bookings',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer YOUR_CRON_SECRET'
      ),
      body := '{}'::jsonb
    ) AS request_id;
  $$
);
```

**Important:** Replace:
- `your-project-ref` with your actual Supabase project reference
- `YOUR_CRON_SECRET` with the same secret value you set in step 2

### 4. Verify Schedules

Check that schedules were created:

```sql
SELECT * FROM cron.job;
```

View schedule details:

```sql
SELECT * FROM cron.job_run_details 
ORDER BY start_time DESC 
LIMIT 20;
```

## Testing

### Manual Invocation via Next.js backup (recommended if Edge cron is down)

```bash
curl -X GET \
  'https://borrowedhome.app/api/cron/expire-bookings' \
  -H 'Authorization: Bearer YOUR_CRON_SECRET'
```

This calls the same `expire_unpaid_bookings` RPC and then `/api/bookings/expire-notifications`.
Use this to unblock stuck `PAYMENT_PENDING` rows immediately.

### Manual Invocation via cURL (Edge Functions)

Test each function manually using cURL:

```bash
# Test complete-bookings
curl -X POST \
  'https://your-project-ref.supabase.co/functions/v1/complete-bookings' \
  -H 'Authorization: Bearer YOUR_CRON_SECRET' \
  -H 'Content-Type: application/json'

# Test auto-capture-payments
curl -X POST \
  'https://your-project-ref.supabase.co/functions/v1/auto-capture-payments' \
  -H 'Authorization: Bearer YOUR_CRON_SECRET' \
  -H 'Content-Type: application/json'
```

Expected response format:
```json
{
  "success": true,
  "message": "...",
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

### Manual Invocation via Supabase Dashboard

1. Go to Edge Functions in Supabase Dashboard
2. Select the function
3. Click "Invoke" 
4. Add header: `Authorization: Bearer YOUR_CRON_SECRET`
5. Click "Invoke Function"

### Check Logs

View function execution logs:

```bash
# View logs for complete-bookings
supabase functions logs complete-bookings

# View logs for auto-capture-payments
supabase functions logs auto-capture-payments
```

Or via Dashboard: Edge Functions → Select function → Logs

## Monitoring

### Cron Job Execution

Monitor cron job executions:

```sql
-- View recent job runs
SELECT 
  jobid,
  runid,
  job_pid,
  database,
  username,
  command,
  status,
  return_message,
  start_time,
  end_time
FROM cron.job_run_details
ORDER BY start_time DESC
LIMIT 50;
```

### Function Metrics

Monitor function performance in Supabase Dashboard:
- Edge Functions → Metrics
- View execution counts, durations, and error rates

## Troubleshooting

### Function Not Executing

1. **Check cron extension is enabled:**
   ```sql
   SELECT * FROM pg_extension WHERE extname = 'pg_cron';
   ```

2. **Verify schedule exists:**
   ```sql
   SELECT * FROM cron.job WHERE jobname LIKE '%bookings%' OR jobname LIKE '%capture%';
   ```

3. **Check recent job runs for errors:**
   ```sql
   SELECT * FROM cron.job_run_details 
   WHERE status = 'failed'
   ORDER BY start_time DESC
   LIMIT 10;
   ```

4. **Verify secrets are set:**
   ```bash
   supabase secrets list
   ```

### Authentication Errors

If you see `401 Unauthorized`:
- Verify `CRON_SECRET` matches in both:
  - Function secrets
  - Cron job Authorization header

### Database Connection Errors

If functions fail with database errors:
- Verify `SUPABASE_SERVICE_ROLE_KEY` is correct
- Check that service role key has necessary permissions
- Ensure database is accessible

### Stripe API Errors

If auto-capture fails with Stripe errors:
- Verify `STRIPE_SECRET_KEY` is correct and has appropriate permissions
- Check Stripe Dashboard for API errors
- Ensure PaymentIntent IDs are valid

## Migration from Vercel Cron

### Before Migration

1. Document current Vercel cron schedule
2. Note any manual triggers or dependencies
3. Test functions manually to ensure they work

### During Migration

1. Deploy Supabase functions
2. Set up schedules in Supabase
3. Keep Vercel cron jobs running temporarily (for safety)
4. Monitor both systems for a few days

### After Migration (Cutover)

1. Verify Supabase schedules are running correctly
2. Confirm no critical bookings/payments were missed
3. Remove cron config from `vercel.json`
4. Optionally disable Vercel cron jobs (or keep as backup)

### Rollback Plan

If issues occur:
1. Re-enable Vercel cron by adding config back to `vercel.json`
2. Remove Supabase cron schedules:
   ```sql
   SELECT cron.unschedule('complete-bookings-hourly');
   SELECT cron.unschedule('auto-capture-payments-30min');
   ```
3. Investigate and fix issues
4. Re-deploy after fixes

## Security Considerations

1. **CRON_SECRET**: Use a strong, randomly generated secret (minimum 32 characters)
2. **Service Role Key**: Never expose in client-side code; only use in server/Edge Functions
3. **Stripe Secret Key**: Keep secure; rotate if compromised
4. **Network Security**: Functions are only accessible via Supabase infrastructure with proper authentication

## Schedule Syntax Reference

Cron schedule format: `minute hour day month weekday`

Examples:
- `0 * * * *` - Every hour at minute 0
- `*/30 * * * *` - Every 30 minutes
- `0 0 * * *` - Daily at midnight
- `0 0 * * 0` - Weekly on Sunday at midnight

See [pg_cron documentation](https://github.com/citusdata/pg_cron) for more details.

## Support

For issues:
1. Check function logs: `supabase functions logs <function-name>`
2. Check cron execution logs: SQL query above
3. Review Supabase Dashboard → Edge Functions → Logs
4. Check Stripe Dashboard for API errors (for auto-capture)
