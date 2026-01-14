# Booking State Machine & Payment Window Logic

## Overview

This document describes the production-grade booking request + approval + payment window system implemented in BorrowedHome.

## Booking Statuses

The booking system uses the following statuses:

- **REQUESTED** - Guest has submitted a booking request; awaiting host response
- **PENDING** - Legacy status (backward compatibility), treated same as REQUESTED
- **ACCEPTED** - Host has accepted (transitional, goes immediately to PAYMENT_PENDING)
- **PAYMENT_PENDING** - Host accepted; guest must pay within 4 hours; slot is locked
- **CONFIRMED** - Payment completed; booking is final
- **DECLINED/REJECTED** - Host rejected the request
- **EXPIRED** - Payment window elapsed without payment; slot unlocked
- **CANCELLED** - Optional future: host/guest cancellation after confirmed
- **COMPLETED** - After end time; eligible for reviews

## Business Rules

### 1. Minimum Lead Time (4 hours)

- Bookings must be requested at least 4 hours before the start time
- Enforced at:
  - Request creation time (client + server validation)
  - Host acceptance time (server re-validation)

**Error Message:** "Bookings must be requested at least 4 hours before the start time."

### 2. Payment Window (4 hours)

- When host accepts, booking becomes `PAYMENT_PENDING`
- `payment_deadline_at` is set to `now() + 4 hours`
- Slot is locked during `PAYMENT_PENDING` (blocks other bookings)
- If payment not completed by deadline:
  - Status → `EXPIRED`
  - `expired_at` → `now()`
  - Slot unlocked (available again)
  - Email sent to guest

### 3. Inventory Locking

- **NOT locked** on `REQUESTED` (host may take time, avoid blocking inventory)
- **IS locked** on `PAYMENT_PENDING` (after host acceptance, before payment)
- **IS locked** on `CONFIRMED` (obviously)

### 4. Idempotency

- All state transitions are idempotent
- Repeated calls should not:
  - Double-send emails
  - Double-create payments
  - Double-log events

## Database Schema

### Bookings Table Additions

```sql
requested_at TIMESTAMPTZ DEFAULT NOW()
host_responded_at TIMESTAMPTZ
accepted_at TIMESTAMPTZ
payment_deadline_at TIMESTAMPTZ
paid_at TIMESTAMPTZ
expired_at TIMESTAMPTZ
stripe_payment_intent_id TEXT
```

### Booking Events Table

Audit trail for all state transitions:

```sql
CREATE TABLE booking_events (
  id UUID PRIMARY KEY,
  booking_id UUID REFERENCES bookings(id),
  event_type TEXT NOT NULL,
  actor_id UUID REFERENCES profiles(id),
  payload JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

## API Routes

### POST `/api/bookings/request`

Creates a new booking request.

**Input:**
- `listing_id`
- `start_time` (ISO string)
- `end_time` (ISO string)
- `guests_count`
- `message` (optional)

**Validations:**
- Minimum lead time (4 hours)
- Availability (no conflicts with PAYMENT_PENDING/CONFIRMED)
- Day-use constraints (end by 9pm)

**Actions:**
- Creates booking with status `REQUESTED`
- Logs `REQUESTED` event
- Sends email to host

### POST `/api/bookings/respond`

Host accepts or rejects a booking request.

**Input:**
- `booking_id`
- `action`: `"accept"` or `"reject"`

**Accept Flow:**
1. Re-validates minimum lead time
2. Re-checks availability
3. Updates status to `PAYMENT_PENDING`
4. Sets `payment_deadline_at` = now() + 4 hours
5. Creates Stripe Payment Intent
6. Stores payment record
7. Logs `ACCEPTED` event
8. Sends payment required email to guest

**Reject Flow:**
1. Updates status to `DECLINED`
2. Sets `host_responded_at`
3. Logs `REJECTED` event
4. Sends rejection email to guest

### POST `/api/stripe/webhook`

Handles Stripe payment events.

**Payment Intent Succeeded:**
- If booking is `PAYMENT_PENDING` and within deadline:
  - Status → `CONFIRMED`
  - `paid_at` → now()
  - Logs `PAID` event
  - Sends confirmation emails (guest + host)

- If booking is `EXPIRED`:
  - Logs warning (manual review may be needed)
  - Does NOT confirm booking

## Cron Jobs

### Expire Unpaid Bookings

**Function:** `supabase/functions/expire-bookings/index.ts`

**Schedule:** Every 5 minutes

**Actions:**
1. Finds bookings where:
   - `status = 'PAYMENT_PENDING'`
   - `payment_deadline_at < NOW()`
2. Updates to `EXPIRED`
3. Sets `expired_at`
4. Logs `EXPIRED` event
5. Triggers email notification (via Next.js API route)

**Email Notifications:**
- Called via `/api/bookings/expire-notifications`
- Sends expiry email to guest

## Email Templates

All emails are sent via Postmark API (`lib/email/send.ts`):

1. **Host Booking Requested** - New request received
2. **Guest Payment Required** - Host accepted, payment needed
3. **Guest Request Rejected** - Host declined
4. **Guest Booking Confirmed** - Payment completed
5. **Host Booking Confirmed** - Payment completed
6. **Guest Payment Expired** - Payment window expired

## UI Components

### Booking Confirmation (`components/booking-confirmation.tsx`)

Handles all booking statuses with appropriate UI:

- **REQUESTED/PENDING**: "Awaiting Host Response"
- **PAYMENT_PENDING**: Payment countdown + payment form
- **CONFIRMED**: Full booking details + address
- **EXPIRED**: Expired message + "Try Again" CTA
- **DECLINED**: Rejection message
- **COMPLETED**: Review prompt

### Booking Dialog (`components/booking-dialog.tsx`)

- Validates minimum lead time (4 hours)
- Uses `/api/bookings/request` endpoint
- Shows clear error messages

## Testing Checklist

- [ ] Guest requests booking 6 hours ahead → REQUESTED created; host receives email
- [ ] Host accepts → PAYMENT_PENDING set; deadline +4h; guest receives email with pay link
- [ ] Guest pays within 4h → CONFIRMED; both emails sent
- [ ] Guest does not pay → cron expires → EXPIRED; slot available again; guest emailed
- [ ] Guest attempts booking 2 hours ahead → blocked
- [ ] Host attempts to accept when start_time < now()+4h → blocked
- [ ] Concurrency: two guests request same slot; first accepted becomes PAYMENT_PENDING; second accept fails due to conflict
- [ ] No duplicate emails on retries/webhook replays/cron reruns

## Environment Variables

Required for email sending:

- `POSTMARK_API_KEY` or `POSTMARK_SERVER_TOKEN`
- `POSTMARK_FROM_EMAIL` (defaults to "hello@borrowedhome.app")
- `NEXT_PUBLIC_SITE_URL` (for email links)

## Deployment Notes

1. Run migration `019_booking_request_approval_payment_window.sql`
2. Deploy Supabase Edge Function: `expire-bookings`
3. Configure Supabase scheduler to call `expire-bookings` every 5 minutes
4. Set up Postmark API key
5. Test email delivery
6. Monitor booking events table for audit trail
