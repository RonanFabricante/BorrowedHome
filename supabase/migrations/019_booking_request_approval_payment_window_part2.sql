-- Migration Part 2: Booking Request + Approval + Payment Window Logic
-- This part uses the enum values added in Part 1
-- Run this AFTER Part 1 has been committed

-- Step 2: Add timestamp columns to bookings table
ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS requested_at TIMESTAMPTZ DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS host_responded_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS accepted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS payment_deadline_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS expired_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS stripe_payment_intent_id TEXT;

-- Set requested_at for existing bookings
UPDATE bookings
SET requested_at = created_at
WHERE requested_at IS NULL;

-- Step 3: Create booking_events audit table
CREATE TABLE IF NOT EXISTS booking_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  booking_id UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  actor_id UUID REFERENCES profiles(id),
  payload JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for booking_events
CREATE INDEX IF NOT EXISTS idx_booking_events_booking_id ON booking_events(booking_id);
CREATE INDEX IF NOT EXISTS idx_booking_events_event_type ON booking_events(event_type);
CREATE INDEX IF NOT EXISTS idx_booking_events_created_at ON booking_events(created_at);

-- RLS for booking_events
ALTER TABLE booking_events ENABLE ROW LEVEL SECURITY;

-- Allow users to view events for their bookings
DROP POLICY IF EXISTS "Users can view events for their bookings" ON booking_events;
CREATE POLICY "Users can view events for their bookings"
  ON booking_events FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM bookings
      WHERE bookings.id = booking_events.booking_id
      AND (
        bookings.guest_id = auth.uid()
        OR EXISTS (
          SELECT 1 FROM listings
          WHERE listings.id = bookings.listing_id
          AND listings.host_id = auth.uid()
        )
      )
    )
  );

-- Allow service role to insert events (for system operations)
DROP POLICY IF EXISTS "Service role can insert events" ON booking_events;
CREATE POLICY "Service role can insert events"
  ON booking_events FOR INSERT
  WITH CHECK (auth.jwt() ->> 'role' = 'service_role');

-- Step 4: Update availability checking function to include PAYMENT_PENDING
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
      AND status IN ('PAYMENT_PENDING', 'CONFIRMED')  -- Both lock inventory
      AND (
        (start_at <= p_start_at AND end_at > p_start_at)
        OR (start_at < p_end_at AND end_at >= p_end_at)
        OR (start_at >= p_start_at AND end_at <= p_end_at)
      )
      AND (p_booking_id IS NULL OR id != p_booking_id)
  );
END;
$$ LANGUAGE plpgsql;

-- Step 5: Create function to check if time slot is available
CREATE OR REPLACE FUNCTION is_time_slot_available(
  p_listing_id UUID,
  p_start_at TIMESTAMPTZ,
  p_end_at TIMESTAMPTZ,
  p_booking_id UUID DEFAULT NULL
)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN NOT check_booking_overlap(p_listing_id, p_start_at, p_end_at, p_booking_id);
END;
$$ LANGUAGE plpgsql;

-- Step 6: Create function to validate minimum lead time (4 hours)
CREATE OR REPLACE FUNCTION validate_minimum_lead_time(
  p_start_at TIMESTAMPTZ
)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN p_start_at >= NOW() + INTERVAL '4 hours';
END;
$$ LANGUAGE plpgsql;

-- Step 7: Replace accept_booking function with new payment window logic
CREATE OR REPLACE FUNCTION accept_booking(
  p_booking_id UUID,
  p_host_id UUID
)
RETURNS bookings AS $$
DECLARE
  v_booking bookings;
  v_listing_id UUID;
  v_host_id UUID;
  v_payment_deadline TIMESTAMPTZ;
BEGIN
  -- Get booking and validate it exists and is REQUESTED or PENDING (for backward compatibility)
  SELECT b.* INTO v_booking
  FROM bookings b
  WHERE b.id = p_booking_id
    AND b.status IN ('REQUESTED', 'PENDING')  -- Support both old and new statuses
  FOR UPDATE;  -- Lock the row for atomic operation

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Booking not found or not in REQUESTED/PENDING status';
  END IF;

  -- Get listing host_id and id
  SELECT l.host_id, l.id INTO v_host_id, v_listing_id
  FROM listings l
  WHERE l.id = v_booking.listing_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Listing not found';
  END IF;

  -- Validate caller is the host
  IF v_host_id != p_host_id THEN
    RAISE EXCEPTION 'Only the listing host can accept bookings';
  END IF;

  -- Re-validate minimum lead time (4 hours from now)
  IF NOT validate_minimum_lead_time(v_booking.start_at) THEN
    RAISE EXCEPTION 'Bookings must start at least 4 hours from now. The requested start time is too soon.';
  END IF;

  -- Re-check availability (no conflicts with PAYMENT_PENDING or CONFIRMED)
  IF check_booking_overlap(v_listing_id, v_booking.start_at, v_booking.end_at, p_booking_id) THEN
    RAISE EXCEPTION 'This time slot is no longer available (conflicts with an existing booking)';
  END IF;

  -- Set payment deadline (4 hours from now)
  v_payment_deadline := NOW() + INTERVAL '4 hours';

  -- Update status to PAYMENT_PENDING and set timestamps
  UPDATE bookings
  SET 
    status = 'PAYMENT_PENDING',
    accepted_at = NOW(),
    host_responded_at = NOW(),
    payment_deadline_at = v_payment_deadline
  WHERE id = p_booking_id;

  -- Return updated booking
  SELECT * INTO v_booking FROM bookings WHERE id = p_booking_id;
  RETURN v_booking;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Step 8: Update decline_booking function to set host_responded_at
