# In-App Notifications Implementation

## Overview

BorrowedHome now includes a complete in-app notifications system with a bell icon in the navbar, dropdown list, and dedicated notifications page. Notifications are created server-side for key events and displayed to users in real-time.

## Database Schema

### `notifications` Table

- `id` (UUID, PK)
- `user_id` (UUID, FK to auth.users)
- `type` (TEXT) - Notification type (BOOKING_REQUESTED, PAYMENT_REQUIRED, etc.)
- `title` (TEXT) - Notification title
- `body` (TEXT, nullable) - Optional notification body
- `href` (TEXT) - Link destination
- `entity_type` (TEXT, nullable) - Related entity type (booking, message)
- `entity_id` (UUID, nullable) - Related entity ID
- `dedupe_key` (TEXT) - Unique key per user for deduplication
- `read_at` (TIMESTAMPTZ, nullable) - When notification was read
- `created_at` (TIMESTAMPTZ) - When notification was created

**Constraints:**
- `UNIQUE(user_id, dedupe_key)` - Prevents duplicate notifications

**Indexes:**
- `(user_id, created_at DESC)` - For fetching user notifications
- `(user_id) WHERE read_at IS NULL` - For unread count queries

**RLS Policies:**
- Users can SELECT their own notifications
- Users can UPDATE their own notifications (for marking as read)
- Only service role can INSERT (via RPC function)

## RPC Function

### `create_notification`

SECURITY DEFINER function that allows server-side code to insert notifications while respecting RLS. Uses `ON CONFLICT DO NOTHING` for idempotency.

## Notification Types

1. **BOOKING_REQUESTED** - Host receives when guest submits booking request
2. **PAYMENT_REQUIRED** - Guest receives when host accepts booking
3. **PAYMENT_DEADLINE_SOON** - Guest receives 60 minutes before payment deadline
4. **BOOKING_CONFIRMED** - Both guest and host receive when payment completes
5. **MESSAGE_RECEIVED** - Recipient receives when new message is sent

## Integration Points

### 1. Booking Request (`/api/bookings/request`)
- Creates `BOOKING_REQUESTED` notification for host
- Dedupe key: `booking:{bookingId}:requested`

### 2. Host Accepts Booking (`/api/bookings/respond`)
- Creates `PAYMENT_REQUIRED` notification for guest
- Dedupe key: `booking:{bookingId}:payment_required`

### 3. Payment Confirmation (Stripe Webhook)
- Creates `BOOKING_CONFIRMED` notifications for both guest and host
- Dedupe keys: `booking:{bookingId}:confirmed:guest` and `booking:{bookingId}:confirmed:host`

### 4. Message Sent (`/api/messages/send`)
- Creates `MESSAGE_RECEIVED` notification for recipient
- Anti-spam: Skips if unread notification exists for same booking within last 2 minutes
- Dedupe key: `message:{messageId}:received`

### 5. Payment Deadline Reminders (Scheduled Function)
- Edge Function: `payment-deadline-reminders`
- Runs every 5 minutes
- Creates `PAYMENT_DEADLINE_SOON` notifications for bookings with deadline within 60 minutes
- Dedupe key: `booking:{bookingId}:deadline_soon`

## API Routes

### `GET /api/notifications`
- Returns user's notifications (paginated)
- Query params: `limit` (default: 10), `cursor` (for pagination)
- Returns: `{ notifications: [], cursor: string | null }`

### `POST /api/notifications/mark-read`
- Marks specific notifications as read
- Body: `{ ids: string[] }`
- Returns: `{ success: true }`

### `POST /api/notifications/mark-all-read`
- Marks all user's notifications as read
- Returns: `{ success: true }`

## UI Components

### `NotificationsBell` (`components/notifications-bell.tsx`)
- Bell icon in navbar with unread count badge
- Dropdown shows last 10 notifications
- Click notification to mark as read and navigate
- "Mark all read" button
- "View all notifications" link
- Polls every 30 seconds for unread count

### `NotificationsPageContent` (`components/notifications-page-content.tsx`)
- Full notifications page at `/notifications`
- Filter: All / Unread
- Shows all notifications with pagination
- Click notification to mark as read and navigate
- "Mark all read" button

## Deployment

### 1. Run Migration
```sql
-- Run in Supabase SQL Editor
-- File: supabase/migrations/022_notifications.sql
```

### 2. Deploy Edge Function
```bash
supabase functions deploy payment-deadline-reminders
```

### 3. Configure Scheduler
In Supabase Dashboard → Database → Extensions → pg_cron:

```sql
-- Schedule payment deadline reminders (runs every 5 minutes)
SELECT cron.schedule(
  'payment-deadline-reminders',
  '*/5 * * * *', -- Every 5 minutes
  $$
  SELECT net.http_post(
    url := 'https://YOUR_PROJECT.supabase.co/functions/v1/payment-deadline-reminders',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.cron_secret')
    ),
    body := '{}'::jsonb
  ) AS request_id;
  $$
);
```

### 4. Set Environment Variables
Ensure these are set in Supabase Edge Function secrets:
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `CRON_SECRET`

## Testing Checklist

- [ ] Guest creates booking request → Host receives notification
- [ ] Host accepts booking → Guest receives payment required notification
- [ ] Guest completes payment → Both receive confirmation notifications
- [ ] Guest sends message → Host receives notification (anti-spam works)
- [ ] Payment deadline approaches → Guest receives reminder notification
- [ ] Click notification → Marks as read and navigates
- [ ] Mark all read → All notifications marked as read
- [ ] Unread count badge updates correctly
- [ ] RLS prevents cross-user access

## Future Enhancements

- Real-time updates via Supabase Realtime subscriptions
- Push notifications (browser notifications API)
- Email digest option
- Notification preferences (per type)
- Notification sounds
