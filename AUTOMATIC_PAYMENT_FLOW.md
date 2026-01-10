# Automatic Payment Capture & Payout Flow

## Overview

BorrowedHome implements automatic payment capture with a review window, automatic payouts to hosts via Stripe Connect, and automatic deposit release after a 24-hour review period.

## Flow Diagram

```
1. Booking Created (PENDING)
   ↓
2. Host Accepts → Booking CONFIRMED
   ↓
3. Payment Initiated → PaymentIntent created (manual capture)
   ↓
4. Guest Pays → Payment authorised (status: "authorised")
   ↓
5. Booking End Time Passes → Booking marked COMPLETED (automatic via trigger/cron)
   ↓
6. Review Window Starts (24 hours) → review_window_ends_at set
   ↓
7. Review Window Ends → Auto-capture triggered (cron job every 30 min)
   ↓
8. Payment Captured → Stripe Transfer to host account
   ↓
9. Deposit Released → Automatically released if no dispute
   ↓
10. Host Receives Payout → Via Stripe Connect (automatic based on host's payout schedule)
```

## Components

### Phase 1: Automatic Booking Completion

**Database Trigger** (`016_auto_complete_bookings_enhanced.sql`):
- Automatically marks bookings as `COMPLETED` when `end_at < NOW()` and status is `CONFIRMED`
- Trigger fires on UPDATE operations

**Cron Job** (`/api/cron/complete-bookings`):
- Runs every hour (`0 * * * *`)
- Calls `mark_past_bookings_completed()` function as backup
- Ensures no bookings are missed

### Phase 2: Review Window

**Database Schema** (`017_payment_review_window.sql`):
- `review_window_ends_at` - End time of 24-hour review window
- `auto_capture_scheduled_at` - Scheduled capture time (initially same as review window end)
- `dispute_reported_at` - Timestamp when dispute is reported
- `capture_hold_reason` - Reason for holding capture
- `deposit_released_at` - Timestamp when deposit was released

**Trigger** (`trigger_initialize_review_window`):
- Automatically sets `review_window_ends_at` when booking becomes `COMPLETED`
- Sets review window to 24 hours after booking `end_at`

### Phase 3: Automatic Capture

**Cron Job** (`/api/cron/auto-capture-payments`):
- Runs every 30 minutes (`*/30 * * * *`)
- Finds payments where:
  - Status = `authorised`
  - Booking status = `COMPLETED`
  - `review_window_ends_at <= NOW()`
  - `dispute_reported_at IS NULL`
- Calls `autoCaptureWithReviewWindow()` for each payment

**Auto-Capture Function** (`lib/payments/auto-capture.ts`):
- Captures PaymentIntent via Stripe
- Calculates host amount: `payment.amount - booking.platform_fee_amount`
- Creates Stripe Transfer to host's Connect account
- Updates payment status to `captured`
- Automatically releases deposit if no dispute

### Phase 4: Stripe Connect Transfers

**Transfer Creation**:
- Amount: `totalAmount - platformFee` (host receives booking amount minus platform fee)
- Destination: Host's Stripe Express account ID
- Currency: AUD
- Metadata: Includes `booking_id`, `type`, `listing_title`

**Automatic Payouts**:
- Funds are automatically transferred to host's Stripe account
- Stripe handles payouts to host's bank account based on their payout schedule (configured during onboarding)
- Host can view payouts in Stripe Dashboard

### Phase 5: Deposit Auto-Release

**Automatic Release**:
- After payment is captured (automatic or manual)
- If `dispute_reported_at IS NULL`
- Deposit PaymentIntent is canceled (released)
- `deposit_released_at` timestamp is set

**Manual Release**:
- Host can manually release deposit via `/api/payments/release-deposit`
- Only if no dispute reported

## Dispute Handling

**Dispute Reporting** (`/api/payments/report-dispute`):
- Can be called by guest or host
- Extends review window by 48 hours
- Sets `dispute_reported_at` timestamp
- Stores `capture_hold_reason`
- Prevents automatic capture until resolved

**After Dispute**:
- Manual review required
- Admin can capture payment/deposit manually
- Review window extension gives time for resolution

## API Endpoints

### Cron Jobs (Protected)
- `GET /api/cron/complete-bookings` - Mark completed bookings (hourly)
- `GET /api/cron/auto-capture-payments` - Auto-capture payments (every 30 min)

**Security**: Requires `Authorization: Bearer {CRON_SECRET}` header

### Manual Actions
- `POST /api/payments/capture` - Manual capture (host only)
- `POST /api/payments/release-deposit` - Manual deposit release (host only)
- `POST /api/payments/capture-deposit` - Manual deposit capture (host only, for damages)
- `POST /api/payments/report-dispute` - Report dispute (guest or host)

