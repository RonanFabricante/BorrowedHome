-- Migration: Booking Cancellations & Refunds
-- Implements production-grade cancellation system with policy engine and Stripe integration

-- Step 1: Add cancellation fields to bookings table
ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cancelled_by TEXT CHECK (cancelled_by IN ('guest', 'host', 'system')),
  ADD COLUMN IF NOT EXISTS cancellation_reason TEXT,
  ADD COLUMN IF NOT EXISTS cancellation_note TEXT,
  ADD COLUMN IF NOT EXISTS cancellation_policy_version TEXT DEFAULT 'v1',
  ADD COLUMN IF NOT EXISTS refund_amount_cents INTEGER,
  ADD COLUMN IF NOT EXISTS currency TEXT DEFAULT 'aud',
  ADD COLUMN IF NOT EXISTS payment_status TEXT DEFAULT 'NONE' CHECK (payment_status IN ('NONE', 'AUTHORIZED', 'CAPTURED', 'VOIDED', 'REFUNDED', 'PARTIALLY_REFUNDED', 'FAILED')),
  ADD COLUMN IF NOT EXISTS cancellation_status TEXT DEFAULT 'NONE' CHECK (cancellation_status IN ('NONE', 'PENDING', 'RESOLVED', 'FAILED')),
  ADD COLUMN IF NOT EXISTS payment_authorized_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS payment_captured_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS stripe_refund_id TEXT;

-- Step 2: Create notification_log table for email deduplication
CREATE TABLE IF NOT EXISTS notification_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  booking_id UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  recipient_email TEXT NOT NULL,
  notification_type TEXT NOT NULL,
  sent_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(booking_id, recipient_email, notification_type)
);

-- Indexes for notification_log
CREATE INDEX IF NOT EXISTS idx_notification_log_booking_id ON notification_log(booking_id);
CREATE INDEX IF NOT EXISTS idx_notification_log_sent_at ON notification_log(sent_at);

-- Step 3: Add indexes for cancellation queries
CREATE INDEX IF NOT EXISTS idx_bookings_cancelled_at ON bookings(cancelled_at) WHERE cancelled_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_bookings_payment_status ON bookings(payment_status);
CREATE INDEX IF NOT EXISTS idx_bookings_cancellation_status ON bookings(cancellation_status);

-- Step 4: Update availability checking function to exclude CANCELLED bookings
CREATE OR REPLACE FUNCTION check_booking_overlap(
  p_listing_id UUID,
  p_start_at TIMESTAMPTZ,
  p_end_at TIMESTAMPTZ,
  p_booking_id UUID DEFAULT NULL
)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM bookings
    WHERE listing_id = p_listing_id
      AND status IN ('PAYMENT_PENDING', 'CONFIRMED')  -- CANCELLED does NOT block inventory
      AND (
        (start_at <= p_start_at AND end_at > p_start_at)
        OR (start_at < p_end_at AND end_at >= p_end_at)
        OR (start_at >= p_start_at AND end_at <= p_end_at)
      )
      AND (p_booking_id IS NULL OR id != p_booking_id)
  );
END;
$$ LANGUAGE plpgsql;

-- Step 5: Create function to log notifications (idempotent via unique constraint)
CREATE OR REPLACE FUNCTION log_notification(
  p_booking_id UUID,
  p_recipient_email TEXT,
  p_notification_type TEXT
)
RETURNS UUID AS $$
DECLARE
  v_notification_id UUID;
BEGIN
  -- Insert notification (will fail silently if duplicate due to unique constraint)
  INSERT INTO notification_log (booking_id, recipient_email, notification_type)
  VALUES (p_booking_id, p_recipient_email, p_notification_type)
  ON CONFLICT (booking_id, recipient_email, notification_type) DO NOTHING
  RETURNING id INTO v_notification_id;

  RETURN v_notification_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Step 6: Create function to check if notification was already sent
CREATE OR REPLACE FUNCTION notification_sent(
  p_booking_id UUID,
  p_recipient_email TEXT,
  p_notification_type TEXT
)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM notification_log
    WHERE booking_id = p_booking_id
      AND recipient_email = p_recipient_email
      AND notification_type = p_notification_type
  );
END;
$$ LANGUAGE plpgsql;

-- Step 7: Add comments
COMMENT ON COLUMN bookings.cancelled_at IS 'When the booking was cancelled';
COMMENT ON COLUMN bookings.cancelled_by IS 'Who cancelled: guest, host, or system';
COMMENT ON COLUMN bookings.cancellation_reason IS 'Reason code: changed_plans, unavailable, safety, other';
COMMENT ON COLUMN bookings.cancellation_note IS 'Optional free-text note from canceller';
COMMENT ON COLUMN bookings.cancellation_policy_version IS 'Policy version applied (for future policy changes)';
COMMENT ON COLUMN bookings.refund_amount_cents IS 'Amount refunded/voided in cents';
COMMENT ON COLUMN bookings.payment_status IS 'Current payment state: NONE, AUTHORIZED, CAPTURED, VOIDED, REFUNDED, PARTIALLY_REFUNDED, FAILED';
COMMENT ON COLUMN bookings.cancellation_status IS 'Cancellation processing state: NONE, PENDING, RESOLVED, FAILED';
COMMENT ON COLUMN bookings.payment_authorized_at IS 'When payment was authorized (PaymentIntent requires_capture)';
COMMENT ON COLUMN bookings.payment_captured_at IS 'When payment was captured';
COMMENT ON COLUMN bookings.stripe_refund_id IS 'Stripe Refund ID if refund was issued';

COMMENT ON TABLE notification_log IS 'Deduplication log for email notifications to prevent spam';
COMMENT ON FUNCTION log_notification IS 'Logs a notification (idempotent - ignores duplicates)';
COMMENT ON FUNCTION notification_sent IS 'Checks if a notification was already sent';

-- Step 8: Migration complete
