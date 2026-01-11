# Production Cutover Checklist

This checklist guides you through migrating from Vercel Cron to Supabase scheduled Edge Functions.

## Pre-Cutover (Preparation)

### 1. Review Current State
- [ ] Document current Vercel cron schedules and last execution times
- [ ] Verify all bookings/payments are in expected states
- [ ] Note any recent issues or errors in current cron jobs
- [ ] Ensure you have access to Supabase Dashboard and CLI

### 2. Verify Prerequisites
- [ ] Supabase CLI installed and authenticated (`supabase login`)
- [ ] Supabase project linked (`supabase link --project-ref your-ref`)
- [ ] `pg_cron` and `pg_net` extensions enabled in Supabase
- [ ] Database migrations up to date
- [ ] All environment variables documented and ready

### 3. Generate Secrets
- [ ] Generate `SUPABASE_CRON_SECRET` (use `openssl rand -hex 32`)
- [ ] Store secrets securely (password manager, etc.)
- [ ] Verify `SUPABASE_SERVICE_ROLE_KEY` is available
- [ ] Verify `STRIPE_SECRET_KEY` is available

## Deployment (Cutover Steps)

### 4. Deploy Edge Functions
- [ ] Deploy `complete-bookings` function:
  ```bash
  supabase functions deploy complete-bookings
  ```
- [ ] Deploy `auto-capture-payments` function:
  ```bash
  supabase functions deploy auto-capture-payments
  ```
- [ ] Verify functions appear in Supabase Dashboard → Edge Functions

### 5. Set Secrets
- [ ] Set secrets for `complete-bookings`:
  ```bash
  supabase secrets set SUPABASE_URL=https://your-project-ref.supabase.co
  supabase secrets set SUPABASE_SERVICE_ROLE_KEY=your_key
  supabase secrets set SUPABASE_CRON_SECRET=your_secret
  ```
- [ ] Set secrets for `auto-capture-payments`:
  ```bash
  supabase secrets set SUPABASE_URL=https://your-project-ref.supabase.co
  supabase secrets set SUPABASE_SERVICE_ROLE_KEY=your_key
  supabase secrets set STRIPE_SECRET_KEY=sk_live_...
  supabase secrets set SUPABASE_CRON_SECRET=your_secret
  ```
- [ ] Verify secrets are set (Dashboard → Edge Functions → Select function → Secrets)

### 6. Test Functions Manually
- [ ] Test `complete-bookings` via cURL or Dashboard:
  ```bash
  curl -X POST 'https://your-project-ref.supabase.co/functions/v1/complete-bookings' \
    -H 'Authorization: Bearer YOUR_SUPABASE_CRON_SECRET'
  ```
- [ ] Verify response is `200 OK` with `success: true`
- [ ] Test `auto-capture-payments` via cURL or Dashboard:
  ```bash
  curl -X POST 'https://your-project-ref.supabase.co/functions/v1/auto-capture-payments' \
    -H 'Authorization: Bearer YOUR_SUPABASE_CRON_SECRET'
  ```
- [ ] Verify response shows expected payment counts (even if 0)
- [ ] Check function logs for errors:
  ```bash
  supabase functions logs complete-bookings
  supabase functions logs auto-capture-payments
  ```

### 7. Configure Schedules
- [ ] Connect to Supabase database (via Dashboard SQL Editor or CLI)
- [ ] Create schedule for `complete-bookings`:
  ```sql
  SELECT cron.schedule(
    'complete-bookings-hourly',
    '0 * * * *',
    $$
    SELECT net.http_post(
      url := 'https://your-project-ref.supabase.co/functions/v1/complete-bookings',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer YOUR_SUPABASE_CRON_SECRET'
      ),
      body := '{}'::jsonb
    ) AS request_id;
  $$
  );
  ```
- [ ] Create schedule for `auto-capture-payments`:
  ```sql
  SELECT cron.schedule(
    'auto-capture-payments-30min',
    '*/30 * * * *',
    $$
    SELECT net.http_post(
      url := 'https://your-project-ref.supabase.co/functions/v1/auto-capture-payments',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer YOUR_SUPABASE_CRON_SECRET'
      ),
      body := '{}'::jsonb
    ) AS request_id;
  $$
  );
  ```