## Database Migrations

### Migration 016: Enhanced Booking Completion
- Adds trigger for automatic completion
- Adds function `mark_past_bookings_completed()`
- Adds index for efficient querying

### Migration 017: Review Window
- Adds review window columns to `payments` table
- Adds trigger to initialize review window on booking completion
- Backfills existing completed bookings

## Environment Variables

```env
# Stripe
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_...

# Cron Security (optional but recommended)
CRON_SECRET=your-secure-random-string

# Supabase
SUPABASE_URL=https://...
SUPABASE_SERVICE_ROLE_KEY=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
```

## Vercel Cron Configuration

Add to `vercel.json` (already included):

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

**Note**: Vercel Cron requires Pro plan. For Hobby plan, use external cron service (e.g., cron-job.org) to call these endpoints.

## Webhook Events Handled

### Stripe Webhooks (`/api/stripe/webhook`)

- `payment_intent.succeeded` / `payment_intent.amount_capturable_updated`
  - Updates payment status to `authorised`
  - Marks booking as `CONFIRMED` (if booking payment)

- `payment_intent.canceled`
  - Updates payment/deposit status to `released`
  - Sets `deposit_released_at` if deposit was canceled

- `payment_intent.captured`
  - Updates payment status to `captured`
  - Clears `auto_capture_scheduled_at`

- `transfer.created`
  - Logs transfer creation (for auditing)
  - Transfer metadata includes `booking_id`

- `account.updated` / `capability.updated`
  - Updates host Stripe account status in database

## Testing

### Manual Testing

1. **Complete a booking**:
   - Create a booking with past end time
   - Check booking status becomes `COMPLETED`

2. **Verify review window**:
   - Check `payments.review_window_ends_at` is set
   - Verify it's 24 hours after booking `end_at`

3. **Trigger auto-capture**:
   - Wait for review window to expire
   - Call `/api/cron/auto-capture-payments` manually
   - Verify payment status becomes `captured`
   - Check Stripe Dashboard for transfer

4. **Test dispute**:
   - Call `/api/payments/report-dispute` with a booking ID
   - Verify `dispute_reported_at` is set
   - Verify review window is extended by 48 hours
   - Verify auto-capture is blocked

### Automated Testing

Add tests for:
- `autoCaptureWithReviewWindow()` function
- Review window initialization trigger
- Dispute reporting and extension
- Amount calculations (platform fee, host amount)

## Monitoring

### Logs to Monitor

- `[AutoCapture]` - Auto-capture operations
- `[Capture]` - Manual capture operations
- `[Cron]` - Cron job executions
- `[Dispute]` - Dispute reports
- `[Webhook]` - Webhook events

### Metrics to Track

- Number of auto-captures per day
- Average time to capture (review window duration)
- Dispute rate (disputes per completed bookings)
- Transfer failures
- Deposit release rate

## Error Handling

### Retry Logic

- Stripe API failures are logged but not retried automatically
- Failed auto-captures remain in `authorised` status
- Cron job will retry on next run (30 minutes)
- Manual capture can be used as fallback

### Edge Cases

- **Review window expired but dispute reported**: Skip auto-capture, require manual review
- **Host account not ready**: Log error, skip auto-capture, notify admin
- **Transfer failure**: Payment remains `captured`, transfer can be retried manually
- **Deposit already released**: Skip deposit release step

## Future Enhancements

- Email notifications for captures and transfers
- Admin dashboard for dispute management
- Automatic retry for failed transfers
- Analytics dashboard for payment metrics
- Configurable review window duration (currently 24 hours)
- Partial deposit capture for damages

## Troubleshooting

### Bookings not completing

- Check trigger `trigger_auto_complete_bookings` is enabled
- Verify cron job is running (`/api/cron/complete-bookings`)
- Check database logs for trigger errors

### Payments not auto-capturing

- Verify review window has expired (`review_window_ends_at <= NOW()`)
- Check for disputes (`dispute_reported_at IS NULL`)
- Verify cron job is running (`/api/cron/auto-capture-payments`)
- Check payment status is `authorised`
- Verify host Stripe account is enabled

### Transfers failing

- Check host Stripe account status (`stripe_charges_enabled`, `stripe_payouts_enabled`)
- Verify `stripe_account_id` is set in `hosts` table
- Check Stripe Dashboard for transfer errors
- Verify platform account has sufficient balance

### Deposits not releasing

- Check `dispute_reported_at` is NULL
- Verify `deposit_released_at` is NULL
- Check Stripe Dashboard for deposit PaymentIntent status
- Verify deposit cancellation succeeded