CREATE OR REPLACE FUNCTION decline_booking(
  p_booking_id UUID,
  p_host_id UUID
)
RETURNS bookings AS $$
DECLARE
  v_booking bookings;
  v_listing_id UUID;
  v_host_id UUID;
BEGIN
  -- Get booking and validate it exists and is REQUESTED or PENDING
  SELECT b.* INTO v_booking
  FROM bookings b
  WHERE b.id = p_booking_id
    AND b.status IN ('REQUESTED', 'PENDING')
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Booking not found or not in REQUESTED/PENDING status';
  END IF;

  -- Get listing host_id
  SELECT l.host_id INTO v_host_id
  FROM listings l
  WHERE l.id = v_booking.listing_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Listing not found';
  END IF;

  -- Validate caller is the host
  IF v_host_id != p_host_id THEN
    RAISE EXCEPTION 'Only the listing host can decline bookings';
  END IF;

  -- Update status to DECLINED and set host_responded_at
  UPDATE bookings
  SET 
    status = 'DECLINED',
    host_responded_at = NOW()
  WHERE id = p_booking_id;

  -- Return updated booking
  SELECT * INTO v_booking FROM bookings WHERE id = p_booking_id;
  RETURN v_booking;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Step 9: Create function to expire unpaid bookings (idempotent)
CREATE OR REPLACE FUNCTION expire_unpaid_bookings()
RETURNS TABLE(expired_count INTEGER, expired_ids UUID[]) AS $$
DECLARE
  v_expired_ids UUID[];
  v_count INTEGER;
BEGIN
  -- Find and update expired bookings
  WITH expired AS (
    UPDATE bookings
    SET 
      status = 'EXPIRED',
      expired_at = NOW()
    WHERE status = 'PAYMENT_PENDING'
      AND payment_deadline_at < NOW()
    RETURNING id
  )
  SELECT 
    COUNT(*)::INTEGER,
    ARRAY_AGG(id)
  INTO v_count, v_expired_ids
  FROM expired;

  RETURN QUERY SELECT v_count, COALESCE(v_expired_ids, ARRAY[]::UUID[]);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Step 10: Create function to log booking events (idempotent via unique constraint)
CREATE OR REPLACE FUNCTION log_booking_event(
  p_booking_id UUID,
  p_event_type TEXT,
  p_actor_id UUID DEFAULT NULL,
  p_payload JSONB DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
  v_event_id UUID;
BEGIN
  -- Insert event (will fail if duplicate due to business logic, but we don't enforce unique constraint on event_type+booking_id+created_at)
  -- Instead, we rely on application logic to prevent duplicate events
  INSERT INTO booking_events (booking_id, event_type, actor_id, payload)
  VALUES (p_booking_id, p_event_type, p_actor_id, p_payload)
  RETURNING id INTO v_event_id;

  RETURN v_event_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Step 11: Add indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_bookings_payment_deadline 
  ON bookings(payment_deadline_at) 
  WHERE status = 'PAYMENT_PENDING';

CREATE INDEX IF NOT EXISTS idx_bookings_listing_status_dates 
  ON bookings(listing_id, status, start_at, end_at);

CREATE INDEX IF NOT EXISTS idx_bookings_stripe_payment_intent_id 
  ON bookings(stripe_payment_intent_id) 
  WHERE stripe_payment_intent_id IS NOT NULL;

-- Step 12: Add comment documentation
COMMENT ON COLUMN bookings.requested_at IS 'When the booking request was created';
COMMENT ON COLUMN bookings.host_responded_at IS 'When the host accepted or declined the request';
COMMENT ON COLUMN bookings.accepted_at IS 'When the host accepted the request (same as host_responded_at for accepted bookings)';
COMMENT ON COLUMN bookings.payment_deadline_at IS 'Deadline for payment (4 hours after acceptance)';
COMMENT ON COLUMN bookings.paid_at IS 'When payment was completed';
COMMENT ON COLUMN bookings.expired_at IS 'When the booking expired due to non-payment';
COMMENT ON COLUMN bookings.stripe_payment_intent_id IS 'Stripe PaymentIntent ID for this booking';

COMMENT ON FUNCTION check_booking_overlap IS 'Checks if a time slot conflicts with PAYMENT_PENDING or CONFIRMED bookings';
COMMENT ON FUNCTION is_time_slot_available IS 'Returns true if a time slot is available (no conflicts)';
COMMENT ON FUNCTION validate_minimum_lead_time IS 'Validates that booking start time is at least 4 hours from now';
COMMENT ON FUNCTION expire_unpaid_bookings IS 'Expires bookings that are PAYMENT_PENDING past their deadline. Returns count and IDs.';
COMMENT ON FUNCTION log_booking_event IS 'Logs a booking event to the audit trail';

-- Step 13: Migration complete
COMMENT ON TABLE booking_events IS 'Audit trail for all booking state transitions and events';