- [ ] Verify schedules were created:
  ```sql
  SELECT * FROM cron.job WHERE jobname LIKE '%bookings%' OR jobname LIKE '%capture%';
  ```

### 8. Parallel Running Period (Recommended: 2-7 days)
- [ ] Keep Vercel cron jobs running (don't remove yet)
- [ ] Monitor both systems for 2-7 days
- [ ] Compare execution times and results
- [ ] Verify no missed bookings/payments
- [ ] Check for any errors or discrepancies

### 9. Monitoring and Verification
- [ ] Monitor Supabase function logs daily:
  ```bash
  supabase functions logs complete-bookings --tail
  supabase functions logs auto-capture-payments --tail
  ```
- [ ] Check cron execution logs:
  ```sql
  SELECT * FROM cron.job_run_details 
  WHERE jobname IN ('complete-bookings-hourly', 'auto-capture-payments-30min')
  ORDER BY start_time DESC 
  LIMIT 20;
  ```
- [ ] Verify bookings are being completed (check database)
- [ ] Verify payments are being captured (check payments table and Stripe Dashboard)
- [ ] Check for any error patterns or failures

## Post-Cutover (Cleanup)

### 10. Remove Vercel Cron (After Successful Parallel Run)
- [ ] Verify Supabase functions have been running successfully for at least 2-7 days
- [ ] Confirm no critical bookings/payments were missed
- [ ] Remove cron config from `vercel.json` (already done in code)
- [ ] Commit and deploy the updated `vercel.json`
- [ ] Optionally disable Vercel cron jobs in Vercel Dashboard (or keep as backup)

### 11. Final Verification
- [ ] Verify `vercel.json` no longer has cron config
- [ ] Verify Vercel deployments no longer require `CRON_SECRET`
- [ ] Confirm Supabase schedules are the only active schedulers
- [ ] Document any lessons learned or issues encountered

### 12. Documentation Update
- [ ] Update team documentation with new architecture
- [ ] Share Supabase Dashboard access if needed
- [ ] Document monitoring procedures
- [ ] Update runbooks/playbooks if applicable

## Rollback Plan (If Needed)

If critical issues occur:

1. **Re-enable Vercel Cron:**
   - Add cron config back to `vercel.json`:
     ```json
     {
       "crons": [
         {
           "path": "/api/cron/complete-bookings",
           "schedule": "0 * * * *"
         },
         {
           "path": "/api/cron/auto-capture-payments",
           "schedule": "*/30 * * * *"
         }
       ]
     }
     ```
   - Deploy to Vercel
   - Set `CRON_SECRET` in Vercel environment variables

2. **Remove Supabase Schedules:**
   ```sql
   SELECT cron.unschedule('complete-bookings-hourly');
   SELECT cron.unschedule('auto-capture-payments-30min');
   ```

3. **Investigate Issues:**
   - Check function logs
   - Check cron execution logs
   - Verify secrets are correct
   - Test functions manually

4. **Fix and Re-deploy:**
   - Fix identified issues
   - Re-deploy functions
   - Re-test manually
   - Re-create schedules

## Success Criteria

The cutover is successful when:
- ✅ Supabase functions execute on schedule
- ✅ No errors in function logs
- ✅ Bookings are being completed automatically
- ✅ Payments are being captured automatically
- ✅ No missed bookings or payments
- ✅ Vercel cron can be safely removed
- ✅ Team is comfortable with new system

## Support Contacts

- **Supabase Support**: [support.supabase.com](https://support.supabase.com)
- **Documentation**: See `docs/SUPABASE_SCHEDULER_SETUP.md`
- **Troubleshooting**: See troubleshooting section in setup guide

## Notes

- Keep Vercel cron running during parallel period for safety
- Monitor closely for first week
- Document any custom configurations or workarounds
- Consider setting up alerts for function failures
- Regular review of cron execution logs recommended
